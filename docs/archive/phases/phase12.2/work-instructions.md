<!-- phase-id: 12.2 -->

# Phase 12.2 — Work Instructions

## Goal

2-5-1 Master を、[仕様 v1.0](contracts/P12.2-master-fixes.md) の 1〜12章のとおりに直す。

完了時の状態：
- 各章の受け入れが E2E・単体テストで確かめられている。
- fresh FULL と EXE が通る。

## Scope

- **区切り A：一時停止**（仕様 1〜6・12）
  - 正解の直後の一時停止で、次の問題を捨てない
  - 一時停止を挟んだ回は速さを数えない（`recallSec` を入れない）
  - 一時停止中の画面と操作
  - 一時停止中も鍵盤の音を鳴らす
  - 開いた時は一時停止を解いて始める
  - Esc を一時停止にする
- **区切り B：ヒントと表示**（仕様 7〜11）
  - ヒントは1回で全部、2回目は「お手本を聴く」
  - 弾き終えたコードに ✓
  - テンポの表示
  - テンポで秒数を出さない
  - 音名の ♭
- **区切り C：締め**
  - E2E `e2e/p12-2-master.spec.ts`
  - スクリーンショット
  - 基準画像の更新（Master の分だけ）
  - fresh FULL・EXE・報告

## Non-goals

- 判定・記録の決まり・記録の形を変えること（`engine.ts`・`policy.ts`・`scheduler.ts`・`model.ts`）。
- 学習の流れ・Mixed の選び方・48セルの表・ホームの Master の入口。
- 通常の Chord Dojo の練習・ほかの画面・アプリ共通の部分。
- 新しい依存パッケージ。

## Contracts

- [P12.2-master-fixes.md](contracts/P12.2-master-fixes.md) — この直しの仕様 v1.0
- [251-master-learning-review.md](../phase12.0/contracts/251-master-learning-review.md) — 学習・復習・Mixed（守る側）
- [251-master-amendment.md](../phase12.0/contracts/251-master-amendment.md) — 答えの出し方（守る側。ヒントの段階は D2 で変える）
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- **受け入れ：** 仕様 1〜12章の受け入れが、すべて E2E か単体テストで PASS。
- **今の Master の E2E：** `e2e/p12-master251*.spec.ts` が PASS。直したのは、この仕様で動きを変えた所の期待値だけ。
- **fresh FULL：** merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- **ほかの画面：** テストと基準画像を書き換えずに PASS。
- **変えないファイル：** `engine.ts`・`policy.ts`・`scheduler.ts`・`model.ts` に差分が無い。
- **スクリーンショット：** 4つの大きさで撮り、報告から場所を示している。
- **EXE：** Tauri で作れる。
- **報告：** 日本語の報告が `reports/` にある。README の Status と `execution-state.json`（`activeStage: null`）がそろっている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。

次のものはコミットせず、報告にも書かない。
- 私的な MIDI・Vault の中身
- `.local-evaluation` の中身
- 個人の絶対パス
