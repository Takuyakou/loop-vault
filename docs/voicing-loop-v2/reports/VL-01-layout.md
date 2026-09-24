# VL-01 — C v3 layout

Status: COMPLETE. Base: `feb44ab` on `feat/voicing-loop-v2`.

## Changed paths

`src/App.tsx`, `src/components/AppShell.tsx`, `src/components/AppShell.test.tsx`, `src/components/music-keyboard/PianoKeyboardVisualizer.tsx`, its test, `src/components/practice/PracticeKeyboard.tsx`, `src/views/ProgressionVoicingPracticeView.tsx`, and its test.

## Result

- Practice sidebar now has persistent Chord Dojo / Voicing Loop / Bass Practice children and no duplicate top-level Voicing Loop item. The existing compact sidebar hides child controls from keyboard focus when collapsed.
- The workspace has a single SOURCE/STUDY/DISPLAY row, Current/Next with a compact Then Next row, timeline overview/ruler/duration-proportional card scaffolding, 88-key keyboard, and a one-row transport. Current and Next show FINGER/PITCH/TONE from their resolved voicings. Existing source/study options remain accessible.
- The explicit bulk SOURCE action previews eligible/changed/skipped CUSTOM/skipped missing-source counts, then uses one existing Vault v2 block update. It does not fabricate source notes or alter CUSTOM. The snapshot handoff is refreshed after success. Automatic migration policy remains separate.
- A local-only 1440×900 sample Playwright screenshot was compared with the attached PDF page 3; this viewport is not a required or minimum product size. Header → toolbar → Current/Next/Then Next → timeline → keyboard → transport order matches. The workspace measured `scrollHeight = clientHeight = 816px` under the 900px viewport.

VL-01 does not change the transport scheduler or seek behavior. Interaction remains for VL-02/03.

## Gate

Focused React/domain tests 74/74; app TypeScript, repository lint including class/source contracts, tracked privacy scan, and `git diff --check` passed. The PDF and screenshots remain untracked local-only.
