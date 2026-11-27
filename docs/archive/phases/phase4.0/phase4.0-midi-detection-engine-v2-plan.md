# Loop Vault Phase 4.0 Claude Code作業指示書
## MIDI Detection Engine v2
### ラベル契約・評価指標・候補ブロック・コード判定を、証拠に基づいて作り直す

---

## 0. 結論

Phase 4.0では、MIDI検出器の重みだけを再調整しない。

最初に、現在の評価を歪めているコードラベル層とExact指標を修正し、その後で候補ブロック抽出、コード候補生成、Reranker、警告、保存前試聴を段階的に改善する。

実装順は次で固定する。

```text
P4.0-00
現状監査・100 MIDI baseline固定

P4.0-01
コードラベル契約と製品バグ修正

P4.0-02
評価指標v2とholdout固定

P4.0-03
イベントを失わないCandidate Block v2

P4.0-04
Vamp／Compactを落とさないBlock Selection v2

P4.0-05
Quality-defining tone・Upper Structure Slash・警告改善

P4.0-06
Legacy／Reranker／Phase4の比較と製品既定判断

P4.0-07
Capture保存前の元Voicing試聴とUI信頼性

P4.0-08
最終回帰・実MIDI確認・ユーザー引継ぎ
```

重要:

- ラベル修正でExactが上がっても、解析精度向上とは報告しない
- 評価指標が妥当になる前にAnalyzerの優劣を決めない
- `defaultAnalyzerMode`は最終比較まで`legacy`のまま
- 各Stageを独立PRにする
- 各Stage終了後に結果を報告し、勝手に次Stageをマージしない
- P4.0-06で人間承認を得るまで製品既定を変更しない

Phase 4.0のテーマ:

**「測れない状態で重みをいじるのをやめ、表示・評価・候補・判定を一つずつ正しくする」**

---

# 1. 今回判明した事実

## 1.1 100 MIDI評価コーパス

ユーザーがClaude Codeへ渡した`test/`フォルダは、既存の次とバイト単位で完全一致していた。

```text
docs/loop-vault-evaluation-corpus/
```

したがって:

- 新しい評価データとして重複追加しない
- `test/`をGitへ追加しない
- 評価の正は既存corpusとmanifest
- `test/`が未追跡で、参照もなく、再確認でも完全一致する場合はlocalから削除してよい
- 削除はcommit対象ではない
- corpusのMIDIと期待値を勝手に変更しない

## 1.2 現行baseline

100 MIDIの現行実測:

| 指標 | Legacy | Legacy Boundary Reranker |
|---|---:|---:|
| Root | 57.76% | 57.97% |
| Quality | 60.83% | 61.48% |
| Surface Exact | 13.69% | 13.79% |

この値は過去の`phase3.6.5-audit.md`と一致している。

意味:

- Phase 3.6〜3.6.5で回帰したわけではない
- 数値は長期間ほぼ据え置き
- Rerankerは現在の指標ではほぼ差が見えていない
- ただし、現在のSurface Exact自体が妥当ではない

## 1.3 Surface Exactの構造的上限

期待ラベルをLoop Vault自身の、

```text
parseChordLabel
↓
ChordSymbol
↓
labelFromSymbol
```

で往復させたところ、期待ラベルの67.78%が同じ文字列へ戻らなかった。

現行Surface Exactの理論上限:

```text
32.22%
```

到達不可の主因:

| 原因 | 割合 | 例 |
|---|---:|---|
| 括弧付きテンションをparserが拒否 | 49.73% | `Bbm7(9)`, `Abmaj7(9)`, `Dbm7(11)` |
| formatter／品質表記の不正 | 12.28% | `A13sus` → `Asus413` |
| 異名同音の固定綴り | 5.77% | `Gbadd9` → `F#add9`, `Db6` → `C#6` |

Key別上限の例:

```text
Gb major: 8.9%
Db minor: 14.4%
```

現行13.69%は、表面文字列として到達可能な32.22%に対して約42.5%である。

ただし、この42.5%も正式な製品KPIにはしない。  
分母自体が表記依存だからである。

## 1.4 確認済み製品バグ

### `C6/9`を自アプリが読み戻せない

- 検出器の21品質に`sixNine`が存在する
- `labelFromSymbol`は`C6/9`を出力する
- parserが`/9`をslash bassとして誤認する
- `parseChordLabel()`が`null`
- Chord Inspectorで自アプリ生成ラベルが無効扱いになる

### テンション表記順が壊れる

現行formatterの、

```ts
tensions.join("")
```

等により、

```text
A13sus
→ Asus413
```

のような不正な表記が生じる。

## 1.5 現行MIDIパイプライン

通常のコード採集UIは`legacy-v1`固定。

```text
2拍固定窓
↓
12 root × 21 quality
↓
平滑化
↓
Full Timeline
↓
4 / 8 / 16小節の全窓
↓
score・地域・長さ・IoUでCandidate選定
```

`hybrid-v1`、`legacy-boundary-rerank`、`voice-aware-rerank-v1`は実装済みだが、通常UIから選択できない。

`hybrid-v1`は主ラベルをLegacyのまま維持し、代替候補へ利用する。

`legacy-boundary-rerank`だけが、保守的条件を満たした区間で主ラベルを置換できる。

## 1.6 Candidateの既知問題

現在はCandidate生成で、小節ごとに代表コード1件へ圧縮する。

そのため:

- 1小節2コードの片方が要約から消える
- 複数小節持続コードの後半が`N.C.`になり得る
- 表示文字列を使うdedupが構造を失う
- 反復判定が実イベント列と一致しない
- 4／8／16小節に含まれる実コード数がUIから分かりにくい
- 低和声密度のVamp／Compact候補が選定で不利になり得る

ただし、次はまだ仮説である。

```text
低コード数候補が出ない主因
=
uniqueChordCount bonusだけ
```

P4.0-00で、score componentと脱落Stageを実測してから確定する。

## 1.7 `endless endless chord.mid`で確認された弱点

期待イベント:

```text
| Dmaj7 | Dm7 | C#m7 | E/F#  C7 |
| Bm7   | D/E | Gmaj9/A（2小節） |
```

現行表示例:

```text
| Dmaj7 | Dm7 | C#m7 | F#m11 |
| Bm7   | Em11 | Gmaj9/A | N.C. |
```

問題:

- minor 3rdがない`F#m11`
- minor 3rdがない`Em11`
- Upper Structure Slash `E/F#`, `D/E`が候補になりにくい
- `C7`が小節代表化で消える
- 2小節持続が`N.C.`へ崩れる
- Candidate保存前試聴が元MIDI Voicingと一致しない

