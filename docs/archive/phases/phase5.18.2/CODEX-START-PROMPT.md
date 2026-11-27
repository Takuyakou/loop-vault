# P5.18.2 Codex / Claude Code Start Prompt

Phase 5.18.2 — Vault Source Discoverability を開始してください。

最初に以下を順番に全文確認してください。
1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/phase5.18.2/README.md`
4. `docs/phase5.18.2/execution-state.json`
5. READMEのRequired reading order

branch、worktree、HEAD、PR、git statusとexecution-stateを照合し、差異はGitを優先してreportへ記録してください。

P5.18.1完了・master統合済み、およびtest-output hygiene merge `81a6890`または後継がmaster祖先であることを確認してください。

今回は `P5.18.2-00` のみ実行してください。
- production実装禁止
- 01以降禁止
- titleをsnapshot/History/report/logへ保存禁止
- Progression Detail導線を推測せず監査
- master merge/push/P5.19禁止
- reset/stash/discard禁止
- git add -A / git add . 禁止
- Vault schema/mutation、P5.15、Analyzer、MIDI Exporter変更禁止
- CURRENT_STATE復活禁止

Stage完了時にaudit/contracts/report/execution-state/Gate/commit hash/post-commit statusを更新し停止してください。
