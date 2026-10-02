# P11-13c — Common Tone soft preference contract

Commit before any Common Tone arm execution. Human-authorized diagnostic only.

## Frozen inputs

- CURRENT, E1-T/inverse/lambda=2, and four Common Tone arms.
- Common Tone gamma grid: **0.125 / 0.25 / 0.5 / 1**. No additional grid points.
- E1-T prior costs 2 per unit preferred-finger deviation; gamma is 1/16,
  1/8, 1/4 or 1/2 of that cost. No ergonomic Gold or absolute comfort threshold.
- Add `gamma * shared MIDI pitches assigned different fingers` to transition
  cost only when both candidate groups belong to the same hand. Same finger adds
  zero. This unweighted penalty is equivalent to a retention bonus plus an
  input-dependent constant. No duration scaling of this new term.
- Candidate generator/cap, Hand Position Proxy, lambda=2, inverse curve, anchors,
  segments, empty hands, cyclic DP, tie-break, source notes and hand assignment
  remain unchanged. Use the existing injected costModel seam from diagnostics;
  do not modify src or install the experiment into the UI.
- Dev: exactly the previous 1,148 progressions / 4,478 events (large offsets0..5
  plus named68). Verify CURRENT and unmodified lambda=2 aggregates against the
  prior dev artifact. Never evaluate offsets6..11, private witnesses or external data.
- Original frozen-policy/comparison JSON and lambda-follow-up JSON stay unchanged.

## Additional fixed controls

- Same ten representative controls as the lambda follow-up, including the same
  middle Saved Anchor [4] for every arm.
- Original single-note time probe plus Common Tone time probes: LH/RH named
  common1/common2, and LH/RH 2-note cluster/open/inversion at offset0. For each,
  IOI seconds = 0.125 / 0.25 / 0.5 / 1 / 2 / 4. Pitches and hands stay fixed.
- Anchor sweep fixes every dev event to the same existing last candidate in all
  arms. Measure determinism, candidate/input immutability and repeat stability.
- Export all 24 original lambda=2 regression cases with candidates, selected
  fingers, edge common pitches, proxy positions and decomposed costs for every arm.
- Runtime: same 128-event right-hand fixture, warmup +12 measurements, serial
  arms; report noise and overhead, do not select on noisy runtime alone.
  Also profile a fixed shared-pitch stress fixture: RH [60,64,67+i%3], 128 events,
  IOI0.5s. This exercises the added term; the original stress has no shared notes.

## Eligibility and selection (dev only)

- Fewer than24 CURRENT-relative regression cases; total reassignment <=2122.
- No additional solver/candidate/structural failures; anchors100%, determinism100%,
  notes/hands/candidates unchanged; repeat fluctuation not increased.
- Original time probe keeps nonincreasing preferred distance and nondecreasing
  proxy movement as IOI grows, with at least one selection change. On each fixed
  Common Tone time probe preserve those directions; if baseline lambda=2 changes
  selection on that probe, the Common Tone arm must still change selection.
- Context sensitivity remains >0. Existing Range invariance/segment/empty-hand
  contracts pass. Proxy movement stays below CURRENT (retain some position gain).
- Among eligible arms: minimize regression case count, then newly regressed cases
  outside the original24, then total reassignment, then proxy movement, then gamma.
- No eligible arm: do not extend/tune grid; report NO_CLEAR_GAIN, or HARMFUL if
  structural/time behavior fails throughout. Common Tone gain alone is insufficient.
- Even an eligible arm is diagnostic-useful, not production promotion or ergonomic
  validation. Report original24 improvements, remaining and new regressions, all
  representative changes and runtime; stop READY_FOR_HUMAN_DECISION.
- No Span/Black Key/finger-crossing/hand-size/Reason UI/E3/default switch or integration.
