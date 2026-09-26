# R06 — classified current-site / theory / Product matrix

The [machine-readable matrix](compatibility-matrix.jsonl) has **29,848/29,848** rows from the site-only frozen plan. All 29,848 were accepted by the current deployed site; Product Text Intake converts 624. The independent policy assigns literal pitch classes to 23,464 rows and explicitly rejects 6,384 unusual or conflicting composites. A site-accepted but policy-rejected label is a known external-policy difference, not an invented chord meaning. There are no `F/UNKNOWN` rows under this finite policy.

| Non-exclusive class | Rows | Interpretation |
|---|---:|---|
| A `SEMANTIC_ERROR` | 138 | Product accepts a label but its identity conflicts with the independent literal policy, including composite meanings. |
| B `DEFINING_TONE_LOSS` | 451 | At least one supported audition surface loses a required pitch class; 274 affect Text Preview and saved Vault, and 379 affect supported Voicing Loop. Counts overlap. |
| C `VALID_OMISSION` | 52 | Only an optional tone is omitted under the chosen policy. |
| D `VOICING_DIFFERENCE` | 311 | Semantic set is retained but concrete note placement differs. |
| E `EXTERNAL_POLICY_DIFFERENCE` | 29,447 | Includes wider site syntax with explicit Product rejection and site/theory semantic-policy differences. This is not an assertion of 29,447 Product bugs. |
| F `UNKNOWN` | 0 | No row was left without a recorded disposition. |

More discriminating E subcounts are **22,840** site-accepted/Product-explicitly-rejected rows with an independently adjudicated theory meaning, **6,384** independently rejected unusual composites, and **11,342** direct site/literal-theory pitch-class differences. The subcounts overlap by design. Among supported Product rows, Text Preview and Vault auditions matched exactly (624/624); 180 Product-valid rows are explicitly unsupported by Voicing Loop Generated. All rows contain support status and a finite action in addition to A–F classes.

The six directly UI-verified high-risk synthetic rows have no F result. In the current `basic-full` style, F13, Dm11, and Am9/C lose a tone required by this audit policy; B7(#9,#5) retains its defining pitch classes but differs in placement; Db7(#9) and E7(b9) omit only an optional tone on at least one surface. These statements are about the named synthetic representatives and current policy, not private witness notes.

The family [coverage table](vocabulary-family-coverage.csv), [mismatch summary](mismatch-summary.csv), [surface consistency table](surface-consistency.csv), and [aggregate JSON](matrix-aggregate.json) were generated with [the research-only builder](scripts/build-matrix.cjs). Re-running the builder twice produced byte-identical matrix SHA-256 `5255EBB8525735ADA1918AD99D2A056D225300A85B6B0D9F82ACD44D8B9966B0`. The `100%` in the family CSV means planned rows were emitted and measured; it does **not** yet assert the R09 whole-grammar coverage gate.
