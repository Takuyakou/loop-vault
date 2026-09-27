<!-- phase-id: 8.9 -->

# Phase 8.9 — Work Instructions

## Goal

取り込んだ進行を「探す・確かめる・手で覚える」まで同じ見た目と同じ操作でつなぐ。使いやすく、モダンで、毎日開きたくなる「練習スタジオ」にする。完了時は、全画面が新しい共通の外枠とデザインシステムの部品で組まれ、承認済みの機能が画面から外れ、保存データは 1 バイトも失われていない状態。

## Scope

- 共通レイアウト：一体型タイトルバー、日本語のサイドバー（狭い時はアイコンだけ）、ヘッダー、中身の欄だけがスクロールする外枠。起動時のウィンドウは 1440×900。
- デザインシステム：既存の `src/styles/tokens.css`（`--lv-*`）を磨いて揃える。自作アイコン、共通部品、右下のトースト（今の2種類を一本化）。
- 作り直す画面：ホーム、Vault、進行ページ（Idea 詳細を吸収）、Chord Dojo、Bass Practice、設定（ダイアログから画面へ）、Live MIDI の見た目、起動・復旧・空の状態。
- 微修正だけの画面：コード採集（MIDI・テキスト、通常・拡張）、Voicing Loop の練習画面。共通部分に馴染ませる程度で、並びと操作は変えない。
- 承認済みの機能の画面からの削除（一覧は [contracts/P8.9-ui-direction.md](contracts/P8.9-ui-direction.md)）。
- 表示を日本語だけにする（英語の文言と言語の切り替えを外す）。

## Non-goals

- core（`src/domain/midi/` の MIDI Analyzer / Extractor・キー検出、Generated ボイシング）の変更。Phase 9 の範囲。
- transport scheduler、SOURCE の音とタイミング、8.8.3 の「コードを決める音」の決まりの変更。
- 保存形式の変更（fileVersion 2 のまま。追加は任意項目だけ）。古い項目の自動移行・削除。
- ライトモード、英語表示、新しい依存パッケージ。
- Phase 9 との並行作業。8.9 を閉じてから Phase 9 に進む。

## Contracts

- [P8.9-autonomous-run.md](contracts/P8.9-autonomous-run.md) — 全自動で進める時の決まり、迷った時の扱い、止める条件
- [P8.9-data-retention.md](contracts/P8.9-data-retention.md) — 保存データの保持と往復テスト
- [P8.9-test-and-evidence.md](contracts/P8.9-test-and-evidence.md) — Test DX の使い方、基準画像、スクリーンショット、報告
- [P8.9-ui-direction.md](contracts/P8.9-ui-direction.md) — デザインの決定事項と削除一覧

## Stages

README の段階一覧と同じ。各段階の詳しい作業と完了条件は `stages/P8.9-0N.md` に置く（段階の zip で追加）。

段階4〜7の最初の作業は必ず次の順にする。

1. 今の画面のロジックを hook / controller に分ける（見た目は変えない。独立した commit）。
2. 既存のテストがそのまま通ることを確かめる。
3. 新しい UI に差し替える。

コード採集は分けない。App.tsx は段階2で、外枠と画面の切り替えを先に分ける。

## Definition of Done

段階の完了条件（全段階共通）：

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットが `p89-generated/` にあり、報告から場所を示している。
- データ保持の往復テストが PASS。
- 製品コードを変えた段階では Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json` が揃っている。

フェーズの完了条件：P8.9-00〜08 がすべて完了し、全画面が新しい外枠と部品で組まれ、最終の fresh FULL が PASS。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
