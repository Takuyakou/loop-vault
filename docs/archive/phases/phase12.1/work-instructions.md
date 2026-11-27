<!-- phase-id: 12.1 -->

# Phase 12.1 — Work Instructions

## Goal

Chord Dojo（はじめ・練習・おわり）と 2-5-1 Master の画面を、[仕様 v1.0](contracts/P12.1-dojo-ui-fixes.md) の 1〜19章のとおりに直す。完了した時は次の状態になっている。

- 各章の受け入れが E2E・単体テストで確かめられている。
- fresh FULL と EXE が通る。

## Scope

- **区切り A 通常の練習：**
  - MIDI 設定の位置
  - 縦の配分（高さの段 T0/T1/T2）
  - ボタンの並び
  - 秒数を1か所に
  - 進行 ② の自動ヒントは名前だけ
  - テンポの結果をカードに
  - 構成を思い出すの重複を消す
- **区切り B 2-5-1 Master：**
  - 上の帯の grid
  - 今のコードの見せ方
  - 違った時の一言
  - 学習の操作
  - ♭ の表記
- **区切り C はじめ・おわり・狭い幅：**
  - 幅 900px 以下で鍵盤を下に付ける
  - 主のボタンを1つに
  - 0件の行を薄く
  - 練習の量を分で入力
  - 右の欄の重複を消す
  - おわりの画面の順番と、飛ばした理由の文言
- **区切り D 締め：** E2E `e2e/p12-1-dojo-ui.spec.ts`、スクリーンショット、基準画像の更新（Chord Dojo の分だけ）、fresh FULL、EXE、報告。

## Non-goals

- 判定・待ち時間・計画の組み立て方・記録の形を変えること。例外は仕様 17章の文言だけ。
- Master の engine・canonical144・Ready/hold・P1 時計を変えること。例外は仕様 10章の読み取り専用の値だけ。
- 答えの出し方の決まり（`answerPolicy.ts`）の意味を変えること。
- 大譜表の描き方と、`PracticeKeyboard` の中を変えること。
- ほかの画面、アプリ共通の上の帯・サイドバー。
- 英語の言葉の言い換え、新しい依存パッケージ、ライトモード。

## Contracts

- [P12.1-dojo-ui-fixes.md](contracts/P12.1-dojo-ui-fixes.md) — この直しの仕様 v1.0
- [theme-lesson-score.md](../phase12.0/contracts/theme-lesson-score.md) — 答えの出し方・縦の並び・見える範囲（守る側）
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- 仕様の 1〜19章の受け入れが、すべて E2E か単体テストで PASS。
- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 次のテストと基準画像が、書き換えずに通る。
  - Voicing Loop・Bass Practice・取り込む・Vault・進行ページ
  - アプリ共通の上の帯・サイドバー
- 6つの大きさ（1920×1080・1440×900・1366×768・1280×720・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- 記録の形と Vault の保存形式が変わっていない（今の往復テストが PASS）。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にある。README の Status と `execution-state.json`（`activeStage: null`）がそろっている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。次はコミットせず、報告にも書かない。

- 私的な音声・MIDI・Vault の中身
- `.local-evaluation` の中身
- 個人の絶対パス

`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
