# P5.20 Run Remaining Stages Prompt

P5.20-00がPASSし、grammar/timing/key/card reuse/Voicing Inspector/capability/Draft bridge/Custom Voicing decision/baselineがcommit済みであることを確認。

AGENTS/CLAUDE/README/state/Required reading/00 reportを読みGitと照合。

問題なければP5.20-01〜03をStage順に連続実行してよい。ただし各Stageで実装→対象test→regression→safety/capability→report→state→diff check→explicit stage→commit→post-cleanを完了してから次へ。

停止条件:
- parser contract矛盾
- second chord identity systemが必要
- CaptureDraft schema rewrite
- exact timing不可
- Custom Voicingがschema/fileVersion/new storage要求
- ProgressionGrid再利用に大規模破壊が必要
- inferred keyをfact保存しないと成立しない
- Vault/Practice schema変更
- P5.15/Analyzer/MIDI Exporter変更
- test-output hygiene退行
- test/build FAIL

Custom VoicingがDEFERREDならAuto Voicingのみで進める。scopeを広げない。

最終到達点: `READY FOR PRODUCT ACCEPTANCE — Text Progression Entry`。master未merge、pushなし、P5.21なしで停止。
