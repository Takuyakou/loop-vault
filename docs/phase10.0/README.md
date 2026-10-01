<!-- phase-id: 10.0 -->

# Phase 10 — 修正作業場（Correction Workspace）

MIDI 取り込み後の画面を、解析の誤りを人が速く直せる「修正作業場」に作り直すフェーズ。Phase 9 の結論（`CORE_C_PLUS_CORRECTION_UX`）を受けて、解析ロジックは変えず、画面と修正の操作に投資する。実装は Claude Code が段階ごとの zip を受け取り、段階の途中は承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** completed
- **Active stage:** P10.0-07（最後の段階。完了）
- **Completed stages:** P10.0-00（基準と監査 — [reports/P10.0-00-audit.md](reports/P10.0-00-audit.md)、fresh FULL PASS @ `1758cee`、製品コードの変更なし。local `master` へ `a5e111a` で取り込み済み）、P10.0-02（作業データと表示 — [reports/P10.0-02-display.md](reports/P10.0-02-display.md)、fresh FULL PASS @ `3c0f2c1`、EXE 作成済み。local `master` へ `42633cd` で取り込み済み）、P10.0-03〜05（まとめ A：ピアノロールの編集・カードの編集・長い曲と狭い画面 — [reports/P10.0-03-05-editing.md](reports/P10.0-03-05-editing.md)、fresh FULL PASS @ `47a5181`、EXE 作成済み。local `master` へ `2fbfd8a` で取り込み済み）、P10.0-06（まとめ B：保存と入れ替え — [reports/P10.0-06-save.md](reports/P10.0-06-save.md)、fresh FULL PASS @ `bbd843c`、EXE 作成済み。local `master` へ `327b2c1` で取り込み済み）、P10.0-07（まとめ C：計測と仕上げ — [reports/P10.0-07-finish.md](reports/P10.0-07-finish.md)、fresh FULL PASS @ `94188df5`、EXE 作成済み。merge 候補 `feat/p10.0-07-finish`、未取り込み）。Phase 全体：[reports/P10.0-FINAL.md](reports/P10.0-FINAL.md)
- **P10.0-01:** 行わない（2026-09-29 人間の判断。監査で、合否は「取った時の名前」と「今の名前」の比較だけと分かったため。作業場で名前を変えた時に札を付け直す。仕様書 v2.2 の 16章）
- **Base:** local `master` `327b2c1`（まとめ B を取り込み済み）
- **Next action:** Phase 10 完了。merge 候補 `feat/p10.0-07-finish` の取り込みは人間の判断

各段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — フェーズ全体の範囲と完了条件
3. [contracts/P10-correction-workspace-spec.md](contracts/P10-correction-workspace-spec.md) — 画面の仕様（Freeze 済み）
4. [execution-state.json](execution-state.json) — 再開用の状態
5. [contracts/P10-autonomous-run.md](contracts/P10-autonomous-run.md) — 全自動で進める時の決まり
6. [contracts/P10-test-and-evidence.md](contracts/P10-test-and-evidence.md) — テストの回し方と証跡
7. 実行中の段階の指示書：[stages/P10.0-03.md](stages/P10.0-03.md)・[P10.0-04.md](stages/P10.0-04.md)・[P10.0-05.md](stages/P10.0-05.md)（まとめ A）
8. [reports/README.md](reports/README.md) — 報告の置き場所

モック（`correction-workspace.html`）は Git 管理外の `p10-generated/mocks/` に置く。段階1以降の指示書は各段階の zip で追加される。

## Stages

1段階＝1つの zip＝1セッション。段階をまたいで自動で進まない。仕様書の15章の段階と同じ番号を使う。

**まとめ方（v2.3、2026-09-30）：** A＝P10.0-03〜05（1つの zip・1つのブランチ、中を3つの区切りに分ける）、B＝P10.0-06、C＝P10.0-07。人間用の計測シートは任意。

### P10.0-00 — 基準と監査

製品コードは変えない。今の取り込み画面の棚卸し、再生の選び方（`practiceVoicingOverride` と、コード名と合わない時の生成への切り替え）の監査、作業データ（CorrectionModel）の実現性の確認、要確認の判定の数字の案、変更前の記録。

### P10.0-01 — （任意）人が直した音をそのまま鳴らす

**行わない**（2026-09-29 人間の判断）。作業場で名前を変えた時に、直した音の札を今の名前に付け直す（P10.0-04）。

### P10.0-02 — 作業データと表示

CorrectionModel を作り、新しい作業場を表示だけで出す（編集なし）。

### P10.0-03 — ピアノロールの編集

外す・戻す・足す・消す・高さを直す・範囲選択・元に戻す・選ぶまでの一括。

### P10.0-04 — カードの編集

つなぐ・分ける・境目・名前・このままでよい・要確認の移動。

### P10.0-05 — 長い曲

倍率・見えている範囲だけ描く・追従・狭い画面の省略。

### P10.0-06 — 保存と入れ替え

保存の流れ、古い部品の撤去、確認ダイアログ。

### P10.0-07 — 計測と仕上げ

修正の手間の計測と、P10.0-00 の基準との比較。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。この README は上乗せだけを書く。
- 解析ロジック（`src/domain/midi/`）、Vault の保存形式（`fileVersion: 2`）、transport は変えない。再生の選び方の変更は P10.0-01 だけで扱う。
- 各段階は merge 候補で止める。取り込みは次の段階の zip の最初の手順で扱う。push・tag・release はしない。
- 私的な MIDI・音声・`.local-evaluation` の中身・個人のパスはコミットしない。
- Phase 9 の研究ブランチ（`research/phase9-core-v2`）は取り込まない。読む時は `git show` で読み取りだけにする。
