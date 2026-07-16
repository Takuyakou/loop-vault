# Loop Vault Phase 3.6 Codex作業指示書（レビュー反映最終版）

## MIDIコード検出精度改善 — Weighted Symbolic Harmony Pipeline

## 0. Phase 3.6の結論

Phase 3.6では、学習済みAIモデルやPython sidecarを導入しない。

既存の `TimedNote[]`、`ChordSymbol`、`ChordTimelineItem` を維持しながら、MIDI解析パイプラインを次の構成へ段階的に改善する。

```text
MIDI parse
↓
ノート正規化・sustain反映
↓
トラック役割推定
↓
区間内overlap時間を使った重み付きPitch Class Profile
↓
拍・小節・顕著なonsetから候補境界を生成
↓
複数長のsegment候補を構築
↓
各segmentでTop-Kコード候補を採点
↓
DP / Viterbiで時間方向に復号
↓
同一コード・ボイシング差の隣接区間を結合
↓
confidenceを再設計
↓
Full Timelineと4/8/16小節候補を生成
```

Phase 3.6の目的は、コード辞書を無制限に増やすことではない。

最優先で改善する対象は以下。

- メロディやフレーズ混在による誤検出
- 短い経過音による過分割
- アルペジオをコードとして統合できない問題
- ベース音だけでルートを決める問題
- 1小節1コードと1小節2コードの判別
- 同じコードのボイシング変化をコードチェンジと誤認する問題
- alternativesが役に立たない問題
- confidenceが実際の信頼性を表していない問題

---

# 1. 仕様の正と前提

本書をPhase 3.6の仕様の正とする。

作業開始前に、必ず現在の `master` と以下を確認すること。

- `docs/claude-phase3-work-report.md` または最新の作業報告書
- `src/domain/midi/`
- `src/domain/chords.ts`
- `src/domain/chordVoicing.ts`
- `src/audio/chordPreview.ts`
- `src/ui/ProgressionGrid.tsx`
- 現在のテスト一式

既知の前提:

- MIDIは `@tonejs/midi` で読み込む
- 読み込み後は自前の `TimedNote[]` で解析する
- コードは `ChordSymbol` として構造化されている
- 同じMIDI bytesから同じ結果を返す決定的処理である
- 解析結果全体は永続化しない
- ユーザーが保存した `SavedProgressionBlock` のみ永続化する
- 保存系はstore actionと `applyVaultChange()` を通す
- Phase 3.6ではUIの大刷新を行わない

---

# 2. Deep Researchから採用する方針

調査報告の最終推奨は、固定窓だけで判定する方式から、区間ベースのhybrid symbolic harmony pipelineへ移行することだった。

Phase 3.6では、次を正式採用する。

1. duration-overlap weighted pitch-class profile
2. rule-based track-role estimation
3. non-chord-tone suppression
4. beat-aware candidate boundaries
5. adaptive segment lattice
6. per-segment Top-K chord candidates
7. DP / Viterbi temporal decoding
8. weak key prior
9. adjacent segment merge
10. confidence redesign

初期実装はTypeScript主体とする。

Rust、ONNX、Python sidecarはPhase 3.6のスコープ外。

Rust移行は、実装後のプロファイリングで明確なボトルネックが確認された場合のみ、将来Phaseで検討する。

---

# 3. 絶対に守る設計ルール

1. `src/domain/*` からReact、Zustand、Tauriをimportしない
2. MIDI解析は純関数中心に保つ
3. 現在時刻・乱数・グローバル状態へ依存しない
4. 同じ入力bytesと同じ設定から、同じ解析結果を返す
5. repository、autosave、backup、fileVersionを変更しない
6. 既存の保存済みProgression Blockを再解析で自動変更しない
7. 新方式の精度を主観だけで判断しない
8. 評価セットとbaselineを作る前に「精度が上がった」と報告しない
9. 調整値を関数内へ散在させず、設定オブジェクトへ集約する
10. 旧解析方式をすぐ削除せず、比較可能な状態を一定期間残す

---

# 4. Phase 3.6の実装範囲

## 4.1 実装するもの

- 評価ハーネス
- synthetic MIDI fixtures
- ローカル評価セット仕様
- ノート正規化
- sustain pedal反映
- 区間内overlap時間集計
- 拍位置重み
- トラック特徴抽出
- トラック役割プロファイル
- 非和声音ペナルティ
- 候補境界生成
- segment lattice
- コード候補スコアの分解
- Top-K候補
- DP / Viterbi復号
- 隣接区間結合
- confidence特徴量とUI用3段階
- analyzerVersion更新
- legacy方式との比較レポート
- Chord Dripを用いた正解ラベル付きsynthetic評価コーパス生成
- 任意区間を高速集計するcumulative / prefix-sum feature tables
- suspension / anticipationを扱う決定的な2パス復号
- 反復検出用の拍グリッド正規化
- 決定的な重み探索とtune / holdout分割
- ユーザー修正ログのローカル収集

## 4.2 実装しないもの

- 音声ファイルからのコード解析
- MIDI解析のRust全面移植
- ONNXモデル
- Transformer
- Python sidecar
- セカンダリードミナントの完全機能分析
- 借用和音の確定判定
- 転調区間の完全追跡
- rootless voicingの網羅的推定
- AIによるコード評価
- UIの大規模レイアウト変更
- fileVersion変更

---

# 5. 最重要: 評価を先に作る

## P3.6-00: Baseline & Evaluation Harness

解析改善より先に、現行方式を測定できる状態を作る。

精度改善は、baselineとの差分で判断する。

## 5.1 評価データ構造

候補ファイル:

```text
src/domain/midi/evaluation/types.ts
src/domain/midi/evaluation/evaluate.ts
src/domain/midi/evaluation/report.ts
src/domain/midi/evaluation/fixtures/
scripts/evaluate-midi-analysis.ts
```

評価ケース例:

```ts
export interface MidiEvaluationCase {
  id: string;
  title: string;
  midiPath: string;
  category: MidiEvaluationCategory[];
  difficulty: "easy" | "medium" | "hard";
  expected: {
    keyTimeline?: ExpectedKeyRegion[];
    chordTimeline: ExpectedChordSegment[];
    saveWorthyBlocks?: ExpectedProgressionBlock[];
  };
}

export interface ExpectedChordSegment {
  startBeat: number;
  endBeat: number;
  primary: string;
  acceptableAlternatives?: string[];
}
```

