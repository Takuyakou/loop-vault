# Loop Vault Phase 3.6.2 Codex作業指示書
## Real MIDI Evaluation Flywheel — 使うほど実MIDI評価セットが育つ仕組み

---

## 0. 結論

Phase 3.6.2では、人間が実MIDI全体へ手作業でコードラベルを付け続ける運用をやめる。

代わりに、Loop Vaultを普通に使う行為から評価データを自動的に蓄積し、人間は以下だけを確認する。

- 保存済み進行と現在の解析結果が食い違う箇所
- legacyとrerankerが不一致の箇所
- confidenceが低い箇所
- slash / tension / rootlessなど情報価値が高い箇所

Phase 3.6.2のテーマは次のとおり。

**「評価のために採譜する」のではなく、「使った結果を評価資産へ変える」。**

---

# 1. 背景

Phase 3.6.1では、`legacy-boundary-rerank`が以下を達成した。

- legacyの境界を維持
- synthetic 100件で全主要指標がlegacy以上
- Top-3 accuracy改善
- correction costを悪化させない
- legacy候補を常に保持
- 実MIDI評価とsynthetic評価を分離
- 修正ログをローカルJSONLへ保存

一方、実MIDIの正解ラベル付き評価セットはまだ存在しない。

課題は、実MIDI全体を人間が採譜して正解ラベルを作る作業が重すぎること。

このPhaseでは、既存の以下を評価資産へ変換する。

1. 保存済み `SavedProgressionBlock`
2. 明示的なコード修正ログ
3. legacy / rerankerの不一致
4. confidenceの低い解析区間
5. ユーザーが選択した許容解

---

# 2. Phase 3.6.2の目的

## 2.1 主目的

- 保存済み進行を実MIDI回帰テストへ変換する
- legacy / rerankerの不一致箇所だけを人間へ提示する
- 既存の修正ログを評価ケースへ昇格する
- ラベルの強さをGold / Silver / Bronzeへ分類する
- 許容可能なコード表記を自動生成する
- レビュー価値の高い区間だけを選ぶ
- analyzer改修のたびに実MIDI回帰を自動実行する
- synthetic評価と実MIDI評価を混ぜない

## 2.2 副目的

- 人間の追加作業を最小化する
- 将来のconfidence再校正やre-ranker学習へ使えるデータを蓄積する
- 個人向け精度改善と汎用精度を区別する
- ユーザーの耳・好みに合わせた回帰セットを育てる

---

# 3. 今回のスコープ

## 3.1 実装するもの

- 保存済みProgression Blockの回帰評価
- 元MIDI Asset解決
- source range解決
- 保存済みコード列と再解析結果の比較
- legacy / reranker差分抽出
- 差分レビュー用HTMLまたは専用開発画面
- 区間試聴
- Legacy / Reranker / 両方許容 / どちらも違う / Skipの判定
- 判定結果のローカル保存
- 既存修正ログの評価manifest化
- Gold / Silver / Bronzeラベル
- 自動許容解生成
- confidence / disagreementによるレビュー優先度
- 重複除去
- source fingerprintによる元MIDI照合
- 実MIDI評価CLI
- レポート出力
- 後方互換
- テスト

## 3.2 今回やらないもの

- MIDI全体の自動採譜
- すべての保存済みブロックをGold正解扱い
- 無編集保存を完全な正解として扱うこと
- クラウド同期
- 匿名テレメトリ
- 外部サーバー送信
- MIDI bytesのログ保存
- 絶対ファイルパスのfeedback JSONL保存
- AIモデル学習
- 自動再学習
- analyzer既定モードの切替
- Phase 3.7 Live MIDIの評価データとの混在
- 個人データから汎用精度を主張すること

---

# 4. 設計原則

## 4.1 人間は不一致だけを見る

次の区間は原則レビュー対象にしない。

```text
legacy == reranker
かつ
confidenceが高い
かつ
保存済みコードとも一致
```

人間へ提示するのは、主に以下。

