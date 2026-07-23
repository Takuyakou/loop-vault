# Phase 3.8.5 Event Identity Audit

## Current persisted event

The persisted chord event is `ChordTimelineItem` in `src/domain/types.ts`.
It currently has no stable identifier. `SavedProgressionBlock.chords` stores
these events directly and `src/domain/schema.ts` validates them with a strict
schema.

## Editing identity

`createEditableProgression()` in
`src/domain/progressionEditing/editableProgression.ts` derives slot IDs from
candidate ID, bar, beat, and ordinal. These IDs are suitable for an editing
session but are not persisted. Insert, split, and merge currently create IDs
from the existing slot ID and history index.

## Save paths

- Capture candidate save: `appendBlockToIdea()` or `createIdeaFromDraft()` in
  `src/store/vaultStore.ts`, then `toSavedProgressionBlock()`.
- Progression Detail save: `applyEditableProgressionToSavedBlock()`, then
  `updateProgressionBlock()`.
- Live MIDI history save: the same candidate-to-saved-block store path.
- Advisor save: `advisorSuggestionToCandidate()`, then `appendBlockToIdea()`.
- Block duplication: `duplicateProgressionBlock()` clones chord events.

All persisted changes pass through `applyVaultChange()`. No direct repository
write is needed for Phase 3.8.5.

## Phase 3.8.5 identity rules

- Add optional `eventId` to `ChordTimelineItem`.
- Old events receive a deterministic editing ID in the form
  `legacy:{blockId}:{bar}:{beat}:{ordinal}` without writing during parse.
- Explicit block save replaces temporary legacy/session IDs with IDs from the
  store's injected `idFactory`.
- Replace keeps the event ID and voicing memory.
- Insert creates a new session ID and persists a new event ID.
- Split keeps the original ID and memory on the first half; the second half
  gets a new ID without memory.
- Merge keeps the selected surviving event ID and memory.
- Delete removes the event and memory; edit-history snapshots restore both.
- Block duplication generates a new ID for every event while cloning snapshot
  values.

## Risks

- Existing slot IDs are also React/UI selection keys, so identity conversion
  must keep the selected slot stable during an edit session.
- The persisted schema is strict. New optional fields must be added to both the
  TypeScript type and Zod schema while retaining `fileVersion: 1`.
- Parse-only loading must not generate persistent IDs or trigger autosave.