カテゴリ例:

```ts
export type MidiEvaluationCategory =
  | "chord-only"
  | "melody-mixed"
  | "bass-separated"
  | "no-bass"
  | "arpeggio"
  | "pad"
  | "slash-chord"
  | "tension"
  | "rootless"
  | "ornament-heavy"
  | "pedal-point"
  | "two-chords-per-bar"
  | "modulation"
  | "full-song"
  | "chord-drip"
  | "fl-studio";
```

## 5.2 評価セットの三層構成

### A. Chord Drip synthetic corpus（主評価源）

Chord Dripは既知の `ChordSymbol` 列からMIDIを生成できるため、
正解タイムラインを自動付与できる決定的な評価コーパス生成器として扱う。

対象を組み合わせて数百ケースを生成可能にする。

- progression preset
- key / transposition
- voicing
- pattern
- BPM
- time signature
- 1小節1コード / 1小節2コード
- seed
- rootless系voicing
- tension
- slash chord
- arpeggio
- pad / sustained
- melody overlay

ただし、Loop VaultからChord Dripの実装へ実行時依存しない。

推奨方式:

1. Chord Drip側のCLIまたは開発スクリプトでMIDIとmanifestを出力
2. Loop Vault側はversioned manifest contractだけを読む
3. 小規模な代表fixtureはリポジトリへ含める
4. 数百件の大規模コーパスはローカル生成物として扱う

出力契約例:

```ts
export interface ChordDripEvaluationManifest {
  schemaVersion: 1;
  generatorVersion: string;
  cases: ChordDripEvaluationCase[];
}

export interface ChordDripEvaluationCase {
  id: string;
  midiPath: string;
  recipeHash: string;
  category: MidiEvaluationCategory[];
  key?: string;
  expected: {
    chordTimeline: ExpectedChordSegment[];
    saveWorthyBlocks?: ExpectedProgressionBlock[];
  };
  generation: {
    preset?: string;
    voicing?: string;
    pattern?: string;
    seed?: string | number;
    bpm?: number;
    timeSignature?: string;
  };
}
```

同じ進行・preset family・voicing familyがtuneとholdoutへ漏れないよう、
recipe単位で分割する。

### B. リポジトリへ含める手作りfixtures

- ライセンス上問題のない小さなsynthetic MIDI
- Chord Dripだけでは再現しにくい境界ケース
- expectedとacceptable alternativesが明確
- CIで毎回動かせる

### C. ローカル実世界評価セット

- ユーザー所有のMIDI
- FL Studioから書き出したMIDI
- 長尺MIDI
- 市販曲由来など再配布できないMIDI
- Chord Drip分布と異なる演奏・ボイシング・トラック構成

ローカル評価セットのパスはgit管理しない。

例:

```text
.local-evaluation/
  manifest.json
  midi/
  chord-drip-corpus/
```

`.gitignore`へ追加する。

Chord Drip syntheticだけで精度を判断しない。
synthetic、手作りfixture、実世界MIDIをカテゴリ別に別々に報告する。

## 5.3 評価指標

最低限、次を計測する。

### コード精度

- Root accuracy
- Quality accuracy
  - major / minor / sus / dim / aug
- Tetrad accuracy
  - 7thまで
- Tension / slash accuracy
- Top-3 accuracy

### 区間精度

- Over-segmentation rate
- Under-segmentation rate
- Boundary precision / recall
- Duration-weighted chord accuracy

### Loop Vault向け指標

- User correction cost
- 検出列から正解列への編集距離
- alternativesから正解を選べる割合
- Save-worthy block recall
- 保存候補に不要な分割が入る割合

## 5.4 段階評価

```text
Level 1: ルートが正しい
Level 2: major / minor / sus / dim / augが正しい
Level 3: 7thまで正しい
Level 4: tension / slash bassまで正しい
```

完全一致だけを最終指標にしない。

## 5.5 CLI

以下のような実行方法を用意する。

```text
npm run eval:midi
npm run eval:midi -- --dataset .local-evaluation/manifest.json
npm run eval:midi:compare
```

比較レポート例:

```text
artifacts/midi-evaluation/baseline.json
artifacts/midi-evaluation/hybrid-v1.json
artifacts/midi-evaluation/comparison.md
```

## 5.6 P3.6-00完了条件

- legacy analyzerのbaselineを保存できる
- synthetic fixturesで評価が動く
- acceptable alternativesを評価できる
- duration-weighted metricsが出る
- 同じ入力から同じレポートが生成される
- 評価データ不足の場合は精度向上を断定しない

---

# 6. 解析方式のバージョン管理

旧方式を即時削除しない。

候補:

```ts
export type MidiAnalyzerMode = "legacy" | "hybrid-v1";

export interface MidiAnalysisOptions {
  mode?: MidiAnalyzerMode;
  weights?: Partial<AnalyzerWeights>;
  debug?: boolean;
}
```

デフォルト切替は、Phase 3.6の評価結果が完了条件を満たした後に行う。

`analyzerVersion` 例:

```text
legacy-v1
hybrid-symbolic-v1
```

解析結果全体は永続化しないため、fileVersion変更は不要。

保存済みブロックへanalyzerVersionが既に保存されている場合は更新する。存在しない場合、新しい永続フィールドを追加する必要はない。

---

## 6.1 ユーザー修正ログをPhase 3.6で導入する

ユーザーが検出コードを明示的に編集し、その進行を保存した時点で、
`検出値 → 修正後` のペアをローカルJSONLへ追記する。

目的:

- 実世界の誤検出パターンを蓄積する
- 評価セットを段階的に拡充する
- confidence再校正へ使う
- 将来のTop-K re-ranker用データを確保する

保存先候補:

```text
AppData/loopvault/analysis-feedback.jsonl
```

通常の `data.json` へ混ぜない。
ネットワーク送信しない。

ログへ含める候補:

