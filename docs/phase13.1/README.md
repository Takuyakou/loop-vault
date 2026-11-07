<!-- phase-id: 13.1 -->

# Phase 13.1 — Bass Practice「MIDI のベースライン」の画面の直し

Phase 13 で作った Bass Practice の「MIDI のベースライン」の画面を、人間のレビューで決めたとおりに直すフェーズ。今の4つの練習には、見た目の部品の置き換えだけをする。

- 仕様：[contracts/P13.1-bass-ui-fixes.md](contracts/P13.1-bass-ui-fixes.md)（v1.0、13項目）
- 見た目の正：zip の `mocks/bass-practice-fix-mock.html`
- 段階：1つ（P13.1-01）

実装する AI は、zip を受け取ったら途中で承認を求めずに最後まで進める。最初にリポジトリルートの `AGENTS.md` を読み、次にこの README を読み、その後は下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて、違いを報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし
- **Completed stages:** P13.1-01
- **Base:** local `master`（調べた時は `884567e1`。何も取り込まない）
- **Next action:** 人間が EXE で確かめる（merge候補で停止）

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告をそろえて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了の条件
3. [contracts/P13.1-bass-ui-fixes.md](contracts/P13.1-bass-ui-fixes.md) — 直す内容（数値と受け入れの正）
4. [../phase13.0/reports/FINAL-REPORT.md](../phase13.0/reports/FINAL-REPORT.md) — Phase 13 の実装と、守る契約
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P13.1-01.md](stages/P13.1-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

モックと今の画面（`before/`）は zip にある。Git 管理外の `p13-generated/P13.1/` に置いて見る（コミットしない）。

## Stages

### P13.1-01 — Bass Practice の画面の直し

| 区切り | 内容 | 仕様の章 |
| --- | --- | --- |
| A | 練習の画面 | 1・2・3・5・7・9・10・11 |
| B | 録音の欄 | 4 |
| C | 部品・読み込み・一覧 | 6・8・12・13 |
| D | 締め | E2E・スクリーンショット・fresh FULL・EXE・報告 |

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは `P10-autonomous-run.md` をそのまま使う。
- 次は変えない：
  - 判定・資格・記録の形（`bass-midi-library-v1.json`・`practice-v1.json`）・Vault `fileVersion: 2`
  - 録音の流れ
  - 今の4つの練習の流れ
- 次の画面とそのテスト・基準画像は変えない：
  - ほかの画面
  - アプリ共通の CSS
- merge 候補で止める。push・tag・release はしない。
- 次は読まない・コミットしない：
  - 私的な MIDI・録音・Vault の中身
  - `.local-evaluation` の中身（`test-logs/` と `gate-cache/` は読んでよい）
  - 個人のパス
