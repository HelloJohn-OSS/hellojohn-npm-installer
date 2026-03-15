'use strict';

/**
 * `hellojohn-oss quickstart` — single-command onboarding.
 *
 * Chains: setup → hjctl local init → hjctl local start
 * Then optionally: hjctl local connect (if tunnel token is available)
 *
 * Options:
 *   --version <tag>  pin binary version
 *   --port <n>       override server port (default: 8080)
 *   --yes            skip server-start confirmation
 *   --profile <name> env profile name (default: default)
 *   --no-connect     skip cloud connect even if token is set
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const { runSetup }  = require('./setup');
const { printBox }  = require('../ui/box');
const { tick, yellow, bold, dim, green } = require('../ui/colors');
const { binDir }    = require('../lib/install-dir');
const { detect }    = require('../lib/platform');

async function runQuickstart(opts = {}) {
  const {
    version    = null,
    port       = 8080,
    yes        = false,
    profile    = 'default',
    noConnect  = false,
    retry      = 3,
  } = opts;

  let platform;
  try {
    platform = detect();
  } catch (err) {
    process.stderr.write(`\n  ${err.message}\n`);
    process.exit(1);
  }

  const hjctl = path.join(binDir(), 'hjctl' + platform.exeSuffix);

  // ── Pre-step: Stop running server before installing ───────────────────────
  // On Windows, running executables are locked — fs.copyFileSync throws EBUSY
  // when trying to overwrite hellojohn.exe while the server is running.
  // If hjctl is already installed from a prior run, stop the server gracefully
  // before setup attempts to overwrite the binary.
  if (fs.existsSync(hjctl)) {
    spawnSync(hjctl, ['local', 'stop', '--server-only'], {
      stdio: 'pipe',
      env: { ...process.env, PATH: `${binDir()}${path.delimiter}${process.env.PATH}` },
    });
  }

  // ── Step 1/3: Install ────────────────────────────────────────────────────
  process.stdout.write('\nStep 1/3  Installing HelloJohn OSS...\n');

  let installVersion;
  try {
    const result = await runSetup({ version, path: 'user', force: false, retry, condensed: true });
    installVersion = result.version;
  } catch (err) {
    process.stderr.write(`\n  ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 2/3: Init ───────────────────────────────────────────────────────
  process.stdout.write(`\nStep 2/3  Initializing local environment...\n`);

  const initEnvFile = path.join(os.homedir(), '.hellojohn', 'env', `${profile}.env`);
  const initExists  = fs.existsSync(initEnvFile);

  if (!initExists) {
    const initResult = spawnSync(hjctl, ['local', 'init', '--profile', profile], {
      stdio: 'inherit',
      env: { ...process.env, PATH: `${binDir()}${path.delimiter}${process.env.PATH}` },
    });
    if (initResult.status !== 0) {
      process.stderr.write(`\n  Init failed. Run: hjctl local init --profile ${profile}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(`  ${tick()} Profile already initialized (${initEnvFile})\n`);
  }

  // ── Step 3/3: Start ──────────────────────────────────────────────────────
  process.stdout.write(`\nStep 3/3  Starting local server...\n`);

  const hjctlEnv = { ...process.env, PATH: `${binDir()}${path.delimiter}${process.env.PATH}` };

  // Stop any leftover hellojohn server from a previous run (no-op if nothing is running)
  spawnSync(hjctl, ['local', 'stop', '--server-only'], { stdio: 'pipe', env: hjctlEnv });

  // Kill any previous hellojohn process on the target port (safe — never kills unrelated services)
  killHellojohnOnPort(port);

  // Find a free port — like Next.js, auto-advance if preferred port is in use
  const resolvedPort = await findFreePort(port);
  if (resolvedPort === null) {
    process.stderr.write(
      `\n  No free port found near ${port}. ` +
      `Free a port and re-run: npx hellojohn-oss quickstart --port <n>\n`
    );
    process.exit(1);
  }
  if (resolvedPort !== port) {
    process.stdout.write(
      `  Port ${port} is in use — using port ${resolvedPort} instead\n`
    );
  }

  const startResult = spawnSync(hjctl, [
    'local', 'start',
    '--profile', profile,
    '--port', String(resolvedPort),
  ], {
    stdio: 'inherit',
    env: hjctlEnv,
  });

  if (startResult.status !== 0) {
    process.stderr.write(`\n  Server start failed. Run: hjctl local start --port ${resolvedPort}\n`);
    process.exit(1);
  }

  // ── Sync hjctl base-url config to the resolved port ─────────────────────
  // hjctl persists base-url in ~/.hjctl/config.yaml. If a previous run used
  // a different port, 'hjctl auth login' would hit the wrong port. We update
  // it unconditionally so it always matches the running server.
  spawnSync(hjctl, ['config', 'set', 'base-url', `http://localhost:${resolvedPort}`], {
    stdio: 'pipe',
    env: hjctlEnv,
  });

  // ── Optional Step 4/4: Cloud connect ────────────────────────────────────
  const tunnelToken = detectTunnelToken(initEnvFile);

  if (!noConnect && tunnelToken) {
    process.stdout.write(`\nStep 4/4  Connecting to HelloJohn Cloud...   ${dim('(token found in env)')}\n`);

    const connectResult = spawnSync(hjctl, [
      'local', 'connect',
      '--profile', profile,
    ], {
      stdio: 'inherit',
      env: { ...process.env, PATH: `${binDir()}${path.delimiter}${process.env.PATH}` },
    });

    if (connectResult.status !== 0) {
      process.stdout.write(`  ${yellow('⚠')}  Could not connect tunnel. Run: hjctl local connect --token hjtun_...\n`);
    }
  } else {
    const boxLines = [
      `${tick()}  HelloJohn OSS is running`,
      null,
      `URL:      http://localhost:${resolvedPort}`,
      `Profile:  ${profile}`,
      `Logs:     hjctl local logs --follow`,
      `Stop:     hjctl local stop`,
    ];

    // ── Show admin credentials from profile env file ─────────────────────────
    // hjctl local init writes HELLOJOHN_ADMIN_EMAIL + HELLOJOHN_ADMIN_PASSWORD
    // into the profile .env file. We read them from there so the user always
    // sees their login credentials without needing to find any files.
    const creds = readInitialCredentials(initEnvFile);
    if (creds) {
      boxLines.push(null);
      boxLines.push(`Admin login:`);
      boxLines.push(`  Email:    ${creds.email}`);
      boxLines.push(`  Password: ${creds.password}`);
      boxLines.push(`  Run: hjctl auth login`);
    }

    boxLines.push(null);
    boxLines.push(`Connect to HelloJohn Cloud?`);
    boxLines.push(`If you have a tunnel token, run:`);
    boxLines.push(`  hjctl local connect --token hjtun_...`);
    boxLines.push(`Get a token from: cloud.hellojohn.com`);

    printBox(boxLines);
  }

  // ── Open a new terminal with PATH pre-loaded ─────────────────────────────
  // The user can run hjctl immediately without restarting their shell.
  launchReadyTerminal({ binDir: binDir(), port: resolvedPort, profile });
}

/**
 * Launches a new terminal window with ~/.hellojohn/bin in PATH.
 * The user lands in a shell where hjctl is immediately available.
 * Silent on any error — not critical if the terminal can't be opened.
 */
