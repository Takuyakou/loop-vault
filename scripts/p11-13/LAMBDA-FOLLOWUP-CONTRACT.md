# P11-13 lambda follow-up — matched dev comparison

Authorized by the human after P11-13 completion. This is a diagnostic shortlist,
not a replacement of the original frozen policy or a production promotion.

- Arms: CURRENT plus E1-T inverse lambda 0.5 / 1 / 2 / 4. Lambda is the only differing policy input.
- Fixed: existing candidate generator/cap, notes, hand assignment, authored onsets,
  durations, cycle endpoint, saved anchors, deterministic tie rules, and original
  `p11-13-properties-v1` measurements.
- Corpus: the same 1,148 dev progressions (large offsets 0..5 plus named cases).
  Do not evaluate offsets 6..11, private witnesses, or sealed data for this selection.
- Reuse the prior dev sweep to check aggregate equality. Preserve the original
  `comparison.json` and `frozen-policy.json` byte-for-byte.
- Additional diagnostic views: per-case/common-tone regression counts; fixed
  authored timing probes; LH single-finger distribution by IOI; Saved Anchor
  retention; repeated-voicing stability; representative fingers; runtime.
- Shortlist on the observed trade-off between common-tone regressions, preferred
  finger deviation, slow/fast behavior, and movement reduction. Do not invent
  ergonomic Gold, new pass thresholds, or select on minimized proxy alone.
- At most two weights for further human comparison. A diagnostic recommendation
  does not change CURRENT default or the existing E1-T lambda 0.5 EXE.
- No E2/E3, production change, merge, push, tag or release in this follow-up.
