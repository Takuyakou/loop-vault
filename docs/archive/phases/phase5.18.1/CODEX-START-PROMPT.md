# P5.18.1 Codex / Claude Code Start Prompt

Phase 5.18.1 — Bassline Preset Library & Vault Source Picker を開始してください。

最初に以下を順番に全文確認してください。

1. リポジトリルートの `AGENTS.md`
2. リポジトリルートの `CLAUDE.md`
3. `docs/phase5.18.1/README.md`
4. `docs/phase5.18.1/execution-state.json`
5. README の Required reading order に指定されたファイル

その後、branch、worktree、HEAD、PR、`git status` と `execution-state.json` を照合してください。

記録と Git の実態が異なる場合は Git の実態を優先し、差異を Stage report に記録してください。

P5.18 が正式完了し clean な master に統合済みであることを確認してください。
未完了なら P5.18.1 に着手せず停止してください。

今回は `execution-state.json` が示す最初の未完了 Stageだけを実行してください。
初回は `P5.18.1-00 — Repository Audit / Contract / Baseline` のみです。

- P5.18.1-01以降へ進まない
- masterへmergeしない
- pushしない
- P5.19へ進まない
- reset / stash / discardしない
- `git add -A` / `git add .` を使わない
- Vault schemaを変更しない
- Vaultをmutationしない
- current default progressionを削除しない
- unsupported chordを別chordへ黙って置換しない
- 個人MIDI、実録音、個人絶対pathをcommitしない
- `docs/CURRENT_STATE.md`を復活させない

Stage完了時に:

- Stage report
- `execution-state.json`
- audit / contracts
- Gate結果
- commit hash
- post-commit `git status --short`

を更新し、次Stageへ進まず停止してください。
