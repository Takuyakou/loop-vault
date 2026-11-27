<!-- phase-id: 5.18.1 -->

# Contract 04 — History / Migration

## Facts only

History may store:

- source kind
- stable preset ID / catalog version
- stable Vault reference
- snapshot signature
- safe source label
- selected tonal center
- selected section
- original/effective BPM
- bassline level

No accuracy or ability score is introduced.

## Legacy

Old attempts without source metadata remain readable.

Current default IDs and serialized references are not destructively migrated.

## Edited/deleted Vault source

Historical snapshot remains readable.
Retained recording remains playable/deletable.
Deleted source cannot start a new practice.
No automatic substitution.
