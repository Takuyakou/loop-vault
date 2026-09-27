# Duplicate analysis and consolidation (Stage 03)

The 624-row P8.8.3 semantic matrix is intentionally exhaustive. Its tests already use frozen rows and `it.each` with row identity in failure output. Collapsing its semantic, audition, practice, and persistence surfaces into one test would reduce diagnostic quality. No semantic row or assertion is removed.

| Overlap inspected | Decision | Contract preserved |
| --- | --- | --- |
| P8.8.4 and P8.8.6 repeatedly open the same Text Capture route | Moved route setup into `e2e/helpers/app.ts` `openTextCapture`; both specs keep their assertions | Text transport and Capture layout |
| P8.8.5 empty/BPM UI and P8.8.6 shared status | Keep both: the former covers global Capture presentation and font/transport; the latter compares Standard/Extended state parity | P8.8.5 and P8.8.6 matrix rows |
| P8.8.3 semantic unit, preview, practice and browser save | Keep distinct failure boundaries. Domain is broad; browser covers representative handoff only | 624-row corpus, `text-chord-tones-v1`, save path |
| P5.13 snapshot set and newer product-path tests | Preserve nine current-state visual baselines after **individual** comparison. Replace only stale Correction Editor PNG with an explicit selected-candidate readability width assertion; an old full-page snapshot mixed accepted shell changes with a real candidate-width bug | T4 visual states and Correction Editor readability |
| Old Dojo tab assertions in two E2E | Migrate to current sidebar button and `aria-current=page`; keep keyboard and scroll assertions | Dojo route, end reachability and keyboard navigation |
| Old local metronome text in VL-03 | Assert the global button state change caused by `m`, retaining the keyboard shortcut check | Voicing Loop/global metronome seam |

No Vitest case or Playwright case is removed. One stale screenshot comparison is replaced with a stronger browser geometry assertion. The remaining test count therefore stays stable; this is deliberate because no other overlap has yet been shown to be fully redundant. T1 parser cases remain table-driven with case labels. The change removes duplicated setup while preserving layer boundaries.
