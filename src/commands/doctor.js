'use strict';

/**
 * `hellojohn-oss doctor` — validates the local installation.
 *
 * Checks:
 *   - hellojohn binary present + executable + version readable
 *   - hjctl binary present + executable + version readable
 *   - ~/.hellojohn/bin is in PATH
 *   - Default profile env file exists and passes basic validation
 *   - File permissions on ~/.hellojohn are not too open (Unix)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const { binDir, baseDir } = require('../lib/install-dir');
const { detect }          = require('../lib/platform');
const { isInCurrentPath } = require('../lib/path-manager');
const { printBox }        = require('../ui/box');
const { tick, cross, yellow, bold, dim } = require('../ui/colors');

async function runDoctor(opts = {}) {
  const { profile = 'default' } = opts;
  let platform;
  try {
    platform = detect();
  } catch (err) {
    process.stderr.write(`  ${cross()} Platform not supported: ${err.message}\n`);
    process.exit(1);
  }

  const checks = [];
  let hasError = false;

  // ── Binaries ─────────────────────────────────────────────────────────────
  for (const binary of ['hellojohn', 'hjctl']) {
    const binPath = path.join(binDir(), binary + platform.exeSuffix);
    if (!fs.existsSync(binPath)) {
      checks.push({ ok: false, label: `${binary} binary`, msg: `not found at ${binPath}`, fix: `npx hellojohn-oss setup` });
      hasError = true;
      continue;
    }

    let version = null;
    try {
      const out = execFileSync(binPath, ['--version'], { timeout: 5000, encoding: 'utf8' });
      version = out.trim();
    } catch (err) {
      checks.push({ ok: false, label: `${binary} --version`, msg: err.message, fix: `npx hellojohn-oss setup --force` });
      hasError = true;
      continue;
    }

    checks.push({ ok: true, label: `${binary}`, msg: version });
  }

  // ── PATH ─────────────────────────────────────────────────────────────────
  const inPath = isInCurrentPath();
  checks.push({
    ok: inPath,
    label: 'PATH',
    msg: inPath ? `${binDir()} is in PATH` : `${binDir()} NOT in PATH`,
    fix: inPath ? null : `Add to your shell profile: export PATH="${binDir()}:$PATH"`,
  });
  if (!inPath) hasError = true;

  // ── Env profile ──────────────────────────────────────────────────────────
  const envFile = path.join(os.homedir(), '.hellojohn', 'env', `${profile}.env`);
  if (!fs.existsSync(envFile)) {
    checks.push({
      ok: false,
      label: `profile "${profile}"`,
      msg: `not found at ${envFile}`,
      fix: `hjctl local init --profile ${profile}`,
    });
    hasError = true;
  } else {
    checks.push({ ok: true, label: `profile "${profile}"`, msg: envFile });

    // Basic validation: check for required keys
    const content = fs.readFileSync(envFile, 'utf8');
    const missingKeys = [];
    for (const key of ['SIGNING_MASTER_KEY', 'SECRETBOX_MASTER_KEY']) {
      const found = content.split('\n').some((l) => !l.trim().startsWith('#') && l.startsWith(key + '=') && l.split('=')[1]?.trim());
      if (!found) missingKeys.push(key);
    }
    if (missingKeys.length) {
      checks.push({
        ok: false,
        label: 'required env keys',
        msg: `missing: ${missingKeys.join(', ')}`,
        fix: `hjctl local init --profile ${profile} --force`,
      });
      hasError = true;
    } else {
      checks.push({ ok: true, label: 'required env keys', msg: 'SIGNING_MASTER_KEY, SECRETBOX_MASTER_KEY present' });
    }
  }

  // ── File permissions (Unix only) ─────────────────────────────────────────
  if (process.platform !== 'win32') {
    const base = baseDir();
    if (fs.existsSync(base)) {
      try {
        const stat = fs.statSync(base);
        const mode = stat.mode & 0o777;
        if (mode & 0o077) {
          checks.push({
            ok: false,
            label: 'directory permissions',
            msg: `~/.hellojohn is world/group readable (mode: ${mode.toString(8)})`,
            fix: `chmod 700 ~/.hellojohn && chmod 600 ~/.hellojohn/env/*.env`,
          });
          hasError = true;
        } else {
          checks.push({ ok: true, label: 'directory permissions', msg: 'secure' });
        }
      } catch {}
    }
  }

  // ── Print results ─────────────────────────────────────────────────────────
  process.stdout.write('\n');
  for (const c of checks) {
    const icon = c.ok ? `  ${tick()} ` : `  ${cross()} `;
    process.stdout.write(`${icon} ${c.label.padEnd(28)} ${c.msg}\n`);
    if (!c.ok && c.fix) {
      process.stdout.write(`${' '.repeat(6)} ${yellow('fix:')} ${c.fix}\n`);
    }
  }
  process.stdout.write('\n');

  if (!hasError) {
    printBox([`${tick()}  Everything looks good!`, null, 'hjctl local start    → start the server']);
    process.exit(0);
  } else {
    process.stdout.write(`  ${cross()} Some checks failed. See fixes above.\n\n`);
    process.exit(1);
  }
}

module.exports = { runDoctor };
