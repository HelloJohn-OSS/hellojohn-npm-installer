'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');

/**
 * Returns the ~/.hellojohn/bin directory path (platform-aware).
 */
function binDir() {
  return path.join(os.homedir(), '.hellojohn', 'bin');
}

/**
 * Returns the ~/.hellojohn base directory.
 */
function baseDir() {
  return path.join(os.homedir(), '.hellojohn');
}

/**
 * Ensures the bin directory exists with correct permissions.
 */
function ensureBinDir() {
  fs.mkdirSync(binDir(), { recursive: true });
}

/**
 * Checks whether a binary is already installed and returns its version.
 *
 * @param {string} binary - 'hellojohn' or 'hjctl'
 * @returns {{ installed: boolean, version: string|null, path: string }}
 */
function checkInstalled(binary) {
  const { execFileSync } = require('child_process');
  const binPath = binaryPath(binary, process.platform === 'win32');

  if (!fs.existsSync(binPath)) {
    return { installed: false, version: null, path: binPath };
  }

  try {
    const out = execFileSync(binPath, ['--version'], { timeout: 5000, encoding: 'utf8' });
    const match = out.match(/(\d+\.\d+\.\d+)/);
    return { installed: true, version: match ? match[1] : out.trim(), path: binPath };
  } catch {
    return { installed: true, version: null, path: binPath };
  }
}

/**
 * Returns the absolute path for a binary in the bin dir.
 */
function binaryPath(name, isWindows = false) {
  return path.join(binDir(), name + (isWindows ? '.exe' : ''));
}

module.exports = { binDir, baseDir, ensureBinDir, checkInstalled, binaryPath };