このMIDIをPhase 4.0の固定回帰fixtureへ追加する。

---

# 2. Phase 4.0の目的

## 2.1 第一目的

次の問いへ、正しい指標で答えられる状態にする。

```text
Legacy
Legacy Boundary Reranker
Voice-aware
Phase 4 analyzer
```

のどれが、

- Root
- Quality
- 7th／Tension
- Slash／Bass
- Boundary
- Candidate Block
- Top-3
- 修正コスト

で優れているか。

## 2.2 第二目的

コード採集UIで次を改善する。

- 自アプリが生成したコードを自アプリで編集できる
- 表記違いを誤検出として数えない
- 1小節2コードと持続コードを失わない
- 1〜5コードのVamp／Compact候補も発見できる
- `E/F#`、`D/E`等を候補に含める
- 3rd欠落のmajor／minorラベルを抑える
- 要確認を本当に曖昧な箇所へ出す
- 保存前後で試聴Voicingが変わらない

## 2.3 最終目的

一発で完全採譜することではない。

```text
機械が正解をTop-3へ含める
↓
ユーザーが数秒で選ぶ
↓
修正量が減る
↓
良い進行を保存できる
```

状態を作る。

---

# 3. 対象外

Phase 4.0では実装しない。

- オーディオファイル解析
- Neural Networkの全面置換
- ONNX製品組み込み
- Python sidecar
- Cloud inference
- Live MIDI検出器の全面変更
- Key転調検出の全面実装
- Mode認識の全面実装
- 保存済みVault進行の自動再解析
- `fileVersion`変更
- PXF変更
- Chord Dojo変更
- LLM変更
- 学習済みweightのオンライン更新
- 補正ログからの自動学習

---

# 4. 絶対に守る設計原則

1. `src/domain/*`からReact、Zustand、Tauriをimportしない  
2. 同じMIDI bytesと同じoptionsから同じ結果を返す  
3. domainで現在時刻や`Math.random()`を使わない  
4. Legacy baselineを削除しない  
5. `defaultAnalyzerMode`をP4.0-06まで変更しない  
6. 評価指標変更とAnalyzer変更を同一commitへ混ぜない  
7. parser／formatter修正を「精度改善」と報告しない  
8. Surface Exactを新方式の主要KPIにしない  
9. 評価でparseできないラベルを黙って除外しない  
10. unsupported countを必ず分母と一緒に報告する  
11. corpus全件で調整しない  
12. tuneとholdoutを分ける  
13. holdoutをweight探索へ使わない  
14. 表示文字列をcandidate identityへ使わない  
15. `chordIndex`ではなくevent timing／event IDを使う  
16. Candidateは非永続のまま  
17. 保存schemaを変更しない  
18. 既存Store actionと`applyVaultChange()`を維持する  
19. 解析結果を自動でVaultへ書き込まない  
20. 人間承認前に製品既定を変更しない  
21. 各Stageを独立branch／PRにする  
22. 各Stage後にbaseline差分を報告する  
23. 失敗したStageを正当化するためtest期待値を変更しない  
24. fixture修正と製品コード修正を別commitにする  
25. 実データの改善を確認せず「精度向上」と断定しない  

---

# 5. Phase 4.0の目標アーキテクチャ

```text
Chord Label Contract
├─ parse
├─ normalize identity
├─ canonical format
├─ key-aware spelling
└─ legacy alias compatibility

Evaluation Contract v2
├─ historical surface metrics
├─ canonical identity metrics
├─ hierarchical metrics
├─ segmentation metrics
├─ block recall
├─ Top-K
├─ correction cost
└─ confidence calibration

Timeline Analyzer
├─ legacy baseline
├─ existing reranker assets
├─ quality-defining-tone evidence
├─ Upper Structure Slash candidates
└─ warnings

Block Detection v2
├─ Full Timeline event slice
├─ structured signature
├─ fixed windows 2/4/8/16
├─ repeat-cycle proposals
├─ density classes
└─ regional / length / IoU diversity

Capture UX
├─ event-accurate summary
├─ code count
├─ warning reason
├─ source Voicing preview
└─ generated fallback
```

---

# 6. P4.0-00 — Repository Audit / Baseline Lock

## 6.1 目的

何も改善する前に、現在値・到達不能領域・候補脱落位置を固定する。

このStageでは製品挙動を変更しない。

## 6.2 Corpus監査

確認:

```text
docs/loop-vault-evaluation-corpus/
test/
```

- ファイル一覧
- byte hash
- manifest
- expected label
- category
- key
- bars
- source metadata

`test/`が完全重複かつ未追跡なら:

- 参照がないことを確認
- localから削除可
- Git commitには含めない
- 正式corpusはdocs側だけ

## 6.3 Baseline再実行

最低限:

```bash
npm run eval:midi:datasets
npm run eval:midi:rerank
npm run diagnose:midi-failures
npm run benchmark:midi
```

実在script名を確認してから実行する。

記録:

| Metric | Legacy | Reranker |
|---|---:|---:|
| Root | 57.76 expected | 57.97 expected |
| Quality | 60.83 expected | 61.48 expected |
| Surface Exact | 13.69 expected | 13.79 expected |

一致しない場合:

- 原因を報告
- Phaseを停止
- baselineを勝手に上書きしない

## 6.4 Label Reachability診断

追加する診断script候補:

```bash
npm run eval:midi:label-reachability
```

出力:

- expected labels総数
- parser success
- formatter round-trip
- surface reachability
- unsupported labels
- parenthesized tensions
- quality aliases
- enharmonic-only mismatch
- key別reachability
- quality別reachability

既知値:

```text
surface reachability ceiling: 32.22%
unreachable: 67.78%
```

再現できない場合は原因を調査する。

## 6.5 Low-density Candidate診断

100 MIDIと専用fixtureで、各正解ブロックについて次を追跡する。

```text
Full Timeline
raw Candidate
dedup後
selection後
UI props
```

候補ごと:

- startBeat／endBeat
- startBar／endBar
- lengthBars
- eventCount
- harmonicChangeCount
- uniqueChordCount
- density
- average rankingScore
- repeat bonus
- unique bonus
- final selectionScore
- density class
- rejection Stage
- rejection reason
- final rank

## 6.6 `endless endless chord.mid`

固定fixture化する。

正解は単一表記へ限定しすぎない。

例:

```text
E/F#
acceptable:
F#9sus4(no5)

D/E
acceptable:
E9sus4(no5)
```

`Dm7` source Voicing:

```text
[38, 53, 57, 60]
```

## 6.7 Corpus split

既存corpusをコピーせず、manifestにstable subsetを定義する。

```text
tune
holdout
```

推奨:

```text
tune: 70%
holdout: 30%
```

条件:

- MIDI hashで固定
- Key
- quality
- slash
- tension
- density
- file category

を可能な範囲で層化する。

乱数を使う場合はseed固定。  
split後にholdoutを見ながらweightを調整しない。

## 6.8 成果物

```text
docs/phase4.0/00-audit.md
docs/phase4.0/00-baseline-lock.json
docs/phase4.0/00-corpus-split.json
.local-evaluation/phase4.0/baseline/
```

local evaluationの生データはGit管理しない。

## 6.9 停止条件

- baselineが再現しない
- corpusに重複・破損がある
- expected labelの意味が不明
- holdout splitが偏る
- 評価scriptがsilent skipしている

このStage完了後、実装内容を報告して停止する。

---

# 7. P4.0-01 — Chord Label Contract / 製品バグ修正

## 7.1 目的

コードの内部的意味、表示文字列、評価上の同一性を分離する。

```text
Chord identity
≠
display spelling
≠
original corpus label
```

## 7.2 監査対象

- `parseChordLabel`
- `labelFromSymbol`
- `ChordSymbol`
- `ChordQuality`
- `Tension`
- `noteNames`
- Chord Inspector
- Quick Editor
- search
- copy
- import／export
- old saved labels
- corpus expected labels

## 7.3 Slash bass parserの修正

slash bassとして解釈するのは、suffixが有効なnote tokenの場合だけ。

```text
/[A-G](#|b)?$
```

相当。

次はslash bassではない。

```text
C6/9
```

parserはquality tokenをlongest matchで先に解釈する。

最低受け入れ:

```ts
parseChordLabel("C6/9") !== null
format(parse("C6/9")) === "C6/9"
```

## 7.4 Parenthesized tension

最低限、現corpusに存在する表記を受理する。

例:

```text
Bbm7(9)
Abmaj7(9)
Dbm7(11)
```

canonical identity上は、既存qualityへ安全に変換できる場合に変換する。

例:

```text
m7(9) → m9 identity
maj7(9) → maj9 identity
m7(11) → m11 identity
```

文字列の形を維持する必要はない。  
意味のround-tripを保証する。

## 7.5 Suspended extension

次を正しく扱う。

```text
A13sus
A13sus4
A7sus
A7sus4
```

canonical displayは一つへ統一する。

推奨:

```text
A13sus4
A7sus4
```

ただし既存UI／fixtureとの互換を監査して決める。

禁止:

```text
Asus413
```

## 7.6 Normalized identity

既存`ChordSymbol`を全面置換せず、評価・比較用の純粋表現を追加する。

概念:

```ts
export interface NormalizedChordIdentity {
  rootPitchClass: number;

  triad:
    | "major"
    | "minor"
    | "diminished"
    | "augmented"
    | "sus2"
    | "sus4"
    | "power"
    | "unknown";

  seventh?:
    | "minor7"
    | "major7"
    | "diminished7";

  extensions: number[];
  alterations: string[];

  bassPitchClass?: number;
  noChord?: boolean;
}
```

実際には現行型・品質語彙を監査して最小実装にする。

目的:

- 表記違いを吸収
- 異名同音を吸収
- root／quality／extension／bassを個別比較
- display formatterから独立

## 7.7 Key-aware spelling

固定`noteNames`だけで全Keyを表示しない。

```ts
formatChordSymbol(
  chord,
  {
    keyContext,
    accidentalPreference,
  },
)
```

評価corpusに正解Keyがある場合、そのKeyの綴りを使えるようにする。

製品側:

- 明示Keyがある → Key spelling
- Key不明 → canonical fallback
- 内部Pitch Classは不変

## 7.8 Legacy alias compatibility

過去に自アプリが生成した既知の不正表記が保存されている可能性を監査する。

必要なら狭いalias tableで読み込む。

```text
known legacy malformed label
→ normalized identity
→ canonical display
```

広すぎる曖昧parserを作らない。

旧data.jsonを読み込んだだけで全ラベルを書き換えない。  
明示編集・保存時だけcanonical labelへ更新してよい。

## 7.9 Formatter

`tensions.join("")`のような順序非保証な文字列連結をやめる。

構成:

```text
root
quality core
suspension
extension
alteration
slash bass
```

を明示する。

## 7.10 Test matrix

- 12 roots
- flat／sharp spelling
- 21 current qualities
- `6/9`
- `7sus4`
- `13sus4`
- m7(9)
- maj7(9)
- m7(11)
- altered
- slash bass
- flat slash bass
- enharmonic
- legacy malformed alias
- invalid label

Property:

```text
parse
→ normalized identity
→ format
→ parse
→ same normalized identity
```

## 7.11 Product acceptance

- `C6/9`がInspectorで有効
- `C6/9`をQuick Editorで保存可能
- `A13sus`系が不正順序にならない
- corpus expected labelsのparse coverage 100%
- identity round-trip 100%
- unsupportedが残る場合は明示一覧
- Root／Quality detection output自体は変えない
- baseline Root／Qualityは同一
- Surface Exact上昇を精度向上と報告しない

## 7.12 成果物

```text
docs/phase4.0/01-label-contract.md
docs/phase4.0/01-roundtrip-report.json
```

このStage後に停止し、製品バグ修正だけを報告する。

---

# 8. P4.0-02 — Evaluation Contract v2

## 8.1 目的

Analyzer改善を、表記ではなく音楽的構造で測る。

## 8.2 指標の分類

### Historical

過去比較用に残す。

```text
surfaceExact
```

ただし主要KPIにしない。

### Label-system

```text
expectedParseCoverage
predictionParseCoverage
identityRoundTripCoverage
surfaceReachability
keySpellingAccuracy
unsupportedExpectedCount
```

### Chord hierarchy

```text
rootAccuracy
triadFamilyAccuracy
qualityAccuracy
seventhAccuracy
extensionAccuracy
bassSlashAccuracy
canonicalExact
pitchSetEquivalentAccuracy
```

### Alternatives／修正

```text
top3CanonicalAccuracy
top5CanonicalAccuracy
averageCorrectionCost
medianCorrectionCost
manualInputRequiredRate
```

