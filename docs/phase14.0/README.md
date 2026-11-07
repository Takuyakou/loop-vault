<!-- phase-id: 14.0 -->

# Phase 14 — MIDI 接続の共通化

MIDI の接続をアプリ全体で1つにし、上部（アプリの右上）から接続・切断できるようにするフェーズ。各モードの表示を、上部と同じ状態・同じ言葉にそろえる。

- **仕様：** [contracts/P14-midi-connection.md](contracts/P14-midi-connection.md)（v1.1）
- **見た目の正：** zip の `mocks/midi-connection-mock.html`
- **段階：** 1つ（P14.0-01）。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし
- **Completed stages:** P14.0-01
- **Base:** local `master` `1028a3b2`（P12.2・P13.1 が入った後。何も取り込まない）
- **Next action:** 人間が EXE で確かめる（報告の 11）。merge 候補 `e54838db`

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P14-midi-connection.md](contracts/P14-midi-connection.md) — 直す内容（状態の表・受け入れの正）
4. [execution-state.json](execution-state.json) — 再開用の状態
5. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
6. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
7. [stages/P14.0-01.md](stages/P14.0-01.md) — 段階の指示書
8. [reports/README.md](reports/README.md) — 報告の置き場所

モックと今の画面（`before/`）は zip にある。Git 管理外の `p14-generated/P14.0/` に置いて見る（コミットしない）。

## Stages

### P14.0-01 — MIDI 接続の共通化

| 区切り | 内容 |
| --- | --- |
| A | 接続の持ち主と状態の関数（仕様 2・3） |
| B | 上部のボタンとパネル（仕様 4） |
| C | 各モードの表示（仕様 5・6） |
| D | 締め：E2E・スクリーンショット・fresh FULL・EXE・報告 |

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは `P10-autonomous-run.md` をそのまま使う。
- 変えないもの：
  - `liveMidiService`・`bridge.ts`・Rust 側の入力・和音の判定
  - 今のプリファレンスの形
  - Vault・練習の記録の形
- merge 候補で止める。push・tag・release はしない。
- 読まない・コミットしないもの：
  - 私的な MIDI・Vault の中身・端末の ID
  - `.local-evaluation` の中身（`test-logs/` と `gate-cache/` は読んでよい）
  - 個人のパス
