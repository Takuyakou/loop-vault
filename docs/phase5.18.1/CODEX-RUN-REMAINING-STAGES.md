# P5.18.1 Run Remaining Stages Prompt

P5.18.1-00 が正式にPASSし、contractsとbaselineがcommit済みであることを確認してください。

`AGENTS.md`、`CLAUDE.md`、`docs/phase5.18.1/README.md`、
`execution-state.json`、Required reading order、P5.18.1-00 reportを読み、
Gitの実態と照合してください。

問題がなければ、P5.18.1-01〜05をStage順に連続実行して構いません。

ただし各Stageで必ず:

1. 実装
2. 対象test
3. regression
4. report更新
5. execution-state更新
6. `git diff --check`
7. 明示path stage
8. 独立commit
9. post-commit clean

を完了してから次Stageへ進んでください。

次の場合は停止してください。

- contract矛盾
- current default互換を破壊
- Vault schema / mutationが必要
- unsupported presetを黙って簡略化する必要がある
- P5.15 / Analyzer / MIDI Exporter変更が必要
- source switch resource leak
- test / build Gate FAIL
- 意図不明な既存変更

最終到達点は:

`READY FOR PRODUCT ACCEPTANCE — Bassline Preset Library & Vault Source Picker`

です。

masterへmergeせず、pushせず、P5.19へ進まず停止してください。
