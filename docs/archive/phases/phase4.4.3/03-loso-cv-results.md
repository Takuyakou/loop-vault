# P4.4.3-03 Leave-one-scenario-out CV

- Candidate: A1-prime
- Folds: 16
- Events: 256
- Decision-eligible folds: 13
- Burned diagnostic folds: 3
- Improved / inconclusive / regressed:
  **5 / 0 / 8**
- General regression: **PASS**
- Decision: **stop-automatic-removal**

| Scenario | Split | H/N/X/U | Applicability | Inertness | Verdict | Decision use |
|---|---|---|---:|---:|---|---|
| H01 block-support-1 | dev | 16/0/0/0 | 100.00% | n/a | regressed | yes |
| H02 block-support-2 | dev | 8/0/8/0 | 100.00% | 100.00% | regressed | yes |
| H03 block-support-3 | dev | 8/0/8/0 | 100.00% | 100.00% | regressed | yes |
| H04 block-support-4 | dev | 16/0/0/0 | 100.00% | n/a | regressed | yes |
| H05 arp-support-1 | dev | 8/0/8/0 | 100.00% | 100.00% | regressed | yes |
| H06 arp-support-2 | dev | 8/8/0/0 | 100.00% | 100.00% | regressed | yes |
| H07 arp-support-3 | dev | 16/0/0/0 | 100.00% | n/a | improved | yes |
| H08 arp-support-4 | dev | 8/0/8/0 | 100.00% | 100.00% | improved | yes |
| H09 rootless-support-2 | dev | 8/0/8/0 | 100.00% | 100.00% | regressed | yes |
| H10 rootless-support-3 | dev | 16/0/0/0 | 100.00% | n/a | improved | yes |
| H11 all-channel-zero-stems | validation | 0/0/16/0 | n/a | 50.00% | regressed | yes |
| H12 all-channel-zero-clear-names | holdout | 0/0/16/0 | n/a | 50.00% | regressed | diagnostic only |
| H13 short-support-duration | validation | 8/0/8/0 | 100.00% | 100.00% | improved | yes |
| H14 boundary-support-duration | holdout | 8/0/8/0 | 100.00% | 100.00% | improved | diagnostic only |
| H15 long-support-duration | validation | 8/0/8/0 | 100.00% | 100.00% | improved | yes |
| H16 status-only-control | holdout | 8/0/8/0 | 0.00% | 100.00% | inconclusive | diagnostic only |

The former holdout scenarios are reported but excluded from promotion counts.
No fold selected parameters, and no old dedicated holdout was opened.