```text
legacy != reranker
saved label != current result
confidence = review
Top-1とTop-2の差が小さい
slash / tension / rootless
過去に修正頻度が高いコード種
```

## 4.2 ラベル強度を区別する

```ts
export type EvaluationLabelStrength =
  | "gold"
  | "silver"
  | "bronze";
```

### Gold

- 差分レビューで人間が正解を選んだ
- 人間が正しいコードを手入力した
- 明示的なコード編集ログ
- 手動で検証済み

用途:

- holdout
- 精度評価
- regression guard
- confidence calibration

### Silver

- 保存済みProgression Block
- 一部編集済みだが全コード確認保証なし
- ユーザー承認済みだが完全採譜ではない

用途:

- tune
- 候補改善
- regression候補
- レビュー対象抽出

### Bronze

- 無編集で保存
- legacyとrerankerが一致
- 高confidence
- 人間未確認

用途:

- active reviewの優先順位
- 分布把握
- 弱い補助データ

Bronzeを正解率計算やholdoutへ混ぜない。

## 4.3 syntheticと実MIDIを分離する

レポートは必ず分ける。

```text
Chord Drip synthetic
手作りfixture
実MIDI Gold
実MIDI Silver
実MIDI Bronze
```

単一の総合スコアだけを出さない。

## 4.4 保存済みブロックを過信しない

「保存した」ことは、コード名をすべて確認した証拠ではない。

したがって、保存済みブロックは初期状態でSilverまたはBronze。
明示編集やレビューでGoldへ昇格する。

---

# 5. データモデル

## 5.1 実MIDI評価ケース

新設候補:

```text
src/domain/midi/realEvaluation/types.ts
src/domain/midi/realEvaluation/schema.ts
```

```ts
export interface RealMidiEvaluationCase {
  schemaVersion: 1;
  id: string;

  source: {
    fingerprint: string;
    assetId?: string;
    fileName?: string;
  };

  range: {
    startBeat: number;
    endBeat: number;
    startBar?: number;
    endBar?: number;
  };

  expected: {
    primary: ExpectedChordSegment[];
    alternatives?: ExpectedAlternativeSet[];
  };

  label: {
    strength: EvaluationLabelStrength;
    origin:
      | "stored-progression"
      | "manual-correction"
      | "difference-review"
      | "implicit-save"
      | "manual-import";
    reviewedAt?: string;
    reviewer?: "local-user";
  };

  context?: {
    key?: string;
    previousChord?: string;
    nextChord?: string;
    category?: string[];
  };

  analyzerContext?: {
    sourceAnalyzerVersion?: string;
    sourceWeightsVersion?: string;
  };
}
```

## 5.2 差分判定

```ts
export type MidiDifferenceJudgment =
  | "legacy"
  | "reranker"
  | "both-acceptable"
  | "neither"
  | "skip";
```

```ts
export interface MidiDifferenceReview {
  schemaVersion: 1;
  id: string;
  sourceFingerprint: string;
  range: {
    startBeat: number;
    endBeat: number;
  };
  legacy: ChordLabelSnapshot;
  reranker: ChordLabelSnapshot;
  alternatives: ChordLabelSnapshot[];
  judgment: MidiDifferenceJudgment;
  correctedChord?: string;
  reviewedAt: string;
}
```

## 5.3 許容解

```ts
export type AlternativeStrength =
  | "strong"
  | "weak";
```

```ts
export interface ExpectedAlternative {
  chord: string;
  strength: AlternativeStrength;
  reason:
    | "tension-reduction"
    | "omitted-fifth"
    | "enharmonic"
    | "equivalent-pitch-set"
    | "manual";
}
```

---

# 6. 保存先とプライバシー

## 6.1 保存先

通常のVaultデータと分離する。

```text
AppData/loopvault/evaluation/
  real-midi-cases.jsonl
  difference-reviews.jsonl
  promoted-corrections.jsonl
  source-index.json
```

## 6.2 source index

