# P13 subsection 5 — Integration and local gates

## Implemented
Five tabs share the existing product frame, instrument preferences and recording rail. Existing four-mode generators, hints, self-review and persistence contracts remain unchanged. Rhythm uses a sixteenth-note grid, Bassline uses beat/note lanes and the shared fretboard, and Root Motion shows an ordered chain without revealing hidden pitches.

MIDI bass library has independent storage, import track selection, optional accompaniment, favorite/search/rename/confirmed delete, practice windows, bounded rendering, post-record feedback and attempt history. Home counts completed MIDI attempts without requiring kept audio. No songs or recordings are inserted into Vault.

## Focused evidence
496 Vitest tests and 12 product-path Playwright tests passed during implementation. Native storage/check and 43 native tests passed. Public FreePats qualification passed all thresholds across 120 fixtures. These runs are development evidence; final HEAD gates are recorded separately in FINAL-REPORT.

## Responsive inspection
Screenshots cover 1920×1080, 1440×900, 960×1032 and 768×640. Desktop keeps diagrams and the recording rail independently scrollable, with MIDI actions visible. Narrow screens stack the rail below the main area. Screenshot review found desktop flex/overflow rules clipping MIDI content on narrow screens; the narrow rule now uses natural block height. Regression checks require the whole content height, actions and history to remain reachable. Raw-note fretboard note-display switching is also exercised.

## Protected surfaces
Vault schema, analyzer, Voicing Loop, Chord Dojo and existing import remain untouched. Added native storage namespace uses existing atomic replace/CAS, backups and quarantine infrastructure. No dependencies were added. Real user recordings or private MIDI have not been read or committed. Unrelated untracked reports/diagnostics remain unchanged.

## Remaining acceptance
Actual audio-interface performance is not established by synthetic fixtures. Human acceptance should verify the recorder input/channel and ten local bass examples, without transmitting or committing recordings. Post-record labels are approximate; source reference/recorded overlay is not sample-accurate across browser decoding and device latency. Recording is limited to 60 seconds, with a scheduling margin. Long windows require shorter intervals or faster tempo. Initial import supports constant 4/4; tempo changes intentionally use the first tempo.

## Fresh FULL failure isolation
First FULL at `8a3d560d` passed all static gates and 3,834 Vitest tests; Playwright had three failures. Two were old assertions targeting the badge inside Degree or the settings field before opening the new common controls. Assertions now target the actual visible badge/control without weakening content or keyboard behavior. The third was a real narrow-layout scroll-owner change: main client/scroll height 628/628, inner panel 554/1998 at 320px. Narrow Bass Practice now restores the main scroll owner; other practice modes are untouched.

A subsequent focused recording run exposed a short unstable attack interpreted as an extra pitch event. A public PCM reproducer with a 10–20ms attack transient reproduced it independently of E2E. Extraction now requires three pitch observations before emitting the preceding pitch at a transition, preserving the real note's original onset when the attack is unconfirmed. The deterministic regression and all 120 public qualification fixtures pass. Escape now cancels MIDI recording while its action button has focus; form typing and native Space activation are preserved. Four affected product tests repeated three times passed 12/12. The final fresh FULL follows this correction commit.
