'use strict';

/**
 * PATH management — three-layer strategy:
 *
 *  Layer 1 (automatic): source bin dir into the CURRENT shell session
 *            by printing a shell-eval string when requested.
 *
 *  Layer 2 (opt-in default): append export to shell profile file
 *            (.zshrc / .bashrc / PowerShell profile / setx).
 *
 *  Layer 3 (--path none): no changes, just print the absolute path.
 *
 * The installer always does Layer 1 automatically.
 * Layer 2 is attempted unless the user passes --path none.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { binDir } = require('./install-dir');
const { tick, yellow, dim, bold } = require('../ui/colors');

/** Detects the user's default shell on Unix. Falls back to bash. */
function detectShell() {
  if (process.platform === 'win32') return 'powershell';

  const shellEnv = process.env.SHELL || '';
  if (shellEnv.includes('zsh'))   return 'zsh';
  if (shellEnv.includes('fish'))  return 'fish';
  if (shellEnv.includes('bash'))  return 'bash';
  return 'bash'; // safe default
}

/** Returns the profile file path for a given shell. */
function shellProfile(shell) {
  const home = os.homedir();
  const map = {
    zsh:        path.join(home, '.zshrc'),
    bash:       path.join(home, '.bashrc'),
    fish:       path.join(home, '.config', 'fish', 'conf.d', 'hellojohn.fish'),
    powershell: null, // handled separately via setx / profile
  };
  return map[shell] ?? path.join(home, '.bashrc');
}

/** The export line to add to a Unix profile file. */
function exportLine(dir) {
  return `export PATH="${dir}:$PATH"  # added by hellojohn-oss installer`;
}

/**
 * Layer 1: Returns the shell commands needed to activate PATH in the current session.
 * The caller should print these so the user can eval them.
 *
 * In non-TTY/CI: not needed — just note what was done.
 */
function sessionActivateCommands(dir = binDir()) {
  const shell = detectShell();
  if (process.platform === 'win32') {
    return [
      `$env:PATH = "${dir};$env:PATH"`,
    ];
  }
  return [
    `export PATH="${dir}:$PATH"`,
  ];
}

/**
 * Layer 2: Persists the PATH addition to the user's shell profile.
 * Returns { success, profilePath, alreadyPresent, shell }.
 *
 * @param {object}  [opts]
 * @param {'user'|'system'|'none'} [opts.mode='user']
 * @param {string}  [opts.dir]
 */
function persistPath(opts = {}) {
  const { mode = 'user', dir = binDir() } = opts;

  if (mode === 'none') {
    return { success: false, alreadyPresent: false, skipped: true };
  }

  if (process.platform === 'win32') {
    return persistPathWindows(dir, mode);
  }

  return persistPathUnix(dir);
}

function persistPathUnix(dir) {
  const shell = detectShell();
  const profilePath = shellProfile(shell);

  try {
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    const current = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf8') : '';

    if (current.includes(dir)) {
      return { success: true, alreadyPresent: true, shell, profilePath };
    }

    const line = exportLine(dir);
    const append = (current.endsWith('\n') || current === '') ? line + '\n' : '\n' + line + '\n';
    fs.appendFileSync(profilePath, append, 'utf8');
    return { success: true, alreadyPresent: false, shell, profilePath };
  } catch (err) {
    return { success: false, error: err.message, shell, profilePath };
  }
}

function persistPathWindows(dir, mode) {
  // Use setx to set user or system PATH persistently
  const scope = mode === 'system' ? '/M' : '';
  try {
    const currentPath = execSync(`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('PATH','${mode === 'system' ? 'Machine' : 'User'}')"`, { encoding: 'utf8' }).trim();
    if (currentPath.includes(dir)) {
      return { success: true, alreadyPresent: true, shell: 'powershell' };
    }
    const newPath = `${dir};${currentPath}`;
    execSync(`setx PATH "${newPath}" ${scope}`, { stdio: 'pipe' });
    return { success: true, alreadyPresent: false, shell: 'powershell' };
  } catch (err) {
    return { success: false, error: err.message, shell: 'powershell' };
  }
}

/**
 * Checks whether binDir is already in the current process PATH.
 */
function isInCurrentPath(dir = binDir()) {
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  return pathDirs.some((d) => path.normalize(d) === path.normalize(dir));
}

/**
 * Prints the PATH status summary block to stdout.
 *
 * @param {object} opts
 * @param {string} opts.dir
 * @param {object} opts.persistResult - output of persistPath()
 */
function printPathStatus({ dir, persistResult }) {
  const inCurrent = isInCurrentPath(dir);
  const shell = detectShell();

  if (inCurrent) {
    process.stdout.write(`  PATH (this session)...         ${tick()} (already active)\n`);
  } else {
    const refreshCmd = process.platform === 'win32'
      ? `$env:PATH = "${dir};$env:PATH"`
      : `source ~/.${shell === 'zsh' ? 'zshrc' : 'bashrc'}`;
    process.stdout.write(`  PATH (this session)...         ${tick()} (new terminal, or run: ${refreshCmd})\n`);
  }

  if (persistResult.skipped) {
    process.stdout.write(`  PATH (persistent)...           skipped (--path none)\n`);
    return;
  }

  if (persistResult.alreadyPresent) {
    process.stdout.write(`  PATH (persistent)...           ${tick()} (already in profile)\n`);
    return;
  }

  if (persistResult.success) {
    process.stdout.write(`  PATH (persistent)...           ${tick()} → ${dim(persistResult.profilePath ?? 'registry')}\n`);
  } else {
    process.stdout.write(`  PATH (persistent)...           ${yellow('manual setup needed')}\n`);
  }
}

/**
 * Returns human-readable instructions for manually persisting PATH.
 */
function manualPathInstructions(dir = binDir()) {
  if (process.platform === 'win32') {
    return [
      `  To persist PATH on Windows, run in PowerShell (admin):`,
      `    [System.Environment]::SetEnvironmentVariable('PATH', "${dir};" + [System.Environment]::GetEnvironmentVariable('PATH','User'), 'User')`,
      `  Or open System Properties → Environment Variables → Path → New → ${dir}`,
    ].join('\n');
  }

  const shell = detectShell();
  const profile = shellProfile(shell);
  return [
    `  To persist PATH, add to ${profile}:`,
    `    ${exportLine(dir)}`,
    `  Then: source ${profile}`,
  ].join('\n');
}

module.exports = {
  detectShell,
  shellProfile,
  sessionActivateCommands,
  persistPath,
  isInCurrentPath,
  printPathStatus,
  manualPathInstructions,
};
