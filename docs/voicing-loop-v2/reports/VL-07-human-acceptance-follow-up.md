# VL-07 — Human Product Acceptance follow-up

Status: implementation complete on `feat/voicing-loop-vl07`; final Human Product Acceptance pending. Base is the local-master VL-06 merge `b30a175`. No master merge, push, tag, release, Phase 9 implementation, Vault schema change, or data migration is part of this stage.

## 1. Reported 1–65 source-bar progression and selector diagnosis

The read-only local check found no matching 1–65 source-bar Progression in the **current active** Vault v2 file. Existing Vault backups contain three distinct matching saved records; each currently fails the practice handoff with `invalid-bpm`. This proves that such records reached Vault persistence at an earlier point, but does not establish why they are absent from the active Vault now. They were not restored or modified. A recovery choice requires human review of the active Vault and backups because replacing current data could lose later work.

The code path for a missing BPM is `CaptureView.saveNew` → `vaultStore.createIdeaFromDraft`/`toSavedProgressionBlock` → Vault v2 → `buildProgressionVoicingPracticeHandoffFromVault` → `buildProgressionVoicingPracticeSnapshot:isSupportedBpm` (`invalid-bpm`). Before VL-07, `buildVoicingLoopVaultCandidates` used `continue` for every failure except `resource-budget`; a persisted record therefore disappeared silently from the selector. The current active Vault also has no such record to list. These are separate findings. No tempo is fabricated for a saved card with missing BPM.

## 2. Selector compatibility and safety

Every readable Vault Progression block entering the library mapper now produces a selector entry. A successful handoff is enabled; an unsuccessful handoff is disabled with its reason code and a localized explanation. Reasons include `invalid-bpm`, `unsupported-meter`, `invalid-chord`, `invalid-timing`, `empty-progression`, `resource-budget`, and `practice-capacity`. Entries with missing BPM no longer display `0 BPM`. Disabled records remain in the default list and search; saved Vault data is not rewritten. Malformed records rejected by Vault parsing remain outside the selector. Click-time handoff validation remains authoritative.

A public synthetic 65-bar manual Capture range passed `createManualDraft` → `draftToCandidate` → `createIdeaFromDraft` → Vault v2 serialize/parse → selector → handoff. The existing 64-bar case and a new 256-bar case pass the same path. Each preserves card count, ordering, source note-number sets, relative absolute timing, durations, SOURCE PlaybackChoice, and full range without truncation.

## 3. Capacity and independent budgets

| Value | Meaning |
| --- | --- |
| 256 PracticeGroups | Voicing Loop practice/display capacity only; groups are currently four beats and remain distinct from source bars, source meter, chord boundaries, and Vault persistence. |
| 512 beats | Historical P8.2 test edge: 128 four-beat PracticeGroups. It was not an independent source-length budget. The test now covers 256 groups separately. |
| 2400 beats | Existing maximum source-beat count accepted by the practice snapshot. Unchanged. |
| 600 seconds | Existing maximum source duration at the effective BPM accepted by the practice snapshot. Unchanged. |
| 2400 events | Existing maximum source-event count accepted by the practice snapshot. Unchanged. |

The check now applies source beat/event/duration budgets first, then the 256-group practice capacity. Tests accept 128, 129, 255, and 256 groups and return `practice-capacity` at 257; a lower group count that exceeds the time budget returns `resource-budget`. No first-256 slicing occurs. A low-BPM progression may hit 600 seconds first. Import limits, raw-note budgets, file-size limits, and Vault v2 are unchanged.

A 256-group public UI fixture renders 256 timeline cards, 256 overview segments and 256 ruler segments, seeks the last chord, resumes playback, and checks monotonic playhead motion. One local Chromium run reached the fully mounted UI in **847 ms** (measurement includes navigation and render; it is not a hardware-independent performance guarantee). Precise boundary choice remains on the chord timeline; overview is for distant navigation.

## 4. Visual follow-up

- Current is content-driven and no longer stretched to Next plus Then Next. Current and Next FINGER/PITCH/TONE facts use compact label/value rows; the Current chord name and finger values retain their prior font sizes. Source conversion remains a secondary action.
- The four keyboard legend items move into the keyboard header. The 88-key keyboard retains its size.
- The recovered height provides a responsive 20–40 px Bottom Interaction Safe Area below Transport on the sampled desktop viewport. At smaller/scaled sizes the workspace may scroll rather than shrink the chord or keyboard. No fixed 900/1000 px product height was introduced.
- Saved PlaybackChoice remains unchanged. Cards without an explicit saved choice display `未設定（自動）` with an explanatory tooltip; no legacy card is changed to SOURCE.
- Next remaining-beat text uses ceiling for values above one beat and `あと1拍未満` below one beat. Only the label rounds; transport beats and source timing remain fractional.
- The playhead and Current chord progress bar are painted by `requestAnimationFrame`. Each frame interpolates no more than one 64th-note callback interval from the latest Transport beat. Audio scheduling, epoch invalidation, and the bounded look-ahead scheduler are untouched. Seek and stop paint the new exact position; pause freezes; resume restarts. Timeline Follow still updates only on chord/span changes and is disabled by manual scrolling. Reduced-motion still shows the current position without decorative CSS easing.

## 5. Contracts, evidence, and pending human action

Product Analyzer/Extractor, Identity/Decoder, P8.1 SOURCE fidelity, P8.2 meter neutrality, SOURCE/GENERATED/CUSTOM intent, Chord Boundary Seek, Transport v2/rollback, Vault fileVersion 2, and Phase 8/9 research candidates are unchanged. Enharmonic spelling remains Phase 9 backlog. Private MIDI, note lists, paths, and media are absent from tracked output. Acceptance screenshots are local-only.

Automated final-HEAD gate results are reported with the commit. Human Product Acceptance has not been executed. The active-Vault versus backup discrepancy cannot be resolved safely by code or automatic restore; the user can decide separately whether to inspect recovery options. The VL-07 product candidate can be reviewed without changing the Vault.
