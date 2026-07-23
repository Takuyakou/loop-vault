# Phase 3.9.0.1 Keyboard Visualizer Audit

## Scope

This audit records the implementation state before Phase 3.9.0.1 changes.
The source of truth for the task is
`docs/phase3.9.0.1-piano-keyboard-visualizer-plan.md`.

## Current Visualizer

- Component: `src/components/practice/PracticeKeyboard.tsx`
- Caller: `src/views/PracticeView.tsx`
- Rendering: one flex item per semitone. White and black notes have the same
  height and are laid out as adjacent vertical stripes.
- Range: recalculated from the current chord guide, held notes, and sustained
  notes on every render. This can move when the target chord or input changes.
- Labels: note names are only available as `title`; there are no visible C
  octave labels.
- Legend: hard-coded English labels.
- Guide notes: shown only when `PracticeView` passes notes for Level 1.

## Live MIDI State

- Store: `src/liveMidi/liveMidiStore.ts`
- Shared instance: `src/liveMidi/defaultLiveMidiStore.ts`
- Domain note state: `src/domain/liveMidi/types.ts`
- Held selector: `heldNotes()` in `src/domain/liveMidi/noteState.ts`
- Sustained selector: `sustainedNotes()` in
  `src/domain/liveMidi/noteState.ts`
- Channel and duplicate Note On counts are retained by
  `reduceLiveNoteState()` in `src/domain/liveMidi/noteStateReducer.ts`.
- Disconnect resets held and sustained state in `resetRuntimeNotes()`.
- `PracticeView` currently subscribes to the entire `notes` object and derives
  practice input through `practiceInputFromLiveState()`.

## Practice Matching

- Requirements: `src/domain/practice/chordRequirements.ts`
- Input adapter: `src/domain/practice/inputState.ts`
- Match logic: `src/domain/practice/matchPerformance.ts`
- Stable confirmation: `src/domain/practice/sessionMachine.ts`
- The UI must continue to use held notes only for matching. Sustained notes
  remain display-only.
- The existing 100 ms stable deadline is independent from visual feedback and
  must not be changed.

## Guide Voicing

- Resolver: `resolveVoicingForUse()` in
  `src/domain/voicing/resolveVoicing.ts`
- Priority: practice override, verified source, high-confidence simultaneous
  source, generated fallback.
- Generated fallback: `voiceChordForPreview()` in
  `src/domain/chordVoicing.ts`
- The current target guide is resolved in `PracticeView`. Phase 3.9.0.1 also
  needs all resolved event voicings once per selected progression to compute a
  fixed keyboard range.

## Note Naming

- Existing utility: `src/components/voicing/midiNoteName.ts`
- Existing convention: MIDI 60 is displayed as C4.
- Phase 3.9.0.1 requirement: FL Studio convention, MIDI 60 is displayed as C5.
- The existing utility is used outside Chord Dojo and will not be changed.
  A reusable display formatter with an explicit convention will be added under
  `src/components/music-keyboard/`.

## Render Path

1. Rust emits a MIDI event batch.
2. `liveMidiStore` updates `notes` for every event.
3. `PracticeView` receives `notes`, creates practice input, and updates the
   session reducer immediately.
4. Match confirmation still waits for the 100 ms stable deadline.
5. The current keyboard receives `session.lastInput`, so visual feedback is
   coupled to the parent session render.

The new visualizer will subscribe to the shared note state directly for
immediate drawing while the existing parent subscription remains responsible
for the matcher.

## Close Failure Audit

- Tauri close handler: `registerTauriCloseGuard()` in
  `src/store/closeGuard.ts`
- Vault flush: `flush()` in `src/store/vaultStore.ts`
- Practice pending progress: the cleanup effect in
  `src/views/PracticeView.tsx`

The current close handler flushes the Vault before a mounted Practice view is
asked to commit its in-memory session. A late update can therefore make the
store dirty after the close flush and trigger:

`変更を保存できなかったため、Loop Vaultを閉じませんでした。`

The fix will add a close-preparation boundary. Mounted views can synchronously
commit pending edits before the close guard flushes the Vault. The close guard
will also retry a late revision once instead of treating a flush race as a
storage failure.

## Planned Files

- `src/components/music-keyboard/*`
- `src/components/practice/PracticeKeyboard.tsx`
- `src/views/PracticeView.tsx`
- `src/views/PracticeView.test.tsx`
- `src/store/closeGuard.ts`
- `src/store/closeGuard.test.ts`
- `src/store/closePreparation.ts`
- `docs/phase3.9.0.1-keyboard-user-verification.md`
- `docs/phase3.9.0.1-implementation-report.md`

## Risks

- Range geometry must handle partial starting and ending octaves without
  displacing black keys.
- L2 and L3 must not leak guide pitches or missing note names.
- Visual state precedence must keep foreign held notes visible over guide
  state.
- Direct Live MIDI visualization must not create a second transport or note
  state.
- Close preparation must be synchronous and idempotent so repeated close
  requests do not duplicate practice progress.
- Physical MIDI timing, pedal appearance, and narrow-window geometry remain
  user verification items.
