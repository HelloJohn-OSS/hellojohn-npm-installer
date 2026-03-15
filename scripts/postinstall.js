#!/usr/bin/env node
'use strict';

/**
 * postinstall hook — runs automatically when `npm i -g hellojohn-oss`.
 *
 * Behaves identically to `npx hellojohn-oss setup`.
 * If the hook is skipped (--ignore-scripts), the user must run:
 *   hellojohn-oss setup
 *
 * Safety: if this script fails, npm install is NOT aborted (exitCode 0).
 * Errors are printed to stderr but don't block the install.
 */

// Skip in CI to avoid unintended downloads
if (process.env.CI === 'true' || process.env.HELLOJOHN_SKIP_POSTINSTALL === 'true') {
  process.stdout.write('  hellojohn-oss: skipping postinstall in CI (set HELLOJOHN_SKIP_POSTINSTALL=false to override)\n');
  process.exit(0);
}

// Skip if running via npx (npx handles setup itself)
if (process.env.npm_lifecycle_event === 'npx') {
  process.exit(0);
}

const { runSetup } = require('../src/commands/setup');

process.stdout.write('\n  hellojohn-oss: running postinstall setup...\n\n');

runSetup({ path: 'user', force: false, retry: 3 })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(
      `\n  Warning: postinstall setup failed: ${err.message}\n` +
      `  Run manually: hellojohn-oss setup\n\n`
    );
    // Exit 0 to not break npm install
    process.exit(0);
  });
