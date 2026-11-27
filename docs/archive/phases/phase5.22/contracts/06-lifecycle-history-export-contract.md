# Contract 06 — Lifecycle / History / Export

## Immutable lifecycle

`sourceBassline` is immutable after save. Any public `updateProgressionBlock` request that contains a `sourceBassline` own property is explicitly rejected before mutation; it is not ignored or spread into the block.

- Duplicate deep-clones notes, exact fractions, and captured harmony, assigns a new block id, and preserves both signatures.
- Delete removes the embedded snapshot with its owning block.
- Legacy blocks remain absent; no backfill occurs.
- Restart and valid v2 import preserve canonical snapshot bytes and signatures.

A current/captured harmony mismatch is visible and never selects another source.

## Practice History

History stores only factual references:

- source kind `source-bassline`;
- idea/block logical reference;
- snapshot schema version and `snapshotSignature`;
- 1/2-bar requested window and actual final range;
- Level 1/2/3;
- monophonic projection used;
- omitted/clipped counts;
- self review and existing opaque retained-take id when present.

History never stores note arrays, captured harmony, either legacy outer title/path, raw MIDI/audio, or device data. After block deletion the row stays readable, replay is unavailable, and no substitute source is selected. These facts use the same-key/path Practice fileVersion 2 migration in Contract 03.

## Aggregate save and export

Before local save or export, serialize the complete candidate Vault canonically and enforce the 16 MiB UTF-8 aggregate limit. Failure occurs before temp/destination creation or atomic replace, preserves the existing file, and shows a path-free localized error. A requested opted-in snapshot may be omitted only after a second explicit user confirmation; opt-in OFF uses the ordinary save path.

A structurally valid legacy v1 Vault already above 16 MiB opens in size-recovery readonly mode rather than quarantine. Add, duplicate, import, merge, and export are blocked. Only delete/shrink operations that produce one complete canonical v2 document at or below 16 MiB may commit atomically; otherwise the legacy file is unchanged.

Vault export includes `sourceBassline` and Capture discloses this before opt-in. Negative export assertions are scoped to the strict `sourceBassline` subtree because pre-existing outer Vault provenance fields remain outside P5.22 scope.

## Import and local corruption

External import performs byte preflight, strict envelope/version parsing, strict `sourceBassline` unknown/forbidden-key validation, per-snapshot limits/signatures/order checks, and complete post-merge aggregate preflight before any write. One invalid external snapshot rejects the entire import; valid sibling ideas are not partially imported or quarantined.

Structurally corrupt local canonical data uses the existing startup backup/recovery/quarantine model. An invalid local snapshot quarantines its containing local record and surfaces the condition; no automatic clean save may erase it. A structurally valid oversized legacy v1 Vault uses size-recovery mode, not quarantine. Future/invalid version handling remains non-writing.