```ts
export interface MidiChordCorrectionEvent {
  schemaVersion: 1;
  sourceFingerprint: string;
  analyzerVersion: string;
  weightsVersion: string;
  segment: {
    startBeat: number;
    endBeat: number;
  };
  detected: {
    primary: string;
    alternatives: string[];
  };
  corrected: string;
  editMethod: "manual-label" | "alternative-selection";
  keyContext?: string;
  previousChord?: string;
  nextChord?: string;
}
```

含めないもの:

- MIDI bytes
- 絶対ファイルパス
- Idea title
- ユーザーメモ
- 個人情報
- クラウド送信

同じコードを保存しただけでは正解確認とみなさない。
明示的に編集またはalternativeを選択した場合だけログ化する。

Settingsに小さな説明付きトグルを追加してよい。

```text
解析修正ログをローカル保存
コード検出を直した履歴を、このPC内だけに保存します。
```

初期値は有効とし、無効化とログ削除が可能であること。
UIの大刷新は行わない。


# 7. P3.6-01: ノート正規化とoverlap集計

## 7.1 目的

瞬間的な同時発音ではなく、segment内で実際に鳴っていた時間をコード証拠として使う。

これにより次を改善する。

- アルペジオ
- 分散和音
- Pad
- sustainを含むピアノ
- 短い経過音の過大評価

## 7.2 型候補

```ts
export interface NormalizedTimedNote extends TimedNote {
  sourceTrackIndex: number;
  program?: number;
  trackName?: string;
  isDrum: boolean;
  sustainedEndBeat: number;
}

export interface SegmentRange {
  startBeat: number;
  endBeat: number;
}

export interface NoteSegmentOverlap {
  note: NormalizedTimedNote;
  overlapBeats: number;
  overlapRatio: number;
}
```

## 7.3 overlap式

```ts
const overlapBeats = Math.max(
  0,
  Math.min(note.sustainedEndBeat, segment.endBeat) -
    Math.max(note.startBeat, segment.startBeat),
);
```

## 7.4 sustain pedal

可能であればCC64を読み取り、sustain中のnote-offをpedal releaseまで延長する。

ただし以下を守る。

- 同一pitchの再発音時に無制限に重ねない
- pedal release時刻を越えない
- MIDI終端を越えない
- sustain情報がないMIDIの結果を壊さない

CC64取得が現在のparser構造で難しい場合は、P3.6-01内で無理に壊さず、独立サブタスクとして切る。

## 7.5 重複ノート

同じtrack、channel、pitch、ほぼ同一startの重複イベントは、解析用には正規化候補とする。

元のMIDIイベント自体は変更しない。

## 7.6 完了条件

- アルペジオfixtureで構成音がsegment内に集約される
- 短い装飾音が長い構成音より強くならない
- sustain fixtureが正しく延長される
- parser出力の決定性を維持する

---

# 8. P3.6-02: ノート重み付け

## 8.1 設定を集約する

重みを関数内へハードコードしない。

```ts
export interface AnalyzerWeights {
  overlapExponent: number;
  downbeatWeight: number;
  strongBeatWeight: number;
  beatWeight: number;
  offbeatWeight: number;
  subdivisionWeight: number;

  chordRoleWeight: number;
  padRoleWeight: number;
  arpeggioRoleWeight: number;
  bassRoleQualityWeight: number;
  bassRoleRootWeight: number;
  melodyRoleWeight: number;
  leadRoleWeight: number;
  counterRoleWeight: number;
  unknownRoleWeight: number;

  stableNoteBonus: number;
  repeatedPitchClassBonus: number;
  passingTonePenalty: number;
  chromaticApproachPenalty: number;
  shortUpperVoicePenalty: number;
  suspensionPenalty: number;
}
```

初期値は調査報告の数値を参考にしてよいが、正解値として固定しない。

必ず評価セットで調整可能にする。

## 8.2 NoteFeatures

```ts
export interface NoteFeatures {
  overlapWeight: number;
  beatStrengthWeight: number;
  trackRoleWeight: number;
  registerWeight: number;
  stabilityWeight: number;
  velocityWeight: number;
  ornamentPenalty: number;
  finalWeight: number;
}
```

## 8.3 基本式

```text
finalWeight =
  overlapWeight
  × beatStrengthWeight
  × trackRoleWeight
  × registerWeight
  × stabilityWeight
  × velocityWeight
  × ornamentPenalty
```

乗算で極端にゼロへ寄る場合はlog-spaceまたは加算式も比較する。

評価結果を見て決める。

## 8.4 overlapWeight

候補:

```ts
Math.sqrt(clamp(overlapBeats / referenceBeats, minWeight, 1));
```

短音を完全に捨てない。

## 8.5 拍位置

Meter情報から拍強度を計算する。

4/4の初期イメージ:

```text
小節頭 > 3拍目 > 2/4拍目 > 裏拍 > 細かいsubdivision
```

拍子を4/4固定にしない。

## 8.6 音域

quality推定とbass推定を分離する。

- 低音はroot / slash候補に強く使う
- 低音だけでqualityを決めない
- 高音メロディはqualityへの影響を弱める
- 中音域の持続音をquality推定で重視する

## 8.7 velocity

velocityは演奏・書き出し方法に依存するため、補助的に使う。

影響範囲を小さくする。

## 8.8 完了条件

- 各重みが単体テスト可能
- 設定値を差し替えて評価できる
- メロディ混在fixtureで短い上声の影響が減る
- bass-only fixtureでqualityがベース音だけに引っ張られない

---

# 9. P3.6-03: トラック役割推定

## 9.1 目的

トラックを完全に採用・除外するのではなく、各役割の確率またはスコアを解析重みへ反映する。

## 9.2 型

```ts
export type TrackRole =
  | "bass"
  | "chord"
  | "pad"
  | "arpeggio"
  | "melody"
  | "lead"
  | "counter"
  | "drums"
  | "unknown";

export interface TrackFeatures {
  trackIndex: number;
  trackName?: string;
  channel?: number;
  program?: number;
  noteCount: number;
  medianPitch: number;
  pitchRange: number;
  averageDurationBeats: number;
  noteDensityPerBeat: number;
  polyphonyRatio: number;
  simultaneousOnsetRatio: number;
  lowestVoiceShare: number;
  highestVoiceShare: number;
  stepwiseMotionRatio: number;
  repeatedPitchClassRatio: number;
  sustainRatio: number;
}

export type TrackRoleProfile = Record<TrackRole, number>;
```