feedback JSONLへ絶対パスを保存しない。
元MIDIとの対応は別のローカル専用indexで管理する。

```ts
export interface LocalMidiSourceIndexEntry {
  fingerprint: string;
  assetId?: string;
  lastKnownPath?: string;
  fileName?: string;
  size?: number;
  modifiedAt?: string;
}
```

`source-index.json`はローカル専用で、外部送信しない。

## 6.3 Fingerprint

MIDI bytesから決定的にSHA-256を生成する。
既存feedbackが別fingerprint方式を使う場合は互換性を確認する。

## 6.4 削除

Settingsまたは開発用設定から以下を可能にする。

- 実MIDI評価データを開く
- 差分レビュー履歴を削除
- 修正ログ昇格データを削除
- source indexを再構築

---

# 7. Stage 1: Stored Progression Regression

## 7.1 目的

Vaultに保存済みのProgression Blockを、実MIDI回帰ケースへ変換する。

## 7.2 処理

```text
Vaultを読み込む
↓
Progression Blockを列挙
↓
元MIDI Assetを解決
↓
元ファイル存在確認
↓
fingerprint生成
↓
保存範囲を解決
↓
legacy / rerankerで再解析
↓
保存済みコード列と比較
↓
回帰レポート生成
```

## 7.3 CLI

```bash
npm run eval:stored-progressions
```

オプション候補:

```bash
npm run eval:stored-progressions -- \
  --vault path/to/data.json \
  --output artifacts/stored-progressions
```

## 7.4 出力

```text
artifacts/stored-progressions/
  summary.md
  cases.jsonl
  missing-sources.json
  mismatches.jsonl
```

## 7.5 ラベル強度

- 明示編集済み保存ブロック: Silver
- 無編集保存: Bronze
- review済み: Gold

既存データで編集有無が分からない場合はBronze。

## 7.6 スキップ条件

- 元MIDIなし
- sourceAssetId不明
- pathなし
- fileなし
- start/end解決不能
- 保存コード列なし

スキップは失敗件数と分ける。

## 7.7 受け入れ条件

- 既存Vaultを変更しない
- repositoryへ書き込まない
- 元MIDIを変更しない
- 不足情報を明確に報告
- 同じ入力から同じ結果
- legacy / rerankerを同一範囲で比較

---

# 8. Stage 2: Difference Review

## 8.1 目的

legacyとrerankerが異なる区間だけを人間へ提示する。

## 8.2 差分抽出

対象:

```text
legacy chord != reranker chord
legacy alternatives != reranker alternatives
saved label != current result
confidence = review
```

同じコードの表記差だけなら正規化して一致扱いにする。
ただしslash bass差は無視しない。

## 8.3 優先度

```ts
export interface ReviewPriority {
  score: number;
  reasons: ReviewReason[];
}
```

候補理由:

- analyzer disagreement
- low confidence
- top1/top2 small margin
- slash chord
- tension chord
- rootless candidate
- frequent correction family
- unseen chord quality
- saved-label mismatch
- boundary mismatch

## 8.4 レビュー形式

推奨はローカルHTMLレポート。

```bash
npm run eval:review-differences
```

出力:

```text
artifacts/midi-difference-review/
  index.html
  cases.json
```

表示例:

```text
Case 017
17小節目

Expected/Saved:
A6/C#

Legacy:
A6/C#

Reranker:
Amaj7

Alternatives:
F#m7/A

[▶ Saved]
[▶ Legacy]
[▶ Reranker]

[Legacyが良い]
[Rerankerが良い]
[両方許容]
[どちらも違う]
[Skip]
```

## 8.5 `neither`

`neither`選択時だけ正しいコードを入力する。
入力は既存`parseChordLabel()`で検証する。

## 8.6 Gold昇格

次はGold。

- Legacyが良い
- Rerankerが良い
- 両方許容
- どちらも違う + correctedChord

Skipは評価ケースへ追加しない。

---

# 9. Stage 3: Correction Promotion

## 9.1 目的

