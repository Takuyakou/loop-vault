<!-- phase-id: 13.1 -->

# Phase 13.1 — Work Instructions

## Goal

Bass Practice「MIDI のベースライン」の画面を、[仕様 v1.0](contracts/P13.1-bass-ui-fixes.md) の 1〜13章のとおりに直す。

完了時の状態：
- 各章の受け入れが E2E・単体テストで確かめられている。
- fresh FULL と EXE が通る。

## Scope

- **区切り A：** 練習の画面（仕様 1・2・3・5・7・9・10・11）
  - 結果のまとめを段の上に出す
  - 課題の帯を詰める
  - 操作の帯を中身のすぐ下に置く
  - 1拍の幅と文字の省き方
  - 伴奏の段
  - 段階の帯を全幅に
  - 操作の並びと主のボタン
  - ♭
- **区切り B：** 右の欄の録音を、MIDI のベースラインでは状態だけにする（仕様 4）。
- **区切り C：** 部品・読み込み・一覧（仕様 6・8・12・13）
  - Bass Practice の中の `lv-input` を部品に置き換える
  - 読み込みの画面
  - ⚙ と ⌨ をチップに
  - 一覧の画面
- **区切り D：** 締め
  - E2E `e2e/phase13-1-bass-ui.spec.ts`
  - スクリーンショット
  - 基準画像の更新（Bass Practice の分だけ）
  - fresh FULL、EXE、報告

## Non-goals

- 判定・資格・記録の形・録音の流れ・読み込みの決まりを変えること。
- 今の4つの練習の流れ・問題・ヒント・自己評価・移調・保存を変えること。
- アプリ共通の `.lv-input`、`src/styles/**`、ほかの画面、アプリ共通の上の帯・サイドバー。
- 新しい依存パッケージ、練習の名前の言い換え。

## Contracts

- [P13.1-bass-ui-fixes.md](contracts/P13.1-bass-ui-fixes.md) — この直しの仕様 v1.0
- [FINAL-REPORT.md](../phase13.0/reports/FINAL-REPORT.md) — Phase 13 の保存と保護の契約（守る側）
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- **受け入れ：** 仕様 1〜13章の受け入れが、すべて E2E か単体テストで PASS。
- **fresh FULL：** merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- **今の Bass Practice の E2E：** 変えるのは部品の操作の書き方だけ。そのうえで PASS。
  - 対象：`phase13-bass-practice.spec.ts`・`phase5.*` の Bass の分
- **ほかの画面：** テストと基準画像を書き換えずに PASS。
- **判定の資格：** `scripts/phase13/qualify-audio.ts` の結果が今と同じ。
- **スクリーンショット：** 5つの大きさで撮り、報告から場所を示している。
- **EXE：** Tauri で作れる。
- **報告：** 日本語の報告が `reports/` にある。README の Status と `execution-state.json`（`activeStage: null`）がそろっている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。

次はコミットせず、報告にも書かない：
- 私的な音声・MIDI・Vault の中身
- `.local-evaluation` の中身
- 個人の絶対パス

`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
