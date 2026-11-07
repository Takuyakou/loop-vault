<!-- phase-id: 12.3 -->

# Phase 12.3 — Chord Dojo の追加と直し

Chord Dojo に、次のものを足して直すフェーズ。

- カードを押して鳴らす
- 度数をいつも出す
- 定番の進行を 25 に増やす
- ランダムキーのエンドレス練習
- ベースの位置の不具合を直す

- **仕様：** [contracts/P12.3-dojo-progressions.md](contracts/P12.3-dojo-progressions.md)（v1.0）
- **正解データ：** [contracts/P12.3-builtins-expected.json](contracts/P12.3-builtins-expected.json)（25 の進行 × 12 キー）
- **見た目の正：** zip の `mocks/chord-dojo-p12-3-mock.html`（8画面）
- **段階：** 1つ（P12.3-01）。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読む。次にこの README を読み、その後は下の Required Reading Order に従う。

Git の実態が常に正。この文書と食い違う時は Git を信じて、違いを報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし
- **Completed stages:** P12.3-01
- **Base:** local `master`（調べた時は `9f61b1c5`。何も取り込まない）
- **Next action:** 人間が EXE で確かめる（報告の 10）。merge 候補 `837abeb5`

段階の終わりに、次の3つをそろえて更新する。

- この節
- [`execution-state.json`](execution-state.json)
- 段階の報告

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P12.3-dojo-progressions.md](contracts/P12.3-dojo-progressions.md) — 直す内容（数値と受け入れの正）
4. [../phase12.0/contracts/P12-chord-dojo-spec.md](../phase12.0/contracts/P12-chord-dojo-spec.md) — Chord Dojo の決まり（守る側）
5. [../phase14.0/contracts/P14-midi-connection.md](../phase14.0/contracts/P14-midi-connection.md) — MIDI の接続の決まり（守る側。5.1 と 7章）
6. [execution-state.json](execution-state.json) — 再開用の状態
7. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
8. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
9. [stages/P12.3-01.md](stages/P12.3-01.md) — 段階の指示書
10. [reports/README.md](reports/README.md) — 報告の置き場所

モックと今の画面（`before/`）は zip にある。Git 管理外の `p12-generated/P12.3/` に置いて見る（コミットしない）。

## Stages

### P12.3-01 — Chord Dojo の追加と直し

| 区切り | 内容 | 仕様の章 |
| --- | --- | --- |
| A | 定番の進行のデータとベースの直し | 2・3 |
| B | カードで鳴らす・度数 | 5・6・7 |
| C | 一覧とランダムキー | 4・8〜12 |
| D | 締め | 21 |

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは `P10-autonomous-run.md` をそのまま使う。
- 次のものは変えない。
  - 記録の形（`store.ts`・`lessonModel.ts`。Dojo の記録 v4）
  - 判定（`judging.ts`）
  - Vault `fileVersion: 2`
- ランダムキーの練習は記録を書かない。
- 2-5-1 Master・Bass Practice・Voicing Loop・取り込む・Vault・進行ページと、そのテスト・基準画像は書き換えない。
- merge 候補で止める。push・tag・release はしない。
- 次のものは読まない・コミットしない。
  - 私的な MIDI・Vault の中身
  - `.local-evaluation` の中身（`test-logs/` と `gate-cache/` は読んでよい）
  - 個人のパス