function launchReadyTerminal({ binDir: bin, port, profile }) {
  const { spawn } = require('child_process');

  try {
    if (process.platform === 'win32') {
      // PowerShell welcome script: set PATH, show status, print hint
      // Use an array joined with newlines — more robust than semicolons for multi-statement scripts
      const psLines = [
        `$env:PATH = "${bin};$env:PATH"`,
        `Write-Host ""`,
        `Write-Host "  HelloJohn OSS is running at http://localhost:${port}" -ForegroundColor Green`,
        `Write-Host "  Profile: ${profile}"`,
        `Write-Host ""`,
        `Write-Host "  hjctl local status      -- check server status"`,
        `Write-Host "  hjctl local logs        -- view server logs"`,
        `Write-Host "  hjctl local stop        -- stop the server"`,
        `Write-Host ""`,
        `hjctl local status`,
      ];
      // Write a temp .ps1 file so we don't hit any quoting/length limits
      const tmpPs1 = require('os').tmpdir() + '\\hellojohn-ready.ps1';
      require('fs').writeFileSync(tmpPs1, psLines.join('\r\n'), 'utf8');

      // cmd /c start — forces Windows to open a new visible console window
      spawn('cmd.exe', [
        '/c', 'start', 'powershell.exe',
        '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1,
      ], { detached: true, stdio: 'ignore' }).unref();

    } else if (process.platform === 'darwin') {
      // macOS: open new Terminal tab
      const script = `export PATH="${bin}:$PATH"; echo "\\nHelloJohn OSS running at http://localhost:${port}\\n"; hjctl local status`;
      spawn('osascript', [
        '-e', `tell app "Terminal" to do script "${script.replace(/"/g, '\\"')}"`,
      ], { detached: true, stdio: 'ignore' }).unref();

    } else {
      // Linux: try common terminal emulators in order
      const cmd = `export PATH="${bin}:$PATH"; echo "HelloJohn OSS running at http://localhost:${port}"; hjctl local status; exec bash`;
      for (const term of ['gnome-terminal', 'xterm', 'konsole', 'xfce4-terminal']) {
        try {
          const args = term === 'gnome-terminal'
            ? ['--', 'bash', '-c', cmd]
            : ['-e', `bash -c '${cmd}'`];
          spawn(term, args, { detached: true, stdio: 'ignore' }).unref();
          break;
        } catch {}
      }
    }
  } catch { /* non-critical — user can open their own terminal */ }
}

