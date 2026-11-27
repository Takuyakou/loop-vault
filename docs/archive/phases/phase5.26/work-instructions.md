# Phase 5.26 Work Instructions

## Scope
P5.26-00ではrepositoryを実測し、P5.24 A-Kを既存generatorから継承し、L-Qとlayered synthetic 8-bar truth、
6軸metrics、flags、promotion、privacy、bounded-performance契約をtest-only codeへ固定する。
Expected 8-bar state countsは `1,1,2,2,1,1,2,2`。M/O/Q false mergeはHard Fail。

## Mission
Local/Global HR seam、Structural Bass seam、spelling、b9 rank、b13 generation coverageを分離して改善可能にする。
Stage00はbaselineを測るだけでproduction behaviorを変更しない。

## Stage00
- current analyzerをdeterministic synthetic inputでfresh実測する
- expected truthとcurrent actualを別型・別定数にする
- segmentation / canonical identity / structural bass / altered tension / spelling / exact surfaceを別々に測る
- flag OFF deep equal、unknown fallback、A-Q、M/O/Q safety、bounded runtimeをpromotion contractへ固定する
- private input、personal path、raw note dumpをtracked outputへ入れない

## Promotion Contract
Track AはA-Q pass、M/O/Q false merge 0、Global-sufficient unchanged、unknown fallback、deterministic、bounded、
flag OFF deep equalをすべて要求する。Track Cのaltered tensionはshadow-onlyで閉じてもよい。

## Non-goals
Production source変更、Global HR削除、raw MIDI/timing変更、Voice Role変更、Vault/Practice schema migration、
saved data rewrite、broad scoring retune、large template expansion、`Amaj9/B` opportunistic normalization。

## Definition of Done
- test-only fixtures/metrics/promotion contractsがfocused testと専用typecheckを通る
- phase docs validator、privacy scan、diff checkが通る
- audit/report/stateがGit realityとfresh gate結果を記録する
- Stage00独立commit後に停止し、Stage01、merge、push、P5.27へ進まない

## Protected Surfaces
production `src/`、`src-tauri/`、Vault/Practice persistence、default analyzer mode、MIDI exporter、unrelated UI/audio。

## Next Action
P5.26-00のみ完了する。
