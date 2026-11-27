# Loop Vault Phase 3.6.2 Stage 0 監査報告

## 目的

Phase 3.6.2 の Real MIDI Evaluation Flywheel を追加する前に、現行コードから再利用できる情報と、不足している証跡を実装ベースで確定する。評価用データは既存 Vault と分離し、MIDI 本体とローカル絶対パスを評価ログへ保存しない。

## 現行データから取得できる情報

### 保存済みコード進行

`SavedProgressionBlock` はコードタイムライン、解析キー、BPM、解析器バージョン、採集日時、任意の元アセット ID・ファイル名・小節範囲を保持する (`src/domain/types.ts`)。

- `sourceAssetId` があれば、所有する `SongIdea.assets` を検索して元ファイルのローカルパスを解決できる。
- Capture 画面から直接 MIDI を読み込んだ場合は、アセットへ関連付けられず `sourceFileName` しか残らないことがある。
- `startBar` / `endBar` はあるが、厳密な `startBeat` / `endBeat` は保存されていない。
- `analyzerVersion` はあるが、解析重みのバージョンは保存されていない。
- ユーザーが候補を編集したか、人手で正解確認したかは保存されていない。
- `MidiProgressionAnalysis.sourceFingerprint` は一時解析結果に存在するが、保存済みブロックへコピーされない (`src/store/vaultStore.ts`)。

このため、既存の保存済みブロックを自動的に Gold とみなすことはできない。由来を解決でき、明示的な確認証跡があるものだけを Gold、保存・部分編集の証跡だけを持つものを Silver、暗黙の保存だけを Bronze とする。

### 修正イベント

`MidiChordCorrectionEvent` はソース指紋、解析器・重みバージョン、拍範囲、検出候補、訂正コード、訂正方法、前後コードを持つ (`src/domain/midi/feedback.ts`)。保存先は AppData 配下の `loopvault/analysis-feedback.jsonl` で、MIDI bytes とファイルパスは保存していない (`src/storage/analysisFeedbackStorage.ts`)。

ただし現行 `fingerprintMidiBytes()` は `fnv1a32-*` 形式であり、Phase 3.6.2 計画が求める SHA-256 ではない (`src/domain/midi/feedback.ts`)。既存ログを読める状態を維持し、新規データから SHA-256 指紋へ移行する必要がある。

## Gold / Silver / Bronze の判定可能性

| 区分 | 現行データだけでの判定 | Phase 3.6.2 で必要な証跡 |
| --- | --- | --- |
| Gold | 不可 | 明示的な人手訂正、差分レビュー、または `userVerified` |
| Silver | 一部可能 | 保存・部分編集・承認の由来と対象区間 |
| Bronze | 可能 | 未編集保存、高信頼一致などの暗黙イベント |

Bronze は件数・レビュー候補の生成には使えるが、精度値、回帰ゲート、holdout には使わない。既存ブロックは証跡不足のため、原則 Bronze または評価対象外から開始する。

## データ分離とプライバシー境界

評価資産は AppData の `loopvault/evaluation/` 配下へ置き、通常の Vault repository を経由しない。

- `real-midi-cases.jsonl`: 匿名化された評価ケース。絶対パスと MIDI bytes を禁止。
- `difference-reviews.jsonl`: 人手判断。絶対パスと MIDI bytes を禁止。
- `promoted-corrections.jsonl`: Gold へ昇格した訂正。絶対パスと MIDI bytes を禁止。
- `source-index.json`: ソース指紋とローカルパスの対応。ローカル再解析専用で、他の評価ファイルへ展開しない。

現行 Vault の `SongIdea.assets[].path` 自体は絶対パスを保存できる (`src/domain/types.ts`, `src/domain/schema.ts`)。これは既存仕様であり Phase 3.6.2 では変更しない。新規評価ストレージがこの値をログ本文へ複製しないことをテストで保証する。

## 後方互換のために追加する任意情報

`fileVersion` は 1 のまま維持する。保存済み進行には次の情報を optional として追加し、Zod 側でも旧データを受理する。

- `sourceFingerprint`
- `sourceStartBeat` / `sourceEndBeat`
- `weightsVersion`
- `userEdited`
- `userVerified`

既存ブロックに値を推測補完しない。新規 Capture だけが取得可能な証跡を保存する。

## 未実装の境界

監査時点で以下は存在しない。

- real MIDI 評価ケース、差分レビュー、Gold 昇格ケースの型・スキーマ・ストレージ
- 保存済み進行を現在の解析器と比較する回帰 CLI
- legacy / hybrid の差分レビュー UI と判断保存
- 許容代替コードを生成する純関数
- review queue の優先度計算
- Gold / Silver / Bronze を分離した real MIDI 評価 CLI
- Capture の人手確認チェックと Settings の評価データ管理 UI

## 実装方針

1. 評価用の純粋な型・分類・比較ロジックは `src/domain/midi/evaluation/` に置く。
2. AppData への JSONL/JSON 入出力は `src/storage/` に置き、Vault repository と分離する。
3. CLI は `scripts/` に置き、既存 Vault と評価データを読み取り専用で扱う。
4. UI からの新規保存は従来どおり store action と autosave を通す。評価ログは独立したローカル補助記録として扱う。
5. 解析器の既定モードは `legacy` のまま維持し、実 MIDI の Gold 指標が legacy を上回るまで変更しない。
