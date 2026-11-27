<!-- phase-id: 10.3 -->

# Phase 10.3 — Work Instructions

## Goal

P10.2 の EXE 確認で見つかった直しと、P10.2 の申し送りを入れる。完了時は、[仕様](contracts/P10.3-workspace-followups-spec.md) の受け入れ条件（9章）を満たし、fresh FULL と EXE が通る状態。

## Scope

- 修正作業場：範囲の知らせを読み上げだけにする、ほかの知らせを 5 秒で消す、メニューを歯車に、操作バーに範囲の札（× で外す）、右の欄の下の「範囲を外す」を無くす、仮の区切りの名前の付け直し。
- 保存：区切りごとに保存した進行の `memo` に区切りの名前を足す。詳細ページの `memo` の表示を、注意のコードと混ざっても読める形に。
- 進行ページ：長い進行でカードの注意の文字を1行に。
- 調べる：Voicing Loop の「保存した音 96/97」の理由（保存の作りの誤りなら保存側を直す）。

## Non-goals

- 解析ロジック・コード名の判別・再生の選び方・transport scheduler・`src/domain/voicing/**` の変更。
- Vault の保存形式の変更。進行に題名の欄を足すこと。
- サイドバーの「設定」のアイコンの変更。
- Voicing Loop・Chord Dojo の画面の変更。
- 新しい依存パッケージ、ライトモード、英語表示。

## Contracts

- [P10.3-workspace-followups-spec.md](contracts/P10.3-workspace-followups-spec.md) — この直しの仕様
- [P10.2 の仕様](../phase10.2/contracts/P10.2-workspace-polish-spec.md)・[追加 1](../phase10.2/contracts/P10.2-addendum-1.md)・[追加 2](../phase10.2/contracts/P10.2-addendum-2.md) — 直前の仕様
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テスト（`src/domain/p89DataRetention.test.ts`、まとめ B、P10.1・P10.2 の往復、区切りごとの保存の `memo`）が PASS。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
