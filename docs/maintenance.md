# Maintenance guide — hellojohn-oss npm package

---

## Development setup

No build step required. The package is plain CommonJS.

```bash
cd npm-installer

# Verify all files parse
node --check bin/hellojohn-oss.js
node --check src/**/*.js scripts/postinstall.js

# Run the CLI locally
node bin/hellojohn-oss.js --help
node bin/hellojohn-oss.js --version

# Test platform detection
node -e "console.log(require('./src/lib/platform').detect())"

# Test the box renderer
node -e "require('./src/ui/box').printBox(['Line 1', null, 'Line 2'])"
```

---

## Testing a full install locally

Once GitHub Releases exist with the correct assets:

```bash
# Test setup
node bin/hellojohn-oss.js setup --version v1.2.3

# Test doctor
node bin/hellojohn-oss.js doctor

# Test quickstart (chains setup + init + start)
node bin/hellojohn-oss.js quickstart --yes
```

For CI smoke testing without npm publish, use `npm link`:

```bash
cd npm-installer
npm link
# Now `hellojohn-oss` is available globally from local source
hellojohn-oss setup
hellojohn-oss doctor
```

---

## Adding a new command

1. Create `src/commands/<name>.js` with a `run<Name>(opts)` async function
2. Export it from `src/index.js`
3. Add the case to `bin/hellojohn-oss.js`:
   - Add `--option` parsing in the flags section
   - Add the handler in the `handlers` object
   - Add help text in `printHelp()`
4. Document the new command in `README.md`

---

## Updating the installer version

The installer version (`package.json` → `"version"`) is independent from the HelloJohn binary version.

Bump the installer version when:
- New commands are added
- Bug fixes in download/extraction/PATH logic
- New platform support

The binary version to download defaults to `latest` from GitHub Releases and is not hardcoded in the installer.

```bash
# Bump version
npm version patch   # 0.1.0 → 0.1.1 (bug fix)
npm version minor   # 0.1.0 → 0.2.0 (new feature)
npm version major   # 0.1.0 → 1.0.0 (breaking change)
```

---

## Adding a new supported platform

1. In `src/lib/platform.js`:
   - Add the OS to `PLATFORM_MAP` if new (usually not needed)
   - Add the arch to `ARCH_MAP` if new (e.g. `riscv64`)
   - Add the platform string to `SUPPORTED_PLATFORMS`

2. In `src/lib/downloader.js`:
   - If the new platform uses a different archive format, add it to `extractBinary()`

3. Update `docs/release-assets.md` with the new asset names

4. Ensure the Go CI builds the binary for that platform

---

## Publishing to npm

```bash
cd npm-installer

# Check what will be published
npm pack --dry-run

# Publish
npm publish --access public
```

Make sure `package.json` has the correct:
- `"version"` — bumped appropriately
- `"files"` — only `bin/`, `src/`, `scripts/`, `README.md` are included (no `docs/`, no `node_modules/`)

The `docs/` folder is intentionally excluded from the npm tarball (not in `"files"`). It lives in the repo for developers only.

---

## Debugging download issues

```bash
# Run with verbose output (Node.js HTTP debug)
NODE_DEBUG=http node bin/hellojohn-oss.js setup 2>&1 | head -50

# Test GitHub API directly
node -e "
const { fetchRelease } = require('./src/lib/github-releases');
fetchRelease().then(r => console.log(r.tag, r.assets.map(a => a.name)));
"

# Test a specific release tag
node -e "
const { fetchRelease } = require('./src/lib/github-releases');
fetchRelease('v1.2.3').then(r => console.log(r));
"
```

---

## Common issues

**"Asset not found in release"**
→ The GitHub Release exists but the asset naming doesn't match the expected pattern.
→ Check `docs/release-assets.md` for the exact required naming.

**"Platform X is not supported"**
→ Add it to `SUPPORTED_PLATFORMS` in `platform.js` and ensure the Go build produces the asset.

**"Binary failed to execute after install"**
→ The archive was extracted but the binary can't run. Check:
  1. The binary is for the right platform (not cross-compiled accidentally)
  2. Permissions are set correctly (Unix: `chmod 755`)
  3. On macOS: Gatekeeper may block unsigned binaries — `xattr -d com.apple.quarantine ~/.hellojohn/bin/*`

**postinstall skipped with `--ignore-scripts`**
→ Expected. User must run `hellojohn-oss setup` manually.
→ This is documented in the README troubleshooting section.

**Windows: `setx` truncates PATH**
→ `setx` has a 1024-character PATH limit on older Windows versions.
→ Workaround: instruct user to add the path via System Properties → Environment Variables.
→ The installer already warns about this.
