<!-- phase-id: 12.1 -->

# Phase 12.1 — Chord Dojo の画面の直し

Phase 12 で作った Chord Dojo と 2-5-1 Master の画面を、人間のレビューで決めたとおりに直すフェーズ。

- **仕様：** [contracts/P12.1-dojo-ui-fixes.md](contracts/P12.1-dojo-ui-fixes.md)（v1.0、19項目）
- **見た目の正：** zip の `mocks/chord-dojo-fix-mock.html`
- **段階：** 1つ（P12.1-01）。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読む。次にこの README を読み、その後は下の Required Reading Order に従う。Git の実態が常に正。この文書と食い違う時は Git を信じ、違いを報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし
- **Completed stages:** P12.1-01
- **Base:** local `master` `fb426bb8246fc2ab55df50063bc8d83bef73693c`（開始時のGitで確認。何も取り込まない）
- **Verified candidate:** `f0f08b52f557d752bd2557c2bdc38d3097f1cf05`（fresh FULL・本番EXEがPASS。最終docs commit後のHEADは別途fresh検証する）
- **Next action:** 人間が EXE で確かめる。merge候補で停止する。

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告をそろえて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了の条件
3. [contracts/P12.1-dojo-ui-fixes.md](contracts/P12.1-dojo-ui-fixes.md) — 直す内容（数値と受け入れの正）
4. [../phase12.0/contracts/theme-lesson-score.md](../phase12.0/contracts/theme-lesson-score.md) — 答えの出し方・縦の並び・見える範囲の決まり（守る側）
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P12.1-01.md](stages/P12.1-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

モックと今の画面（`before/`）は zip にある。Git 管理外の `p12-generated/P12.1/` に置いて見る（コミットしない）。

## Stages

### P12.1-01 — Chord Dojo の画面の直し

区切りは4つ。

| 区切り | 中身 |
| --- | --- |
| A 通常の練習 | 仕様 1〜7・19 |
| B 2-5-1 Master | 仕様 8〜11・18 |
| C はじめ・おわり・狭い幅 | 仕様 12〜17 |
| D 締め | E2E・スクリーンショット・fresh FULL・EXE・報告 |

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは `P10-autonomous-run.md` をそのまま使う。
- 次は変えない。
  - 判定、Master の engine と時計
  - 記録の形（Dojo v4・Master）、Vault `fileVersion: 2`
  - 答えの出し方の決まり
- 次の画面とそのテスト・基準画像は変えない。
  - Voicing Loop・Bass Practice・取り込む・Vault・進行ページ
  - アプリ共通の上の帯・サイドバー
- merge 候補で止める。push・tag・release はしない。
- 次は読まない・コミットしない。
  - 私的な Vault の中身・MIDI・音声
  - `.local-evaluation` の中身（`test-logs/` と `gate-cache/` は読んでよい）
  - 個人のパス
