'use strict';

const https      = require('https');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const zlib       = require('zlib');
const { execFileSync } = require('child_process');

const { renderProgress, doneProgress, formatBytes } = require('../ui/progress');
const { tick, cross } = require('../ui/colors');

const RETRY_DELAYS_MS = [1000, 3000, 9000]; // exponential backoff

/**
 * Downloads a file from `url` to a temp file, reporting progress.
 * Follows redirects. Retries on transient failures.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.label       - Display label for progress output
 * @param {number} [opts.retries=3] - Total attempts (1 = no retry)
 * @param {string} [opts.ext]       - File extension to preserve (e.g. '.zip', '.tar.gz')
 * @returns {Promise<string>} path to downloaded temp file
 */
async function downloadFile({ url, label, retries = 3, ext = '' }) {
  let lastErr;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      process.stdout.write(`  Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})...\n`);
      await sleep(delay);
    }

    try {
      return await downloadOnce({ url, label, ext });
    } catch (err) {
      lastErr = err;
      process.stdout.write(`\n  ${cross()} Download failed: ${err.message}\n`);
    }
  }

  const manualUrl = url.replace(/\?.*$/, '');
  throw new Error(
    `Download failed after ${retries} attempt(s): ${lastErr.message}\n\n` +
    `  Manual download: ${manualUrl}\n` +
    `  Then install with: --local-path <file>`
  );
}

