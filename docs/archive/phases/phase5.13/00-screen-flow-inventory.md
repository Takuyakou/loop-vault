# Phase 5.13 Screen and Flow Inventory

## Screen inventory

| Surface | Entry point | Primary task | Important states |
| --- | --- | --- | --- |
| App shell | `src/components/AppShell.tsx` | Move between work areas and understand save/playback state | active route, saved/saving/unsaved, playback active |
| Home | `src/views/HomeView.tsx` | Resume the next loop or start capture | empty, focus available, stale ideas |
| Capture empty | `src/views/CaptureView.tsx` | Import MIDI | idle, drag-active, parsing, error |
| Pre-analysis | `src/components/pre-analysis/PreAnalysisWorkspace.tsx` | Inspect Voices and choose analysis input | single/multi MIDI, presets, custom roles, warnings, playback |
| Analysis result | `src/views/CaptureView.tsx` | Compare candidates and select a useful range | analyzing, candidate list, full timeline, selected draft |
| Correction editor | `src/components/progression-editing/**` | Correct labels, boundaries, and voicings | clean/dirty, undo/redo, validation errors |
| Save progression | `src/components/SaveProgressionPopover.tsx` | Save to a new or existing Idea | closed, destination selection, submitting, error |
| Vault | `src/views/VaultView.tsx` | Search, filter, compare, and open progressions | empty, populated, selected, playing, long content |
| Idea detail | `src/views/DetailView.tsx` | Edit Idea metadata, references, assets, and pipeline | clean/dirty fields, validation, deletion confirmation |
| Progression detail | `src/views/ProgressionDetailView.tsx` | Edit and preview a saved progression | clean/dirty, inspector open, advisor open |
| Live MIDI | `src/components/LiveMidiMiniMode.tsx` | Recognize played chords and capture a progression | disconnected, connected, provisional, confirmed, history |
| Chord Dojo | `src/views/PracticeView.tsx` | Practice progressions and voicings | selection, preflight, active, paused, results |
| Settings | `src/views/SettingsDialog.tsx` | Configure app, MIDI, LLM, backup, and diagnostics | collapsed/expanded sections, busy, success, error |
| Dialogs | `src/components/Modal.tsx`, `src/components/ConfirmDialog.tsx` | Confirm or recover from consequential actions | open, busy, nested, focus return |
| Toasts | `src/components/Toast.tsx`, `src/components/UndoToast.tsx` | Announce result or offer undo | success/info, undo available, timeout |

## F1 MIDI to Vault

1. Start: App shell `コード採集`.
2. Import: drag a MIDI file or use the visible file picker button.
3. Inspect: piano roll, Voice list, presets, warnings.
4. Analyze: one primary Analyze action.
5. Review: candidate ranking, full-song location, chord labels, confidence/warnings.
6. Correct: select a candidate, edit labels/range/boundaries, undo or reset.
7. Save: save to a new Idea or append to an existing Idea.
8. Verify: open Vault and locate the saved progression.

Main risks:

- Capture contains several dense control groups; the primary action can lose prominence after scrolling.
- Candidate, current draft, detected value, and edited value use related colors but not always a stable shared status contract.
- Save feedback is split between the popover, toast, and shell save indicator.

Recovery already available:

- Alternative file picker for drag and drop
- Retry after parse/render error
- Unified draft undo/redo
- Unsaved-leave confirmation
- Vault autosave status in the shell

## F2 Multiple MIDI / Voice selection

1. Add MIDI.
2. Expand part details.
3. Select preset or custom Voices.
4. Preview selected input.
5. Adjust roles/solo where allowed.
6. Analyze.

Main risks:

- Voice rows carry color, role, track/channel, inclusion, solo, and warnings in a compact area.
- Disabled/recommended/excluded reasons need text as well as color.
- The selected preset and actual analysis input must remain visibly synchronized.

## F3 Vault reuse

1. Start: App shell `Vault`.
2. Search and filter.
3. Preview one or more rows.
4. Open progression detail.
5. Edit or hand off to Chord Dojo.

Main risks:

- Large result sets are rendered as a full list.
- Row click, preview button, favorite, copy, and open affordances compete.
- Very long progression names and metadata are now wrapped, but compact mode still intentionally clips secondary data.

## F4 Live MIDI

1. Start from the piano icon in the shell.
2. Connect/select a device via settings.
3. Play notes and inspect provisional/confirmed chord state.
4. Exit mini mode.
5. Import captured history to an Idea.

Main risks:

- Hardware/environment errors need a next action, not only a diagnosis.
- The shell icon relies on tooltip/accessible name at narrow widths.

## F5 Chord Dojo

1. Choose a progression.
2. Choose level/mode/voicing options.
3. Confirm MIDI input.
4. Start, pause/resume, or end a session.
5. Review progress and result.

Main risks:

- `PracticeView.tsx` is a large stateful screen with many controls.
- The left library and main practice area have separate scrolling at desktop sizes; narrow sizes require careful focus order and overflow checks.

## Keyboard baseline

- App navigation: native buttons with visible `:focus-visible`
- Route change: focus moves to `<main>`
- Skip link: present
- Modal: focus trap, Escape, focus return
- Context menu/editor: keyboard handlers present
- Capture range: arrow/Shift/Alt keyboard operations present
- Drag-only operations: file picker and button alternatives remain available

