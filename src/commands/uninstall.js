'use strict';

/**
 * `hellojohn-oss uninstall [--keep-config]`
 *
 * Removes installed binaries. With --keep-config, leaves ~/.hellojohn/env/ intact.
 * Without --keep-config, removes ~/.hellojohn/bin only (not env files — safety default).
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const { binDir, baseDir } = require('../lib/install-dir');
const { detect }          = require('../lib/platform');
const { tick, cross, yellow, bold } = require('../ui/colors');

async function runUninstall(opts = {}) {
  const { keepConfig = true, yes = false } = opts; // keepConfig=true by default for safety

  let platform;
  try { platform = detect(); } catch { platform = { exeSuffix: process.platform === 'win32' ? '.exe' : '' }; }

  const binaries = [
    path.join(binDir(), 'hellojohn' + platform.exeSuffix),
    path.join(binDir(), 'hjctl'     + platform.exeSuffix),
  ].filter((p) => fs.existsSync(p));

  const removeDir = !keepConfig ? baseDir() : binDir();

  process.stdout.write('\n  HelloJohn OSS Uninstaller\n');
  process.stdout.write(`  Binaries:   ${binDir()}\n`);
  if (!keepConfig) {
    process.stdout.write(`  Config:     ${baseDir()} ${yellow('(will be removed)')}\n`);
  } else {
    process.stdout.write(`  Config:     ${baseDir()} (kept — pass --remove-config to delete)\n`);
  }
  process.stdout.write('\n');

  const confirmed = yes || await confirm('  Proceed? (y/N) ');
  if (!confirmed) {
    process.stdout.write('  Aborted.\n');
    return;
  }

  // Remove binaries
  for (const p of binaries) {
    try {
      fs.unlinkSync(p);
      process.stdout.write(`  ${tick()} Removed ${p}\n`);
    } catch (err) {
      process.stderr.write(`  ${cross()} Could not remove ${p}: ${err.message}\n`);
    }
  }

  // Optionally remove the bin dir if empty
  try {
    const remaining = fs.readdirSync(binDir());
    if (remaining.length === 0) {
      fs.rmdirSync(binDir());
    }
  } catch {}

  // Remove full base if requested
  if (!keepConfig) {
    try {
      fs.rmSync(baseDir(), { recursive: true, force: true });
      process.stdout.write(`  ${tick()} Removed ${baseDir()}\n`);
    } catch (err) {
      process.stderr.write(`  ${cross()} Could not remove ${baseDir()}: ${err.message}\n`);
    }
  }

  process.stdout.write(`\n  ${tick()} HelloJohn OSS uninstalled.\n`);
  if (keepConfig) {
    process.stdout.write(`  Config files kept at ${baseDir()}\n`);
    process.stdout.write(`  Remove them manually with: rm -rf ~/.hellojohn\n`);
  }
  process.stdout.write('\n');
}

function confirm(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

module.exports = { runUninstall };
