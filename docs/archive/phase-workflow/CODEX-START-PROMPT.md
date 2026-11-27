# Session start prompt

Paste this at the start of a session to resume a phase. Replace `phaseX.Y` with
the target phase (e.g. `phase5.17`).

```text
最初にリポジトリルートのAGENTS.mdと、対象Phaseの単一入口であるdocs/phaseX.Y/README.mdを全文読んでください。

READMEに記載されたrequired reading orderに従って必要ファイルを確認してください。

その後、branch、worktree、HEAD、PR、git statusとexecution-state.jsonを照合してください。記録と実態が異なる場合はGitの実態を優先し、差異をreportへ記録してください。

最初の未完了Stageまたは未完了Gateから再開し、README、work-instructions、execution-stateに定義された順序、禁止事項、完了条件を省略しないでください。

各Stage完了時にREADME、execution-state、Stage report、検証結果、commit hashを更新してください。

指定外Stage、次Phase、masterへのmerge、pushには進まず、停止条件に該当した場合は変更を破棄せず報告して停止してください。
```

English equivalent:

```text
First read the repository-root AGENTS.md and the target phase's single entry
point, docs/phaseX.Y/README.md, in full.

Follow the required reading order listed in that README.

Then reconcile branch, worktree, HEAD, PR, git status, and execution-state.json.
Where the record and reality differ, trust Git and record the difference in a
report.

Resume from the first incomplete stage or gate, without skipping the order,
prohibitions, or completion criteria defined in the README, work-instructions,
and execution-state.

At the end of each stage, update the README, execution-state, the stage report,
the verification results, and the commit hash.

Do not advance to an unassigned stage, the next phase, a merge to master, or a
push. If a stop condition applies, do not discard changes — report and stop.
```
