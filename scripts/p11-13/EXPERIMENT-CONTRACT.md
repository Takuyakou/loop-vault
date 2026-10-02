# P11-13b bounded comparison contract

Freeze before arm execution. Public synthetic only. No external datasets or private witnesses.

- CURRENT: current cost with the 13a shared foundation. Candidate generation and hand assignment are fixed.
- E1-raw: median anchor proxy, no prior/time weighting.
- E1-T-zero-prior: selected time curve, lambda 0.
- E1-T: lambda > 0, same candidates, median proxy.
- Curves: inverse, sqrt, shifted-inverse. Seconds are the input unit. The 0.001 floor is numeric protection only.
- Lambda grid: 0.125, 0.25, 0.5, 1, 2, 4. Finite developer search bounds, not Gold.
- Dev: P11-12 named cases plus large-case chromatic offsets 0..5 (all three timing variants).
- Frozen evaluation: large-case offsets 6..11 plus separately authored rest/anchor/cycle/heterogeneous-cardinality controls. No parameters selected from those outputs.
- Property validity: no structural/candidate/solver failures, immutable input/candidates, exact anchors, deterministic reruns, no additional repeated-voicing fluctuation, common-pitch finger reassignment count <= CURRENT; monotonic time direction and actual context/time response.
- Width: contiguous passing lambda grid points per curve. Prefer widest passing run, then inverse / sqrt / shifted-inverse order. Use a central tested point. A singleton is not a robust valid width.
- No passing width: do not tune further; freeze a diagnostic non-promotable comparator at inverse/lambda 1 and report no passing width. Do not start E2.
- Internal minimized proxy movement is diagnostic, not evidence of ergonomic correctness.
- Human decision uses ten representative public cases and an EXE with developer settings toggle. CURRENT remains default. No E2/E3/default switch/merge.
