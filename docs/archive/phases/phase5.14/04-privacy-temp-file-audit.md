# Phase 5.14 Privacy and Temp File Audit

## Save path

- The save dialog returns the user-selected destination.
- Missing extensions become `.mid`; `.mid` and `.midi` are retained.
- Rust validates the `MThd` header before writing.
- Writes use a sibling temporary file, `sync_all`, then atomic replacement.
- Errors shown to UI do not include stack traces or absolute paths.

## Drag cache

- Location: Tauri application cache under `midi-export`
- Key: SHA-256 of the exact MIDI bytes
- Reuse: only an exact nonzero regular file is reused
- TTL: 24 hours
- Lifetime: files are not deleted while a DAW may still read them
- Startup: stale cleanup is best-effort and does not block launch

Cleanup examines only direct children of the app-managed cache directory. It
skips directories, symlinks, and extensions other than `.mid` and `.tmp`.
Cleanup never traverses the Vault, repository, user save folder, or an
arbitrary path.

## Native drag trust boundary

The frontend cannot pass an arbitrary file path to `DoDragDrop`. It supplies a
short-lived token. Rust resolves the token and revalidates:

1. expiry
2. app-cache parent
3. `.mid` extension
4. regular non-symlink file
5. nonzero and expected byte length
6. SHA-256 content hash

## Data minimization

Only musical events, tempo, meter, and chord marker labels enter the MIDI
file. Idea title, source path, memo, tags, API data, and Vault metadata are not
serialized. No generated MIDI, personal MIDI, `.local-evaluation`, cache, or
build artifact is tracked by Git.

