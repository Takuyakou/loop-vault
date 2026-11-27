# P5.21.1 Codex / Claude Code Start Prompt

Phase 5.21.1 — Mixed Voice Harmonic Extraction を開始してください。

最初に:

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/phase5.21.1/README.md`
4. `docs/phase5.21.1/execution-state.json`
5. Required reading

を全文確認してください。

その後Git realityを確認:

- branch / HEAD / master
- worktrees
- `git status --short`
- merge/rebase/cherry-pick
- P5.21 exact accepted base
- Settings visual-baseline maintenance state
- P5.15 ancestry
- test-output hygiene

今回は `P5.21.1-00 — Failure-case Audit / Baseline / Contract Lock` のみ実行してください。

重要:

- production behaviorを変更しない
- P5.21.1-01へ進まない
- `all_instruments.mid`をGit commitしない
- PC全体をMIDI scanしない
- exact filenameをrepo/shared worktree/local-evaluation範囲で自動探索する
- raw MIDIを変更しない
- display MIDIを変更しない
- chord scoring/boundary/candidate generationを変更しない
- chord-tone membershipをnote classifier設計へ入れない
- 高音=melodyという単独ruleを採用しない
- note削除を設計しない
- melody-like weight=0を許可しない
- default analyzer/presetを変更しない
- P5.21のvisual-baseline blockerをこのPhaseへ混ぜない
- reset/stash/discard禁止
- `git add -A` / `git add .`禁止
- merge/push/P5.22禁止

Stage00で必ず:

1. `all_instruments.mid` のfailure topologyを実データから再確認
2. current Harmonic Core outputをbaseline lock
3. deterministic synthetic note-role fixture generatorを作成
4. protected tension / inversion / arpeggio fixtureを含める
5. note-level ground truthを生成時既知として自動化
6. insertion seamを特定
7. Shadow promotion gateを結果を見る前に固定
8. official corpus regression methodを固定
9. report / execution-state / explicit commit / clean status

まで行って停止してください。
