'use strict';

/**
 * `hellojohn-oss setup` — downloads and installs HelloJohn binaries.
 *
 * Options:
 *   --version <tag>         pin a specific release (default: latest)
 *   --path user|system|none PATH persistence mode (default: user)
 *   --force                 re-download even if already installed
 *   --retry <n>             number of download attempts (default: 3)
 *   --local-path <file>     skip download; use a local archive
 *   --quiet                 suppress non-error output
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { detect, assetName }      = require('../lib/platform');
const { fetchRelease, findAsset } = require('../lib/github-releases');
const { downloadFile, extractBinary } = require('../lib/downloader');
const { ensureBinDir, binDir }   = require('../lib/install-dir');
const { persistPath, printPathStatus, manualPathInstructions, isInCurrentPath } = require('../lib/path-manager');
const { printBox }               = require('../ui/box');
const { statusLine, createSpinner } = require('../ui/progress');
const { tick, cross, yellow, green, bold, dim } = require('../ui/colors');

const BINARIES = ['hellojohn', 'hjctl'];

/**
 * Runs the setup command.
 *
 * @param {object} opts
 * @param {string} [opts.version]
 * @param {'user'|'system'|'none'} [opts.path='user']
 * @param {boolean} [opts.force=false]
 * @param {number}  [opts.retry=3]
 * @param {string}  [opts.localPath]   - path to a local archive to use instead of downloading
 * @param {boolean} [opts.quiet=false]
 * @param {boolean} [opts.condensed=false] - use condensed output (for quickstart)
 * @returns {Promise<{ version: string, binDir: string }>}
 */
async function runSetup(opts = {}) {
  const {
    version:  pinVersion = null,
    path:     pathMode   = 'user',
    force                = false,
    retry                = 3,
    localPath            = null,
    quiet                = false,
    condensed            = false,
  } = opts;

  const log = quiet ? () => {} : (s) => process.stdout.write(s + '\n');

  // ── Step 1: Detect platform ──────────────────────────────────────────────
  let platform;
  try {
    platform = detect();
  } catch (err) {
    throw new Error(err.message);
  }
  statusLine('Detecting platform...', `${platform.label} ${tick()}`);

  // ── Step 2: Fetch release info ───────────────────────────────────────────
  const spinner = createSpinner('Fetching latest release');
  let release;
  try {
    release = await fetchRelease(pinVersion || undefined);
    spinner.stop(`  Fetching latest release...     ${release.tag} ${tick()}`);
  } catch (err) {
    spinner.stop();
    throw new Error(`Could not fetch release info: ${err.message}`);
  }

  const version = release.tag;

  // ── Step 3: Check already installed ─────────────────────────────────────
  // We use a `.hjversion` marker file instead of running the binary.
  // `hellojohn` is a server binary (no --version flag) — invoking it would
  // accidentally start a full HTTP server and potentially block port 8080.
  if (!force) {
    const versionMarker = path.join(binDir(), '.hjversion');
    const hjBin  = path.join(binDir(), 'hellojohn' + platform.exeSuffix);
    const hjCtlBin = path.join(binDir(), 'hjctl' + platform.exeSuffix);
    if (fs.existsSync(hjBin) && fs.existsSync(hjCtlBin)) {
      try {
        const installed = fs.readFileSync(versionMarker, 'utf8').trim();
        if (installed === version) {
          log(`  HelloJohn ${version} already installed. Use --force to re-download.`);
          return { version, binDir: binDir() };
        }
      } catch { /* marker missing or unreadable → proceed with install */ }
    }
  }

  // ── Step 4: Download binaries ────────────────────────────────────────────
  ensureBinDir();
  const tmpFiles = [];

  for (const binary of BINARIES) {
    let archivePath;

    if (localPath) {
      // Air-gapped install: use provided local file for the first binary,
      // or expect a pattern like hellojohn_*.tar.gz / hjctl_*.tar.gz in the same dir
      const candidates = fs.readdirSync(path.dirname(localPath))
        .filter((f) => f.startsWith(binary + '_') && (f.endsWith('.tar.gz') || f.endsWith('.zip')));
      archivePath = candidates.length ? path.join(path.dirname(localPath), candidates[0]) : localPath;
      log(`  Using local archive: ${archivePath}`);
    } else {
      const name = assetName(binary, version, platform);
      let asset;
      try {
        asset = findAsset(release, name);
      } catch (err) {
        throw new Error(err.message);
      }

      archivePath = await downloadFile({
        url:     asset.url,
        label:   `Downloading ${binary}...`,
        retries: retry,
        ext:     platform.ext,  // '.zip' or '.tar.gz' — critical for extraction
      });
      tmpFiles.push(archivePath);
    }

    await extractBinary({
      archivePath,
      destDir: binDir(),
      binary,
      isWindows: platform.isWindows,
    });
  }

  // Clean up temp files
  for (const tmp of tmpFiles) {
    try { fs.unlinkSync(tmp); } catch {}
  }

  // ── Step 5: Verify install ───────────────────────────────────────────────
  statusLine('Installing to', `${binDir()} ${tick()}`);

  if (!platform.isWindows) {
    for (const binary of BINARIES) {
      const p = path.join(binDir(), binary);
      if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
    }
    statusLine('Setting permissions...', tick());
  }

  // Verify binaries exist on disk.
  // NOTE: We intentionally do NOT run --version here because `hellojohn` is a
  // server binary (not a CLI tool) and would start a full HTTP server if invoked.
  // Version validation can be done via: npx hellojohn-oss doctor
  for (const binary of BINARIES) {
    const p = path.join(binDir(), binary + platform.exeSuffix);
    if (!fs.existsSync(p)) {
      log(`  ${yellow('⚠')}  ${binary} binary not found after install — run: npx hellojohn-oss doctor`);
    }
  }

  // ── Step 5b: Write version marker ───────────────────────────────────────
  // Lets future runs skip re-downloading when the same version is already installed.
  try {
    fs.writeFileSync(path.join(binDir(), '.hjversion'), version + '\n', 'utf8');
  } catch { /* non-fatal */ }

  // ── Step 6: PATH management ──────────────────────────────────────────────
  const persistResult = persistPath({ mode: pathMode, dir: binDir() });
  printPathStatus({ dir: binDir(), persistResult });

  // ── Step 7: Print success box ────────────────────────────────────────────
  if (!condensed) {
    printSetupSuccessBox({ version, persistResult });
  }

  return { version, binDir: binDir() };
}

function printSetupSuccessBox({ version, persistResult }) {
  const dir = binDir();
  const shell = require('../lib/path-manager').detectShell();

  const lines = [
    `${tick()}  HelloJohn OSS ${version} installed successfully`,
    null,
  ];

  // PATH note
  if (!persistResult.skipped && !persistResult.alreadyPresent && persistResult.success) {
    lines.push(`PATH note:`);
    lines.push(`  ${dir} added to ${persistResult.profilePath ?? 'PATH'}`);
    lines.push(`  Restart your terminal or run:`);
    if (process.platform === 'win32') {
      lines.push(`    $env:PATH = "${dir};$env:PATH"     (PowerShell)`);
    } else {
      lines.push(`    source ~/${shell === 'zsh' ? '.zshrc' : '.bashrc'}`);
    }
    lines.push(null);
  }

  lines.push(`Next steps:`);
  lines.push(`  hjctl local init`);
  lines.push(`  hjctl local start`);
  lines.push(null);
  lines.push(`Or run everything at once:`);
  lines.push(`  npx hellojohn-oss quickstart`);

  printBox(lines);
}

module.exports = { runSetup };
