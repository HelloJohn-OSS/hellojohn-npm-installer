# Architecture — hellojohn-oss npm installer

## What this package is

`hellojohn-oss` is a **runtime downloader installer**: a lightweight npm package whose only job is to download the pre-compiled `hellojohn` and `hjctl` binaries from GitHub Releases and place them on the user's machine.

The Go binaries are NOT bundled inside the npm package. This keeps the npm tarball tiny (~50KB) regardless of how large the binaries are.

---

## File map

```
npm-installer/
│
├── bin/
│   └── hellojohn-oss.js       Entry point. Called when user runs:
│                                  npx hellojohn-oss [command]
│                                  hellojohn-oss [command]   (after npm i -g)
│
├── scripts/
│   └── postinstall.js         Runs automatically after `npm install -g hellojohn-oss`.
│                              Calls runSetup() — same as `hellojohn-oss setup`.
│                              Exits 0 even on failure (doesn't break npm install).
│                              Skipped in CI (CI=true) and when HELLOJOHN_SKIP_POSTINSTALL=true.
│
├── src/
│   ├── index.js               Public API for programmatic use. Re-exports all commands.
│   │
│   ├── commands/              One file per CLI command.
│   │   ├── setup.js           Core: downloads binaries, installs, updates PATH.
│   │   ├── quickstart.js      Chains setup → hjctl local init → hjctl local start.
│   │   ├── doctor.js          Validates binaries, PATH, profile, permissions.
│   │   ├── update.js          Re-runs setup with --force.
│   │   └── uninstall.js       Removes binaries. Keeps config by default.
│   │
│   └── lib/                   Pure utility modules. No side effects unless called.
│       ├── platform.js        Detects OS+arch → Go naming (linux/amd64, etc).
│       ├── github-releases.js GitHub API: fetches latest/tagged release metadata.
│       ├── downloader.js      HTTP download with progress bar, retries, extraction.
│       ├── tar-parser.js      Pure Node.js tar.gz extractor (fallback when `tar` CLI unavailable).
│       ├── install-dir.js     Returns ~/.hellojohn/bin paths. Ensures directory exists.
│       ├── path-manager.js    3-layer PATH strategy: session / profile file / none.
│       └── proxy.js           Forwards `npx hellojohn-oss hjctl <args>` to installed hjctl.
│
│   └── ui/                    Terminal output utilities. No logic.
│       ├── box.js             Renders ╔═══╗ bordered boxes (NEXT STEPS, success, etc).
│       ├── colors.js          ANSI color helpers. Auto-disables in non-TTY.
│       └── progress.js        Progress bar (when Content-Length known) + spinner (when not).
│
└── docs/                      You are here.
    ├── architecture.md        This file.
    ├── how-setup-works.md     Step-by-step walkthrough of the setup command.
    ├── release-assets.md      Required GitHub Release asset naming conventions.
    └── maintenance.md         How to update, test, and publish the package.
```

---

## Data flow — `npx hellojohn-oss`

```
bin/hellojohn-oss.js
  │  parses argv, dispatches to command
  ▼
src/commands/setup.js::runSetup()
  │
  ├─ platform.js::detect()
  │     node os.platform() + os.arch()  →  { os:'linux', arch:'amd64', ext:'.tar.gz', ... }
  │
  ├─ github-releases.js::fetchRelease()
  │     GET api.github.com/repos/HelloJohn-OSS/hellojohn/releases/latest
  │     returns { tag:'v1.2.3', assets:[{name, url, size}] }
  │
  ├─ github-releases.js::findAsset(release, 'hellojohn_v1.2.3_linux_amd64.tar.gz')
  │     finds asset URL from release metadata
  │
  ├─ downloader.js::downloadFile({ url, label, retries:3 })
  │     HTTPS GET → tmp file, renders progress bar, follows redirects (GitHub → S3)
  │     retries with exponential backoff on failure
  │
  ├─ downloader.js::extractBinary({ archivePath, destDir, binary })
  │     .tar.gz → tries system `tar`, falls back to tar-parser.js
  │     .zip    → PowerShell Expand-Archive (Windows) or system unzip
  │     writes binary to ~/.hellojohn/bin/hellojohn
  │
  ├─ [repeat download+extract for hjctl]
  │
  ├─ path-manager.js::persistPath({ mode:'user' })
  │     appends `export PATH="~/.hellojohn/bin:$PATH"` to ~/.zshrc or ~/.bashrc
  │     on Windows: uses `setx`
  │
  └─ ui/box.js::printBox([...])
        prints the ╔══ NEXT STEPS ══╗ box
```

---

## Key design decisions

| Decision | Reason |
|----------|--------|
| Zero npm dependencies | Faster npx execution, no supply chain risk, no npm install step |
| Binaries NOT bundled in npm | Keeps tarball small, one npm package for all platforms |
| `~/.hellojohn/bin` install path | User-local, no sudo required, consistent across platforms |
| 3-layer PATH strategy | Never silently mutates global env; always transparent |
| `postinstall` exits 0 on error | npm install should never fail due to binary download issues |
| CI detection skips postinstall | Prevents unintended binary downloads in build pipelines |
| Pure-Node tar fallback | Works even on Windows without WSL or extra tools installed |

---

## What this package does NOT do

- It does not bundle the Go binaries (they live in GitHub Releases)
- It does not implement `hjctl local` commands (those are in the Go binary at `hellojohn-oss/cmd/hjctl/`)
- It does not manage the tunnel relay server (that lives in HelloJohn Cloud)
- It does not require sudo or admin rights
