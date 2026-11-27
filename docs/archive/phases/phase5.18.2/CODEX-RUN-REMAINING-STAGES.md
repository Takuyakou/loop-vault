# P5.18.2 Run Remaining Stages Prompt

P5.18.2-00がPASSし、title boundary / Progression Detail determination / baselineがcommit済みであることを確認してください。

AGENTS.md、CLAUDE.md、README、execution-state、Required reading order、Stage00 reportを読みGitと照合してください。

問題なければP5.18.2-01〜03をStage順に連続実行して構いません。
各Stageで実装→対象test→regression→privacy negative tests→report→state→diff check→明示path commit→post-commit cleanを完了してから次へ進んでください。

停止条件:
- titleをsnapshot/Historyへ保存する必要
- Vault schema/mutationが必要
- Progression Detailがnever-existedでStage00のhuman approvalなし
- P5.18.1 transaction破壊
- test-output hygiene退行
- P5.15/Analyzer/MIDI Exporter変更
- Gate FAIL
- 意図不明な既存変更

最終到達点は `READY FOR PRODUCT ACCEPTANCE — Vault Source Discoverability`。
masterへmergeせず、pushせず、P5.19へ進まず停止してください。
