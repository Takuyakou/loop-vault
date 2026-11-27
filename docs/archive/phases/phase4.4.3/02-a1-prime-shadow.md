# P4.4.3-02 A1-prime Shadow

- Evaluation split: dev only
- Holdout: not run
- Product path: unchanged
- Only algorithm change: `minimumSupportBeats` removed

| Metric | A1-prime |
|---|---:|
| Primary contamination reduction | 100.00% |
| Primary melody leak reduction | 100.00% |
| Note recall delta | 0.25pp |
| Note F1 delta | 3.62pp |
| Voicing exact delta | 17.05pp |
| Bass delta | 0.00pp |
| Top-note delta | 12.50pp |
| Register delta | 12.50pp |
| Events changed from A1 | 0 |

The next stage evaluates the preregistered candidate with 16-scenario
leave-one-scenario-out CV. No parameter is selected from this report.
