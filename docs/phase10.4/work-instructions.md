<!-- phase-id: 10.4 -->

# Phase 10.4 — Work Instructions

## Goal

進行ページ（アイデアの詳細を含む）を、取り込むの修正作業場と同じ部品で作り直す。完了時は、[仕様](contracts/P10.4-progression-page-spec.md) の受け入れ条件（9章）を満たし、fresh FULL と EXE が通る状態。

## Scope

- 保存した進行 ⇄ 作業場のモデルの変換と往復。手で変えた音の置き場（今の形式の中で）。
- 進行ページの画面：進行の帯・曲全体の帯・小節・カード・ピアノロール（確かめる／音を直す）・右の欄・範囲（くり返し再生）・歯車のメニュー。
- 編集：コードを替える（音も合わせる）、音を外す・戻す・高さを変える・足す、消す4通り、足す・分ける・つなぐ、境目の長さ、元に戻す。
- 保存：上書き保存、別の版として保存（範囲だけも）、変更を捨てる、離れる時の確認、メモ。
- アイデアの詳細から最初の進行の進行ページへ。アイデアにしか無い操作は `⋯` に残す。

## Non-goals

- 解析ロジック・コード名の判別・再生の選び方・transport scheduler・`src/domain/voicing/**`（呼ぶだけ）の変更。
- Vault の保存形式の変更。進行に題名の欄を足すこと。
- 取り込むの修正作業場の見た目と動きの変更。
- Voicing Loop・Chord Dojo・Bass Practice・テキスト取り込みの画面の変更。サイドバーの「設定」のアイコンの変更。
- 進行が1つも無いアイデアの詳細の作り直し。
- 新しい依存パッケージ、ライトモード、英語表示。

## Contracts

- [P10.4-progression-page-spec.md](contracts/P10.4-progression-page-spec.md) — この phase の仕様
- [P10.3 の仕様](../phase10.3/contracts/P10.3-workspace-followups-spec.md)・[P10.2 の仕様](../phase10.2/contracts/P10.2-workspace-polish-spec.md) — 作業場の直前の仕様
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 進行の変更なしの往復テスト、上書き保存・別の版・範囲だけの版・メモの往復テストが PASS。
- 取り込むの修正作業場の E2E と基準画像が、書き換えずに通る。
- 4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テスト（`src/domain/p89DataRetention.test.ts`、まとめ B、P10.1〜P10.3 の往復、進行ページの上書き保存）が PASS。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。


## 2026-10-04 ユーザー承認済み追補

当初Freeze本文に対する、この作業のユーザー承認を記録する。原添付・ZIPは変更しない。

- 手動音編集の最低音数は2音。既存manual snapshotの2〜10音制約を使い、保存形式やVoicingSource値を足さない。
- ユーザーの回答「①許可、②A」により、Bass Practiceで手編集した正確なMIDI音を鳴らす再生選択分岐の追加を許可する。Vault/Practiceの保存形式と画面の見た目は維持する。音は現在Vaultからセッション用データとして渡す。既存自動生成関数、resolver、scheduler、transport、解析処理は変更しない。例外はBassの一時入力・検証・saved MIDI選択とprops配線に限定する。
- 「このカードを元に戻す」は、保存時の音・コード名・音源選択を戻し、現在の長さ・位置と隣接カードを保持する。境目・分割・結合等の構造変更は既存Undo/Redoで戻す。resetは履歴に1操作積む。
- 公開操作の承認はない。push・PR公開・merge・release・deployは行わない。
