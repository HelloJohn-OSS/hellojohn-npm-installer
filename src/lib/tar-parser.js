'use strict';

/**
 * Minimal pure-Node tar.gz extractor for a single target file.
 * Used as fallback when system `tar` is not available.
 *
 * Handles ustar / POSIX.1-2001 tar format.
 */

const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const BLOCK = 512;

/**
 * Extracts files from a .tar.gz archive.
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @param {string|null} targetFile - filename to extract (basename only), or null to extract all
 * @returns {Promise<void>}
 */
function extract(archivePath, destDir, targetFile) {
  return new Promise((resolve, reject) => {
    const readStream  = fs.createReadStream(archivePath);
    const gunzip      = zlib.createGunzip();
    const chunks      = [];
    let   done        = false;

    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', () => {
      if (done) return;
      try {
        const buf = Buffer.concat(chunks);
        extractFromBuffer(buf, destDir, targetFile);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    gunzip.on('error', reject);
    readStream.on('error', reject);
    readStream.pipe(gunzip);
  });
}

function extractFromBuffer(buf, destDir, targetFile) {
  let offset = 0;
  const len  = buf.length;
  let found  = false;

  while (offset + BLOCK <= len) {
    const header = buf.slice(offset, offset + BLOCK);
    offset += BLOCK;

    // Two consecutive zero blocks = end of archive
    if (isZeroBlock(header)) break;

    const nameRaw  = readString(header, 0, 100);
    const sizeOct  = readString(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156]);

    const size = parseInt(sizeOct.trim(), 8) || 0;
    const blocks = Math.ceil(size / BLOCK);
    const dataEnd = offset + blocks * BLOCK;

    // We only care about regular files ('0', '', or '\0')
    if (typeFlag === '0' || typeFlag === '' || typeFlag === '\0') {
      const basename = path.basename(nameRaw);
      // If targetFile is null → extract everything; otherwise match by name
      if (targetFile === null || basename === targetFile) {
        const data = buf.slice(offset, offset + size);
        // Preserve relative directory structure from the tar entry
        const entryPath = targetFile === null
          ? path.join(destDir, nameRaw.replace(/\\/g, '/'))
          : path.join(destDir, basename);
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });
        fs.writeFileSync(entryPath, data);
        found = true;
        if (targetFile !== null) break; // single-file mode: stop early
      }
    }

    offset = dataEnd;
  }

  if (!found && targetFile !== null) {
    throw new Error(`File "${targetFile}" not found in archive.`);
  }
}

function readString(buf, offset, length) {
  const end = buf.indexOf(0, offset);
  return buf.slice(offset, end < 0 || end > offset + length ? offset + length : end).toString('utf8');
}

function isZeroBlock(buf) {
  for (let i = 0; i < BLOCK; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

module.exports = { extract };
