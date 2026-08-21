# Contract 07 — Security / Privacy

Preserve P1 Security Hardening without widening CSP, Tauri capabilities, MIDI intake, or file permissions.

Never commit or report private MIDI, raw audio, `.local-evaluation`, personal absolute paths, source filenames/track names, device ids, raw source note dumps, or anything inferred from a user's captured performance.

The `sourceBassline` subtree is strict. Unknown or forbidden fields are rejected, never preserved or stripped. Errors disclose neither paths nor note content. Existing unrelated outer Vault provenance fields predate P5.22 and must not be copied into the subtree; negative export claims are scoped accordingly.

External invalid snapshot data rejects the entire import before write. Local corrupt data follows the documented backup/recovery/quarantine path. Aggregate size checks cover save/export/import/merge as Contract 03 requires.

## Automated fixtures

Use synthetic deterministic objects, never MIDI binaries:

- single/multiple/no Bass Voice and explicit/stale selection;
- source-matched automatic and eligible exact manual ranges, plus ineligible arbitrary/unprovable/misaligned multi-source ranges;
- integer triplet/odd-PPQ timing passed through the raw-tick transient path;
- proof that float-beat reverse reconstruction is rejected;
- range/window starts-before, ends-after, spans-all, exact-boundary, simultaneous, overlap, empty, and final-partial cases;
- exact/under/over 8,192-note and 1 MiB snapshot limits;
- exact/under/over 16 MiB whole-Vault save/export/import/merge limits;
- harmony gaps, conflicting overlaps, exact-boundary ties, missing integer authority, and comparison outcomes;
- malformed/noncanonical fractions, non-finite values, invalid pitch/velocity/order/signatures;
- forbidden subtree keys and strict whole-import rejection;
- immutable update rejection, deep duplicate, embedded delete;
- Vault TypeScript v1 migration/v2 round-trip/>2 readonly/non-write and same-key Practice Rust+TypeScript v1 migration/v2/>2 non-write;
- playback cleanup, keyboard, focus, JA/EN, aria, 320px, and 200% behavior.

## Empirical and human evidence

No committable privacy-safe aggregate note distribution was found at Stage00. Budgets are explicitly security/synthetic decisions, not empirical percentiles. If a future privacy-safe aggregate is produced, it must contain no title/path/Voice label/note dump or per-file reconstruction risk and remains optional evidence, not permission to weaken caps.

Real MIDI is optional, ignored/local, and selected by the user only for final product judgment. Acceptance records only PASS/FAIL and UI behavior. Privacy acceptance asserts that the new `sourceBassline` subtree contains no forbidden fields; it does not claim that pre-existing legacy outer Vault provenance fields are absent. Reports still never record a path, private title, Voice label, note list, or inferred musical content.