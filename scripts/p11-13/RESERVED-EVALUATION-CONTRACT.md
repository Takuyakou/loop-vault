# P11-13d — frozen reserved confirmation contract

Freeze before any new reserved arm execution. No policy changes or reruns after
reading the reserved result. Diagnostic evaluator additions only; src unchanged.

## Frozen policy / arms

Exactly CURRENT, E1-T/inverse/lambda2, and E1-T/inverse/lambda2 with weak
same-MIDI-pitch/same-hand reassignment penalty gamma1. Reuse existing costModel,
candidate generator/cap, median Hand Position Proxy, Saved Anchor, segments,
empty-hand handling, cyclic DP/ties, full-progression Range scope, notes/hands.
No other gamma/lambda/curve arms, adoption, FULL/EXE, merge, push or release.

## Dataset / exposure

Evaluate only existing largeCases offsets6..11: 1,080 cases / 4,320 events.
Read archived dev aggregates without recomputing or tuning dev.
Existing comparison.ts already contains P11-13b reserved evaluation of a
different frozen policy. Report that prior exposure honestly; this is the first
confirmation of the dev-selected lambda2/gamma1, not an unused new corpus.
No private data or external dataset. Named 1-to-2 / 2-to-1 / 3-to-1 are absent
from reserved; mark NOT_MEASURED, never invent reserved coverage via transpose.

Representatives: six families white/black/cluster/wide/inversion/open, smallest
codepoint stable ID with >=2 notes in the first event, followed by smallest
right-hand cluster/inversion/open IDs with >=2 notes. Nine cases, fixed before
results; include notes/timing to interpret fingers, never finger Gold.

## Metrics / controls

Reuse comparisonMetrics measure/aggregate (p11-13-properties-v1) and the
CURRENT-relative casewise definitions from P11-13c. Record selected changed
events versus CURRENT and versus lambda2; proxy/wrap are diagnostic only.
Each corpus arm includes one deterministic duplicate solve inside measure,
and a separate anchor sweep (same last existing candidate for every event).
These mandated property solves are part of one evaluation run, not retuning.

Time controls derived exclusively from reserved: LH/RH 2-note cluster/open/
inversion, offset6 at original IOI1 beat; substitute IOI seconds
0.125/0.25/0.5/1/2/4. Also LH/RH single-note ascending [base,base+2,base+4,
base+5], base=42/66, seconds0.03125/0.0625/0.125/0.25/0.5/1/2/4/8/16.
Require preferred distance nonincreasing and movement nondecreasing with IOI,
and retain actual selection response wherever the lambda2 control responds.
Context controls: LH/RH base42/66 [base,base+2,base+4], IOI0.125 seconds;
change neighbors by +step/-step for step1..7. Require some central response.
Derived controls are separate from the 1,080-case corpus denominators.

Range: actual product adapter on these nine full-progression fixtures, with
session ranges first-only and middle-to-last, all three arms. Result must equal
no-range; compare notes/hands before/after. No range-only optimization.
Run existing focused segment/empty-hand/anchor/Range regressions on frozen code.

Runtime: original comparisonMetrics runtime128 stress only, each of three arms,
warmup plus12 timed solves, no parameter search or repeat profiling. Report
median/p95 and absolute/relative delta. No ergonomic/runtime promotion claim.

## Confirmation decision (fixed before execution)

All arms: zero candidate-empty/solver/structural failures, all notes/hands/
candidates unchanged, deterministic100%, Saved Anchors100%, repeat fluctuation0,
Range invariant. Existing focused regressions pass.
For lambda2+gamma1: time directions and baseline-sensitive responses retained,
context response >0, total reassignment <=lambda2 and CURRENT-relative regressed
case count <=lambda2. Equality is permitted as no clear worsening.
No major new family regression relative to lambda2: reject if either new
CURRENT-relative regression cases reach max(3, ceil(5% of family cases)), or
extra reassignments exceed max(2, ceil(5% of family common comparisons)).
Existing lambda2 cluster regressions are reported separately, not newly created.
Runtime major regression: reject if gamma1 median is >=2x lambda2 AND >=50ms
slower, OR p95 >=2x lambda2 AND >=100ms slower. Report smaller overhead too.
These bounds check major diagnostic regressions, not a product latency SLA.
Any major violation => HOLDOUT_NOT_CONFIRMED, otherwise HOLDOUT_CONFIRMED.
Missing named-family reserved coverage and prior exposure remain limitations
even if measured properties confirm. No policy retuning in either outcome.

The entry point uses an exclusive run marker and refuses execution if already
started or output exists. If interrupted, preserve partial records; do not
silently retry. After results stop READY_FOR_HUMAN_DECISION.
