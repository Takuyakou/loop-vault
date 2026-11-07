<!-- phase-id: 14.0 -->

# Phase 14 — Work Instructions

## Goal

[仕様 v1.1](contracts/P14-midi-connection.md) のとおりに、次の3つを行う。

- MIDI の接続をアプリ全体で1つにする。
- 上部のボタンとパネルから接続・切断できるようにする。
- 各モードの表示を、上部と同じ状態からそろえる。

完了時は、次の状態になっている。

- 各章の受け入れが、単体テストと E2E で確かめられている。
- fresh FULL と EXE が通る。

## Scope

- **区切り A：接続と状態**
  - `connectionController`（意図・接続・切断・もう一度試す・機器を選ぶ・起動時・自動で戻る）
  - 自動接続の保存（新しいキー）
  - `selectMidiConnection` と状態の表（意図 off が一番先。`lost` はこの起動でつないだ時だけ）
  - 接続の操作の世代番号と取り消し（仕様 2.1）
  - 手動の切断は今の起動の間だけ
  - 各画面がリースを取らないようにする
- **区切り B：上部とパネル**
  - `MidiStatusChip` の置き換え
  - `midi-panel`
  - `openMidiPanel(opener)`（閉じたら開いたボタンへフォーカスを戻す）
- **区切り C：各モード**
  - `MidiRequiredNotice`
  - Chord Dojo・Master・Voicing Loop・`VoicingPanel`・設定・Live MIDI の表示と「MIDI 設定」
  - 練習の途中で外れた時は止めて待ち、つながったら同じ課題から続ける（仕様 5.1）
  - 実際の入力が判定まで届き、二重にならないことの確認（仕様 7）
  - 合成の入力の入口の直し
- **区切り D：締め**
  - E2E `e2e/p14-midi-connection.spec.ts`
  - スクリーンショット
  - 基準画像（上部の文字が変わったものだけ）
  - fresh FULL・EXE・報告

## Non-goals

- `liveMidiService`・`bridge.ts`・Rust 側・和音の判定・今のプリファレンスの形を変えること。
- 練習の判定や中身、Vault・練習の記録の形。
- Bass Practice・取り込む・Vault の画面。
- 新しい依存パッケージ。

## Contracts

- [P14-midi-connection.md](contracts/P14-midi-connection.md) — この直しの仕様 v1.1
- [P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動の決まり
- [P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストと証跡

## Definition of Done

- 仕様 2〜7章（2.1・5.1 を含む）の受け入れが、すべて単体テストか E2E で PASS。2章の 7〜9 は 3 回続けて PASS。
- 今の Chord Dojo・Master・Voicing Loop・Live MIDI の E2E が PASS。直したのは、仕様 21章で許した所だけ。
- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 次のファイルに差分が無い：`liveMidiService.ts`・`bridge.ts`・`src-tauri` の MIDI 入力・`domain/liveMidi`。
- 3つの大きさのスクリーンショットがあり、報告から場所を示している。
- Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json`（`activeStage: null`）が揃っている。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。

次のものはコミットせず、報告にも書かない：

- 私的な MIDI・Vault の中身
- 端末の ID
- `.local-evaluation` の中身
- 個人の絶対パス
