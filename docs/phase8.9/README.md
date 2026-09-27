<!-- phase-id: 8.9 -->

# Phase 8.9 — 画面の全面刷新（UI/UX renewal）

Loop Vault の画面を、共通の外枠・デザインシステム・各画面の順に作り直すフェーズ。実装は Claude Code が段階ごとの zip を受け取り、段階の途中は承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** in-progress — P8.9-02（共通レイアウト）を実行中。ブランチ `feat/p8.9-02-shell`
- **Active stage:** P8.9-02
- **Completed stages:** P8.9-00（準備 — [reports/P8.9-00-setup.md](reports/P8.9-00-setup.md)、監査 [audit/P8.9-00-baseline.md](audit/P8.9-00-baseline.md)、fresh FULL PASS @ `d363d6f`。local `master` へ `232d21f` で取り込み済み）、P8.9-01（土台と部品 — [reports/P8.9-01-foundation.md](reports/P8.9-01-foundation.md)、fresh FULL PASS @ `7b9de50`、EXE 作成済み。local `master` へ `12baad7` で取り込み済み）
- **Base:** local `master` `12baad7`（段階1を取り込み済み）
- **Next action:** [stages/P8.9-02.md](stages/P8.9-02.md) を最後まで実行する

各段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — フェーズ全体の仕様
3. [execution-state.json](execution-state.json) — 再開用の状態
4. [contracts/P8.9-autonomous-run.md](contracts/P8.9-autonomous-run.md) — 全自動で進める時の決まり
5. [contracts/P8.9-data-retention.md](contracts/P8.9-data-retention.md) — 保存データを守る契約
6. [contracts/P8.9-test-and-evidence.md](contracts/P8.9-test-and-evidence.md) — テストの回し方と証跡
7. [contracts/P8.9-ui-direction.md](contracts/P8.9-ui-direction.md) — 見た目と画面の方針
8. 実行中の段階の指示書：[stages/P8.9-02.md](stages/P8.9-02.md)
9. [reports/README.md](reports/README.md) — 報告の置き場所

段階1以降の指示書（`stages/P8.9-0N.md`）とモックは、各段階の zip で追加される。

## Stages

各段階は独立した commit の列で、必要なゲートの結果と commit hash を記録してから完了とする。1段階＝1つの zip＝1セッション。段階をまたいで自動で進まない。

### P8.9-00 — 準備（Claude Code の設定・往復テスト・変更前の記録・調査）

製品の画面は変えない。phase package・許可設定・データ保持の往復テスト・スクリーンショットの道具・「変更前」の記録・段階4〜7のロジック分離の調査。

### P8.9-01 — 土台と部品

tokens の整理、自作アイコン、共通部品、トーストの一本化。

### P8.9-02 — 共通レイアウト

外枠と画面切り替えの分離、一体型タイトルバー、サイドバー、ヘッダー、スクロール、起動時 1440×900。

### P8.9-03 — 機能の整理

最初に「進行ページ」の担当（`ProgressionDetailView.tsx`・`DetailView.tsx`・`components/progression-editing/`）を `scripts/test-dx/selection.mjs` に作る。承認済みの機能を画面から外す。日本語化は、言語の切り替えを外して日本語に固定し、作り直さない画面（採集・Voicing Loop・外枠・共通部品）の英語を直すところまで。作り直す画面の英語は、その画面を作り直す段階で消す。

### P8.9-04 — ホームと Vault

ロジック分離のあと、ホームと Vault を作り直す。

### P8.9-05 — 進行ページ

ロジック分離のあと、Idea 詳細を吸収した進行ページを作る。

### P8.9-06 — Chord Dojo

ロジック分離のあと、モックの形で作り直す。

### P8.9-07 — Bass Practice

最初に Rhythm と Root Motion の守りのテストを足し、そのあとロジックを分けて、4つの練習を同じ枠に揃える。

### P8.9-08 — 設定と仕上げ

設定の画面化、Live MIDI、起動・空の状態、採集と Voicing Loop の微修正、全体の見直し。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。この README は上乗せだけを書く。
- 各段階は merge 候補で止める。取り込みは次の段階の zip の最初の手順で扱う。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
- `docs/CURRENT_STATE.md` は復活させない。
