<!-- phase-id: 10.2 -->

# Phase 10.2 — 修正作業場の再生と見た目の整理

Phase 10.1 で直した修正作業場を、人間が EXE で使って出た要望（8件）と、P10.1 の報告の決めてほしいこと（曲の再生で直す前の音が鳴る）に合わせて直すフェーズ。解析・transport・再生の選び方・Vault の保存形式は変えない。実装は Claude Code が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** completed
- **Active stage:** なし（Phase 10.2 完了。唯一の段階は P10.2-01）
- **Completed stages:** P10.2-01（修正作業場の再生と見た目の整理 — [reports/P10.2-01-polish.md](reports/P10.2-01-polish.md)、fresh FULL PASS @ `54caa5a6`、EXE 作成済み。merge 候補 `feat/p10.2-workspace-polish`（P10.1 の merge 候補を含む）、未取り込み）
- **Base:** local `master` `94dae5b6` ＋ Phase 10.1 の merge 候補 `feat/p10.1-workspace-fixes`（このブランチに `87c121f5` で取り込み。local `master` は別の worktree で checkout されていて、そこでの取り込みは許可されなかったため、master 自体は変えていない）
- **Next action:** Phase 10.2 完了。merge 候補の取り込みは人間の判断

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P10.2-workspace-polish-spec.md](contracts/P10.2-workspace-polish-spec.md) — この直しの仕様（P10.1 への上書き）
4. [../phase10.1/contracts/P10.1-workspace-fixes-spec.md](../phase10.1/contracts/P10.1-workspace-fixes-spec.md) — P10.1 の仕様
5. [../phase10.0/contracts/P10-correction-workspace-spec.md](../phase10.0/contracts/P10-correction-workspace-spec.md) — 土台の仕様書 v2.5
6. [execution-state.json](execution-state.json) — 再開用の状態
7. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり（Phase 10.2 にもそのまま使う）
8. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
9. [stages/P10.2-01.md](stages/P10.2-01.md) — 段階の指示書
10. [reports/README.md](reports/README.md) — 報告の置き場所

モック（`workspace-tidy-mock.html`）は zip の `mocks/` にあり、Git 管理外の `p10-generated/mocks/` に置く。

## Stages

1段階＝1つの zip＝1セッション。

### P10.2-01 — 修正作業場の再生と見た目の整理

曲の再生で直した音を鳴らす、メトロノーム（ヘッダーの全体の設定を読む）、見えている一番左のカードから再生、先頭へ、鳴っているカードの見た目、小節の行を押して選ぶ、右クリック→右クリックで保存する範囲、区切りの端のドラッグ、最初からやり直す、画面全体の並び（高さを使い切る・右の欄・ファイル帯）、操作バーの整理、カードの名前を切らない、BPM の上下ドラッグ。中を4つの区切りに分ける。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは Phase 10 の `P10-autonomous-run.md` をそのまま使う。
- 解析ロジック（`src/domain/midi/`）、コード名の判別（`detectLiveChord`）、再生の選び方（`resolveVoicing`）、transport、Vault の保存形式（`fileVersion: 2`）、保存の中身は変えない。曲の再生の変更は、作業場の中で音の並びを作るだけにする。
- merge 候補で止める。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
