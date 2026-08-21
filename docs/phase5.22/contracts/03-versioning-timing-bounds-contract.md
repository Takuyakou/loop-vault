# Contract 03 — Versioning / Timing / Bounds

## Vault version decision

P5.22 uses Vault `fileVersion = 2`.

The current v1 block schema is strict. Adding `sourceBassline` under top-level v1 would make the supported v1.1.0 writer quarantine the containing idea; import/save can then serialize accepted records without it. Optional-field v1 is not round-trip safe.

The v2 path must provide:

- deterministic v1 to v2 migration with `sourceBassline` absent and no backfill;
- v2 startup/load/save/export/import/merge/backup/recovery/quarantine tests;
- the supported v1 Vault TypeScript `parseVaultFileJson` / store path treating v2 as future readonly and refusing writable save;
- versions above v2 remaining readonly and non-writing in the P5.22 writer.

## Practice file version decision

The current TypeScript and Rust Practice storage accept exactly fileVersion 1. An old binary does not recognize v2 as readonly; Rust validation rejects it before JavaScript and existing CAS/precommit behavior leaves the canonical file unmodified.

Stage 04 must keep the same physical Practice storage key/path and implement fileVersion 2 consistently in Rust and TypeScript:

- Rust admits v1 and v2 envelopes, rejects versions above 2 without mutation, and preserves revision/CAS safety;
- TypeScript migrates v1 to v2 with no Source Bassline History, reads/writes v2, and treats versions above 2 as readonly/non-writing;
- backup, recovery, quarantine, concurrent-save, and restart tests cover the migration.

No alternate storage key may split History into two canonical files.

## Exact timing and captured harmony

Source notes use only the raw integer tick path in Contract 02. Float beat reversal is forbidden.

Captured harmony is optional. It is created only when each user-confirmed chord span has a proven transient integer tick authority and can be clipped to the source-matched range without rounding. Exact representability checks may accept an integer value only when equality is proven; they may not manufacture it with rounding. If the authority is unavailable, the all-note snapshot and Level3 may still be saved, but captured harmony, L1/L2, and source Chord Context are unavailable with a localized reason.

## Per-snapshot bounds

- maximum 8,192 notes;
- maximum 1,048,576 UTF-8 bytes for canonical serialized `sourceBassline`;
- exactly zero or one snapshot per progression block;
- pitch integer 0..127 and velocity finite 0..1;
- canonical fractions only;
- start nonnegative and before length, duration positive, end at most length;
- one constant 4/4 range of 1..12 complete bars, maximum 48 quarter-note beats;
- canonical note/harmony order and valid SHA-256 signatures.

The note cap is 3.2768% of the P1 250,000-note MIDI intake cap (about 1/30.52), and permits more than 170 events per beat at maximum length. The 1 MiB snapshot cap is 1/16 of the aggregate Vault cap. These are security/synthetic bounds; no committable privacy-safe empirical user distribution is currently available, so the documentation makes no empirical percentile claim.

## Aggregate Vault bound

The existing 16 MiB external pre-read limit is import-only and is not sufficient by itself. P5.22 locks one `MAX_VAULT_SERIALIZED_BYTES = 16 MiB` UTF-8 preflight across:

- canonical local save/atomic replace;
- export before creating/replacing the destination;
- external import both before and after decoding/parsing;
- merge before canonical save.

An over-limit save/export/merge fails before write and leaves the current canonical/destination file unchanged. Capture offers a second snapshot-free confirmation only when the user explicitly opted ON/requested a snapshot and that snapshot cannot be attached; opt-in OFF follows the ordinary save path with no extra confirmation. It may never silently omit requested data. If even the snapshot-free Vault exceeds the limit, the progression save is denied with a path-free, note-free error.

A structurally valid legacy v1 Vault already above 16 MiB is not quarantined or automatically rewritten. It opens in a localized size-recovery readonly mode. Add, duplicate, import, merge, and export remain blocked; delete or shrink edits are the only writable operations and may commit only when their complete canonical v2 result is at or below 16 MiB. Until that single compliant result can be atomically written, the legacy file remains unchanged. Normal writable mode resumes after the compliant shrink/migration succeeds.

External invalid/over-limit input rejects the entire import before any write. A valid but oversized legacy Vault follows the explicit size-recovery mode above and is not corruption. Structurally corrupt local canonical data follows the existing backup/recovery/quarantine path and is never silently rewritten as clean data.