各role scoreは0〜1、合計1へ正規化してよい。

## 9.3 推定ルール

### Drums

- channel 10
- percussion program / metadata

### Bass

- median pitchが低い
- lowestVoiceShareが高い
- polyphonyが低〜中
- 拍頭への着地が多い

### Chord

- simultaneousOnsetRatioが高い
- polyphonyが高い
- 中音域
- 平均音価が中程度

### Pad

- polyphonyが高い
- 平均音価が長い
- sustainRatioが高い

### Arpeggio

- polyphonyは低い
- repeatedPitchClassRatioが高い
- 音が連続する
- 区間内でコード構成音を巡回する

### Melody / Lead

- highestVoiceShareが高い
- polyphonyが低い
- stepwiseMotionRatioが高い
- 音域が比較的広い

### Counter

- melodyに近いが最高声占有率が低い
- リズム密度が中程度

## 9.4 トラック名とProgram

トラック名やGeneral MIDI Programはpriorとして使うが、hard ruleにしない。

例:

```text
"bass" → bass score加点
"lead" → lead score加点
"pad" → pad score加点
```

実際の音符特徴と矛盾する場合は、音符特徴を優先する。

## 9.5 単一トラックMIDI

1トラックに全パートが統合されている場合は、track roleだけでは分離できない。

この場合はnote-level featureで補う。

- 低音域 → root / bass evidence
- 中音域の持続 → chord evidence
- 高音域の短い順次進行 → melody evidence

## 9.6 Debug情報

解析結果へ永続化しなくてよいが、debug modeではrole profileを確認できるようにする。

CLIレポート例:

```text
Track 0 Piano
chord 0.42 / melody 0.31 / arpeggio 0.18 / bass 0.09
```

## 9.7 完了条件

- synthetic track fixturesで期待roleが最大になる
- roleをhard labelとして固定しない
- 単一トラックでも解析不能にならない
- drumsがコード検出へ寄与しない

---

# 10. P3.6-04: 非和声音の抑制

## 10.1 削除ではなく減衰

短い音を一律削除しない。

maj9、13、suspensionなどの有効音を失うため。

## 10.2 初期対応

### Passing / Neighbor

以下が揃うほど減衰を強くする。

- 短い
- 弱拍
- 上声
- 前後が半音または全音
- 他声部に同pitch classの支持がない
- 安定音へ解決する

### Chromatic approach / Enclosure

- 半音接近
- 非常に短い
- 直後に安定音へ着地
- 他声支持がない

### Suspension

強拍に出るため、context-freeな段階では単純減衰しない。

候補特徴として以下だけを記録する。

- 前位置から持続している
- 強拍に存在する
- 近接音へ解決する可能性がある

最終判定は、後述の2パス復号で仮タイムラインを参照して行う。

### Anticipation

context-freeな段階では、前区間末の短い先取り音候補として記録する。

「次のコードに一致するか」は仮タイムラインが必要なため、
最終判定は2パス復号で行う。

### Pedal point

長く持続する低音と上声の和声変化を分離する。

bass evidenceとquality evidenceを別に保持する。

## 10.3 テンション判定

次を満たす音は、非和声音ではなくテンション候補として残す。

- segment内で一定時間持続
- 複数回反復
- 強拍または拍頭で安定
- 他声部にも支持がある
- 候補コードの3rd / 7thと矛盾しない

## 10.4 循環依存を避ける2パス構造

suspensionとanticipationは、前後コードが分からないと確定できない。
一方、その前後コードは非和声音処理の結果に依存する。

無制限な反復は行わず、次の決定的な2パスに固定する。

### Pass 1: 仮復号

- passing / neighbor / chromatic approachなどcontext-free特徴を使用
- suspension / anticipationは強い減点をしない
- Top-K + DPで仮タイムラインを1回生成

### Pass 2: 文脈付き本復号

- Pass 1の前後コードを参照
- suspensionの保持元と解決先を評価
- anticipationが次コードを先取りしているか評価
- 該当segmentの候補スコアを再計算
- DPをもう1回だけ実行して最終タイムラインを得る

同じ入力と設定から必ず同じ結果を返す。
3回以上の反復や収束待ちは行わない。

## 10.5 完了条件

- passing tone fixtureで不要なコード候補が減る
- maj9 fixtureで9thが消えない
- suspension fixtureを単純なforeign noteとして大減点しない
- pedal point fixtureで低音だけをroot確定に使わない

---

# 11. P3.6-05: 候補境界とAdaptive Segmentation

## 11.1 目的

固定1拍、固定2拍、固定1小節のいずれかへ決め打ちしない。

候補境界を列挙し、最も自然な区間列を後段のDPで選ぶ。

## 11.2 BoundaryCandidate

```ts
export interface BoundaryCandidate {
  beat: number;
  strength: number;
  reasons: BoundaryReason[];
}

export type BoundaryReason =
  | "bar-start"
  | "beat-start"
  | "strong-onset-burst"
  | "bass-change"
  | "pitch-profile-change"
  | "silence-gap"
  | "time-signature-change";
```

## 11.3 必須境界

- 0 beat
- MIDI終端
- 拍子変更点
- 小節頭

## 11.4 任意境界

- 各拍頭
- 多数のnote-onが集中した位置
- bass evidenceの顕著な変化
- 前後のweighted PCP差が大きい位置
- silence gap

## 11.5 subdivision

半拍など細かい境界は、以下が複数成立する場合のみ許可する。

- 強いonset burst
- bass change
- chord candidate scoreの大きな改善
- ornamentでは説明できない

細かい境界を無制限に増やさない。

## 11.6 SegmentCandidate

```ts
export interface SegmentCandidate {
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  startBoundaryStrength: number;
  endBoundaryStrength: number;
  noteOverlaps: NoteSegmentOverlap[];
}
```

初期制約例:

- 基本最短長: 1拍
- 条件付き最短長: 0.5拍
- 基本最大長: 1小節
- silenceや全音符系では1小節超も許可可能

拍子に依存して小節長を計算する。

## 11.7 Lattice爆発対策

- 各開始境界から最大N個の終了境界
- 最大segment長
- strengthが低い境界の枝刈り
- 同一範囲の重複除去