既存`analysis-feedback.jsonl`を実MIDI評価ケースへ変換する。

## 9.2 CLI

```bash
npm run eval:promote-corrections
```

## 9.3 変換

```text
feedback JSONL
↓
schema validation
↓
重複除去
↓
source fingerprint照合
↓
元MIDI存在確認
↓
segment range確認
↓
Gold評価ケース生成
```

## 9.4 重複

同一キー:

```text
sourceFingerprint
+ startBeat
+ endBeat
+ correctedChord
```

同一修正が複数回ある場合は最新または最頻を採用。
矛盾する修正はレビューキューへ送る。

## 9.5 source不明

source indexで解決できない場合はorphanとして報告し、捨てない。

```text
orphan-corrections.jsonl
```

## 9.6 Live MIDIとの分離

Phase 3.7の`live-chord-v1`修正ログは、file analyzerの評価へ混ぜない。

---

# 10. Stage 4: Acceptable Alternatives

## 10.1 目的

人間がprimaryコード1件だけ確認すれば、評価レベル別の許容解を機械生成できるようにする。

## 10.2 自動生成するもの

### Strong alternatives

- 異名同音
- 5th省略
- tensionを除いて同じ基礎コード
- `maj9 → maj7`
- `m9 → m7`
- `13 → 7`
- `11 → 7`または`m7`
- 同じroot / third / seventhを共有する縮退形

### Weak alternatives

- 同じpitch-class集合を持つ別root
- `C6 ↔ Am7/C`
- rootless由来の別解
- slash bassを除いた形
- 機能的には異なるが構成音が近いもの

## 10.3 API

```ts
export function deriveAcceptableAlternatives(
  primary: ChordSymbol,
  options?: {
    includeWeak?: boolean;
  },
): ExpectedAlternative[]
```

純関数。

## 10.4 評価への統合

```text
Exact
Acceptable
Weakly acceptable
```

Root / Quality / Tetradは従来どおり別計測。

## 10.5 乱用防止

上限:

```text
Strong: 最大4
Weak: 最大4
```

---

# 11. Stage 5: Active Review Queue

## 11.1 目的

情報価値の高い区間だけを提示する。

## 11.2 優先度式

```text
priority =
  analyzerDisagreement
  + lowConfidence
  + smallTop1Top2Margin
  + savedLabelMismatch
  + rareChordQuality
  + slashOrTensionBonus
  + frequentCorrectionFamily
  - alreadyReviewed
```

係数は設定オブジェクトへ集約。

## 11.3 Diversification

- 同一MIDIから最大5件
- 同一qualityから最大10件
- 同一小節近辺を重複表示しない
- rootless / slash / tension / simple triadを分散

## 11.4 CLI

```bash
npm run eval:build-review-queue
```

出力:

```text
review-queue.json
review-queue.md
```

---

# 12. Stage 6: 実MIDI回帰CLI

## 12.1 コマンド

```bash
npm run eval:real-midi
```

## 12.2 dataset別出力

```text
Gold
Silver
Bronze
Unlabeled
```

## 12.3 Gold指標

- Root accuracy
- Quality accuracy
- Tetrad accuracy
- Exact accuracy
- Strong alternative accuracy
- Weak alternative accuracy
- Top-3 accuracy
- Boundary precision / recall
- Correction cost

## 12.4 Silver指標

- Saved label agreement
- Top-3 contains saved label
- Regression count
- Improvement count
- Correction distance

Silverは公式accuracyとして扱わない。

## 12.5 Bronze指標

- analyzer agreement
- confidence distribution
- review candidate count
- chord distribution

## 12.6 比較

```text
legacy
legacy-boundary-rerank
future analyzers
```

## 12.7 回帰ガード

Gold:

```text
Root must not regress
Quality must not regress
Boundary must not regress
Correction cost must not increase
```

Silver:

```text
重大regressionが増えない
saved label disagreementが急増しない
```

Bronzeはhard guardに使わない。

---

# 13. UIへの最小統合

