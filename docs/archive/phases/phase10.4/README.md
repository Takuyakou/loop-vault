<!-- phase-id: 10.4 -->

# Phase 10.4 — 進行ページを作業場の部品で作り直す

進行ページ（進行の詳細。アイデアの詳細も含む）を、取り込むの修正作業場と同じ部品（操作バー・カードの帯・ピアノロール・右の欄・保存の欄・範囲）で作り直すフェーズ。中に入れるのは保存した進行で、聴いてコードを替える・消す・足す、音を変える、上書き保存と別の版として保存ができるようにする。解析・transport・Vault の保存形式は変えない。Bassの正確な編集MIDI再生選択だけはユーザー承認の追補で追加する。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** completed（ローカル実装・自動ゲート完了。実音聴取・ネイティブ人間操作は未実施）
- **Active stage:** なし
- **Completed stages:** P10.4-01
- **Base:** local `master`（P10.3 の merge 候補 `feat/p10.3-workspace-followups` を取り込んだ後）
- **Next action:** EXEで人間の実音確認・ネイティブ操作と差分レビュー。仕様判断待ちは解消済み。公開操作は追加指示まで行わない。 [実行報告](reports/P10.4-01-progression-page.md)

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P10.4-progression-page-spec.md](contracts/P10.4-progression-page-spec.md) — この phase の仕様
4. [../phase10.3/contracts/P10.3-workspace-followups-spec.md](../phase10.3/contracts/P10.3-workspace-followups-spec.md)・[../phase10.2/contracts/P10.2-workspace-polish-spec.md](../phase10.2/contracts/P10.2-workspace-polish-spec.md) — 作業場の直前の仕様
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり（そのまま使う）
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P10.4-01.md](stages/P10.4-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

モック（`progression-page-mock.html`）は zip の `mocks/` にあり、Git 管理外の `p10-generated/mocks/` に置く。

## Stages

1段階＝1つの zip＝1セッション。

### P10.4-01 — 進行ページを作業場の部品で作り直す

変換と往復 → 画面 → 編集 → 保存と締めくくり、の4つの区切り。手順0で、手で変えた音の置き場と部品の共有のしかたを決めてから書き始める。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは Phase 10 の `P10-autonomous-run.md` をそのまま使う。
- 解析ロジック、コード名の判別、再生の選び方、transport、`src/domain/voicing/**`、Vault の保存形式（`fileVersion: 2`）は変えない。手で変えた音の置き場が今の形式で表せない時は止めて報告する。
- 取り込むの修正作業場の見た目と動きは変えない。サイドバーの「設定」のアイコンは変えない。
- merge 候補で止める。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