## 11.8 完了条件

- 1小節1コードfixtureで不要な2分割を抑える
- 1小節2コードfixtureで正しい中間境界を候補化する
- アルペジオfixtureで細かく分割しすぎない
- segment数が長大MIDIで爆発しない

---

# 12. P3.6-06: Weighted Pitch Class Profile

## 12.1 型

```ts
export interface WeightedPitchProfile {
  qualityPcs: number[]; // length 12
  rootPcs: number[];    // length 12
  bassPcs: number[];    // length 12
  topPcs: number[];     // length 12
  totalWeight: number;
}
```

## 12.2 分離

- `qualityPcs`: 3rd、5th、7th、tension判定
- `rootPcs`: ルート候補
- `bassPcs`: slash bass候補
- `topPcs`: melody / tension判定

全用途に同じchromaを使わない。

## 12.3 Cumulative / Prefix-sum Feature Tables

segment latticeでは、多数の重複区間について同じPCP集計を行う。
各segmentで全ノートを再走査しない。

候補境界を昇順に並べ、その境界インデックス上で
加算可能な特徴量の累積積分表を一度だけ構築する。

候補:

```ts
export interface CumulativePitchFeatures {
  boundaries: number[];
  qualityPcs: number[][]; // [boundaryIndex][12]
  rootPcs: number[][];
  bassPcs: number[][];
  topPcs: number[][];
  onsetPcs: number[][];
}
```

任意の `[startBoundary, endBoundary]` の加算特徴は差分で取得する。

```ts
segmentPcs[pc] =
  prefix[endIndex][pc] - prefix[startIndex][pc];
```

目標計算量:

- cumulative table構築: ノート数と境界数にほぼ線形
- 任意segmentの加算PCP取得: O(12 × profile数)

注意:

- 最低音、最高音、active voice countなど非加算特徴は別の索引で計算する
- beat-strengthのonset寄与とduration-overlap寄与を分離してよい
- 固定1拍へ量子化する必要はない
- 候補境界時刻に対する区分積分として実装する
- prefix-sum導入前後でスコアが一致するテストを作る

## 12.4 coverage

各コード候補について以下を分ける。

- core tone coverage
- optional tone coverage
- extension coverage
- conflicting tone weight
- unexplained tone weight

## 12.5 完了条件

- 低音の重複だけでminor chordへ飛びにくくなる
- 中音域の3rd / 7thがqualityへ強く効く
- 高音メロディがルートを変えにくい

---

# 13. P3.6-07: コード候補スコアの分解

## 13.1 コード辞書

Phase 3.6では、現在対応しているコード辞書を原則維持する。

不足が明らかな場合のみ、以下の範囲で追加を検討する。

```text
maj min dim aug sus2 sus4
6 m6 7 maj7 m7 m7b5 dim7
add9 9 maj9 m9
11 m11 13 maj13
7sus4 9sus4 6/9
7b9 7#9 7#5 7b5 maj7#11
slash chords
```

辞書追加を精度改善の主手段にしない。

## 13.2 ChordCandidateScore

```ts
export interface ChordCandidateScore {
  chord: ChordSymbol;
  templateScore: number;
  coreCoverageScore: number;
  extensionCoverageScore: number;
  bassCompatibilityScore: number;
  slashCompatibilityScore: number;
  keyCompatibilityScore: number;
  foreignNotePenalty: number;
  missingCoreTonePenalty: number;
  ambiguityPenalty: number;
  totalScore: number;
  evidence: ChordEvidence[];
}
```

## 13.3 構成音の扱い

コードテンプレートは次の4分類を持つ。

```ts
export interface ChordTemplate {
  required: number[];
  important: number[];
  optional: number[];
  conflicting: number[];
}
```

例:

- 3rd / 7th欠落は大きめに減点
- 5th欠落は軽い減点
- 9th / 11th / 13thはoptionalまたはextension
- b3と3などqualityを壊す音は強く減点

## 13.4 ベース

ベースはroot / slash候補のprior。

ベースだけでコード確定しない。

同一pitch setの曖昧性例:

- C6
- Am7/C

は1位とalternativesに残す。

## 13.5 rootless

Phase 3.6では限定対応。

以下の条件がある場合のみrootless候補を開く。

- 別bass trackがrootを支持
- 全体低音がrootを支持
- key priorと前後コードがrootを支持
- 3rd / 7thが明瞭

根拠が弱い場合は通常コードまたはslash候補を優先する。

## 13.6 Top-K

各segmentで上位5〜8件を保持する。

```ts
export interface ScoredSegment {
  segment: SegmentCandidate;
  candidates: ChordCandidateScore[];
}
```

## 13.7 完了条件

- 候補スコアの内訳をdebugレポートで確認できる
- alternativesが単なるスコア順文字列ではなく根拠を持つ
- C6 / Am7/Cのような曖昧例で両候補を保持できる

---

# 14. P3.6-08: Key Prior

## 14.1 方針

キーはhard constraintにしない。

借用和音、セカンダリードミナント、一時的なトニック化を消さないため、弱いpriorとしてのみ使用する。

## 14.2 初期実装

- 4〜8小節程度のsliding window
- weighted PCPからkey candidateを推定
- global keyとlocal key候補を保持
- chord scoreへ小さな補正

```ts
export interface KeyRegionCandidate {
  startBeat: number;
  endBeat: number;
  tonicPitchClass: number;
  mode: "major" | "minor";
  score: number;
}
```

## 14.3 key weight

設定値として持つ。

初期値は小さくする。

キー非所属コードを即座に落とさない。

## 14.4 完了条件

- ダイアトニック進行でtie-breakに役立つ
- 借用和音fixtureを排除しない
- key priorなし/ありの評価比較を出せる

---

# 15. P3.6-09: DP / Viterbi復号

## 15.1 目的

局所的に最も高いコードを並べるのではなく、曲全体として自然な区間とコード列を選ぶ。

## 15.2 状態

状態は以下の組み合わせ。

```text
segment range
+
chord candidate
```

## 15.3 コスト

