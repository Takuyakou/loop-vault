# VL-08 — SMF Tempo Default & Vault Preservation

Status: implementation complete; final-HEAD gates and Human Product Acceptance follow separately. This stage does not merge, change Vault v2, restore a real Vault, or promote Phase 9 work.

## Decision and scope

A Standard MIDI File with no Set Tempo event has an effective 120 BPM. Product analysis and Voicing Loop now use that default. Explicit Set Tempo and absent Set Tempo remain distinguishable in runtime diagnostics. The existing Vault v2 schema has no dedicated, safe tempo-provenance field, so no fileVersion change was made. For a newly captured no-tempo SMF, the effective 120 is used in analysis but is **not** written as source BPM into the Idea or ProgressionBlock. The existing MIDI asset link and missing block BPM preserve enough information for the Voicing Loop to resolve `SMF_DEFAULT` after reload. Explicit Set Tempo BPM is saved as before. This is a limited provenance contract: a detached or later edited MIDI link, or a user-entered BPM, cannot reconstruct the original tempo-event absence from Vault v2 alone.

## A. Tempo path and legacy handling

Before VL-08, `analyzeMidiTempo` returned no `representativeBpm` when the tempo-event list was empty. `parseRawSmf` exposed no tempo, Product analysis propagated missing BPM, `CaptureView.saveNew`/`createIdeaFromDraft`/`toSavedProgressionBlock` persisted no BPM, and `buildProgressionVoicingPracticeHandoffFromVault` passed an undefined BPM to the snapshot builder. The snapshot then returned `invalid-bpm`. This could make an otherwise valid captured SMF unusable in Voicing Loop.

`src/domain/midi/tempoAnalysis.ts::analyzeMidiTempo` now applies 120 only when **no** tempo event exists, with runtime `tempoDiagnostics.provenance = SMF_DEFAULT`. Explicit Set Tempo uses its measured BPM and `SMF_META`; invalid explicit tempo is not silently treated as absent. Both the raw import and selected-voice analysis paths carry the diagnostic. The capture/save path leaves source BPM absent for `SMF_DEFAULT` while retaining the linked MIDI asset. No migration or schema change is needed.

`src/domain/progressionVoicingPractice/handoff.ts::resolveVaultPracticeTempo` resolves saved blocks in this order: block BPM, a matching MIDI asset link with missing block BPM (120, `SMF_DEFAULT`), saved Idea BPM, then 120 as a mutable `PRACTICE_INITIAL`. The latter does **not** claim a source tempo. Text-progressions keep their existing runtime default. The selector and loaded transport show `120 BPM（SMF既定）` or `120 BPM（練習初期値）` when applicable. A practice BPM adjustment changes only the session clock; it does not write source BPM, timing, or provenance back to Vault. Unsupported meter and other practice limitations still appear as disabled entries with reasons.

Because an explicit saved BPM may have been entered or edited by a user, a reloaded v2 record is labeled `SAVED_BPM`, not retrospectively asserted to be `SMF_META`. `SMF_META` versus `SMF_DEFAULT` remains exact in new SMF runtime diagnostics. Dedicated durable provenance for every future edit would require a reviewed schema contract.

## B. Read-only Vault investigation

The real active Vault and backup files were inspected only through read-only file reads and in-memory parsing. The diagnostic did not invoke `JsonVaultRepository.load`, which creates a startup backup, nor any write, restore, or repair method. The active Vault parsed with zero quarantined records. Among 20 parseable backup snapshots, four contained a matching source-bar record; the active Vault did not. In the backup sequence where the record first ceased to appear, its parent Idea remained. This establishes disappearance between snapshots but does not establish the user action or exact call that caused it. There is no operation log from which to prove a unique cause.

The normal path is `JsonVaultRepository.load` → `parseVaultFileJson` → `normalizeVaultPracticeCompatibility` → store `initialize`/`setVault` → targeted mutations → `serializeVault` → temporary file and atomic rename. A valid v2 record with missing BPM is accepted by schema and remains in `ideas`; practice eligibility is assessed separately. Records that fail strict parsing, including unknown forward fields, are quarantined. The store refuses mutation and flush while quarantine is present, preventing a filtered in-memory Vault from silently overwriting the source file. Invalid JSON has the repository's pre-existing corrupt-file handling; this stage did not invoke it on real data or attempt automatic repair.

A separate, plausible destructive path existed in `VaultView.togglePin`: it sent `updateIdea` a whole `progressionBlocks` array captured from the view. If that array was stale, pinning could overwrite a newer block list and delete blocks while retaining the parent Idea. The available snapshots do not prove that this exact path caused the observed disappearance. The pin operation now calls `updateProgressionBlock(ideaId, blockId, { pinned })`, and `updateIdea` rejects replacement of `progressionBlocks`. Other intentional delete, replace-import, and restore operations are not reinterpreted as automatic preservation bugs.

## C. Preservation contract and regression evidence

Synthetic Vault v2 tests cover load → unrelated create/edit → save → reload. A valid BPM-less, practice-incompatible or unsupported-meter block remains semantically identical; no block is removed because the Voicing Loop cannot use it. A targeted pin change does not replace the whole block array. A forward-unknown record is quarantined and the original serialized bytes remain untouched when a write is attempted. The repository round-trip verifies atomic serialization preserves unrelated records. The schema/fileVersion remains v2.

Synthetic MIDI tests cover explicit 120, explicit non-120, no-tempo default 120, runtime provenance, the selected-voice path, legacy linked-SMF missing BPM, unknown-origin practice default, and a practice override without source mutation. The current VL-07 tests are retained.

## Real-data boundary and acceptance

No real Vault or backup was changed, restored, replaced, migrated, or copied into Git. Private MIDI and record contents are excluded from fixtures and this report. Human Acceptance should re-import the local regression MIDI from Full Timeline after this change. This stage does not assert that a previously absent record has been restored.

Final-HEAD gate results are provided with the completion report after the stage commit. No merge is part of VL-08.