### Segmentation

```text
boundaryPrecision
boundaryRecall
boundaryF1
overSegmentationRate
underSegmentationRate
durationWeightedChordAccuracy
```

### Block

```text
blockRecallAtIoU50
blockRecallAtIoU80
densityClassRecall
repeatCycleRecall
dedupCollisionRate
```

### Confidence／Warning

```text
warningPrecision
warningRecall
confidenceBinAccuracy
ECE-like calibration error
```

## 8.3 Canonical Exact

比較対象:

```text
NormalizedChordIdentity
```

異名同音と同義表記を一致とする。

例:

```text
Gbadd9
F#add9
```

はroot／quality identityとして一致。

ただし:

```text
keySpellingAccuracy
```

では別途評価する。

## 8.4 Representability

expected labelが検出器の語彙で表現可能かを分類する。

```text
representable
parser-only unsupported
detector-vocabulary unsupported
ambiguous
```

主要指標から黙って除外しない。

常に、

```text
分子 / 分母
unsupported数
```

を出す。

## 8.5 Event-weightedとDuration-weighted

両方出す。

```text
eventWeighted
durationWeighted
```

短い誤分割で数値が過度に動くことを防ぐ。

## 8.6 Surface Exactとの関係

レポートへ明記する。

```text
Surface Exact:
表記互換性を含む過去指標

Canonical Exact:
音楽的identityの完全一致

両者を直接「+Xポイント改善」と比較しない
```

## 8.7 Baseline再計算

ラベル修正後、Analyzerを変えずにLegacy／Rerankerを再評価する。

期待:

- Rootは原則同一
- Qualityは原則同一
- Surface Exactは変化してよい
- Canonical Exactの正式baselineが得られる
- 以前の13.69／13.79と新Exactを同列比較しない

## 8.8 Tune／Holdout

すべてのweight調整はtuneだけ。

holdoutは:

- Stage完了時
- default promotion判断時

だけ実行する。

評価レポートへsubsetを明示する。

## 8.9 Paired comparison

同じevent／case単位で比較する。

出力:

- improved cases
- regressed cases
- unchanged
- category breakdown
- key breakdown
- quality breakdown

必要なら固定seedのpaired bootstrapを評価toolで使用してよい。  
製品domainへ乱数を入れない。

## 8.10 Promotion gateの固定

P4.0-02完了時点で、以降変更しないGate文書を作る。

```text
docs/phase4.0/02-promotion-gates.json
```

最低条件:

- Rootでhard regressionなし
- Qualityでhard regressionなし
- simple triad／7th bucketでhard regressionなし
- canonicalExactまたはTop-3が改善
- correction costが悪化しない
- bassSlashが悪化しない
- block recallが悪化しない
- runtime上限内
- 決定性維持

数値閾値はP4.0-02のbaselineを見て、人間承認で固定する。  
Claude Codeが後続結果に合わせて閾値を変えない。

## 8.11 成果物

```text
docs/phase4.0/02-evaluation-contract.md
docs/phase4.0/02-normalized-baseline.json
docs/phase4.0/02-promotion-gates.json
docs/phase4.0/02-metric-migration.md
```

このStage後に停止する。

---

# 9. P4.0-03 — Candidate Block v2 / イベント表現

## 9.1 目的

1小節1コード圧縮をCandidate identityから取り除く。

このStageではAnalyzerの主コードを変更しない。

## 9.2 Candidate content

Candidateの実体を、Full Timelineと重なるevent sliceにする。

```ts
export interface CandidateBlockV2 {
  id: string;

  startBeat: number;
  endBeat: number;
  startBar: number;
  endBar: number;
  lengthBars: number;

  events: CandidateChordEvent[];

  stats: CandidateChordStats;

  structuredSignature: string;

  generatorSources: CandidateGeneratorSource[];
}
```

```ts
export interface CandidateChordEvent {
  sourceEventId?: string;

  relativeStartBeat: number;
  durationBeats: number;

  chord: ChordSymbol;
  normalizedChord: NormalizedChordIdentity;

  confidence: number;
  warnings: string[];
}
```

## 9.3 Stats

```ts
export interface CandidateChordStats {
  eventCount: number;
  harmonicChangeCount: number;
  uniqueChordCount: number;
  chordEventsPerBar: number;

  densityClass:
    | "vamp"
    | "compact"
    | "standard"
    | "dense";
}
```

定義はP4.0-00の分布を見て、P4.0-03開始前に固定する。

暫定概念:

```text
vamp:
1 unique chord、または極低変化

compact:
2〜5 harmonic eventsを中心

standard:
中密度

dense:
1小節2コード以上が多い
```

コード数が少ないことを低品質とみなさない。

## 9.4 Structured signature

dedup／repeat／identityに表示文字列を使わない。

構造化要素:

```text
relativeStartBeat
durationBeats
normalized chord identity
```

必要ならbeatをPPQ由来の有理値へ量子化し、浮動小数誤差を避ける。

異名同音だけの違いは同一signature。

slash bass差は別signature。

## 9.5 Summary formatter

構造からUI文字列を作る。

要件:

- 1小節2コードを並記
- 複数小節持続を表示
- `N.C.`をevent欠損と混同しない
- actual durationを保持
- 旧1小節代表化をidentityに使わない

例:

```text
| E/F# · C7 | Bm7 | D/E | Gmaj9/A — |
```

または既存UIに合う安全な形式。

## 9.6 UI header

```text
1–8小節
8小節・7イベント・6コード
Compact
```

一般ユーザー向けには、

```text
8小節・6コード
```

程度でもよい。

内部statsは詳細／debugへ。

## 9.7 Save conversion

Candidate V2のevent timingをそのままSavedProgressionBlockへ変換する。

- 1小節2コード維持
- 持続duration維持
- event ID規則維持
- Voicing抽出範囲維持

## 9.8 Compatibility

Candidateは非永続。

Vault schema／fileVersion変更なし。

旧Candidate testsはV1 adapterを使うか、新構造へ明示更新する。  
testを通すためだけに意味を戻さない。

## 9.9 Acceptance

`endless endless chord.mid`で:

- 8実イベントがCandidateに存在
- `C7`が消えない
- `Gmaj9/A`の持続が維持
- 8小節と8コードを混同しない
- 構造的に異なる候補がdedupされない
- Analyzer labelはまだLegacyのままでもよい
- baseline Root／Quality不変

## 9.10 成果物

```text
docs/phase4.0/03-candidate-block-v2.md
docs/phase4.0/03-dedup-collision-report.json
```