```text
segmentCost =
  - templateScore
  - coreCoverageScore
  - extensionCoverageScore
  - bassCompatibilityScore
  - slashCompatibilityScore
  - keyCompatibilityScore
  + foreignNotePenalty
  + missingCoreTonePenalty
  + shortSegmentPenalty

transitionCost =
  chordChangePenalty
  + weakBeatChangePenalty
  - repeatedChordReward
  - stableBassMotionReward
```

## 15.4 重要な挙動

- 同一コード継続へ小さなreward
- 強拍でのコード変更は弱拍より許容
- 極端に短いsegmentへpenalty
- 前後でroot・qualityが同じならvoicing差として継続しやすくする
- key priorは小さい

## 15.5 設定型

```ts
export interface DecoderWeights {
  chordChangePenalty: number;
  weakBeatChangePenalty: number;
  shortSegmentPenalty: number;
  repeatedChordReward: number;
  sameRootReward: number;
  keyPriorWeight: number;
}
```

## 15.6 異名同音表記の扱い

DPは `F#` と `Gb` の文字列差を和声変化として扱わない。

内部候補は以下でcanonicalizeし、異名同音の重複状態を作らない。

```text
root pitch class
quality
extensions
bass pitch class
```

最終ラベル表記は復号後に `labelFromSymbol()` 相当の表示層で決める。

優先順位:

1. local / global keyのflat・sharp傾向
2. 入力コードや保存データに既存表記がある場合はその傾向
3. deterministicな既定綴り

受け入れ条件:

- 同じ和音がF#とGbの表記差だけで交互に変化しない
- key contextがflat系ならflat表記を優先できる
- 内部スコアと表示綴りを分離する

## 15.7 アルゴリズム

候補segmentが可変長なので、単純なframe Viterbiではなく、DAG上の動的計画法として実装してよい。

各boundaryをnode、segment candidateをedgeとみなす。

edgeごとにTop-K chord statesを持つ。

## 15.8 完了条件

- greedy結果とDP結果を比較できる
- 過分割率が改善する
- 1小節2コードを消しすぎない
- 同じ入力で常に同じ経路を選ぶ

---

# 16. P3.6-10: 隣接区間の結合

## 16.1 結合対象

- 同じChordSymbol
- 同じroot / qualityでextension差のみ
- 一時的な5th欠落
- 短い9th追加
- 同じbassで上声だけが動く

## 16.2 結合しないもの

- bassが意味のあるslashへ変化
- 3rdがmajor/minor間で変化
- 7thが和声機能を変える
- 強拍で明確な境界がある
- 1小節2コードfixtureの正解境界

## 16.3 Alternatives

結合で吸収した一時的な候補は、必要ならalternativesまたはevidenceへ残す。

## 16.4 完了条件

- voicing change fixtureで同一コードへまとまる
- 実コードチェンジを過剰結合しない

---

# 17. P3.6-11: Confidence再設計

## 17.1 Raw scoreを確率として表示しない

`totalScore` やsoftmaxをそのままconfidence 100%として表示しない。

## 17.2 ConfidenceFeatures

```ts
export interface ConfidenceFeatures {
  top1Score: number;
  top2Score: number;
  margin: number;
  entropy: number;
  coreCoverage: number;
  foreignNoteRatio: number;
  bassAgreement: number;
  keyAgreement: number;
  temporalConsistency: number;
  boundaryStrength: number;
}
```

## 17.3 Phase 3.6での校正

評価セットが少ない初期段階では、複雑なisotonic regressionを本番へ固定しない。

まず以下を実装する。

1. confidence featuresを算出
2. 評価レポートで各特徴と正解率を確認
3. ルールベースで `high / medium / review` を決定
4. 十分なvalidation件数が得られた後に校正器を追加可能な構造にする

## 17.4 UI表示

```ts
export type ConfidenceLevel = "high" | "medium" | "review";
```

- high: 通常は警告不要
- medium: 詳細で確認可能
- review: UIに「要確認」

すべてのコードに数値パーセントを出さない。

## 17.5 完了条件

- 「高」の実測正解率をレポートできる
- 全候補が100%になる状態を解消する
- marginが小さい曖昧候補をreviewへ落とせる

---

# 18. P3.6-12: Progression Block抽出への統合

コードタイムライン改善後も、4/8/16小節候補抽出を壊さない。

確認事項:

- Full Timelineが新しいsegment長に対応する
- 1小節内複数コードを正しくブロックへ含める
- block summaryを壊さない
- 試聴順序を壊さない
- Chord Drip形式コピーを壊さない
- 保存済み `SavedProgressionBlock` の形式を壊さない

候補ブロック評価:

- Save-worthy block recall
- 候補の重複率
- 過剰に似た候補の件数
- 4/8/16小節境界の妥当性

Phase 3.6ではblock抽出アルゴリズムの大刷新はしない。

新タイムラインへの適合と回帰修正を中心とする。

## 18.1 反復・類似度比較用の拍グリッド正規化

可変長segmentの切れ方を、そのまま進行反復判定へ使わない。

同じ4小節でも、ある出現では1segment、別の出現では2segmentに分かれる可能性があるため、
repeatCountや類似候補判定の前にcanonical beat gridへリサンプルする。

```ts
export function resampleTimelineForComparison(
  timeline: readonly ChordTimelineItem[],
  options?: {
    resolutionBeats?: number;
  },
): CanonicalChordFrame[]
```

初期値:

```text
resolutionBeats = 1
```

各グリッドセルには、その時間を最も長く占有したコードを割り当てる。
同率時のtie-breakは決定的にする。

用途:

- repeatCount
- similar candidate detection
- progression block deduplication
- block comparison

用途外:

- UI表示
- 試聴
- 保存する元タイムライン
- Full Timeline

元の可変長segmentは保持し、比較時だけ正規化する。

必要であれば将来0.5拍解像度を選べる構造にする。

受け入れ条件:

- 同じコード進行が区間分割の違いだけで別進行にならない
- 本当に異なる1小節2コード進行を潰さない

---

# 19. Debugと説明可能性

精度調整には「なぜこのコードになったか」が必要。

本番UIに全情報を出す必要はないが、debug reportを生成できるようにする。

例:

```ts
export interface ChordDecisionDebug {
  segment: SegmentRange;
  selected: ChordCandidateScore;
  alternatives: ChordCandidateScore[];
  trackRoles: TrackRoleProfile[];
  boundaryReasons: BoundaryReason[];
  confidence: ConfidenceFeatures;
}
```

