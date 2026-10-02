<!-- phase-id: 10.1 -->

# Phase 10.1 — 修正作業場の使い心地の直し

Phase 10 で作った MIDI の「取り込む」の修正作業場を、人間が EXE で使って出た要望（13件）に合わせて直すフェーズ。解析・transport・Vault の保存形式は変えない。実装は Claude Code が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし（Phase 10.1 完了。唯一の段階は P10.1-01）
- **Completed stages:** P10.1-01（修正作業場の使い心地の直し — [reports/P10.1-01-fixes.md](reports/P10.1-01-fixes.md)、fresh FULL PASS @ `980be255`、EXE 作成済み。merge 候補 `feat/p10.1-workspace-fixes`、未取り込み）
- **Base:** local `master` `1f18e880`（Phase 10 の `feat/p10.0-07-finish` は `73507e87` で取り込み済み。Phase 11 の P11-09・P11-10 も取り込み済みの master）
- **Next action:** Phase 10.1 完了。merge 候補 `feat/p10.1-workspace-fixes` の取り込みは人間の判断

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P10.1-workspace-fixes-spec.md](contracts/P10.1-workspace-fixes-spec.md) — この直しの仕様（v2.5 への上書き）
4. [../phase10.0/contracts/P10-correction-workspace-spec.md](../phase10.0/contracts/P10-correction-workspace-spec.md) — 土台の仕様書 v2.5
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり（Phase 10.1 にもそのまま使う）
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P10.1-01.md](stages/P10.1-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

## Stages

1段階＝1つの zip＝1セッション。

### P10.1-01 — 修正作業場の使い心地の直し

操作バー（一番上）と並び替え、選んだカードから再生、再生位置の表示、追従・`Space`・`Esc`、選んだ音の外し方、保存する範囲の欄、8小節、押して鳴らす既定 ON、コード名の自動判別、BPM の変更。中を4つの区切りに分ける。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは Phase 10 の `P10-autonomous-run.md` をそのまま使う（「P10.0-01 以外の段階で再生の選び方を変えない」も同じ）。
- 解析ロジック（`src/domain/midi/`）、コード名の判別（`detectLiveChord`）、transport、Vault の保存形式（`fileVersion: 2`）は変えない。
- merge 候補で止める。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
