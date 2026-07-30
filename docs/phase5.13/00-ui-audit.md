# Phase 5.13 UI Audit

## What is already working well

- The app is a real tool surface rather than a marketing layout.
- The dark palette, compact density, monospaced chord labels, and teal accent fit long DAW-adjacent sessions.
- Native buttons are used for primary navigation and most actions.
- A skip link and route-level focus transfer are present (`src/App.tsx`, `src/styles.css`).
- Modal focus trap, Escape close, stacked dialog handling, body scroll lock, and focus return are implemented (`src/components/Modal.tsx`).
- Unsaved progression changes are guarded before navigation (`src/App.tsx`, `src/views/ProgressionDetailView.tsx`).
- Drag and drop has a file-picker alternative (`src/views/CaptureView.tsx`).
- `prefers-reduced-motion` is respected globally (`src/styles.css`).
- Long Vault text has explicit wrapping and responsive row tracks (`src/styles.css`, `src/views/VaultView.tsx`).

## Priority findings

### P0

No reproducible P0 issue was found in the baseline production screen or existing test suite.

### P1-01 Shared component contracts are incomplete

- Problem: buttons, fields, panels, badges, errors, and empty states are styled by repeated one-off class strings.
- User impact: the same action changes visual weight between screens, increasing recognition time and making primary actions less predictable.
- Evidence: `src/views/CaptureView.tsx`, `src/views/DetailView.tsx`, `src/views/SettingsDialog.tsx`, `src/components/ConfirmDialog.tsx`.
- Proposal: extend semantic tokens and introduce small shared primitives without adding a UI library.
- Risk: broad class replacement can produce visual regressions.
- Verification: component tests, screenshot matrix, keyboard focus checks.
- Priority: P1.

### P1-02 Toast feedback is informational but not recoverable

- Problem: the generic Toast only renders message text and times out.
- User impact: errors may name a failure without offering retry, dismiss, or the next place to go.
- Evidence: `src/components/Toast.tsx`, global `setToast` usage in `src/App.tsx`.
- Proposal: add tone, title, optional action, manual dismiss, and assertive semantics for errors while keeping current call sites compatible.
- Risk: excessive alerts can interrupt screen-reader users.
- Verification: error/action E2E, focus remains on the triggering control, `role=alert` only for errors.
- Priority: P1.

### P1-03 Capture hierarchy is dense at the exact decision point

- Problem: full-song map, candidates, draft controls, editor, preview, and save controls compete vertically.
- User impact: after analysis, users must scan multiple regions to understand what is selected, what changed, and what will be saved.
- Evidence: `src/views/CaptureView.tsx`, `src/components/CaptureDraftSessionBar.tsx`, `src/components/progression-editing/ChordInspector.tsx`.
- Proposal: stabilize section headings/status summaries, keep one primary action per decision step, and use common detected/edited/selected states.
- Risk: moving controls can disrupt learned workflows.
- Verification: Playwright F1 flow, before/after screenshots, click-count comparison.
- Priority: P1.

### P1-04 Some high-frequency controls use 32-36 px visual targets

- Problem: several icon buttons are `h-8/w-8` or `h-9/w-9`.
- User impact: pointer acquisition is harder, especially beside other compact actions.
- Evidence: `src/components/AppShell.tsx`, `src/views/HomeView.tsx`, `src/views/ProgressionDetailView.tsx`.
- Proposal: preserve density but raise interactive hit areas to a shared minimum where layout permits; retain tooltip and accessible name.
- Risk: the shell may wrap earlier at 1024 px.
- Verification: 1024x720 screenshot and target-size E2E assertions.
- Priority: P1.

### P1-05 Some fields rely on aria-label or placeholder instead of a persistent visible label

- Problem: 78 form controls and 61 labels were found; some compact editors use aria-label/title only.
- User impact: sighted users can lose field meaning after entering a value; speech input users may see a different label than the accessible name.
- Evidence: compact fields in `src/views/DetailView.tsx` and editing components under `src/components/progression-editing/**`.
- Proposal: add compact visible labels or associate existing headings with controls.
- Risk: increased vertical density.
- Verification: Playwright accessible-name audit and narrow viewport screenshots.
- Priority: P1.

### P1-06 Large result collections have no explicit scaling contract

- Problem: the Vault renders the result collection directly; the Phase 5.13 gate includes 1,000-card-equivalent data.
- User impact: filter and navigation latency may grow with large libraries.
- Evidence: `src/views/VaultView.tsx`.
- Proposal: measure first; add bounded rendering only if the performance gate fails.
- Risk: virtualization can harm find-in-page and focus behavior.
- Verification: synthetic 1,000-item performance fixture and repeated navigation listener check.
- Priority: P1, measurement-gated.

### P2-01 Token coverage is narrow

- Problem: danger, success, focus, control height, typography, shadows, motion, and z-index are mostly literal.
- Impact: visual tuning requires cross-file edits and can drift.
- Proposal: add semantic tokens while keeping the current palette.
- Priority: P2.

### P2-02 Color roles are sometimes mixed

- Problem: teal, cyan, amber, red, and raw hex values are used directly for several unrelated UI roles.
- Impact: selection, playback, detection, warning, and Voice identity can be harder to distinguish.
- Proposal: define state-role tokens and keep Voice palette separate.
- Priority: P2.

### P2-03 Very large view modules raise consistency risk

- Problem: Capture and Practice views are each several thousand lines.
- Impact: local styling and state patterns are easy to duplicate.
- Proposal: extract presentation-only sections when needed by the current UX work; do not refactor domain behavior.
- Priority: P2.

## Guideline status before implementation

| Rule | Status | Evidence |
| --- | --- | --- |
| Semantic controls | Mostly compliant | Native buttons dominate; custom canvas/range controls have keyboard handlers |
| Accessible names | Mostly compliant | Icon buttons generally have `aria-label` and `title` |
| Visible focus | Compliant | Global `:focus-visible` ring |
| Dialog focus | Compliant | trap, Escape, return implemented |
| Route focus | Compliant | main receives focus on view change |
| Form labels | Partial | compact editors still rely on aria/title |
| Error recovery | Partial | render boundary has retry; generic toast has no action |
| Reduced motion | Compliant | global media query |
| Long content | Partial | Vault improved; full app matrix not automated |
| Narrow viewport | Partial | shell wraps intentionally; full flow not automated |
| Loading/disabled reason | Partial | present in Capture/settings, inconsistent elsewhere |
| Color-only state | Partial | most states have text/icon, but local candidates/Voice colors need audit |

## Implementation sequence

1. P5.13-01: semantic tokens and shared UI/state primitives.
2. P5.13-02: shell, navigation, save state, toast/dialog, global responsive behavior.
3. P5.13-03: Capture and Phase 5.12 pre-analysis hierarchy.
4. P5.13-04: analysis result, candidate, correction, undo, and save workflow.
5. P5.13-05: Vault, detail, Live MIDI, Dojo, settings, correction log.
6. P5.13-06: guideline re-audit and focused fixes.
7. P5.13-07: repository-local Playwright E2E, screenshots, accessibility, and final builds.

## Explicitly out of scope

- Analyzer or ranking changes
- Schema or `fileVersion` changes
- MIDI export and DAW drag
- UI framework migration
- Whole-app React or CSS rewrite
- New product features

