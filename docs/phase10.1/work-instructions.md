<!-- phase-id: 10.1 -->

# Phase 10.1 — Work Instructions

## Goal

修正作業場を、人間が実際に使って困った所（再生の始まる所と位置、キー、選択の外し方、保存する範囲の欄、コード名、BPM、ボタンの並び）について直す。完了時は、[仕様](contracts/P10.1-workspace-fixes-spec.md) の受け入れ条件（14章）を満たし、fresh FULL と EXE が通る状態。

## Scope

- 修正作業場の並び（操作バーを一番上に、下の再生の列をなくす）。
- 再生：選んだカードからの再生、位置の表示、再生線、追従、BPM の変更（再生・再生線・保存）。
- キー：`Space`、`Esc` とフォーカスの枠。
- 選択：選んだ音の外し方、開いた直後はカードを選ばない。
- 右の欄：保存する範囲の欄を常に出す、おすすめの範囲の開け閉め。
- 表示の 8小節、「押して鳴らす」の既定 ON。
- コード名の自動判別（名前の出どころを3つに分ける）。

## Non-goals

- 解析ロジック・コード名の判別（`detectLiveChord`）・再生の選び方・transport scheduler・`src/domain/voicing/**` の変更。
- Vault の保存形式の変更（`fileVersion: 2` のまま。進行の `bpm` は今ある項目を使う）。
- Voicing Loop・進行ページ・テキストの取り込み・Chord Dojo。
- 新しい依存パッケージ、ライトモード、英語表示。

## Contracts

- [P10.1-workspace-fixes-spec.md](contracts/P10.1-workspace-fixes-spec.md) — この直しの仕様（v2.5 への上書き）
- [Phase 10 の仕様書 v2.5](../phase10.0/contracts/P10-correction-workspace-spec.md) — 土台
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テスト（`src/domain/p89DataRetention.test.ts`）とまとめ B の往復テスト・再生の一致が PASS。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
