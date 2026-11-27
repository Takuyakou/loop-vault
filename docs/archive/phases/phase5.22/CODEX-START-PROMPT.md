# P5.22 Codex / Claude Code Start Prompt

Phase 5.22 — Source Bassline Practice を開始してください。

最初に全文確認:

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/phase5.22/README.md`
4. `docs/phase5.22/execution-state.json`
5. README Required reading

Git realityを確認:

- branch / HEAD / master
- status/worktrees
- merge/rebase/cherry-pick
- P1 Security Hardening ancestor
- P5.21.1 accepted ancestor
- P5.20/current Capture behavior
- P5.15 non-ancestor

今回は `P5.22-00 — Repository Audit / B+ Contract / Baseline` のみ実行してください。

重要:

- production featureをまだ実装しない
- P5.22-01へ進まない
- 案BではなくREADMEのB+を正本とする
- 保存時に最低音だけへ潰さない
- 全Bass note eventsを原資料として保持する設計を監査する
- fileVersion1を先に決めない
- old-writer round-trip data-lossを検証する
- exact timingを推測でfloat固定しない
- Contract06だけでsize safetyを済ませない
- Bass role自動推定だけで永続化を承認しない
- explicit opt-in default OFFを検討/固定する
- source snapshotをprogression editで書き換えない
- Level1/2を保存しない
- Transferを次区間の意味に変更しない
- raw MIDI/path/filename/track/deviceを保存しない
- P1 import budgetsを弱めない
- P5.15/Analyzer/MIDI Exporter変更禁止
- reset/stash/discard禁止
- `git add -A` / `git add .`禁止
- merge/push/P5.23禁止

Stage00完了時:

- audit
- fileVersion decision
- timing decision
- boundary semantics
- schema concept
- note/byte budgets
- Capture opt-in/Voice selection contract
- edit/duplicate/delete semantics
- Level3 polyphony policy
- L1/L2 deterministic rules
- History/export/import contract
- baseline gates
- report/execution-state/commit/clean status

を記録し、停止してください。
