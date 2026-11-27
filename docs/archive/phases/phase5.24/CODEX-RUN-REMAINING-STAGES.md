# P5.24 Run Remaining Stages

P5.24-00 PASSと以下のcommit済みを確認:
- insertion seam
- A-K fixtures
- 4/4 scope
- Harmonic Rhythm contract
- Bass Lane contract
- fragment evidence contract
- metrics
- boundary tolerance
- promotion gate
- feature flag
- baseline

問題なければStage01〜04を順に実行してよい。

Stage01:
Harmonic Rhythm + Bass Lane Shadow only。
両subsystemのmetricsを別々にreport。

Stage02:
Fragment Consolidator Shadow only。
A-K評価。
Promotion FAILならStage03へ進まず停止。

Stage03:
default-OFF flag。
OFF deep equal。
ONではHarmonic State input変更によるlabels/boundaries/candidates変化は意図された挙動。
algorithm scope creepは禁止。

Stage04:
Full gates / product acceptance readiness。

各Stage:
implementation → focused tests → regression → metrics → protected diff → report/state → diff-check → explicit staging → independent commit → clean

禁止:
- subset-only merge
- Local estimator
- raw MIDI mutation
- Vault schema/fileVersion change
- candidate diversification
- merge/push/P5.25

最終:
`READY FOR PRODUCT ACCEPTANCE — Harmonic Rhythm & Performance Fragment Consolidation`
