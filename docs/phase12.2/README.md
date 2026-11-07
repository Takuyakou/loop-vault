<!-- phase-id: 12.2 -->

# Phase 12.2 — 2-5-1 Master の直し

2-5-1 Master の一時停止とヒントまわりを、人間のレビューで決めたとおりに直すフェーズ。

- **仕様：** [contracts/P12.2-master-fixes.md](contracts/P12.2-master-fixes.md)（v1.0、12項目）
- **見た目の正：** zip の `mocks/master251-fix-mock.html`
- **段階：** 1つ（P12.2-01）。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読む。次にこの README、その次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて、違いを報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし（Phase 12.2 完了。唯一の段階は P12.2-01）
- **Completed stages:** P12.2-01（2-5-1 Master の直し — [reports/P12.2-01-master-fixes.md](reports/P12.2-01-master-fixes.md)、fresh FULL PASS @ `01da44c9`、EXE 作成済み。merge 候補 `feat/p12.2-master-fixes`、未取り込み）
- **Base:** local `master` `884567e10f6f6860a11b1955931c079bdb09bb1f`（開始時に実Gitを確認。何も取り込まない）
- **Next action:** 人間が EXE で確かめる。merge 候補の取り込みは人間の判断

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告をそろえて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P12.2-master-fixes.md](contracts/P12.2-master-fixes.md) — 直す内容（数値と受け入れの正）
4. [../phase12.0/contracts/251-master-learning-review.md](../phase12.0/contracts/251-master-learning-review.md) — 学習・復習・Mixed の決まり（守る側）
5. [../phase12.0/contracts/251-master-amendment.md](../phase12.0/contracts/251-master-amendment.md) — 答えの出し方の決まり（守る側。ヒントの段階は、この仕様の D2 で1回に変える）
6. [execution-state.json](execution-state.json) — 再開用の状態
7. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
8. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
9. [stages/P12.2-01.md](stages/P12.2-01.md) — 段階の指示書
10. [reports/README.md](reports/README.md) — 報告の置き場所

モックと今の画面（`before/`）は zip にある。Git 管理外の `p12-generated/P12.2/` に置いて見る（コミットしない）。

## Stages

### P12.2-01 — 2-5-1 Master の直し

| 区切り | 内容 | 仕様の章 |
| --- | --- | --- |
| A | 一時停止 | 1〜6・12 |
| B | ヒントと表示 | 7〜11 |
| C | 締め | E2E・スクリーンショット・fresh FULL・EXE・報告 |

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは `P10-autonomous-run.md` をそのまま使う。
- 次のものは変えない。
  - 判定（`engine.ts`）
  - 記録の決まり（`policy.ts`・`scheduler.ts`）
  - 記録の形（`model.ts`）
  - Vault `fileVersion: 2`
- 次のテストと基準画像は書き換えない。
  - ほかの画面
  - 通常の Chord Dojo の練習
- merge 候補で止める。push・tag・release はしない。
- 次のものは読まない・コミットしない。
  - 私的な MIDI・Vault の中身
  - `.local-evaluation` の中身（`test-logs/` と `gate-cache/` は読んでよい）
  - 個人のパス
