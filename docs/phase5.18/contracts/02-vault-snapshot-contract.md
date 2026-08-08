<!-- phase-id: 5.18 -->

# Contract 02 — Vault Progression Snapshot

## Direction
`Vault → Practice` only. P5.18-00 locks a future in-memory snapshot boundary;
it does not change the Vault schema or repository in this stage.

## Snapshot v1
`chord-context-snapshot-v1` contains only:
- stable logical source reference (idea/block ids), source type, and safe label
- detected key/mode when present
- original BPM and 4/4 meter
- selected section start/end and the selected chord events
- for each chord: root, quality, optional slash bass, onset, and duration
- a deterministic signature of canonical snapshot content

The signature must be deterministic and must not include a path, timestamp,
user identity, or mutable source object identity.

## Supported section
A source section is one or two complete 4/4 bars, with 1–8 beats and 1–8 chord
events. Start/end are explicit chord boundaries. A source that lacks valid 4/4
timing, key data required by the generator, BPM in 30–240, or a selectable
section is unavailable for this flow. Do not clip, substitute, or silently
normalize it into another progression.

## Forbidden data
- raw MIDI bytes or external source contents
- personal absolute paths and source filesystem paths
- source asset metadata, user-identifying metadata, or recordings
- Vault mutation or Practice-to-Vault write-back

## Lifecycle
- New practice takes a fresh immutable snapshot from the current source.
- Historical attempts retain their original snapshot/signature and are never
  rewritten after source edit.
- Deleted sources leave History and retained takes readable/playable/deletable,
  but cannot start new practice and cannot be replaced automatically.