/**
 * Checks whether a TCP port is free by attempting to bind to it.
 * Returns true if free, false if in use.
 */
function isPortFree(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(() => resolve(true)); });
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * Finds the first free port starting from `preferred`.
 * Tries preferred, preferred+1, preferred+2, … up to preferred+9.
 * Returns the free port number, or null if none found.
 */
async function findFreePort(preferred) {
  for (let delta = 0; delta <= 9; delta++) {
    const candidate = preferred + delta;
    if (await isPortFree(candidate)) return candidate;
  }
  return null;
}

/**
 * Best-effort: kill a hellojohn process using `port` (only if it's a
 * previous hellojohn/hjctl instance — never kills unrelated services).
 */
function killHellojohnOnPort(port) {
  const { execSync } = require('child_process');
  try {
    let pids = [];
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "netstat -ano | Select-String ':${port} '"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      pids = [...new Set(
        out.split('\n')
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && /^\d+$/.test(p) && p !== '0')
      )];
      // Only kill if the process is hellojohn.exe or hjctl.exe
      for (const pid of pids) {
        try {
          const name = execSync(
            `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Name"`,
            { encoding: 'utf8', stdio: 'pipe' }
          ).trim().toLowerCase();
          if (name === 'hellojohn' || name === 'hjctl') {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          }
        } catch {}
      }
    } else {
      try { execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' }); } catch {}
    }
  } catch { /* safe — we'll just use a different port if this fails */ }
}

/**
 * Reads admin credentials from the hjctl profile env file.
 * `hjctl local init` writes HELLOJOHN_ADMIN_EMAIL and HELLOJOHN_ADMIN_PASSWORD
 * into ~/.hellojohn/env/<profile>.env — that's the authoritative source.
 * Returns { email, password } or null if not found / not set.
 */
function readInitialCredentials(profileEnvFile) {
  if (!profileEnvFile || !fs.existsSync(profileEnvFile)) return null;
  try {
    const content = fs.readFileSync(profileEnvFile, 'utf8');
    let email = null;
    let password = null;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('HELLOJOHN_ADMIN_EMAIL=')) {
        email = trimmed.slice('HELLOJOHN_ADMIN_EMAIL='.length).trim().replace(/^["']|["']$/g, '');
      }
      if (trimmed.startsWith('HELLOJOHN_ADMIN_PASSWORD=')) {
        password = trimmed.slice('HELLOJOHN_ADMIN_PASSWORD='.length).trim().replace(/^["']|["']$/g, '');
      }
    }
    if (email && password) return { email, password };
  } catch { /* unreadable */ }
  return null;
}

/** Read HELLOJOHN_TUNNEL_TOKEN from an env file if uncommented. */
function detectTunnelToken(envFile) {
  if (!fs.existsSync(envFile)) return null;
  try {
    const content = fs.readFileSync(envFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('HELLOJOHN_TUNNEL_TOKEN=')) {
        const value = trimmed.slice('HELLOJOHN_TUNNEL_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
        if (value && value !== 'hjtun_your_token_here') return value;
      }
    }
  } catch {}
  return null;
}

module.exports = { runQuickstart };
