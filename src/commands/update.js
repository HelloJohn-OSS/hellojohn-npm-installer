'use strict';

/**
 * `hellojohn-oss update [--version <tag>]` — re-downloads and replaces binaries.
 */

const { runSetup } = require('./setup');

async function runUpdate(opts = {}) {
  const { version = null, retry = 3 } = opts;
  process.stdout.write('\n  Updating HelloJohn OSS binaries...\n\n');
  await runSetup({ version, path: 'user', force: true, retry });
}

module.exports = { runUpdate };