---

# 10. P4.0-04 — Block Generation / Selection v2

## 10.1 目的

Vamp、2小節loop、2〜5コードのCompact候補を、密度だけで落とさない。

## 10.2 Candidate generators

小節窓を全廃しない。

次の複数generatorを併用する。

```text
fixed windows:
2 / 4 / 8 / 16 bars

repeat cycle:
2 / 4 / 8 / 16 bars相当

event-boundary aligned:
明確なevent開始／終了

loop-return:
区間末から区間頭への接続
```

Adaptive Hybrid Timelineの全面既定化はこのStageの対象外。

## 10.3 Repeat cycle

Global Keyへ依存しすぎないsignatureを使う。

推奨要素:

- 最初のChord rootからの相対半音
- quality family
- slash bassのroot相対interval
- relative beat
- duration

minor／modeの弱いKey推定で周期が壊れないようにする。

最低条件:

- 2周以上
- duration patternが近い
- chord identity一致率が閾値以上
- 偶然一致を弾くminimum evidence

閾値はtune corpusで固定する。

## 10.4 Cadence／loop fitness

強いglobal Key前提の`V→I`だけにしない。

初期feature:

- 区間末から区間頭へのroot motion
- common tones
- exact return
- local dominant-like relation
- end／start stability
- boundary strength

弱いbonusとして使用する。

## 10.5 Score方針

禁止:

- rawMatchScoreをそのまま平均
- 1コード候補への固定penalty
- uniqueChordCountを品質とみなす

まず現行scoreを分解して診断する。

Block qualityは、可能な範囲で次から作る。

```text
duration-weighted event evidence
boundary quality
repeat evidence
loop fitness
```

Chord diversityはscore bonusにしないか、極小へ制限する。

## 10.6 Event evidence

P4.0-02で定義した内部featureを使う。

例:

- core coverage
- quality-defining coverage
- foreign note ratio
- bass agreement
- top1-top2 margin
- temporal stability

未校正raw scoreを直接混ぜない。

Legacyからfeatureが取れない場合:

- まずdiagnostic metadataを非永続で追加
- holdout評価で単調性を確認
- scoreを勝手に確率と呼ばない

## 10.7 Density diversity

最終選定に次を追加する。

```text
vamp
compact
standard
dense
```

各classに候補があり、品質floorを満たす場合、最低1件を選ぶ。

ただし:

- class枠だけで低品質候補を強制しない
- quality floorを先に満たす
- region／length／IoUも維持
- 最終上限6〜12件は原則維持

## 10.8 1コードVamp

1コードだから減点しない。

独立classとして扱う。

Vampが多数ある場合:

- boundary
- duration
- recurrence
- confidence
- source region

で選ぶ。

## 10.9 Selection diagnostics

候補ごとに選定理由を開発者reportへ出す。

```text
selected-by-region
selected-by-length
selected-by-density
selected-by-repeat
selected-by-overall
rejected-by-quality-floor
rejected-by-iou
rejected-by-limit
deduplicated
```

UIへすべて出さない。

## 10.10 Acceptance

fixture:

- 8小節1コード
- 8小節2コード
- 8小節3コード
- 8小節4コード
- 8小節5コード
- 8小節8コード
- 4小節8コード
- 16小節5コード
- 2小節loop×4
- 1小節2コード
- 同一コード反復

条件:

- 1〜5コードだけを理由にraw候補から消えない
- 2小節loopが1cycle候補になる
- Vamp／Compactが品質floor内なら最終候補へ残る
- standard／denseを壊さない
- block recallがpromotion gateを満たす
- candidate count上限維持
- runtime上限内

## 10.11 成果物

```text
docs/phase4.0/04-block-selection-v2.md
docs/phase4.0/04-density-recall-report.json
```

---

# 11. P4.0-05 — Chord Candidate Quality v2

## 11.1 目的

主に次を直す。

- 3rd欠落のmajor／minor
- susとm11の混同
- BassをRootと過信
- Upper Structure Slash欠落
- warningの誤配置

このStageでは`defaultAnalyzerMode`をまだ変えない。

## 11.2 Stage分割

同一PRへ全部詰めない。

### P4.0-05A

Upper Structure Slash候補生成

### P4.0-05B

Quality-defining tone evidence／warning

### P4.0-05C

Legacy Boundary Reranker A/B接続

### P4.0-05D

Tune corpusでweight／閾値探索

各substageを別commitにする。

## 11.3 Upper Structure Slash

候補例:

```text
E major triad + F# bass
→ E/F#

D major triad + E bass
→ D/E
```

最低条件:

- Bass evidenceが十分
- Bassが一時的なpassing toneではない
- 上声とBassにregister separation
- 上声がtriad／7thのcoreを十分含む
- 上声のdurationが十分
- melodyだけでtriadが偶然成立していない
- percussion除外
- chord tone外Bassを許容

出力:

```text
primary candidate:
E/F#

acceptable／alternative:
F#9sus4(no5)
```

評価は1表記だけを絶対正解にしない。

## 11.4 Quality-defining tone

Major／Minor等を名乗るための重要音を分ける。

```ts
export interface QualityDefiningEvidence {
  requiredPitchClasses: number[];
  coverage: number;
  missingPenalty: number;
}
```

例:

- major: major 3rd
- minor: minor 3rd
- dim: minor 3rd + b5
- aug: major 3rd + #5
- sus2: 2nd
- sus4: 4th
- dominant: major 3rd + b7
- maj7: major 3rd + maj7
- min7: minor 3rd + b7

Rootlessの可能性を考慮し、Root欠落は一律hard rejectにしない。

3rd欠落:

- major／minorの主ラベルへ強い減点
- sus候補を同時生成
- warning
- ただしVoicing／文脈で明確な証拠がある場合の拡張余地を残す

## 11.5 Sus pair

3rd証拠が弱く、2nd／4thが強い場合:

```text
minor11だけ
```

ではなく、

```text
sus
slash
extended sus
```

を候補集合に含める。

## 11.6 Bass evidence

Bassは重要だがRootを決定しすぎない。

分ける。

```text
bass support for root
bass support for slash
upper structure support
quality support
```

BassがRootでも、quality-defining toneが弱い場合はRoot bonusを減衰する。

## 11.7 Existing Reranker

既存`legacy-boundary-rerank`の次を再利用する。

- core coverage
- missing core tone
- foreign penalty
- root evidence
- conservative replacement

