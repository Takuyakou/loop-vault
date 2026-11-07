<!-- phase-id: 12.3 -->

# Phase 12.3 — Work Instructions

## Goal

Chord Dojo を、[仕様 v1.0](contracts/P12.3-dojo-progressions.md) の 2〜12章のとおりに直し、足す。

完了時の状態：

- 各章の受け入れが、E2E か単体テストで確かめられている。
- fresh FULL と EXE が通る。

## Scope

- **区切り A：定番の進行のデータとベースの直し**（仕様 2・3）
  - `DEFS`（25 の進行）
  - `group`・`mode`・`title`・`keyLabel`
  - テーマ名とキーの名前
  - ベースを上の音より下にする（`placeBassBelow`）
  - 期待データとの一致
- **区切り B：カードで鳴らす・度数**（仕様 5・6・7）
  - 進行のカードをボタンにして鳴らす
  - 段ごとのヒントの扱い
  - 1コードの練習のカード
  - 度数をいつも出す（チェックを消す）
- **区切り C：一覧とランダムキー**（仕様 4・8〜12）
  - 定番の進行の一覧（まとまり・度数・キーでのコード名・3つのボタン）
  - ランダムキーの画面・出題・判定・ヒント・クリア・次のキー・集計・まとめ
  - 自分で判定・外れた時・キー操作
- **区切り D：締め**
  - E2E `e2e/p12-3-dojo.spec.ts`
  - スクリーンショット
  - 基準画像（Chord Dojo の練習画面で変わったものだけ）
  - fresh FULL・EXE・報告

## Non-goals

- 記録の形・`fileVersion`・新しい保存のキー
- ランダムキーの結果を保存すること
- 今の 8つの `pointCheck`・`pointText` を直すこと
- 音名の綴りをキーに合わせること
- 2-5-1 Master・Bass Practice・Voicing Loop・取り込む・Vault・進行ページ
- 新しい依存パッケージ

## Contracts

- [P12.3-dojo-progressions.md](contracts/P12.3-dojo-progressions.md) — この直しの仕様 v1.0
- [P12.3-builtins-expected.json](contracts/P12.3-builtins-expected.json) — 定番の進行の正解データ
- [P12-chord-dojo-spec.md](../phase12.0/contracts/P12-chord-dojo-spec.md) — Chord Dojo の決まり（守る側）
- [P14-midi-connection.md](../phase14.0/contracts/P14-midi-connection.md) — MIDI の接続（守る側）
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- **受け入れ：** 仕様 2〜12章の受け入れが、すべて E2E か単体テストで PASS。
- **正解データ：** 25 × 12 キーの `buildBuiltin` が期待データと一致する。
- **今の E2E：** Chord Dojo と Master の E2E が PASS。直したのは、仕様 21章で許した所だけ。
- **fresh FULL：** merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- **記録の形：** `store.ts`・`lessonModel.ts`・`judging.ts` に差分が無い。
- **ほかの画面：** テストと基準画像を書き換えずに PASS。
- **スクリーンショット：** 4つの大きさで撮り、報告から場所を示している。
- **EXE：** Tauri で作れる。
- **報告：** 日本語の報告が `reports/` にある。README の Status と `execution-state.json`（`activeStage: null`）がそろっている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。

次のものはコミットせず、報告にも書かない。

- 私的な MIDI・Vault の中身
- `.local-evaluation` の中身
- 個人の絶対パス
