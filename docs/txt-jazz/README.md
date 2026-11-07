# TXT-JAZZ — Stage 01 実装

利用者提供の v3 仕様を、現在のコード・テストと照合する調査です。フェーズ番号は未指定です。

- ブランチ: `feat/txt-jazz-stage01`
- 開始点: Stage 00 `6998a4317e7934a8f3e76784c66d95479e371bae`。製品ソースは local `master` `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9` と一致
- 現在の状態: Stage 01 実装完了・fresh FULL PASS（`a04a8c8b`）。実機 EXE の確認と別担当の独立レビューは未実施
- 次の段階: 人間によるレビューと merge 判断。merge / push / tag / release は行っていない

## Required Reading Order

1. 人間がチャットで指定した `AGENTS.md`（[追跡版](../../AGENTS.md)と相違する場合は人間の指示を優先）
2. [AI handoff index](../ai-handoff/README.md)、[HANDOFF](../ai-handoff/HANDOFF.md)
3. [Phase workflow](../phase-workflow/README.md)
4. [v3 仕様（受領ファイルの無変更コピー）](work-instructions.md)
5. [Stage 00 報告](reports/TXT-JAZZ-00-stage00.md)
6. [調査証拠](evidence/README.md) とタスク関連の実コード・既存テスト
7. [Stage 01 の人間承認方針](stage01-approval.md)、[実装・検証報告](reports/TXT-JAZZ-01-stage01.md)

## Stages

- TXT-JAZZ-00: 調査完了。仕様 §3 の10項目と §2.2 の9項目、全103入力と既存全unit入力の凍結、A/B/C の実現性を報告。
- TXT-JAZZ-01: 実装完了（FULL PASS）。任意の `altered?: true`、既存上限維持、Text限定の minMaj7 正準表示変更。実利用の保存・再読込・export/import・登録音Dojoが合格条件。

merge / push / fetch / tag / release は行わない。実装の結果を報告し、承認されていない次の段階へ進まない。
`docs/phase12.4/` パッケージは開始点には存在せず、関連資料は `docs/reports/P12.4-00-audit.md` と `docs/reports/P12.4-dojo-jazz.md` にある。
数値フェーズが未指定のため、数値を必要とする `execution-state.json` は作成しない。

## 調査結果の入口

- [Stage 00 統合報告・人間判断事項](reports/TXT-JAZZ-00-stage00.md)
- [解析・正規化・全103入力の表](reports/parser-audit.md)
- [既存入力の凍結方法・実行履歴](reports/parser-regression-audit.md)
- [保存・試聴・消費側・alt候補の実現性](consumers-audit.md)

Stage 00 の仕様・報告・parser baseline は凍結し、その「承認待ち」は当時の状態として保持する。現在の承認条件は [stage01-approval.md](stage01-approval.md) が入口。
