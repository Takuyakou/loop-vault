# Repository Playwright audit (Stage 04)

The machine inventory lists all 34 specs and all 129 project-expanded cases. These groups record the browser-only reason and disposition for **every** spec. T3 cases remain representative end-to-end product paths; T4 cases protect browser geometry, focus, accessibility, fonts, or visual appearance. The actual reduction was one obsolete PNG assertion, replaced by an explicit failing geometry contract rather than skipped.

| Specs (all tracked cases covered) | Browser-only value | Disposition |
| --- | --- | --- |
| `accessibility`, `keyboard`, `reduced-motion`, `responsive`, `visual` | Real focus order, axe, media preference, viewport geometry, selected screenshots | Keep; split visual serial suite into independent tests; remove only the invalid Correction Editor snapshot and retain stronger width check |
| `capture-flow`, `vault-flow`, `phase5.14-midi-export`, `phase5.20-text-progression`, `phase5.23-timeline-legibility` | Import, save, navigation, drag/export and correction route | Keep representative paths; do not duplicate parser corpus here |
| `phase5.13-3` | Practice end reachability, queue wheel chaining and Live MIDI overlay | Keep; update retired Dojo tab selector to current sidebar route |
| `phase5.16-production-activation`, `phase5.16.1-degree-echo`, `phase5.17-record-compare`, `phase5.18-chord-context`, `phase5.19-root-motion`, `phase5.22-source-bassline-practice` | Production mode entry, device stubs, keyboard/scale and persisted sessions | Keep distinct product modes; domain rules remain in Vitest |
| `phase5.27-voicing-loop-ui`, `phase5.28-voicing-loop-navigation`, `phase5.30-voicing-loop-polish`, `phase5.31-control-timing`, `phase5.32-suggested-fingering`, `phase5.33-voicing-rule-ui` | Different shipped Voicing Loop surfaces and navigation/visual interactions | Keep unique assertions; update one obsolete 38px assumption to shared 36px CSS minimum |
| `voicing-loop-v2`, `voicing-loop-vl09`, `voicing-loop-vl10`, `voicing-loop-vl11`, `voicing-loop-vl12` | Timeline, seek, follow, keyboard, rollback, hand display and transport behaviors | Keep unique stage contracts; VL-03 metronome now observes global control |
| `phase8.8-extended-text`, `phase8.8.4-text-transport` | Representative save, real playback controls and exact browser seek | Keep; shared route helper replaces copied setup |
| `phase8.8.5-capture-geometry`, `phase8.8.5-final-ui`, `phase8.8.5-text-workspace` | Shared tab DOM, source text, global controls, local fonts and toolbar reflow | Keep browser-only checks |
| `phase8.8.6-capture-closure` | Status parity, desktop no-page-scroll, 70/150/200-bar internal scrolling | Keep permanent T4 layout regression |

## Previously failing cases

Two old Dojo tests now navigate with the current sidebar button. The Voicing Loop transport test reads the 36px shared control contract; another observes the global metronome button. These four focused tests passed together. Home and Settings PNGs were individually compared against accepted shell/global-control changes and updated. The serial visual group was separated; all six visual cases now execute independently instead of cascading skips. The remaining Correction Editor case detects a genuine narrow selected-candidate header. Human review classified this as a **product defect**, so its visual image was **not** accepted as a baseline. The test remains failing with an explicit readability-width message; product code is outside this task's scope.

## Snapshot policy

Only an image for a formally accepted state may be updated. The other nine retained images were compared individually to the present product and updated for accepted navigation/header changes. The single removed Correction Editor image is replaced by a browser geometry assertion, not deleted to turn the Gate green. Local comparison images stay ignored. No automatic bulk baseline update, `.skip`, `.fixme`, or retry was used.
