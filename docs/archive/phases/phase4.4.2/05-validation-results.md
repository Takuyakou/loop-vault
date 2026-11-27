# P4.4.2-05 Validation Results

- Locked candidate: **A1**
- Result: **PASS**
- Decision: `advance-to-holdout`
- Validation execution count: **1**
- Gate classification: recomputed from stored results only
- Holdout: not run
- Product path: unchanged

| Metric | Result |
|---|---:|
| Primary contamination reduction | 50.00% |
| Primary melody leak reduction | 50.00% |
| Note recall delta | 0.00pp |
| Note F1 delta | 4.76pp |
| Voicing exact delta | 50.00pp |
| Bass delta | 0.00pp |
| Top-note delta | 50.00pp |
| Register delta | 50.00pp |

The general validation split contains no plain-block, rootless, or arpeggio
category events, so those category checks are not applicable. The 96-event
overall regression check passed. Failed gates: none.
