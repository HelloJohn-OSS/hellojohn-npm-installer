# GitHub Release Asset Requirements

The installer depends on GitHub Releases in `HelloJohn-OSS/hellojohn` having assets with specific names.

---

## Required asset naming

For each release tag (e.g. `v1.2.3`), the following assets must be present:

```
hellojohn_v1.2.3_linux_amd64.tar.gz
hellojohn_v1.2.3_linux_arm64.tar.gz
hellojohn_v1.2.3_darwin_amd64.tar.gz
hellojohn_v1.2.3_darwin_arm64.tar.gz
hellojohn_v1.2.3_windows_amd64.zip
hellojohn_v1.2.3_windows_arm64.zip

hjctl_v1.2.3_linux_amd64.tar.gz
hjctl_v1.2.3_linux_arm64.tar.gz
hjctl_v1.2.3_darwin_amd64.tar.gz
hjctl_v1.2.3_darwin_arm64.tar.gz
hjctl_v1.2.3_windows_amd64.zip
hjctl_v1.2.3_windows_arm64.zip
```

Pattern: `<binary>_<tag>_<os>_<arch>.<ext>`
- `<binary>`: `hellojohn` or `hjctl`
- `<tag>`: exactly the GitHub release tag, including the `v` prefix
- `<os>`: `linux`, `darwin`, `windows`
- `<arch>`: `amd64`, `arm64`
- `<ext>`: `.tar.gz` for Linux/macOS, `.zip` for Windows

---

## Archive contents

Each archive must contain the binary at the **root level** (no subdirectory):

```
# Good
hellojohn_v1.2.3_linux_amd64.tar.gz
└── hellojohn                    ← binary at root

# Also OK
hellojohn_v1.2.3_linux_amd64.tar.gz
└── hellojohn_v1.2.3_linux_amd64/
    └── hellojohn                ← binary in one subdirectory
```

The extractor uses `tar -xzf <archive> -C ~/.hellojohn/bin hellojohn` (extracts only the target binary by name). Nested paths deeper than one level may require updating `downloader.js`.

---

## Optional: checksums file

```
checksums.txt
```

Contents format (sha256):
```
abc123...  hellojohn_v1.2.3_linux_amd64.tar.gz
def456...  hjctl_v1.2.3_linux_amd64.tar.gz
...
```

In Phase 1, checksum verification is optional. In Phase 2 it becomes mandatory.
To enable it: implement `verifyChecksum()` in `downloader.js` after the download step.

---

## How to build release assets (Go CI example)

Using GoReleaser (`.goreleaser.yml`):

```yaml
builds:
  - id: hellojohn
    binary: hellojohn
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]

  - id: hjctl
    binary: hjctl
    main: ./cmd/hjctl
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]

archives:
  - id: hellojohn
    builds: [hellojohn]
    name_template: "hellojohn_{{ .Tag }}_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        format: zip

  - id: hjctl
    builds: [hjctl]
    name_template: "hjctl_{{ .Tag }}_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        format: zip

checksum:
  name_template: "checksums.txt"
```

GoReleaser produces exactly the naming convention the installer expects.

---

## Testing the installer against a real release

```bash
# Pin a specific version
npx hellojohn-oss setup --version v1.2.3

# Verify it found the assets
npx hellojohn-oss doctor
```
