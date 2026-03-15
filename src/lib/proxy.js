'use strict';

/**
 * npx proxy — forwards `npx hellojohn-oss hjctl local <cmd>` to the
 * installed hjctl binary.
 *
 * This is the fallback for users who don't have hjctl in PATH yet.
 * e.g.  npx hellojohn-oss hjctl local init
 *       npx hellojohn-oss hjctl local start
 */

const { spawnSync } = require('child_process');
const path = require('path');

const { binDir }  = require('./install-dir');
const { detect }  = require('./platform');

/**
 * Proxies to the hjctl binary with given args.
 * This call does NOT return — it replaces the process.
 *
 * @param {string[]} args - Everything after 'hjctl' in the original argv
 */
function proxyToHjctl(args) {
  let exeSuffix = '';
  try {
    const platform = detect();
    exeSuffix = platform.exeSuffix;
  } catch {}

  const hjctlPath = path.join(binDir(), 'hjctl' + exeSuffix);

  const result = spawnSync(hjctlPath, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${binDir()}${path.delimiter}${process.env.PATH}`,
    },
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      process.stderr.write(
        `  hjctl not found at ${hjctlPath}.\n` +
        `  Run: npx hellojohn-oss setup\n`
      );
    } else {
      process.stderr.write(`  Proxy error: ${result.error.message}\n`);
    }
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

module.exports = { proxyToHjctl };
