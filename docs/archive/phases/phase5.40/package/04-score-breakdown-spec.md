# Candidate Score Breakdown Specification

## Objective

Explain numerically why the wrong local candidate wins.

P5.40-00 must score **all currently eligible candidates** for each target local state. It must not inspect only the winner and expected answer.

## Required per-candidate fields

Record at least:

- anonymous state ID;
- candidate canonical identity;
- candidate family/reason;
- root;
- quality;
- explicit modifiers;
- omissions;
- independent bass/slash semantics;
- template expected pitch classes;
- observed materially present pitch classes;
- missing expected tones;
- conflicting present tones;
- template hit contribution;
- outside-share contribution;
- root evidence contribution;
- bass evidence contribution;
- quality evidence contribution;
- explicit-modifier evidence / penalty;
- omission-conflict contribution;
- semantic complexity contribution;
- any attenuation terms used by the frozen scorer;
- total score;
- final rank;
- tie-break reason when equal/near-equal.

## Comparison views

Produce at least:

1. top 10 ranked candidates;
2. independently correct candidate(s), even if outside top 10;
3. current winning candidate;
4. score delta: winner vs correct candidate;
5. contribution-by-contribution delta;
6. any material tone conflict ignored or underweighted by the winner;
7. any correct-candidate evidence that the scorer fails to reward.

## Diagnostic questions

The report must answer, with evidence:

- Is the correct candidate generated at all?
- If generated, where does it rank?
- Which exact score term causes the wrong winner to overtake it?
- Is the defect root evidence, quality evidence, outside-tone handling, bass evidence, omission handling, complexity bias, modifier handling, sparse-evidence behavior, or tie-break?
- Does the same defect appear in privacy-safe synthetic or public-safe controls?
- Can the issue be described without naming the private source or exact location?

## No-fix rule

Stage00 may add evaluation-only diagnostics needed to expose these values, but must not change the ranking outcome.
