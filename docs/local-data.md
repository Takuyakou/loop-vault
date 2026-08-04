# ローカルデータ（MIDI 評価コーパス）について

このリポジトリには **MIDI ファイルを一切含めていません**。理由と、開発・評価を
手元で再現するためのディレクトリ配置を説明します。

## なぜ MIDI をリポジトリに含めないのか

- 精度評価に使う MIDI コーパスには、ライセンスが自作・公開可能と確認できていない
  素材が含まれます。第三者の権利物を再配布しないため、コーパスは公開対象から外して
  います。
- MIDI は評価・研究のための入力データであり、アプリケーションのビルドや単体テストの
  実行には必要ありません（後述）。

そのため、MIDI を格納するディレクトリはすべて `.gitignore` で除外し、
コミット前チェック（`scripts/check-staged-files.mjs`）でも誤ステージを防いでいます。

## 単体テストは MIDI が無くても通る

アプリの単体テストスイート（`npm run test` / Vitest）は、上記コーパスに依存しません。
MIDI コーパスが手元に無いクリーンな clone の状態でも全テストが通ることを確認しています。

つまり、コードを読む・ビルドする・テストを流す目的であれば、MIDI データは不要です。
MIDI コーパスが必要になるのは、`scripts/` 配下の **精度評価スクリプト**
（例: `scripts/evaluate-block-recall.ts`、`scripts/ablate-midi-analysis.ts` など）を
実行して検出精度を測る場合だけです。

## 評価コーパスの配置（手元で評価を再現する場合）

精度評価スクリプトは、リポジトリルートからの相対パスでコーパスを参照します
（絶対パスはコードに書いていません）。手元で評価を再現したい場合は、以下の
ディレクトリに MIDI を配置してください。いずれも `.gitignore` 済みです。

| ディレクトリ | 用途 | 参照する主なスクリプト |
| --- | --- | --- |
| `docs/loop-vault-evaluation-corpus/` | Gold 評価コーパス（ブロック/コード進行検出の基準セット） | `evaluate-block-recall.ts`, `ablate-midi-analysis.ts`, `analyze-midi-failures.ts`, `build-corpus-split.ts` ほか |
| `.local-evaluation/` | ローカル作業用の大規模 MIDI セット（失敗分類・回帰確認用） | `audit-*.ts`, `classify-*.ts`, `check-*-gates.ts` ほか |
| `test/` | ボイシング/ハーモニー系の Gold コーパス群 | `audit-phase43-labels.ts` ほか |

`test/` 配下の実際のサブディレクトリ例（手元環境で確認したもの）:

```
test/
├─ Loop Vault Evaluation Corpus 100 ＋ex/
├─ loop-vault-chapter3-seed/
├─ loop-vault-voicing-gold-corpus-v1/
├─ loop-vault-voicing-harmony-support-gold-v1/
├─ loop-vault-voicing-melody-contamination-gold-v1/
├─ phase5.15/
├─ phase5.15-supplemental/
└─ fixtures/            ← ここだけは公開安全な最小フィクスチャで、コミット対象
```

> `test/fixtures/` は、ライセンス上問題のない最小限のテストフィクスチャ専用です。
> `.gitignore` でも `test/*` を除外しつつ `!test/fixtures/` で例外化しています。
> ここ以外の `test/` 配下（＝実 MIDI コーパス）はコミットしないでください。

## 保存済み練習データの場所

アプリが保存する練習データ等は、リポジトリではなく OS のユーザーデータ領域
（Windows では `%APPDATA%` 配下）に置かれます。一部の評価スクリプトはこの領域を
`process.env.APPDATA`（未設定時はホームディレクトリから解決）で参照します。
こちらもリポジトリには含まれません。