CLIレポート例:

```text
Bars 5-6 / Beats 17-21
Selected: Dm9
Core coverage: 0.92
Bass agreement: 0.71
Foreign note ratio: 0.08
Alternative: F6/D (-0.04)
Boundary: bar-start + bass-change
```

Debug情報は通常の `data.json` に保存しない。

---

# 20. パフォーマンス要件

Phase 3.6は精度優先だが、実用速度を維持する。

基準はbaseline測定後に確定する。

初期目標:

- 3分程度の一般的なMIDI: baselineの2倍以内
- 可能なら2秒以内を目標
- UIメインスレッドを長時間ブロックしない
- candidate latticeが無制限に増えない
- 同じMIDIを繰り返し解析してメモリリークしない

計測項目:

```text
parse
normalize
role estimation
boundary generation
segment scoring
DP decode
merge
block extraction
total
```

最適化はプロファイリング後に行う。

Phase 3.6中は、計測なしにRustへ移植しない。

---

## 20.1 決定的な重み探索

`AnalyzerWeights` と `DecoderWeights` を人手だけで調整しない。

オフラインの決定的な探索スクリプトを用意する。

```text
npm run tune:midi-weights
```

候補方式:

- small grid search
- deterministic random search
- coarse-to-fine search

必須条件:

- 乱数seedを固定
- tune setだけで最適化
- holdout setを探索中に参照しない
- synthetic、手作りfixture、実世界MIDIのカテゴリ別結果を残す
- 単一の平均値だけで最適化しない
- regression guardをhard constraintとして扱う
- 最良weightsとdataset hashとgit commitをartifactへ保存

出力例:

```text
artifacts/midi-tuning/run-config.json
artifacts/midi-tuning/candidates.jsonl
artifacts/midi-tuning/best-weights.json
artifacts/midi-tuning/holdout-report.md
```

目的関数は設定可能にする。

例:

```text
root / quality / Top-3 / boundary F1 / correction cost / block recall
```

ただし、chord-onlyや1小節2コード等の主要カテゴリを大幅悪化させる候補は採用しない。

## 20.2 中間Stageの評価解釈

Stage 1〜2の改善は、segmentationとDPを組み合わせて初めて効果が出る可能性がある。

そのため:

- 各Stageでbaselineとの差分は必ず報告する
- 横ばいまたは軽微な悪化も隠さない
- Stage 1〜2単体の総合値だけで方針を巻き戻さない
- parserの破損、決定性喪失、重大regressionは即時修正する
- 最終判断はPass 2 DP、merge、confidenceまで統合した結果で行う


# 21. 受け入れ基準

## 21.1 必須

- legacy baselineを保存できる
- hybrid-v1を同じ評価セットで測定できる
- 既存テストがすべて通る
- 同じMIDIから同じ結果が返る
- 既存保存形式を壊さない
- `npm run lint` が通る
- `npm test` が通る
- `npm run build` が通る
- `npm run tauri build` が通る

## 21.2 精度

最低条件:

- Root accuracyがbaselineより悪化しない
- Top-3 accuracyがbaselineより悪化しない
- メロディ混在カテゴリのcorrection costが改善する
- アルペジオカテゴリの取りこぼしが改善する
- 過分割率が改善する

目標:

- Over-segmentation rateをbaseline比20%以上削減
- Median correction costをbaseline比15%以上削減
- Top-3 accuracyを改善
- Save-worthy block recallを維持または改善

20%や15%は目標値であり、評価セット規模が不十分な場合は断定しない。

## 21.3 Regression guard

次のカテゴリで大幅悪化しない。

- chord-only piano
- 1小節2コード
- slash chord
- tension chord
- full-song MIDI

改善カテゴリだけで平均を上げ、単純MIDIを壊すことを禁止する。

---

# 22. 実装ステージ

各Stageを別PRまたは明確な別コミットで進める。

## Stage 0: Audit, Corpus & Baseline

対象:

- 現行解析コードの確認
- evaluation harness
- Chord Drip evaluation manifest contract
- Chord Drip synthetic corpus generatorまたはexport CLI
- 手作りsynthetic fixtures
- tune / holdout split
- legacy baseline

変更前に現在のアルゴリズムを文章と図で報告する。

## Stage 1: Note Normalization & Weighted Overlap

対象:

- sustain
- overlap
- beat strength
- register separation
- AnalyzerWeights

このStage単体でbaseline比較を行う。

## Stage 2: Track Role & Context-free Ornament Features

対象:

- TrackFeatures
- TrackRoleProfile
- drums exclusion
- melody penalty
- arpeggio integration
- passing / neighbor / approachのcontext-free特徴
- suspension / anticipation候補フラグ

このStageでは、前後コードが必要なsuspension / anticipationの最終判定を行わない。

このStage単体で比較する。

## Stage 3: Adaptive Segmentation & Cumulative Features

対象:

- BoundaryCandidate
- SegmentCandidate
- segment lattice
- branch pruning
- candidate-boundary cumulative feature tables
- prefix-sumとnaive集計の一致テスト

まだDPを入れず、候補区間の妥当性をテストする。

## Stage 4: Candidate Scoring & Top-K

対象:

- WeightedPitchProfile
- ChordTemplate分類
- ChordCandidateScore
- alternatives / evidence
- weak key prior

greedy結果を出してbaselineと比較する。

## Stage 5: Two-pass DP / Viterbi

対象:

- DAG decoder
- transition cost
- repeated chord reward
- weak beat change penalty
- Pass 1仮復号
- suspension / anticipation文脈再評価
- Pass 2本復号
- 異名同音canonicalization
- determinism

greedyとDPの両方を比較レポートへ出す。

## Stage 6: Merge & Confidence

対象:

- adjacent merge
- voicing-only merge
- ConfidenceFeatures
- high / medium / review

UIに100%を乱発しない。

## Stage 7: Product Integration & Feedback Log

対象:

- Full Timeline
- Candidate Blocks
- beat-grid comparison normalization
- repeatCount / similar block回帰修正
- preview
- copy
- save
- correction JSONL log
- local log setting / delete
- analyzerVersion
- legacy fallback

既存UIを壊さない。

