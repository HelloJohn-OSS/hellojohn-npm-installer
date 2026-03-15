#!/usr/bin/env node
'use strict';

/**
 * hellojohn-oss CLI entry point
 *
 * Usage:
 *   npx hellojohn-oss                          → setup (default)
 *   npx hellojohn-oss setup [opts]             → install binaries
 *   npx hellojohn-oss quickstart [opts]        → setup + init + start
 *   npx hellojohn-oss doctor                   → validate installation
 *   npx hellojohn-oss update [--version <tag>] → re-download binaries
 *   npx hellojohn-oss uninstall [opts]         → remove binaries
 *   npx hellojohn-oss hjctl <args>             → proxy to hjctl binary
 *   npx hellojohn-oss --help                   → print this help
 *   npx hellojohn-oss --version                → print installer version
 */

// Require Node 18+
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  process.stderr.write(`hellojohn-oss requires Node.js 18 or later (found ${process.version}).\n`);
  process.exit(1);
}

const { runSetup }      = require('../src/commands/setup');
const { runQuickstart } = require('../src/commands/quickstart');
const { runDoctor }     = require('../src/commands/doctor');
const { runUpdate }     = require('../src/commands/update');
const { runUninstall }  = require('../src/commands/uninstall');
const { proxyToHjctl }  = require('../src/lib/proxy');

const pkg = require('../package.json');

// ── Parse minimal argv ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);

function flag(name, defaultVal = false) {
  const idx = argv.indexOf(name);
  if (idx === -1) return defaultVal;
  return true;
}

function option(name, defaultVal = null) {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) return defaultVal;
  return argv[idx + 1];
}

function optionInt(name, defaultVal) {
  const v = option(name);
  if (v === null) return defaultVal;
  const n = parseInt(v, 10);
  return isNaN(n) ? defaultVal : n;
}

// ── Dispatch ───────────────────────────────────────────────────────────────
const command = argv[0];

if (!command || command === '--help' || command === '-h' || command === 'help') {
  printHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v' || command === 'version') {
  process.stdout.write(`hellojohn-oss v${pkg.version}\n`);
  process.exit(0);
}

// Proxy: npx hellojohn-oss hjctl [args]
if (command === 'hjctl') {
  proxyToHjctl(argv.slice(1));
  // proxyToHjctl never returns — it exits the process
}

// Main commands
const handlers = {
  async setup() {
    await runSetup({
      version:   option('--version'),
      path:      option('--path', 'user'),
      force:     flag('--force'),
      retry:     optionInt('--retry', 3),
      localPath: option('--local-path'),
      quiet:     flag('--quiet'),
    });
  },

  async quickstart() {
    await runQuickstart({
      version:   option('--version'),
      port:      optionInt('--port', 8080),
      yes:       flag('--yes'),
      profile:   option('--profile', 'default'),
      noConnect: flag('--no-connect'),
      retry:     optionInt('--retry', 3),
    });
  },

  async doctor() {
    await runDoctor({
      profile: option('--profile', 'default'),
    });
  },

  async update() {
    await runUpdate({
      version: option('--version'),
      retry:   optionInt('--retry', 3),
    });
  },

  async uninstall() {
    await runUninstall({
      keepConfig: !flag('--remove-config'),
      yes:        flag('--yes'),
    });
  },
};

// Default: setup
const fn = handlers[command] ?? handlers.setup;

(async () => {
  try {
    // If the raw command is unknown (not setup/quickstart/…) treat it as
    // an implicit `setup` invocation — preserves `npx hellojohn-oss` UX.
    if (!handlers[command] && command) {
      // Unknown command — show help
      process.stderr.write(`  Unknown command: "${command}"\n\n`);
      printHelp();
      process.exit(1);
    }
    await fn();
  } catch (err) {
    process.stderr.write(`\n  Error: ${err.message}\n\n`);
    process.exit(1);
  }
})();

// ── Help ───────────────────────────────────────────────────────────────────
function printHelp() {
  process.stdout.write(`
  hellojohn-oss v${pkg.version} — HelloJohn OSS installer

  Usage:
    npx hellojohn-oss                          Install HelloJohn OSS (setup)
    npx hellojohn-oss setup [opts]             Download and install binaries
    npx hellojohn-oss quickstart [opts]        One-command onboarding
    npx hellojohn-oss doctor                   Validate installation
    npx hellojohn-oss update [--version <tag>] Update to a new version
    npx hellojohn-oss uninstall [opts]         Remove installed binaries
    npx hellojohn-oss hjctl <args>             Proxy to hjctl binary

  setup / update options:
    --version <tag>     Pin a specific release tag (default: latest)
    --path user|system|none  PATH persistence mode (default: user)
    --force             Re-download even if already installed
    --retry <n>         Download attempt count (default: 3)
    --local-path <file> Use a local archive instead of downloading

  quickstart options:
    --version <tag>     Pin binary version
    --port <n>          Server port (default: 8080)
    --yes               Skip start confirmation
    --profile <name>    Env profile (default: default)
    --no-connect        Skip cloud connect step

  uninstall options:
    --remove-config     Also remove ~/.hellojohn config (env files, run state)
    --yes               Skip confirmation prompt

  doctor options:
    --profile <name>    Profile to validate (default: default)

  Examples:
    npx hellojohn-oss                     # Install latest
    npx hellojohn-oss quickstart          # Install + init + start in one step
    npx hellojohn-oss hjctl local status  # Check runtime status
    npx hellojohn-oss hjctl local logs    # Tail server logs

  Docs: https://github.com/HelloJohn-OSS/hellojohn
`);
}