ただし、存在しないUS Slash候補は選べないため、候補生成を先に実装する。

## 11.8 Warning

新規:

```text
missing-quality-defining-tone
upper-structure-slash-possible
sustained-across-bar
ambiguous-quality
ambiguous-bass
```

現行`ambiguous-bass`は実条件がTop1／Top2総合score差なので、意味を分ける。

Backward compatibility:

- 旧warning文字列を読む
- 新規解析では正しいwarningを出す
- 旧保存memoを自動書換しない

## 11.9 `endless endless chord.mid`

受け入れ:

```text
F#m11
Em11
```

が主候補に残らない、または強いwarning付きでUS SlashがTop-3に入る。

望ましい:

```text
E/F#
D/E
```

が主候補または第1代替。

`Gmaj9/A`を維持。

単純な:

```text
Dmaj7
Dm7
C#m7
C7
Bm7
```

へ不要な回帰を起こさない。

## 11.10 Tune／Holdout

weight／閾値探索はtuneだけ。

holdoutを見て再調整しない。

評価:

- root
- quality
- canonical exact
- bass slash
- top3
- correction cost
- warning precision
- category regressions

## 11.11 成果物

```text
docs/phase4.0/05-candidate-quality-v2.md
docs/phase4.0/05-tune-report.json
docs/phase4.0/05-holdout-report.json
```

---

# 12. P4.0-06 — Analyzer Comparison / Default Promotion

## 12.1 比較対象

最低限:

```text
legacy
legacy-boundary-rerank
voice-aware-rerank-v1
phase4-v1
```

`phase4-v1`は、P4.0-03〜05を統合した明示modeとする。

旧modeを削除しない。

## 12.2 UI

通常ユーザーへAnalyzer selectorを安易に出さない。

開発者設定／診断だけで比較可能にする。

製品既定は1つ。

## 12.3 Gate

P4.0-02で固定したGateだけを使う。

後から有利な閾値へ変更しない。

最低確認:

- full corpus
- tune
- holdout
- key bucket
- quality bucket
- slash bucket
- density bucket
- clean synthetic
- complex／multi-instrument
- runtime
- determinism

## 12.4 Promotion条件

次を満たす場合だけ、人間へdefault変更を提案する。

- holdoutで主要指標が改善
- Root／Qualityのhard regressionなし
- simple chord bucketでhard regressionなし
- Bass／Slashが改善または非劣化
- Top-3／correction costが改善
- Block recallが改善または非劣化
- warningが濫発しない
- runtime上限内
- all tests pass
- 実MIDIユーザー確認で致命的不具合なし

## 12.5 変更しない場合

Gate未達なら:

```text
defaultAnalyzerMode = legacy
```

を維持する。

Phase 4.0は失敗ではない。

ラベル層、評価基盤、Block V2、候補層は独立した成果として残す。

## 12.6 人間承認

Claude Codeはdefault変更をcommitする前に停止し、次を報告する。

```text
推奨:
promote / keep legacy

根拠:
metric table
regression cases
runtime
user-facing changes
rollback
```

ユーザーの明示承認後だけdefault変更PRを作る。

## 12.7 Analyzer version

新mode:

```text
phase4-symbolic-v1
```

等、実装と一致する名前にする。

保存時の`analyzerVersion`へ記録する。

`fileVersion`は変更しない。

---

# 13. P4.0-07 — Capture Preview / Warning UX

## 13.1 目的

保存前と保存後の音の違いをなくし、なぜ要確認なのか分かるようにする。

## 13.2 元Voicing Preview

Phase 3.8.5では、元MIDI VoicingはCandidate保存時に抽出される。

Capture保存前では、AnalysisStateの:

```text
sourceData
sourceVoices
```

から対象eventのVoicingをオンデマンド抽出する。

```text
Candidate試聴
↓
event rangeからVoicing抽出
↓
session cache
↓
元MIDI Voicing
↓
失敗時generated fallback
```

## 13.3 Cache key

```text
sourceFingerprint
event start/end
normalized chord key
extractorVersion
```

非永続。

## 13.4 UI

候補／コードカードへ小さく表示。

```text
元MIDI
推定
自動
```

切替を付ける場合:

```text
[元MIDI] [自動]
```

元Voicingがないときに`元MIDI`を偽表示しない。

## 13.5 保存前後一致

同じCandidateを保存した後、Progression Detailで同じResolver出力になること。

fixture `Dm7`:

```text
[38, 53, 57, 60]
```

で確認する。

## 13.6 Warning reason

`要確認`だけではなく、理由を表示する。

例:

```text
3rdの証拠が弱い
Upper Structureの可能性
Bassが曖昧
証拠が少ない
メロディ成分が多い
小節をまたいで持続
```

通常カードでは1行。

詳細はtooltip／Inspector。

## 13.7 Warning calibration

P4.0-02のwarning metricで校正する。

正しい単純コードへ濫発しない。

warning有無だけで要確認を決めない。

```text
evidence score
+
warning severity
```

から表示状態を決める。

## 13.8 Candidate header

```text
8小節・6コード
```

を表示。

必要なら:

```text
Compact
```

を補助chip。

内部debug値を通常UIへ出しすぎない。

## 13.9 Acceptance

- 保存前後のVoicing一致
- fallbackが明示
- `Dm7`元Voicing一致
- warning理由が分かる
- simple chordの要確認濫発減少
- Quick Editor／PlaybackController回帰なし
- Candidate UIの情報過多なし

---

# 14. P4.0-08 — Final QA / User Handoff

## 14.1 自動検証

```bash
npm run lint
npm test -- --run
npx tsc --noEmit
cargo test
npm run build
npm run tauri build
npm run eval:midi:datasets
npm run eval:midi:rerank
npm run benchmark:midi
git diff --check
git status --short
```

実在commandだけを実行する。

## 14.2 最終レポート

```text
docs/phase4.0/08-final-report.md
docs/phase4.0/08-metric-comparison.json
docs/phase4.0/08-user-verification-checklist.md
```

## 14.3 ユーザー確認

最低限:

### Label

- `C6/9`を編集・保存
- parenthesized tension import
- flat key表示
- `A13sus4`

### Candidate

- 1小節2コード
- 複数小節持続
- 2小節loop
- 1コードVamp
- 2〜5コードCompact
- long MIDI region coverage

### Chord quality

- `endless endless chord.mid`
- `E/F#`
- `D/E`
- `Gmaj9/A`
- simple major／minor
- sus
- altered
- slash

### Preview

