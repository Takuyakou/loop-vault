# P5.16.2-00 Audit ? Rhythm Echo

## Scope and base

- Branch: `docs/p5162-00-audit`
- Base: `85453d9642248434702e2882429c6f44cacbcfd6` (`P5.16.1-05`)
- Scope: Rhythm Echo only ? generated rhythm content, metronome/count-in, muted playback, honest self-review, transfer, Home/History integration.
- Explicitly excluded: microphone or DI input, onset/duration scoring, Bassline Echo, Vault-derived source, Vault schema changes, Chord Dojo changes, and Phase 5.17 work.

## Protected contracts verified

- The Bass Practice shell already owns the Practice route and exposes the existing `Degree Echo` experience behind its flag.
- Practice data is an independent, versioned repository (`loopvault/practice-v1.json`), with atomic persistence, backups, corruption isolation and recovery; Vault `fileVersion` is not part of this work.
- The shared practice flow has the required states and self-rated review semantics. `independentSuccess` is derived from rating, hint level, and Singing completion ? not any automatic listening/scoring signal.
- `PracticeClock` already uses Tone Transport, generation invalidation, scheduled callback cleanup, and synthesizer disposal. It is a useful timing reference, but it is tied to chord timeline items, quarter-note scheduling, and a single fixed callback model. Rhythm Echo needs a dedicated beat-event scheduler rather than a hidden reinterpretation of that clock.
- Existing preview playback accepts beat-based note events and a sound choice. Rhythm Echo can add a muted-bass request while retaining the global playback controller lifecycle and master-volume contract.
- Feature flags currently cover Degree Echo only. Rhythm Echo needs its own default-OFF flag and must not make enabled Degree Echo data/UI appear when the Rhythm flag is OFF.
- Current shared types and Zod schemas are degree-only (`BassPracticeMode = "degree"`, degree target events, 4/4 meter, degree generator snapshot, and literal degree session mode). Stage 01 must introduce a discriminated, backward-compatible rhythm representation and migration/round-trip tests before any persisted Rhythm attempt is written.
- Home and History currently label summaries as `Degree Echo`. Stage 03 must render the persisted mode label, preserve existing Degree summaries, and keep no-input/automatic-score language out of the UI.

## Delivery decisions

1. Stage 01 will define a rhythm event model in beats, vocabulary cells, meters (`3/4`, `4/4`, `6/8`), deterministic seeded generation, difficulty, hint ladder, and tempo/start-position transfer. It will add safe practice-storage compatibility coverage before UI work.
2. Stage 02 will introduce a scoped Rhythm playback scheduler sharing the audio clock for target, count-in, click, and visual playhead. It will be cancelable, idempotently stoppable, and released on route/mode changes. Count-in supports exactly one or two bars and does not consume the Listen limit.
3. Stage 03 will add the mode tabs, Rhythm View, keyboard controls (`M`, `C`), truthful review/next-focus copy, and Home/History mode summaries. The rhythm grid remains hidden through Hint 3 and Review, and Hint 4 does not create success.
4. Stage 04 will run the phase release gates, including deterministic timing, rapid toggle/route-leave cleanup, accessibility, Degree Echo and Chord Dojo regression, and Web/Tauri builds.

## Risks and controls

| Risk | Control |
|---|---|
| Existing saved Degree data becomes unreadable | Discriminated schemas with a strict `degree` legacy branch; fixture-based load and write round trips before enabling Rhythm writes. |
| Audible click survives mode/route changes | Generation token plus explicit schedule, synth, and transport cleanup; rapid toggle and route-leave tests. |
| Audio/visual timing drifts | Derive both from one immutable beat schedule and test every event boundary. |
| Rhythm UI implies automatic scoring | Present only self-rated Rhythm/Duration/Recall issues and persisted self-rated results. |
| Flag leakage | Rhythm has a separate default-OFF flag and OFF regression tests. |

## Audit outcome

No blocking contract contradiction was found. The next unfinished stage is P5.16.2-01, Rhythm Domain.

diff --git a/.agent/PLANS.md b/.agent/PLANS.md
new file mode 100644
--- /dev/null
+++ b/.agent/PLANS.md