## Stage 8: Deterministic Tuning, Holdout & Performance

対象:

- tune setでの決定的weights探索
- untouched holdoutでの最終評価
- synthetic / fixture / real-world別比較
- 全評価セット
- カテゴリ別比較
- 処理時間
- メモリ
- Tauri build
- 人間による実MIDI確認

---

# 23. Codex用マスタープロンプト

各Stageの冒頭に以下を付ける。

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.6を実装します。

仕様の正は docs/phase3.6-midi-chord-accuracy-work-plan.md です。
Deep Researchの原文は docs/Loop Vault MIDIコード検出精度向上の深掘り調査報告.md を参照してください。
現状はmasterと最新の作業報告書を確認してください。

## 目的
MIDIコード検出を、固定窓中心の局所判定から、
重み付き区間特徴・役割推定・可変区間・Top-K候補・DP復号を使う
決定的なsymbolic harmony pipelineへ改善する。

## 絶対に守ること

1. 評価ハーネスとbaselineなしに精度向上を主張しない。
2. MIDI解析は同じ入力から同じ結果を返す。
3. 現在時刻、乱数、ネットワークへ依存しない。
4. src/domainからReact、Zustand、Tauriをimportしない。
5. repository、applyVaultChange、autosave、backup、fileVersionを変更しない。
6. 保存済みProgression Blockを自動再解析・自動変更しない。
7. 新しい重みは設定オブジェクトへ集約する。
8. legacy analyzerを比較可能な状態で残す。
9. Rust、ONNX、Python sidecarを導入しない。
10. 調整はカテゴリ別評価結果を確認しながら行う。
11. 各Stage終了時にlint、test、buildを通す。
12. 各Stageでbaselineとの差分を報告する。
13. Chord Dripとは実行時依存せず、versioned corpus manifestで連携する。
14. segmentの加算特徴はprefix-sum / cumulative tableで取得する。
15. suspension / anticipationは決定的な2パス復号で処理する。
16. 重み調整はtune setで自動探索し、holdoutへ過学習させない。
17. 異名同音は内部でcanonicalizeし、表示綴りは復号後に決定する。
18. Stage 1〜2単体の横ばいだけで計画を中止しない。

## 作業開始前の報告

- 関連ファイル一覧
- 現在の解析フロー
- 現在のコード候補採点方法
- 現在の時間分割方法
- 今回の変更対象
- 変更しない範囲

## 作業終了時の報告

- 変更ファイル一覧
- 実装内容
- 追加テスト
- 全テスト結果
- baselineとの比較
- カテゴリ別改善・悪化
- 処理時間
- 未解決事項
- 人間が確認すべき点

精度改善が確認できなかった場合は、成功したように書かず、正直に報告してください。

コミット名:
P3.6-XX: 簡潔な作業内容
```

---

# 24. 人間側の確認項目

## Stage 0後

- Chord DripからMIDIと正解manifestを決定的に生成できるか
- 同じrecipe familyがtuneとholdoutへ漏れていないか
- 評価データの正解コードが妥当か
- acceptable alternativesが不足していないか
- baseline結果が実感と一致するか
- Chord Drip分布だけへ偏っていないか

## Stage 1〜2後

中間Stage単体では、総合精度が横ばいまたは軽微に悪化しても想定内。
決定性や単純ケースを壊していない限り、segmentationとDP統合前に方針を巻き戻さない。

次を確認する。

- アルペジオが1コードとして集まりやすくなったか
- sustainピアノが途切れないか
- 短い音を無視しすぎてテンションが消えていないか

### Stage 2固有

- メロディ混在MIDIで誤検出が減ったか
- Piano 1トラックMIDIでもコードが弱くなりすぎないか
- Bassを弱めすぎてslash chordが失われていないか

## Stage 3後

- 1小節1コードが細かく分割されないか
- 1小節2コードが候補境界に入るか
- 弱拍装飾で大量の境界ができていないか

## Stage 4後

- alternativesに納得できる候補が並ぶか
- maj7 / maj9 / 6 / 6/9が無意味に揺れていないか
- C6 / Am7/Cのような曖昧例が残るか

## Stage 5後

- コードが不自然に固定されすぎていないか
- 逆に細かく揺れていないか
- 借用和音がkey priorで消えていないか

## Stage 6後

- 同じコードのボイシング変化がまとまるか
- 本当のコードチェンジを結合していないか
- 「高」が本当に信頼できるか

## 最終

最低限、次の実MIDIで確認する。

- Chord Drip出力
- 自作FL Studioループ
- メロディ混在ピアノ
- ベース分離
- アルペジオ
- 3分程度のフルMIDI
- Neo-Soul / Jazz系テンション
- 1小節2コード

---

# 25. Phase 3.6完了後の候補

## Phase 3.6.1

- 評価セット追加
- correction logを評価fixtureへ昇格するツール
- confidence thresholdの再校正
- デバッグビュー改善
- 再生・編集UXからの追加フィードバック

## Phase 3.7

- slash chord優先順位の高度化
- rootless voicing heuristics
- maj7 / maj9 / 6 / 6/9の安定化
- m7 / m9 / m11の安定化
- altered dominant
- secondary dominant
- borrowed chord
- tonicization
- modulation tracking

## 将来研究

- learned boundary classifier
- Top-K候補のlearned re-ranker
- ONNXローカル推論
- Rust hot-path optimization

学習モデルはfull replacementではなく、既存ルール系の候補を並べ替える小さなre-rankerから検討する。

---

# 26. 最終メッセージ

Phase 3.6の目標は、あらゆるコードを完璧に命名することではない。

Loop Vaultの目的は、MIDI全体から使えるコード進行を見つけ、ユーザーが少ない修正で保存できる状態を作ることである。

そのため、最終的に重視するのは以下。

```text
ルートが大きく外れない
メロディで細かく揺れない
アルペジオを1つの和音として扱える
1小節1コードと2コードを区別できる
上位候補に正解が残る
confidenceが信用できる
修正回数が減る
保存したい進行ブロックを取りこぼさない
```

Phase 3.6によって、Loop Vaultを

**「MIDIからコード名を推測するアプリ」から、
「複雑なMIDIから、直しやすく再利用しやすいコード進行を取り出すアプリ」**

へ進化させる。
