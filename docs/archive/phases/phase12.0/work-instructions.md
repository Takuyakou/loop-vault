<!-- phase-id: 12.0 -->

# Phase 12 — Work Instructions

## Goal

Chord Dojo を [仕様 v1.4](contracts/P12-chord-dojo-spec.md) のとおりに作り直す。完了時は、仕様の受け入れ条件（12章）を満たし、fresh FULL と EXE が通る状態。

## Scope

- 区切り0：今の部品の読み直し、型の音の一覧表、組み込みの進行と「今日のポイント」の確認表、和音の音のずれを測る道具。
- 区切り1：型の音の表、組み込みの進行、記録ファイル `chord-dojo-v1.json`、状態の進み方、今日の練習の組み立て、判定の追加（待ち時間を含む）、登録した音のまとめ方。
- 区切り2：はじめ・練習・おわりの画面、確認と型の練習（構成を知る・①②・構成を思い出す）、☆、MIDI が無い時。
- 区切り3：登録した音の練習、進行で弾く（①②③）、組み込みの進行、進行ページからの入口。
- 区切り4：古い画面と仕組みの片付け、ホームと札、テストの整理、スクリーンショット、fresh FULL、EXE。

## Non-goals

- Vault の保存形式の変更。`block.practice` への書き込み。
- 解析・コード名の判別・transport・`src/domain/voicing/**`（呼ぶだけ）・再生の選び方の変更。
- Voicing Loop・Bass Practice・取り込む・進行ページの画面の変更。
- 「登録した音 → 自分の型」、進行の別のキー。
- 新しい依存パッケージ、ライトモード、英語表示。

運指は2026-10-05のユーザー変更により現行Voicing Loop productionの生成・鍵盤表示を再利用する。独自rankerは作らず、合否判定へ使わない。

## Contracts

- [P12-chord-dojo-spec.md](contracts/P12-chord-dojo-spec.md) — Chord Dojo の仕様 v1.4
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 区切り1〜3の単体テスト・E2E が PASS。Voicing Loop・Bass Practice・ホーム・取り込む・進行ページのテストと基準画像が書き換えずに通る。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テストが PASS し、Vault の保存形式が変わっていない。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・Vault の中身・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
