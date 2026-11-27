# P5.18 Claude Code Start Prompt

最初に以下を順番に全文確認してください。

1. リポジトリルートの `AGENTS.md`
2. リポジトリルートの `CLAUDE.md`
3. `docs/phase5.18/README.md`
4. `docs/phase5.18/execution-state.json`
5. README の Required reading order に指定されたファイル

その後、branch、worktree、HEAD、PR、`git status` と `execution-state.json` を照合してください。

記録と Git の実態が異なる場合は Git の実態を優先し、差異を Stage report に記録してください。

今回は `execution-state.json` が示す **最初の未完了 Stageだけ** を実行してください。

- 指定外 Stageへ進まない
- 次Phaseへ進まない
- masterへmergeしない
- pushしない
- reset / stash / 既存変更の破棄をしない
- `git add -A` / `git add .` を使わない

Stage完了時に:
- Stage report
- `execution-state.json`
- 必要な contract / audit
- Gate結果
- commit hash
- post-commit `git status --short`

を更新し、次Stageへ進まず停止してください。