function downloadOnce({ url, label, ext = '' }) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `hellojohn-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    const out = fs.createWriteStream(tmpFile);

    function fetch(fetchUrl) {
      const mod = fetchUrl.startsWith('http:') ? http : https;

      const req = mod.get(fetchUrl, {
        headers: { 'User-Agent': 'hellojohn-oss-installer/1.0' },
      }, (res) => {
        // Follow redirects (GitHub assets redirect to S3)
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          return fetch(res.headers.location);
        }

        if (res.statusCode !== 200) {
          out.destroy();
          fs.unlink(tmpFile, () => {});
          return reject(new Error(`HTTP ${res.statusCode} for ${fetchUrl}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          renderProgress(label, downloaded, total);
        });

        res.pipe(out);

        out.on('finish', () => {
          doneProgress(label, total || downloaded);
          resolve(tmpFile);
        });

        out.on('error', (err) => {
          fs.unlink(tmpFile, () => {});
          reject(err);
        });

        res.on('error', (err) => {
          fs.unlink(tmpFile, () => {});
          reject(err);
        });
      });

      req.on('error', (err) => {
        out.destroy();
        fs.unlink(tmpFile, () => {});
        reject(new Error(`Network error: ${err.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Download timed out after 30s'));
      });
    }

    fetch(url);
  });
}

/**
 * Extracts a downloaded archive (.tar.gz or .zip) to destDir.
 * The binary name (without extension) is returned as the installed path.
 *
 * @param {object} opts
 * @param {string} opts.archivePath - Path to the downloaded archive
 * @param {string} opts.destDir     - Directory to extract into
 * @param {string} opts.binary      - Binary name (e.g. 'hellojohn' or 'hjctl')
 * @param {boolean} opts.isWindows
 * @returns {Promise<string>} absolute path to extracted binary
 */
async function extractBinary({ archivePath, destDir, binary, isWindows }) {
  const binName = binary + (isWindows ? '.exe' : '');
  const destPath = path.join(destDir, binName);

  fs.mkdirSync(destDir, { recursive: true });

  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, destDir, binName);
  } else {
    await extractTarGz(archivePath, destDir, binName);
  }

  if (!fs.existsSync(destPath)) {
    throw new Error(
      `Binary "${binName}" not found in archive after extraction.\n` +
      `Expected: ${destPath}`
    );
  }

  if (!isWindows) {
    fs.chmodSync(destPath, 0o755);
  }

  return destPath;
}

function extractTarGz(archivePath, destDir, targetBinary) {
  // GoReleaser puts the binary in a subdirectory inside the tarball
  // (e.g. hellojohn_v1.0.0_linux_amd64/hellojohn).  Extract to a temp dir
  // first, then find the binary and copy it to destDir.
  return new Promise((resolve, reject) => {
    const tmpExtract = path.join(os.tmpdir(), `hj-tar-${Date.now()}`);
    fs.mkdirSync(tmpExtract, { recursive: true });

    let extracted = false;

    // Try system tar first (Linux/macOS/Windows 10+)
    try {
      execFileSync('tar', ['-xzf', archivePath, '-C', tmpExtract], { stdio: 'pipe' });
      extracted = true;
    } catch {
      // Fallback: manual Node stream parser
    }

    const finish = () => {
      const found = findFileRecursive(tmpExtract, targetBinary);
      if (found) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(found, path.join(destDir, targetBinary));
      }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}
      resolve();
    };

    if (extracted) return finish();

    // Manual tar-gz extraction fallback
    const tar = require('./tar-parser');
    tar.extract(archivePath, tmpExtract, null /* extract all */)
      .then(finish)
      .catch(reject);
  });
}

/**
 * Recursively finds a file by name inside a directory tree.
 * First tries exact match, then falls back to prefix match (e.g. hellojohn*.exe).
 * Returns the full path if found, or null.
 */
function findFileRecursive(dir, filename) {
  // Pass 1: exact match
  const exact = _walkFind(dir, (name) => name === filename);
  if (exact) return exact;

  // Pass 2: prefix match — handles releases where the binary is named
  // hellojohn_v1.0.0_windows_amd64.exe instead of hellojohn.exe
  const dotIdx = filename.lastIndexOf('.');
  const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext  = dotIdx >= 0 ? filename.slice(dotIdx) : '';
  return _walkFind(dir, (name) => name.startsWith(stem) && name.endsWith(ext));
}

function _walkFind(dir, predicate) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = _walkFind(full, predicate);
      if (found) return found;
    } else if (predicate(entry.name)) {
      return full;
    }
  }
  return null;
}

function extractZip(archivePath, destDir, targetBinary) {
  // On Windows 10+, use PowerShell's Expand-Archive.
  // Archives from GoReleaser / GitHub Actions typically wrap the binary in a
  // subdirectory (e.g. hellojohn_v1.0.0_windows_amd64/hellojohn.exe), so we
  // extract to a temp dir first, then find & move the binary to destDir.
  return new Promise((resolve, reject) => {
    try {
      if (process.platform === 'win32') {
        const tmpExtract = path.join(os.tmpdir(), `hj-zip-${Date.now()}`);
        execFileSync('powershell', [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpExtract}' -Force`,
        ], { stdio: 'pipe' });

        // Binary may be at root OR inside a subdirectory — find it either way
        const found = findFileRecursive(tmpExtract, targetBinary);
        if (found) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(found, path.join(destDir, targetBinary));
        }
        // Cleanup temp extraction dir (best effort)
        try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}
        return resolve();
      }

      // On Linux/macOS: unzip with funzip-style extraction, then fallback to
      // full extract + find if unzip can't target the nested path directly.
      const tmpExtract = path.join(os.tmpdir(), `hj-zip-${Date.now()}`);
      try {
        execFileSync('unzip', ['-o', archivePath, '-d', tmpExtract], { stdio: 'pipe' });
      } catch (err) {
        throw new Error(`unzip failed: ${err.message}. Install 'unzip' or use --local-path.`);
      }
      const found = findFileRecursive(tmpExtract, targetBinary);
      if (found) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(found, path.join(destDir, targetBinary));
      }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}
      resolve();
    } catch (err) {
      reject(new Error(
        `Could not extract zip archive: ${err.message}\n` +
        `Manual download & install with: --local-path <file>`
      ));
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { downloadFile, extractBinary };
