# hellojohn-oss

> **One command to install and run HelloJohn OSS — your self-hosted, open-source auth platform.**

[![npm version](https://img.shields.io/npm/v/hellojohn-oss)](https://www.npmjs.com/package/hellojohn-oss)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Quickstart (recommended)

```bash
npx hellojohn-oss quickstart
```

This single command will:
1. Download the `hellojohn` and `hjctl` binaries for your platform
2. Generate cryptographic keys and create a local config profile
3. Start the server in the background
4. Print a "Connect to Cloud?" hint if you have a tunnel token

---

## Standard flow

```bash
# 1. Install binaries
npx hellojohn-oss

# 2. Initialize local config
hjctl local init

# 3. Start the server
hjctl local start

# 4. (Optional) Connect to HelloJohn Cloud
hjctl local connect --token hjtun_...
```

Time to first running instance: **< 3 minutes**.

---

## Commands

### `npx hellojohn-oss` / `npx hellojohn-oss setup`

Downloads and installs `hellojohn` and `hjctl` to `~/.hellojohn/bin`.

```
Options:
  --version <tag>      Pin a specific release (default: latest)
  --path user|system|none  PATH persistence mode (default: user)
  --force              Re-download even if already installed
  --retry <n>          Download attempt count (default: 3)
  --local-path <file>  Use a local archive (air-gapped installs)
```

### `npx hellojohn-oss quickstart`

One-command onboarding. Chains setup → init → start.

```
Options:
  --port <n>           Server port (default: 8080)
  --yes                Skip start confirmation
  --profile <name>     Env profile name (default: default)
  --no-connect         Skip cloud connect step
```

### `npx hellojohn-oss doctor`

Validates your installation: binaries, PATH, env profile integrity, file permissions.

### `npx hellojohn-oss update [--version <tag>]`

Re-downloads and replaces binaries.

### `npx hellojohn-oss uninstall`

Removes installed binaries. Config files are kept by default.

```
Options:
  --remove-config      Also remove ~/.hellojohn (env files, run state)
  --yes                Skip confirmation
```

### `npx hellojohn-oss hjctl <args>`

Proxies directly to the installed `hjctl` binary. Useful when `hjctl` is not in PATH yet.

```bash
npx hellojohn-oss hjctl local status
npx hellojohn-oss hjctl local logs --follow
```

---

## Runtime management (`hjctl local`)

Once installed, use `hjctl` to manage your local instance:

```bash
hjctl local init                           # Create config profile (auto-generates keys)
hjctl local start                          # Start server in background
hjctl local stop                           # Stop server (and tunnel if running)
hjctl local status                         # Show server + tunnel status
hjctl local logs --follow                  # Tail server logs

hjctl local connect --token hjtun_...      # Connect to HelloJohn Cloud relay
hjctl local tunnel status                  # Check tunnel connection
hjctl local tunnel stop                    # Disconnect tunnel only

hjctl local env list                       # List config variables
hjctl local env set KEY=value              # Set a config variable
hjctl local env edit                       # Open config in $EDITOR
```

---

## Install locations

| Path | Description |
|------|-------------|
| `~/.hellojohn/bin/` | `hellojohn` and `hjctl` binaries |
| `~/.hellojohn/env/default.env` | Default config profile |
| `~/.hellojohn/run/` | PID files, state, and logs |

---

## Using without PATH changes

If you prefer not to modify PATH, use the npx proxy for all commands:

```bash
npx hellojohn-oss setup --path none
npx hellojohn-oss hjctl local init
npx hellojohn-oss hjctl local start
npx hellojohn-oss hjctl local status
```

---

## `npm install -g` support

```bash
npm install -g hellojohn-oss
# → postinstall automatically runs setup
hellojohn-oss quickstart
```

If the postinstall hook was skipped (`--ignore-scripts`):

```bash
hellojohn-oss setup
```

---

## Air-gapped installs

If the target machine has no internet access:

1. Download the archives from the [GitHub Releases page](https://github.com/HelloJohn-OSS/hellojohn/releases) on another machine
2. Transfer both `hellojohn_*` and `hjctl_*` archives to the target machine
3. Run:

```bash
npx hellojohn-oss setup --local-path /path/to/hellojohn_v1.2.3_linux_amd64.tar.gz
```

The installer looks for the `hjctl` archive in the same directory automatically.

---

## CI environments

The `postinstall` hook is automatically skipped when:

- `CI=true` is set (standard in GitHub Actions, CircleCI, etc.)
- `HELLOJOHN_SKIP_POSTINSTALL=true` is set explicitly

This prevents unintended binary downloads in build pipelines. If you need the binaries in CI, run `hellojohn-oss setup` as an explicit step.

---

## Troubleshooting

**"Asset not found in release"**
The GitHub Release exists but the asset names don't match the expected pattern.
Check that your release assets follow the naming convention: `hellojohn_v<tag>_<os>_<arch>.tar.gz`.

**"Platform X is not supported"**
The current platform is not in the supported list. Supported: Linux (amd64/arm64), macOS (amd64/arm64), Windows (amd64/arm64).

**"Binary failed to execute after install"**
The binary was extracted but won't run. Check:
1. The binary matches your platform (not accidentally cross-compiled)
2. On Unix: permissions — `ls -la ~/.hellojohn/bin/` should show `-rwxr-xr-x`
3. On macOS: Gatekeeper may block unsigned binaries — run:
   ```bash
   xattr -d com.apple.quarantine ~/.hellojohn/bin/hellojohn ~/.hellojohn/bin/hjctl
   ```

**postinstall was skipped (`--ignore-scripts`)**
Run setup manually:
```bash
hellojohn-oss setup
# or via npx if not globally installed:
npx hellojohn-oss setup
```

**Windows: PATH not persisting after terminal restart**
`setx` has a 1024-character limit on older Windows versions. If the PATH wasn't updated, add `%USERPROFILE%\.hellojohn\bin` manually via System Properties → Environment Variables.

---

## Requirements

- Node.js 18+
- Internet access (or use `--local-path` for air-gapped installs)
- Supported platforms: Linux (amd64/arm64), macOS (amd64/arm64), Windows (amd64/arm64)

---

## License

MIT — see [LICENSE](../../LICENSE).
