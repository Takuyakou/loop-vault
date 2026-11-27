# P5.26 Run Remaining Stages

P5.26-00 PASSと以下のcommit済みを確認:
- current pipeline/baseline
- A-Q fixtures
- synthetic 8-bar ground truth
- metric decomposition
- spelling contract
- Local/Global arbitration
- Structural Bass contract
- Track A promotion gate
- Track C non-blocking policy
- flags
- performance methodology

問題なければStage01〜05を順に実行。

Stage01:
Track B spelling only。PC identity invariance必須。

Stage02:
Track A Shadow only。
Local HR + Structural Bass + identity-independent consolidation。
A-Q評価。production connection禁止。

Promotion FAIL:
Stage03へ進まずreportして停止。

Stage03:
Track A feature-flagged production integration。
default OFF / OFF deep equal / ON official+synthetic+real-local。

Stage04:
Track C shadow。
b13 generation + b9 diagnosis。
unsafeなら `SHADOW PASS — NOT PROMOTED` でよい。

Stage05:
Full Product Acceptance。

各Stage:
implementation → focused tests → relevant regression → metrics → protected diff → report/state → git diff --check → explicit staging → independent commit → clean

No merge/push/P5.27。

Final:
`READY FOR PRODUCT ACCEPTANCE — Local Harmonic Rhythm / Spelling / Altered Tensions`