## 13.1 Capture

保存時に以下を記録できるようにする。

- source fingerprint
- sourceAssetId
- source range
- analyzer version
- weights version
- edited status
- saved label

## 13.2 暗黙承認

無編集保存はBronze。
一部編集済み保存はSilver。

候補:

```text
この進行を確認済みとして保存
```

ユーザーが明示した場合のみGold。
初期値OFF。

## 13.3 Settings

開発・評価セクションを追加する場合:

```text
実MIDI評価データ
- 保存先を開く
- 差分レビューを生成
- 修正ログを評価ケースへ変換
- 評価データを削除
```

一般ユーザー向けに複雑なら開発モード限定でよい。

---

# 14. 既存データとの関係

## 14.1 SavedProgressionBlock

必要な新規フィールド候補:

```ts
sourceFingerprint?: string;
sourceStartBeat?: number;
sourceEndBeat?: number;
sourceAnalyzerVersion?: string;
sourceWeightsVersion?: string;
userEdited?: boolean;
userVerified?: boolean;
```

Zod optional/defaultで後方互換。
`fileVersion`は上げない。

## 14.2 既存ブロック

不足情報がある場合はスキップまたはBronze。
自動で推測してGoldにしない。

## 14.3 feedback

既存formatを読めること。
schemaVersionがある場合はmigration readerを用意する。

---

# 15. テスト

## 15.1 Domain

- Gold / Silver / Bronze分類
- source range解決
- saved block変換
- difference normalization
- enharmonic一致
- slash bass差
- acceptable alternatives
- strong / weak分類
- duplicate correction
- conflict correction
- review priority
- diversification

## 15.2 Storage

- JSONL append
- invalid line quarantine
- source index
- pathなし
- file移動
- fingerprint一致
- delete
- no cloud

## 15.3 CLI

- empty vault
- source missing
- mixed valid/invalid blocks
- deterministic output
- Gold only report
- analyzer compare
- report files

## 15.4 Integration

- Captureで編集
- 保存
- correction log
- promote
- eval
- review judgment
- Goldへ昇格
- analyzer update後のregression

## 15.5 Privacy

評価ログへ以下が含まれないこと。

- MIDI bytes
- 絶対path（source index以外）
- Idea title
- user memo
- reference URL
- 個人情報

---

# 16. 実装ステージ

## Stage 0: Audit

- SavedProgressionBlock現状確認
- sourceAssetId / range確認
- feedback schema確認
- Asset path解決確認
- evaluation harness確認
- 追加フィールド要否
- privacy確認

成果物:

```text
docs/phase3.6.2-audit.md
```

## Stage 1: Stored Progression Regression

- block列挙
- source解決
- fingerprint
- 再解析
- report
- CLI

## Stage 2: Difference Review

- disagreement抽出
- priority
- HTMLまたは開発画面
- preview
- judgment保存
- Goldケース生成

## Stage 3: Correction Promotion

- feedback読込
- source index
- duplicate
- conflict
- orphan
- Gold manifest

## Stage 4: Acceptable Alternatives

- pure function
- strong / weak
- evaluation integration
- tests

## Stage 5: Active Review Queue

- confidence
- disagreement
- rare categories
- diversification
- queue CLI

## Stage 6: Real MIDI Evaluation

- Gold / Silver / Bronze分離
- analyzer compare
- regression guard
- reports
- performance

## Stage 7: Product Integration & QA

- Capture metadata
- optional verified checkbox
- Settings/dev tools
- migration
- build
- tauri build
- final report

---

# 17. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.6.2を実装します。

仕様の正は
docs/phase3.6.2-real-midi-evaluation-flywheel-plan.md
です。

目的:
人間が実MIDI全体を採譜し続けなくても、
Loop Vaultを普通に使うほど実MIDI評価セットが育つ仕組みを作る。

絶対に守ること:

1. 保存済みProgression BlockをすべてGold正解扱いしない。
2. Gold / Silver / Bronzeを明確に分離する。
3. 無編集保存はBronze。
4. 明示修正または人間レビューのみGold。
5. syntheticと実MIDIを同じ精度集計へ混ぜない。
6. Bronzeをaccuracyやholdoutへ使わない。
7. feedback JSONLへ絶対pathを追加しない。
8. 元MIDI pathはローカル専用source indexへ分離する。
9. MIDI bytesを評価ログへ保存しない。
10. クラウド送信しない。
11. 既存Vaultを評価CLIから変更しない。
12. 元MIDIを変更しない。
13. repositoryへ直接書かない。
14. 新フィールドはoptionalまたはZod default。
15. fileVersionを上げない。
16. 既存legacy / reranker / hybridを壊さない。
17. Live MIDI評価をfile analyzer評価へ混ぜない。
18. 人間へ全区間を見せず、不一致・低confidenceを優先する。
19. 各Stageでlint、test、buildを通す。
20. privacyをテストする。

作業開始前:
- 関連ファイル
- 現在の保存ブロック構造
- feedback構造
- source解決可能性
- 変更計画
- リスク
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- CLI
- テスト結果
- privacy確認
- 人間確認項目
- 未解決事項
を報告する。

コミット:
P3.6.2-XX: 要約
```

---

# 18. 人間側チェックリスト

## Stage 1

- 保存済みブロック数
- 元MIDI解決数
- 不明数
- 範囲不足数
- legacy / reranker比較
- Vaultが変更されていない

## Stage 2

- 不一致だけ表示される
- 同じ結果はスキップ
- Legacy / Reranker試聴
- 両方許容
- どちらも違う
- corrected chord
- 判定がGoldへ保存

## Stage 3

- 過去修正ログが昇格
- orphanが失われない
- 重複が減る
- 矛盾は自動確定しない
- 絶対pathがログへ入らない

## Stage 4

- Bm9 → Bm7
- Cmaj9 → Cmaj7
- G13 → G7
- 異名同音
- slash bass差
- strong / weakの妥当性

## Stage 5

- 重要区間が上位
- 同じMIDIだけで埋まらない
- review済みが消える
- confidence低区間
- analyzer不一致

## 最終

- 実MIDI全曲を採譜せず評価できる
- 普通に保存・修正するほどケースが増える
- Goldだけで正確な比較が可能
- Silverで回帰傾向が見える
- Bronzeが正解率を汚さない
- syntheticと実MIDIが別レポート
- analyzer変更時に自動回帰できる

---

# 19. 受け入れ条件

以下が利用できる、または同等の統合CLIが提供される。

```text
npm run eval:stored-progressions
npm run eval:review-differences
npm run eval:promote-corrections
npm run eval:build-review-queue
npm run eval:real-midi
```

最低限:

- 保存済みブロックからSilver/Bronzeケース生成
- 明示修正ログからGoldケース生成
- legacy/reranker差分からGoldレビュー
- 許容解自動生成
- review queue
- Gold/Silver/Bronze別評価
- deterministic
- privacy
- backward compatibility
- lint
- tests
- build
- tauri build

---

# 20. Phase 3.6.2完了後

Phase 3.6.3候補:

- correction logからconfidence再校正
- 個人向け重み最適化
- user-specific reranker
- review結果を使った候補閾値調整
- root / quality / tension別の個人傾向
- 評価画面の製品統合
- 保存時の確認UX改善

Phase 3.7とは並行可能。
Live MIDIの修正ログは別datasetとして保持する。

---

# 21. 最終メッセージ

Phase 3.6.2の目的は、評価作業を増やすことではない。

次の循環を作ること。

```text
MIDIを解析する
↓
良い進行を保存する
↓
必要なコードだけ直す
↓
修正・保存結果が評価データになる
↓
新しい解析器を自動回帰する
↓
不一致だけ人間が確認する
↓
さらにGoldデータが増える
```

**Loop Vaultを使うほど、Loop VaultのMIDI解析評価が強くなる。**

これをPhase 3.6.2の完成形とする。
