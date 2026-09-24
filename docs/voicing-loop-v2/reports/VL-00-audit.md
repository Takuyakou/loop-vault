# VL-00 — baseline audit and frozen contract

Status: COMPLETE. Base: `de298b9283cf9f279d17df1d8c87b9061780e420` on local `master`; implementation branch: `feat/voicing-loop-v2`.

## Baseline and visual reference

- P8.1 source-first playback and P8.2 meter-neutral Voicing Loop are present in the base merge. The Product analyzer remains `phase4-v1`; P8.4 is not promoted. Vault remains fileVersion 2.
- The attached three-page PDF was read. Page 3, **C — タイムライン統合案 v3**, is the structural reference. Its local render is ignored under `.local-evaluation/voicing-loop-v2/reference/` and must never be tracked.
- Primary acceptance viewport: 1440 × 900. The top toolbar, large Current/smaller Next/one-row Then Next, timeline, 88-key keyboard, and one-row transport must fit without page scrolling. Amber left hand, cyan right hand, and dark density are protected.

## Transport audit and decision

`src/practice/ProgressionVoicingTransport.ts` registers one repeating Tone.Transport callback **per event** plus one per rest at session start, and registers beat/draw callbacks. This is not a bounded rolling scheduler: registration and restart work scale with the entire progression. `generation` guards callbacks across stop/start, while `projectionEpoch` guards delayed Draw updates; there is no seek transaction, note ledger, or explicit external MIDI output. The current MIDI device path in this view is input monitoring, not note output. CC64/CC123 and external note-off are therefore conditional on a future output path; WebAudio release/dispose is mandatory now. The `PreviewInstrument` release contract is used for playback and preview. VL-02 will replace whole-progression registrations with a bounded rolling scheduler and generation invalidation.

Transport state machine: STOPPED, COUNT_IN, PLAYING, PAUSED, and transient SEEKING. Playing seek invalidates pending work, releases audio, advances epoch, snaps to a chord onset, and continues without count-in or loop-count reset. Paused seek stays paused; stopped seek changes the start anchor; count-in seek restarts count-in for the target. Pause, stop, wrap, route leave, source switch, and reconnect invalidate old work. Preview never moves playhead and is disabled during active playback unless a safe overlap rule is proven. Future A-B range may be represented as start/end bounds but is not implemented here.

## Bounds and ownership

| Bound | Current owner | VL decision |
| --- | --- | --- |
| Source beats / duration / events | `METER_NEUTRAL_BUDGET` in `snapshot.ts`: 2400 beats, 600 seconds, 2400 events | Preserve independently. |
| Practice groups | `snapshot.ts`: currently 600 at default 4 beats/group | Voicing Loop consumption cap becomes 128 groups. Do not call them source bars. |
| Source meter and timing | `snapshot.ts`, `clock.ts`, saved block | Preserve source truth; display grouping stays distinct. Count-in uses practice-group beats. |
| Text progression | `TEXT_PROGRESSION_MAX_BARS` in text entry/store | Audit only; retain existing input cap. |
| Vault | v2 read/restore/migration through store and handoff | Open compatible long saved blocks within the new Voicing Loop cap; no v3 migration. |

## Protected contracts and test matrix

- Keep analyzer, P8.4/P8.5/P8.6, Vault schema, Live MIDI analysis, and unrelated practice modes unchanged.
- Existing Source MIDI and Custom snapshots fail closed when unavailable. Source pitch numbers and absolute timing remain detached and unchanged. Generated lessons remain separate.
- VL-01: screenshot/layout and old playback regression. VL-02: fixed-seed state/action, rapid seek, pause/seek/resume, count-in, wrap, release/dispose and bounded scheduling. VL-03: card/ruler/overview seek, follow/manual scroll, scale, keyboard. VL-04: 128 groups and separate source budgets. VL-05: full unit/TypeScript/lint/build/Playwright/privacy/diff gates and local-only visual comparison.

Human product acceptance on actual hardware follows automated gates. No merge, push, tag, or release is authorized by this stage.
