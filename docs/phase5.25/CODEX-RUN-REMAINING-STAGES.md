# P5.25 Run Remaining Stages

P5.25-00 PASSと以下の固定を確認:
- current 2-bar limit origin
- 1/2/4/8 domain
- default 2
- crop contract
- crop-before-projection
- short-source fallback
- Record duration behavior
- History/UI policy

問題なければStage01〜03を順に実行。

各Stage:
implementation → focused tests → relevant regression → report/state → diff-check → explicit staging → independent commit → clean

Test/Build Optimization Policyを適用し、heavy full gatesはFinalへ集約。ただしPhase固有安全Gateは省略しない。

Hard stop:
- snapshot schema変更必要
- Vault/fileVersion変更必要
- legacy 1/2 regression
- crop-before-projection破壊
- Record limit変更必要
- unrelated Bass Practice change

最終:
`READY FOR PRODUCT ACCEPTANCE — Source Bassline Practice Window Expansion`
No merge/push/P5.26。
