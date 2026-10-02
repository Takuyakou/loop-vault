<!-- phase-id: 10.3 -->

# Phase 10.3 — 修正作業場の EXE 確認の直しと申し送り

P10.2 の EXE 確認で見つかった直し（知らせ・歯車・範囲の札）と、P10.2 の報告の申し送り（区切りの名前、長い進行の折り返し、仮の区切りの名前、「保存した音 96/97」）をまとめて入れるフェーズ。解析・transport・再生の選び方・Vault の保存形式は変えない。実装は Claude Code が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** in-progress
- **Active stage:** P10.3-01（修正作業場の EXE 確認の直しと申し送り）
- **Completed stages:** なし
- **Base:** local `master` `5ddacd92`（P10.2 の merge 候補 `feat/p10.2-workspace-polish` を P10.1 ごと `--no-ff` で取り込んだ後）
- **Next action:** [stages/P10.3-01.md](stages/P10.3-01.md) の区切り1〜3を最後まで実行する（ブランチ `feat/p10.3-workspace-followups`）

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P10.3-workspace-followups-spec.md](contracts/P10.3-workspace-followups-spec.md) — この直しの仕様
4. [../phase10.2/contracts/P10.2-workspace-polish-spec.md](../phase10.2/contracts/P10.2-workspace-polish-spec.md)・[追加 1](../phase10.2/contracts/P10.2-addendum-1.md)・[追加 2](../phase10.2/contracts/P10.2-addendum-2.md) — 直前の仕様
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり（そのまま使う）
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P10.3-01.md](stages/P10.3-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

モック（`workspace-tidy-mock.html`）は zip の `mocks/` にあり、Git 管理外の `p10-generated/mocks/` に置く。

## Stages

1段階＝1つの zip＝1セッション。

### P10.3-01 — 修正作業場の EXE 確認の直しと申し送り

範囲の文を読み上げだけに・ほかの知らせは 5 秒で消す、作業場のメニューを歯車に、操作バーに範囲の札（× で外す）、区切りごとに保存した進行の memo に区切りの名前、長い進行の進行ページの折り返し、仮の区切りの名前の付け直し、「保存した音 96/97」の理由。中を3つの区切りに分ける。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは Phase 10 の `P10-autonomous-run.md` をそのまま使う。
- 解析ロジック、コード名の判別、再生の選び方、transport、Vault の保存形式（`fileVersion: 2`）は変えない。保存の中身で変えてよいのは、区切りごとに保存した進行の `memo` だけ。
- サイドバーの「設定」のアイコンは変えない。
- merge 候補で止める。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
