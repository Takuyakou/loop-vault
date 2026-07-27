# P4.4.2-01 Dev Failure Matrix

- split: dev only
- Validation / Holdout: 未実行
- Product role推論だけでPrimary / Diagnostic-onlyを分離
- Gold roleは評価分類にだけ使用し、filter判定へ渡していない

## Failure categories

| Category | Events |
|---|---:|
| support-count-0 | 8 |
| support-count-1 | 24 |
| support-count-2 | 32 |
| support-count-3 | 64 |
| support-count-4-plus | 32 |
| support-duration-too-short | 0 |
| role-is-bass | 8 |
| no-harmony-voice | 8 |
| status-only-change | 7 |
| pitch-fidelity-change | 8 |

## Subset

| Subset | Events | Contamination | Leak | Exact | Recall | Usable | Filter trigger |
|---|---:|---:|---:|---:|---:|---:|---:|
| diagnostic-only | 16 | 6 | 37.50% | 0.00% | 68.75% | 0.00% | 0.00% |
| other | 56 | 15 | 26.79% | 50.00% | 84.85% | 53.57% | 42.86% |
| primary | 88 | 30 | 34.09% | 10.23% | 75.74% | 4.55% | 0.00% |

各eventのProduct role / confidence、support pitch count、duration、mass、rejection reasons、noteInstanceId、input/final pitch set、selected sourceVoicing、statusはJSONへ保存した。

Bass誤分類とsupport count 0はDiagnostic-onlyであり、P4.4.2の改善Gateへ含めない。
