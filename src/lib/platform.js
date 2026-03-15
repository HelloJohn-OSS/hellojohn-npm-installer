'use strict';

const os = require('os');

/**
 * Maps Node.js os.platform() → GoOS names used in release asset filenames.
 */
const PLATFORM_MAP = {
  linux:  'linux',
  darwin: 'darwin',
  win32:  'windows',
};

/**
 * Maps Node.js os.arch() → Go arch names used in release asset filenames.
 */
const ARCH_MAP = {
  x64:   'amd64',
  arm64: 'arm64',
  // arm is not supported — caught in detect()
};

const SUPPORTED_PLATFORMS = new Set([
  'linux/amd64',
  'linux/arm64',
  'darwin/amd64',
  'darwin/arm64',
  'windows/amd64',
  'windows/arm64',
]);

/**
 * Detects the current platform and architecture.
 *
 * @returns {{ os: string, arch: string, ext: string, isWindows: boolean }}
 * @throws  {Error} if the platform is not supported
 */
function detect() {
  const nodeOS   = os.platform();
  const nodeArch = os.arch();

  const goOS   = PLATFORM_MAP[nodeOS];
  const goArch = ARCH_MAP[nodeArch];

  if (!goOS || !goArch) {
    throw new Error(
      `Platform ${nodeOS}/${nodeArch} is not supported yet.\n` +
      `Supported: ${[...SUPPORTED_PLATFORMS].join(', ')}.`
    );
  }

  const platform = `${goOS}/${goArch}`;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(
      `Platform ${platform} is not supported yet.\n` +
      `Supported: ${[...SUPPORTED_PLATFORMS].join(', ')}.`
    );
  }

  return {
    os: goOS,
    arch: goArch,
    ext: goOS === 'windows' ? '.zip' : '.tar.gz',
    exeSuffix: goOS === 'windows' ? '.exe' : '',
    isWindows: goOS === 'windows',
    label: platform,
  };
}

/**
 * Builds the expected asset filename for a given binary, version, and platform.
 *
 * Pattern: <binary>_<version>_<os>_<arch>.tar.gz|zip
 * e.g.:    hellojohn_v1.2.3_linux_amd64.tar.gz
 */
function assetName(binary, version, platform) {
  const v = version.startsWith('v') ? version : `v${version}`;
  return `${binary}_${v}_${platform.os}_${platform.arch}${platform.ext}`;
}

module.exports = { detect, assetName };