- 保存前元Voicing
- 保存後一致
- generated fallback

### Warning

- 理由表示
- 正しいコードへの濫発
- 本当に曖昧な箇所

## 14.4 不具合記録

```text
MIDI:
対象位置:
期待:
Legacy:
Reranker:
Phase4:
Top-3:
Warning:
Candidate範囲:
保存前Voicing:
保存後Voicing:
修正操作:
スクリーンショット:
```

## 14.5 完了表現

ユーザー確認前:

```text
自動検証: 完了
100 MIDI評価: 完了
実MIDI聴感確認: ユーザー確認待ち
defaultAnalyzerMode: 未変更
Phase 4.0: 暫定完了
```

ユーザー確認前に「完全完了」と断定しない。

---

# 15. Branch / PR構成

推奨stack:

| 順 | Branch | 内容 |
|---:|---|---|
| 1 | `docs/p40-00-audit-baseline` | 監査・baseline固定 |
| 2 | `fix/p40-01-chord-label-contract` | parser／formatter製品バグ |
| 3 | `test/p40-02-evaluation-contract-v2` | 正規化評価 |
| 4 | `feature/p40-03-candidate-event-model` | Candidate Block v2 |
| 5 | `feature/p40-04-block-selection-v2` | generator／density |
| 6 | `feature/p40-05a-upper-structure-slash` | US Slash候補 |
| 7 | `feature/p40-05b-quality-evidence` | 3rd等の証拠 |
| 8 | `test/p40-05c-reranker-comparison` | Reranker A/B |
| 9 | `feature/p40-07-capture-source-voicing-preview` | 保存前試聴 |
| 10 | `docs/p40-08-final-qa` | 最終報告 |
| 条件付き | `feature/p40-06-promote-analyzer` | 人間承認後の既定変更 |

原則:

- 1 branch = 1 PR
- 前Stageをbaseにしたstacked PR可
- 各PRでcommitを実装／test／docsに分ける
- 自動mergeしない
- default promotionだけは独立PR

---

# 16. Performance

## 16.1 目標

100 MIDI corpus:

- 評価時間を記録
- analyzer modeごとにp50／p90
- Block V2 overhead
- US Slash candidate overhead
- Capture Voicing抽出cache

## 16.2 UI

解析は現状frontend同期である。

Phase 4.0ではWorker化を必須にしないが、次を測る。

- 3分
- 10分
- 240小節
- multi-track
- type 0 multi-channel

明確なUI freezeが悪化した場合、default promotionを止める。

## 16.3 Candidate complexity

- generator数
- raw candidate数
- dedup後
- selection時間

をreportする。

無制限な周期探索をしない。

---

# 17. Data / Compatibility

- Candidate V2は非永続
- Full Timeline schema変更は必要最小限
- 新しい内部diagnostic fieldはpublic Vault schemaへ入れない
- SavedProgressionBlock互換
- `fileVersion = 1`
- 旧data.json読込
- 既存保存進行を自動変更しない
- analyzerVersionだけ新規保存へ記録
- old warningsを読める
- old labelsを読める
- parse時の一括書換なし

---

# 18. Privacy / Security

- MIDI bytesを評価reportへ埋め込まない
- 絶対pathをGit管理reportへ書かない
- corpus hashで識別
- `.local-evaluation`をGit管理しない
- personal MIDIをfixtureへ無断追加しない
- `endless endless chord.mid`をGitへ追加する場合、ユーザー所有・公開可否を確認する
- 公開不可ならlocal evaluationだけ
- external serviceへMIDIを送信しない
- LLMへMIDI／解析結果を送信しない

---

# 19. Rollback

## Label

- parser／formatterは旧label aliasを読める
- canonical displayだけrollback可能
- data migrationなし

## Candidate V2

- feature flagで旧Candidateへ戻せる
- Candidateは非永続

## Analyzer

- modeでLegacyへ即時戻せる
- default変更は独立commit

## Preview

- 元Voicing previewをfeature flagで無効化
- generated playbackへ戻す
- Vault Voicing Memoryは影響なし

---

# 20. Claude Codeマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 4.0 MIDI Detection Engine v2を実装します。

仕様の正は:
docs/phase4.0/phase4.0-midi-detection-engine-v2-plan.md

現行仕様の基準:
docs/current-midi-detection-spec.md
master commit 22cd15eを起点に、実作業時のHEAD差分を最初に監査してください。

重要な実測baseline:
Legacy:
Root 57.76%
Quality 60.83%
Surface Exact 13.69%

Legacy Boundary Reranker:
Root 57.97%
Quality 61.48%
Surface Exact 13.79%

現行Surface Exactの構造的上限:
32.22%

上限を壊している主因:
- parenthesized tension parser
- quality formatter
- enharmonic spelling

確認済み製品バグ:
- C6/9をparseできない
- A13sus系がAsus413等へ壊れる

絶対に守ること:

1. P4.0-00から順に進める。
2. Stageを飛ばさない。
3. 各Stageを独立branch / PRにする。
4. 各Stage終了時に報告して停止する。
5. 自動mergeしない。
6. defaultAnalyzerModeをP4.0-06まで変更しない。
7. P4.0-06でも人間承認なしに変更しない。
8. Label修正とAnalyzer変更を同一commitへ混ぜない。
9. Surface Exact上昇を精度向上と報告しない。
10. Canonical identity metricsを導入する。
11. 評価不能labelを黙って除外しない。
12. unsupported件数と分母を報告する。
13. tune / holdoutを分ける。
14. holdoutでweightを調整しない。
15. promotion gateを後から変更しない。
16. 既存Legacy modeを削除しない。
17. Candidate identityに表示文字列を使わない。
18. structured event signatureを使う。
19. 1小節1コード圧縮をCandidate identityから除外する。
20. 小節窓自体はcandidate generatorとして残す。
21. 2小節窓を追加する。
22. repeat cycleをglobal Keyへ強依存させない。
23. rawMatchScoreを無校正で直接平均しない。
24. 1コードVampを固定減点しない。
25. uniqueChordCountを品質scoreとして強く使わない。
26. density classをselection diversityへ追加する。
27. quality floor未満をclass枠で無理に採用しない。
28. Upper Structure Slash候補をquality penaltyより先に実装する。
29. quality-defining toneを明示評価する。
30. Root欠落を一律hard rejectしない。
31. BassだけでRoot / Qualityを決めない。
32. existing legacy-boundary-rerank資産を再利用する。
33. hybrid-v1が主ラベルを維持する仕様を理解する。
34. US Slash候補がなければRerankerで選べないことを理解する。
35. warning名と実条件を一致させる。
36. old warning / old labelを読める。
37. 旧data.jsonを読める。
38. fileVersionを変更しない。
39. Candidateは非永続。
40. SavedProgressionBlockを自動再解析しない。
41. repositoryへ直接書かない。
42. 保存は既存store actionとapplyVaultChangeを使う。
43. Capture元VoicingはAnalysisStateからon-demand抽出する。
44. 保存前後のVoicingを一致させる。
45. Quick Editorの別コード候補へ旧source Voicingを流用しない。
46. Live MIDI検出器を変更しない。
47. Chord Dojoを変更しない。
48. LLMを変更しない。
49. domainでDate.now / Math.randomを使わない。
50. 同じbytes / optionsで同じ結果を返す。
51. test期待値を都合よく変更しない。
52. 各Stageでlint / test / typecheck / cargo test / buildを実行する。
53. 各Stageで100 MIDI評価差分を報告する。
54. 実機未確認を完了済みと書かない。

