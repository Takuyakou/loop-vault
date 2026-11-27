# Flaky and fixture audit (Stages 06–07)

## Repeated execution

At one fixed candidate state, three timing-sensitive browser cases were each repeated ten times with the same Chromium environment: VL-03 seek/global-metronome shortcut, P8.8.4 exact Standard seek, and P8.8.6 70/150/200-bar internal scroll. **30/30 passed** in 43.1 seconds including build/setup. The public synthetic P7 aggregate Vitest, previously suspected of a five-second timeout under full-suite concurrency, passed **10/10** isolated repetitions at the original five-second limit in 62.1 seconds. No private holdout was used.

No actual flaky case was observed in these repeated runs. The historical one-off P7 full-suite timeout remains a co-load suspicion, not a confirmed flaky test. FULL uses four Vitest workers and a 30-second case ceiling because its suite contains resource-heavy integration/evaluation checks; this is reported explicitly, not hidden with retries. Playwright keeps zero local retries. The old Dojo timeout was deterministic absent-tab selection, and the visual failures were deterministic outdated baselines or a real layout defect.

## Fixture and helper ownership

The tracked E2E helpers are `e2e/helpers/app.ts` (navigation and capture actions) and `e2e/helpers/midiFixture.ts` (synthetic MIDI construction). `src/testing/progressionVoicingPracticeE2eFixture.ts` owns the isolated Voicing Loop fixture. They are all referenced and remain domain-scoped. The duplicated P8.8.4/P8.8.6 Text Capture setup moved into `openTextCapture` in the existing app helper; no broad universal helper was introduced. The existing synthetic fixture set is retained, including the frozen P8.8.3 matrix, because case diversity and provenance are part of the contract. No private witness enters Git.

The nine accepted visual PNGs remain distinct states. The retired Correction Editor PNG was removed only after its unique readability contract was moved to an explicit browser geometry assertion, which currently fails on a confirmed product layout bug. No other fixture or snapshot was proven unused or fully redundant, so none was removed for count reduction.

## Remaining risks

The known Correction Editor candidate header can collapse below a readable width. Human review classified the current screen as a defect. Test-suite rationalization does not modify product code; FULL cannot be declared PASS until that product defect is fixed and the explicit width assertion passes. There is no evidence from 10 repeats that more retries or timeout expansion would help it.
