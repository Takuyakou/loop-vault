<!-- phase-id: 10.2 -->

# Phase 10.2 — Work Instructions

## Goal

修正作業場で、聴いて確かめる流れ（どこから鳴るか、何が鳴っているか、直した音が鳴るか、メトロノーム）と、範囲の選び方・見た目を、人間が P10.1 の EXE で使って困った所について直す。完了時は、[仕様](contracts/P10.2-workspace-polish-spec.md) の受け入れ条件（14章）を満たし、fresh FULL と EXE が通る状態。

## Scope

- 曲の再生：作業場の音（保存すると鳴る音）で鳴らす、メトロノーム、見えている一番左のカードから鳴らす、先頭へ、鳴っているカードの見た目。
- 選ぶ：小節の行を押してカードを選ぶ、カードの右クリック→右クリックで保存する範囲、区切りの端のドラッグ。
- 最初からやり直す（`⚙` のメニュー、確認の後に取り込んだ直後へ戻す）。
- 見た目：操作バーの整理（1行、要確認 0 の時は出さない、切り替えの形、`⚙` のメニュー）、カードの「4拍」、コードの行の高さ、カードの名前を切らない。
- 画面全体の並び：ピアノロールで高さを使い切る、右の欄の並び替えと保存する範囲の下への貼り付け、ファイル帯の重なりを外す。
- BPM の欄：上下ドラッグ・ホイール・`↺ MIDI`。

## Non-goals

- 解析ロジック・コード名の判別（`detectLiveChord`）・再生の選び方（`resolveVoicing`）・transport scheduler・`src/domain/voicing/**` の変更。
- Vault の保存形式・保存の中身の変更。
- Voicing Loop・進行ページ・テキストの取り込み・Chord Dojo の変更（全体のメトロノームの設定の持ち方も変えない）。
- カウントイン、新しい依存パッケージ、ライトモード、英語表示。

## Contracts

- [P10.2-workspace-polish-spec.md](contracts/P10.2-workspace-polish-spec.md) — この直しの仕様
- [P10.1 の仕様](../phase10.1/contracts/P10.1-workspace-fixes-spec.md)・[Phase 10 の仕様書 v2.5](../phase10.0/contracts/P10-correction-workspace-spec.md) — 土台
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テスト（`src/domain/p89DataRetention.test.ts`）、まとめ B の往復テスト・再生の一致、`namesTempo.test.ts` が PASS。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