P4.0-00開始前に報告すること:

- current HEAD
- current defaultAnalyzerMode
- corpus path
- test/重複状況
- baseline scripts
- label parser / formatter file
- Candidate block file
- Reranker file
- Voicing preview path
- branch / PR plan
- risks

各Stageの終了報告:

- 変更ファイル
- commit
- PR
- before / after metrics
- tune / holdout
- improved cases
- regressed cases
- unsupported labels
- runtime
- tests
- 未解決
- 次Stageへ進めてよいか

P4.0-06では必ず停止し、次を人間へ提示する:

- promote / keep legacy推奨
- full metric table
- holdout regression cases
- runtime
- user-facing差分
- rollback

人間承認前にdefault変更PRを作らない。

最終Stageで作成:

docs/phase4.0/08-user-verification-checklist.md

最終表現:

自動検証: 完了
100 MIDI評価: 完了
実MIDI聴感確認: ユーザー確認待ち
defaultAnalyzerMode: 維持 / 人間承認後変更
Phase 4.0: 暫定完了

コミット形式:
P4.0-XX: 要約
```

---

# 21. 自動テスト総覧

## 21.1 Label contract

- `C6/9`
- `Cm6/9` if supported
- `Bbm7(9)`
- `Abmaj7(9)`
- `Dbm7(11)`
- `A13sus`
- `A13sus4`
- altered tensions
- slash bass
- flat slash
- enharmonic identity
- legacy malformed aliases
- invalid suffix
- all 12 roots
- all current qualities
- identity round-trip
- key spelling

## 21.2 Evaluation

- no silent skip
- surface vs canonical
- root
- quality
- seventh
- extension
- bass
- pitch-set
- duration weighted
- event weighted
- unsupported
- representability
- tune / holdout
- paired comparison
- stable report order

## 21.3 Candidate event model

- 1 bar 1 chord
- 1 bar 2 chords
- 2 bar sustain
- event spanning boundary
- N.C.
- repeated label
- slash difference
- enharmonic identity
- structural dedup
- display summary
- save conversion

## 21.4 Block generation

- 2 / 4 / 8 / 16 fixed
- 2 bar repeat
- 4 bar repeat
- false repeat
- vamp
- compact
- standard
- dense
- region
- length
- IoU
- quality floor
- candidate limit
- deterministic

## 21.5 Chord candidates

- major missing 3rd
- minor missing 3rd
- dim missing b5
- aug missing #5
- sus2
- sus4
- dominant
- US triad over non-chord bass
- passing bass rejection
- melody triad rejection
- E/F#
- D/E
- Gmaj9/A
- acceptable sus alternatives
- bass evidence
- warning

## 21.6 Reranker

- legacy retained
- clear replacement
- candidate unavailable
- US Slash available
- simple chord regression
- tune
- holdout
- deterministic

## 21.7 Capture Preview

- source Voicing success
- source Voicing fail
- generated fallback
- cache
- chord edit invalidates source preview
- save then Detail consistency
- `Dm7 [38,53,57,60]`
- PlaybackController
- no persistence

## 21.8 Regression

- old data
- Vault
- Progression Detail
- Quick Editor
- Smooth／Style
- Voicing Memory
- Chord Dojo
- Live MIDI
- Progression Advisor
- Import／Export
- Backup
- close flush

---

# 22. Phase 4.0全体受け入れ条件

## Label

- `C6/9`自己往復
- parenthesized tension identity往復
- sus表記正常
- corpus parse 100%
- identity round-trip 100%
- unsupported明示
- old labels読込
- no migration

## Evaluation

- Surface Exactをhistorical化
- Canonical Exact導入
- hierarchical metrics
- bass／slash
- Top-K
- correction cost
- segmentation
- block recall
- tune／holdout
- promotion gate固定

## Candidate

- event timingを維持
- 1小節2コード
- 持続
- 2小節loop
- structured dedup
- event／change／unique分離
- 8小節と8コード非混同
- code count UI

## Low-density

- Vampを固定減点しない
- 2〜5コード候補をhard filterしない
- density class diversity
- quality floor
- standard／dense回帰なし

## Chord quality

- quality-defining tone
- US Slash
- Bass過信抑制
- warning再設計
- `endless endless chord.mid`改善
- simple chord hard regressionなし

## Analyzer

- Legacy比較可能
- Phase4 mode
- holdout report
- runtime report
- 人間承認前default不変
- rollback可能

## Preview

- 元Voicing
- generated fallback
- source chip
- 保存前後一致
- warning reason

## Compatibility

- `fileVersion = 1`
- old data
- Candidate非永続
- existing save path
- no LLM／Live／Dojo regression

## Quality

- lint
- tests
- typecheck
- cargo test
- Web build
- Tauri build
- evaluation
- benchmark
- implementation reports
- user checklist

---

# 23. 最終メッセージ

Phase 4.0で最初に直すのは、Analyzerの重みではない。

```text
正解ラベルを読めない
↓
同じ意味をExact不一致と数える
↓
到達不能な指標でAnalyzerを比較する
↓
改善しても数字へ出ない
```

状態を先に終わらせる。

その後、

```text
イベントを失わない候補
低密度を落とさない選定
Qualityを決める音の評価
Upper Structure Slash
意味のある警告
元MIDIの響きでの保存前試聴
```

を積み上げる。

**「何となく精度が低い」から、どこが悪く、何を直した結果どの指標が改善したかを説明できる検出器へ進化させる。**
