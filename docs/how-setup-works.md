# How `setup` works — step by step

This explains exactly what happens when a user runs `npx hellojohn-oss` (or `npx hellojohn-oss setup`).

---

## Step 1: Platform detection (`src/lib/platform.js`)

Reads `os.platform()` and `os.arch()` from Node.js and maps them to Go's naming:

| Node value | Go name |
|------------|---------|
| `linux`    | `linux` |
| `darwin`   | `darwin` |
| `win32`    | `windows` |
| `x64`      | `amd64` |
| `arm64`    | `arm64` |

If the combination is not in the supported list, setup fails with a clear error message.

Output: `linux/amd64`, `darwin/arm64`, `windows/amd64`, etc.

---

## Step 2: Fetch release info (`src/lib/github-releases.js`)

Calls the GitHub API:

```
GET https://api.github.com/repos/HelloJohn-OSS/hellojohn/releases/latest
```

Or if `--version v1.2.3` was passed:

```
GET https://api.github.com/repos/HelloJohn-OSS/hellojohn/releases/tags/v1.2.3
```

Returns the release tag and the list of assets with their download URLs and sizes.

---

## Step 3: Build asset filenames

For `linux/amd64` and release `v1.2.3`:

```
hellojohn_v1.2.3_linux_amd64.tar.gz
hjctl_v1.2.3_linux_amd64.tar.gz
```

For `windows/amd64`:

```
hellojohn_v1.2.3_windows_amd64.zip
hjctl_v1.2.3_windows_amd64.zip
```

If an asset with that name doesn't exist in the release, setup fails and lists what assets ARE available.

---

## Step 4: Download binaries (`src/lib/downloader.js`)

For each binary:

1. Makes an HTTPS GET request to the GitHub asset URL
2. GitHub redirects to an S3 URL — the downloader follows the redirect automatically
3. Streams the response to a temp file in `os.tmpdir()`
4. Renders a progress bar when `Content-Length` is in the response headers
5. Falls back to a spinner when `Content-Length` is missing
6. In CI/non-TTY: no progress, just prints start + done lines

**Retry logic**: on network error, waits 1s then 3s then 9s before giving up.
After the final failure, prints the manual download URL and `--local-path` instructions.

---

## Step 5: Extract binary

For `.tar.gz`:
1. Tries system `tar -xzf <archive> -C ~/.hellojohn/bin <binaryname>`
2. Falls back to the pure-Node tar parser (`src/lib/tar-parser.js`) if `tar` is not available

For `.zip`:
1. On Windows: PowerShell `Expand-Archive`
2. On Linux/macOS: system `unzip`

After extraction, `chmod 755` is applied on Unix.

---

## Step 6: Verify

Runs `hellojohn --version` and `hjctl --version` to confirm the binaries are executable.

---

## Step 7: PATH management (`src/lib/path-manager.js`)

Three layers, in order:

**Layer 1 (always):** The binary is available in the current npm/npx process via the explicit path. The installer prints the `source` or PowerShell command to activate it in the current terminal session.

**Layer 2 (default):** Appends the export line to the user's shell profile:
- `~/.zshrc` for zsh
- `~/.bashrc` for bash
- Fish: `~/.config/fish/conf.d/hellojohn.fish`
- Windows: `setx PATH`

If the path is already there, it says "already in profile" and skips.

**Layer 3 (`--path none`):** Does nothing. Just prints the absolute path.

---

## Step 8: Print NEXT STEPS box

Prints the success box with:
- Installed version
- PATH instructions (if needed)
- What to run next: `hjctl local init` → `hjctl local start`
- Or: `npx hellojohn-oss quickstart`

---

## Flags reference

| Flag | Default | Description |
|------|---------|-------------|
| `--version <tag>` | latest | Pin a specific release tag |
| `--path user\|system\|none` | `user` | PATH persistence mode |
| `--force` | false | Re-download even if already installed |
| `--retry <n>` | 3 | Download attempt count |
| `--local-path <file>` | — | Skip download, use local archive |
| `--quiet` | false | Suppress non-error output |

---

## Air-gapped installs (`--local-path`)

If the machine has no internet access:

1. Download the archives on another machine from the GitHub Releases page
2. Transfer them to the target machine
3. Run:

```bash
npx hellojohn-oss setup --local-path /path/to/hellojohn_v1.2.3_linux_amd64.tar.gz
```

The installer will look in the same directory for `hjctl_*.tar.gz` as well.
