# P5.19 Run Remaining Stages Prompt

P5.19-00がPASSし、contracts/schema decision/fingering policy/Vault root-path policy/baselineがcommit済みであることを確認してください。

AGENTS.md、CLAUDE.md、Phase README、execution-state、Required reading order、P5.19-00 reportを読み、Git実態と照合してください。

問題なければP5.19-01〜05をStage順に連続実行して構いません。

各Stageで必ず: 実装 → 対象test → regression → privacy/safety → report → execution-state → diff-check → explicit-path stage → 独立commit → post-commit clean。

停止条件: contract矛盾、破壊的schema migration、Vault schema/mutation、false fretboard shape、Vault root pathをoriginal basslineと誤認、Identify/Review composite score、P5.15/Analyzer/MIDI Exporter変更、test-output hygiene退行、test/build FAIL、resource leak、意図不明変更。

最終到達点は `READY FOR PRODUCT ACCEPTANCE — Root Motion Echo`。
masterへmergeせず、pushせず、P5.20へ進まず停止してください。
