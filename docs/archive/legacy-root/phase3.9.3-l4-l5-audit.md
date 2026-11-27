# Loop Vault Phase 3.9.3 L4 / L5 + Mix Session 開始前監査

## 1. 監査の目的と範囲

本書は `docs/phase3.9.3-l4-l5-mix-session-plan.md` §27 Stage T0 と §28 の開始前報告に対応する。記載内容は、Phase 3.9.3着手時点の実コードを確認した結果であり、計画上の予定を現行実装として扱っていない。

- 対象ブランチ: `feature/p3-9-3-l4-l5-mix-session`
- 監査時HEAD: `bf74d6ea84fb109236eebbe2c786192deee18b8b`
- 基準ブランチ: `master` / `origin/master`
- 既存テスト基準: 137ファイル、761テスト
- コード変更: なし
- Phase 3.9.3実装状況: **L4、L5、Mix Sessionはいずれも未実装**

## 2. 結論

現行Chord Dojoは、単一の保存済みコード進行をL1〜L3で練習する実装である。Step / Flowのセッション機械、MIDI判定、Voicing Resolver、Style Voicing生成、PracticeClock、Practice progressの保存経路は既に存在する。

一方、Phase 3.9.3に必要な構造化Key / mode、コード進行の移調、Key spelling、Key bag、Key coverage、L4 / L5 confirmation、複数進行Mix Sessionは存在しない。永続化型の`PracticeLevel`とZod schemaだけは1〜5を許可しているが、実際のDojoセッションと進捗更新APIはL1〜L3に限定されている。

| 領域 | 現行実装 |
|---|---|
| L1〜L3単独練習 | 実装済み |
| L4 / L5セッション | 未実装 |
| 構造化Key / harmonic mode | 未実装。`string`で保持 |
| ChordSymbolの構造化root / slash bass | 実装済み |
| ChordSymbol / 進行の移調 | 未実装 |
| Keyに応じたenharmonic spelling | 未実装 |
| Roman numeral / degree表示 | 実装済み。ただし文字列Keyを各モジュール内で個別解析 |
| Voicing Resolver | 実装済み |
| Style Voicing generator | 実装済み |
| PracticeClock | 実装済み |
| L4 / L5 coverage・別日confirmation | 未実装 |
| Mix Session | 未実装 |

## 3. Current Practice schema

### 3.1 TypeScript型

`src/domain/practice/types.ts`

```ts
export type PracticeLevel = 1 | 2 | 3 | 4 | 5;
export type DojoPracticeLevel = 1 | 2 | 3;
export type PracticeMode = "step" | "flow";
export type PracticeLeniency = "easy" | "normal" | "strict";
export type PracticeMatchState = "empty" | "partial" | "match" | "wrong";
```

`PracticeMode`は練習進行方式のStep / Flowを表す型であり、major / minorなどの音楽上のmode型ではない。

`src/domain/practice/types.ts`

```ts
export interface PracticeProvisionalClear {
  level: PracticeLevel;
  clearedAt: string;
  clearedOnLocalDate: string;
  targetTempo: number;
}

export interface ProgressionPracticeProgress {
  schemaVersion: 1;
  progressionFingerprint: string;
  confirmedLevel?: PracticeLevel;
  provisional?: PracticeProvisionalClear;
  lastPracticedAt?: string;
}
```

現行型には`transposition`、`clearedKeyPitchClasses`、`confirmationPitchClasses`がない。

### 3.2 Zod schema

`src/domain/schema.ts`

```ts
export const practiceLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const practiceProvisionalClearSchema = z
  .object({
    level: practiceLevelSchema,
    clearedAt: isoDateSchema,
    clearedOnLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    targetTempo: z.number().int().min(40).max(300),
  })
  .strict();

export const progressionPracticeProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    progressionFingerprint: z.string().min(1),
    confirmedLevel: practiceLevelSchema.optional(),
    provisional: practiceProvisionalClearSchema.optional(),
    lastPracticedAt: isoDateSchema.optional(),
  })
  .strict();
```

Zod schemaはLevel 4 / 5の数値を既に受理する。ただし`.strict()`であるため、Phase 3.9.3のoptionalフィールドをTypeScript型だけへ追加すると読み込み時に不正レコードとなる。型とschemaを同時に更新する必要がある。`fileVersion`は現行も`1`である（`src/domain/schema.ts`、`src/domain/types.ts`）。

## 4. Current L1〜L3 Level model

実セッションは`DojoPracticeLevel`を使うためL1〜L3限定である。

`src/domain/practice/types.ts`

```ts
export interface PracticeSessionState {
  blockId: string;
  progressionFingerprint: string;
  level: DojoPracticeLevel;
  mode: PracticeMode;
  leniency: PracticeLeniency;
  status: "idle" | "ready" | "running" | "paused" | "completed";
  currentEventIndex: number;
  roundNumber: number;
  roundDirty: boolean;
  consecutiveCleanFlowRounds: number;
  bpm: number;
  targetTempo: number;
  requiredAttackRevision: number;
  provisionalCandidate?: {
    state: "match" | "wrong";
    sinceMs: number;
    pitchSignature: string;
    attackRevision: number;
  };
  eventResults: Array<"pending" | "match" | "miss">;
  lastRoundWasClean?: boolean;
  lastInput?: PracticeInputSnapshot;
  lastMatch?: PracticeMatchResult;
}
```

`src/domain/practice/sessionMachine.ts`

```ts
export function createPracticeSessionState(
  input: Omit<PracticeSessionState,
    | "status"
    | "currentEventIndex"
    | "roundNumber"
    | "roundDirty"
    | "consecutiveCleanFlowRounds"
    | "requiredAttackRevision"
    | "eventResults"
  > & { eventCount: number },
): PracticeSessionState;

export function reducePracticeSession(
  state: PracticeSessionState,
  action: PracticeAction,
  context: PracticeSessionContext,
): PracticeSessionState;
```

セッション機械は純粋関数で、React、Zustand、Tauri、Tone、現在時刻、乱数を参照しない。判定器は`PracticeSessionContext.matchInput`で注入できる。

正式進捗更新もL1〜L3限定である。

`src/domain/practice/practiceProgress.ts`

```ts
export interface RecordPracticeRoundInput {
  level: DojoPracticeLevel;
  bpm: number;
  targetTempo: number;
  consecutiveCleanFlowRounds: number;
  nowIso: string;
  localDate: string;
}

export function recordPracticeRound(
  block: SavedProgressionBlock,
  input: RecordPracticeRoundInput,
): ProgressionPracticeProgress;
```

`recordPracticeRound()`はL1〜L3のtarget tempo、連続clean Flow、同日 / 別日のprovisional confirmationを処理する。Key別coverageやL4 / L5 confirmationは処理しない。

UIは`src/views/PracticeView.tsx`で`useState<DojoPracticeLevel>(1)`を持ち、L1「見て弾く」、L2「名前で弾く」、L3「度数で弾く」の3ボタンだけを表示する。`src/components/practice/PracticeKeyboard.tsx`はL1だけGuideを表示し、L2 / L3ではGuideを隠す。

## 5. Key / modeの現状

構造化された`KeySignature`、`SupportedPracticeMode`、`PracticeTargetPlan`は現行コードに定義されていない。これらはPhase 3.9.3計画書に示された提案型であり、既存実装として扱わない。T1以降で、既存の`SavedProgressionBlock`、`ChordTimelineItem`、`PracticeTargetSource`との境界に合わせて新設する。

`src/domain/types.ts`

```ts
export interface SavedProgressionBlock {
  id: string;
  origin?: "live-midi";
  confidence?: number;
  pinned?: boolean;
  sourceAssetId?: string;
  sourceFileName?: string;
  sourceFingerprint?: string;
  sourceStartBeat?: number;
  sourceEndBeat?: number;
  startBar?: number;
  endBar?: number;
  lengthBars?: number;
  summaryText: string;
  chords: ChordTimelineItem[];
  detectedKey?: string;
  bpm?: number;
  timeSignature?: string;
  memo?: string;
  tags: string[];
  suppressedAutoTags?: SuppressedAutoTag[];
  capturedAt: string;
  analyzerVersion: string;
  sourceAnalyzerVersion?: string;
  sourceWeightsVersion?: string;
  userEdited?: boolean;
  userVerified?: boolean;
  practice?: ProgressionPracticeProgress;
}
```

`SongIdea`にも`key?: string`がある（`src/domain/types.ts`）。Dojo表示は`block.detectedKey ?? selectedIdea.key`を使う（`src/views/PracticeView.tsx`）。

文字列Keyのprivate parserは少なくとも`src/domain/harmony/degrees.ts`と`src/domain/harmony/romanNumerals.ts`に別々に存在する。どちらも`C`、`C#`、`Db`、`Am`、`A minor`のようなmajor / minor表現を読むが、共通の公開Key domainではない。未検証modeを判別する共通guardもない。

## 6. ChordSymbol、slash bass、移調、spelling

### 6.1 実データ型

`src/domain/types.ts`

```ts
export interface ChordSymbol {
  root: number;
  quality: ChordQuality;
  tensions: Tension[];
  bass?: number;
  label: string;
}
```

rootとbassはpitch classの数値で、slash bassは`bass?: number`として構造化されている。quality、tensions、表示用labelも分離されている。

### 6.2 再利用可能な既存API

`src/domain/chords.ts`

```ts
export function labelFromSymbol(symbol: ChordSymbol): string;

export function parseChordLabel(label: string): ChordSymbol | null;

export function makeChordSymbol(
  root: number,
  quality: ChordQuality,
  tensions: Tension[] = [],
  bass?: number,
): ChordSymbol;

export function normalizePc(value: number): number;
```

`makeChordSymbol()`はrootとbassを0〜11へ正規化し、`labelFromSymbol()`でlabelを再生成する。`parseChordLabel()`はslash bassを構造化して読む。

### 6.3 未実装境界

- `transposeChordSymbol()`相当の関数は存在しない。
- 進行全体を元データからtarget keyへ移調する関数は存在しない。
- 保存Voicingの全noteを同じsemitone量だけ平行移動する関数は存在しない。
- `labelFromSymbol()`は固定配列`C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B`を使う。target keyごとの♯ / ♭方針を選ぶKey-aware spellingは存在しない。

したがって、slash bassをrootと同量移調できるデータ形状はあるが、その処理自体は未実装である。

## 7. Degree / Roman numeral domain

`src/domain/harmony/degrees.ts`

```ts
export interface DegreeSymbol {
  degree: number;
  accidental: -1 | 0 | 1;
  quality: ChordQuality;
  bass?: "3rd" | "5th" | "7th";
  label: string;
}

export function degreeOf(chord: ChordSymbol, key: string | undefined): DegreeSymbol | undefined;

export function degreeSequence(block: SavedProgressionBlock): string[];
```

`degreeOf()`は文字列Keyを内部解析し、major / minor別のdegreeとaccidentalを返す。slash bassはrootからのintervalが3rd / 5th / 7thの場合だけ相対位置として表す。

`src/domain/harmony/romanNumerals.ts`

```ts
export type RomanNumeralConfidence = "high" | "medium" | "low";

export interface RomanNumeralHint {
  label: string;
  detail?: string;
  confidence: RomanNumeralConfidence;
}

export function romanNumeralHint(
  chord: ChordSymbol,
  detectedKey: string | undefined,
): RomanNumeralHint | undefined;
```

`degreeOf()`と`romanNumeralHint()`は別実装で、それぞれprivateなKey parserとpitch-class表を持つ。Phase 3.9.3開始時点では、移調前後のdegree同一性を検証する共通APIはない。

## 8. Phase 3.8.5 Voicing Resolver

`src/domain/voicing/types.ts`

```ts
export interface VoicingResolveOptions {
  autoUseConfidence?: number;
}

export interface ResolvedVoicing {
  midiNotes: number[];
  origin: "practice-override" | "source-verified" | "source-auto" | "generated";
  representation?: VoicingRepresentation;
}
```

`src/domain/voicing/resolveVoicing.ts`

```ts
export function resolveVoicingForUse(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
  generatedFallback: number[],
  options: VoicingResolveOptions = {},
): ResolvedVoicing;

export function resolveTimelineVoicings(
  timeline: readonly ChordTimelineItem[],
): Record<string, readonly number[]>;
```

優先順位はpractice override、verified source、confidence条件を満たすsource、generated fallbackである。返却値は新しい`midiNotes`配列で、Resolver自体はReact / Zustand / Tauriへ依存しない。

現行Resolverはtarget key移調を行わない。Phase 3.9.3ではResolverの結果をsession-onlyで平行移動する境界が別途必要になるが、保存済み`ChordVoicingMemory`を書き換える必要はない。

## 9. Phase 3.9.2 Style generator

`src/domain/voicingPractice/types.ts`

```ts
export type VoicingStyleId =
  | "shell-17"
  | "open-17"
  | "rootless-ab";

export interface GenerateStyleVoicingOptions {
  maxLeftHandSpanSemitones: number;
  maxRightHandSpanSemitones: number;
  allowUnsupportedFallback: boolean;
}
```

`src/domain/voicingPractice/optimizeProgression.ts`

```ts
export function generateStyleVoicingPlan(
  progression: readonly SavedChordEvent[],
  styleId: "generated-close" | VoicingStyleId,
  options: GenerateStyleVoicingOptions,
): GeneratedStyleVoicingPlan;

export function optimizeCandidateGroups(
  candidateGroups: readonly StyleVoicingCandidate[][],
): StyleVoicingCandidate[];
```

generatorは入力進行から決定的に候補を作り、遷移costで進行全体を最適化する純粋domainである。現行`PracticeView`は保存済み`block.chords`を直接渡している。target keyへ移調済みのsession-only eventsを作る機構は未実装である。

Style modeでは現行も進捗保存を抑止している。`src/views/PracticeView.tsx`の`persistPendingSession()`と`persistProgress()`は`styleModeRef.current`がtrueなら保存しない。

### 9.1 SavedChordEventのidentityとtimingに関する実装判断

`src/domain/voicingPractice/types.ts`の実物は次のaliasである。

```ts
export type SavedChordEvent = ChordTimelineItem;
```

`ChordTimelineItem.eventId`はoptionalであり、timingは既存の`bar`、`beat`、`durationBeats`で保持される（`src/domain/types.ts`）。Phase 3.9.3では次の方針を採用する。

- `eventId`がある場合はその値を維持する。
- `eventId`がない場合は、`{ ideaId, blockId, eventIndex, bar, beat, durationBeats }`から決定的なsession-only fallback IDを作る。
- fallback IDを保存済みeventへ書き戻さず、移調・Style plan・Mix snapshot内だけで使う。
- 新しい`startBeat`フィールドは追加しない。既存の`bar`、`beat`、`durationBeats`を移調後もそのまま維持する。

既存コードにも`src/views/PracticeView.tsx`の`practiceEventId()`と`src/domain/voicingPractice/optimizeProgression.ts`のように、optionalな`eventId`へindex由来の決定的fallbackを与える先例がある。

## 10. PracticeClock

`src/practice/PracticeClock.ts`

```ts
export interface PracticeClockStartOptions {
  events: readonly ChordTimelineItem[];
  bpm: number;
  beatsPerBar: number;
  callbacks: PracticeClockCallbacks;
}

export function buildPracticeClockSchedule(
  events: readonly ChordTimelineItem[],
  beatsPerBar: number,
  bpm: number,
): PracticeClockSchedule;
```

```ts
export class PracticeClock {
  async start(options: PracticeClockStartOptions): Promise<void>;
  pause(): void;
  resume(): void;
  setBpm(bpm: number): void;
  stop(): void;
}
```

`buildPracticeClockSchedule()`は純粋関数である。`PracticeClock`本体は`Tone.getTransport()`で取得した共有Transportを操作し、単一進行をround単位で反復する。現行`PracticeView`はFlow開始時に`beatsPerBar: 4`を渡す。

Mixの複数進行切替、進行間1小節count-in、Progression bagは実装されていない。Mixで再利用する場合は既存Clock外側のMix coordinatorが、同時に有効な`PracticeClock`を一つに限定し、進行切替時に既存scheduleを停止してから次を開始する。これは各`PracticeClock`が同じ`Tone.getTransport()`を操作するためであり、通常練習とMixを含む複数の`PracticeClock`間のTransport競合を防ぐ。

`PlaybackController`によるコード／進行試聴はTone Transportを共有せず、`src/audio/chordPreview.ts`の`globalThis.setTimeout`で発音をscheduleする。したがってPracticeClock間のTransport競合とは分けて扱う。ただし音声の同時発音は起こり得るため、Mix coordinatorはアプリ共通の単一`PlaybackController`を使い、練習開始・進行切替・別試聴開始時に既存試聴を`stop()`してから次の再生へ進む。

## 11. Progression fingerprint

`src/domain/practice/progressionFingerprint.ts`

```ts
export function progressionFingerprint(block: SavedProgressionBlock): string;
```

fingerprintは各eventのchord key、bar、beat、durationBeatsと、`block.detectedKey`、bpm、timeSignatureからFNV-1aで生成される。`SongIdea.key`は含まれない。

Dojo表示は`block.detectedKey ?? selectedIdea.key`を使うため、Idea側Keyだけを使う進行では、Idea Key変更がfingerprintへ反映されない。L4 / L5のstale判定を実装する前に解消が必要なriskである。

## 12. Current UI

主要エントリは`src/views/PracticeView.tsx`である。現行UIには以下がある。

- 単一進行の選択
- L1 / L2 / L3選択
- Step / Flow選択
- easy / normal / strict判定
- resolved / generated-close / Style target選択
- ピアノ / エレピ試聴
- 現在 / 次 / 進行全体の表示
- MIDI接続、鍵盤visualizer、練習結果

L4 / L5 selector、Current Key、Key progress rail、manual Key選択、confirmation UI、複数選択、Mix preflight、Mix summaryは存在しない。

## 13. 保存経路

`src/store/vaultStore.ts`

```ts
updateProgressionBlock: (
  ideaId: string,
  blockId: string,
  changes: Partial<SavedProgressionBlock>,
) => boolean;
```

store内部の変更入口は次のシグネチャである。

```ts
function applyVaultChange(mutator: (vault: VaultFile) => VaultFile)
```

`updateProgressionBlock()`は`applyVaultChange()`を呼び、stateを`unsaved`にして500ms既定のdebounce後に`flush()`する。Practice UIは`updateProgressionBlock(..., { practice })`を使用しており、repositoryへ直接書いていない（`src/store/vaultStore.ts`、`src/views/PracticeView.tsx`）。

通常saveの実装は`src/domain/repository.ts`の`JsonVaultRepository.save()`で、`data.json.tmp`へ書いた後に`data.json`へrenameする。世代backupは通常saveごとには作られず、既存`data.json`を正常にloadしたときに`createStartupBackup()`が作成し、最新20世代へrotateする。Phase 3.9.3では、このtmp→renameとload時backupの既存機構を変更しない。

現行単独練習は終了時、component cleanup、app close preparationで未保存sessionを進捗へ反映する。Style modeは保存対象外である。

Phase 3.9.3で守る境界:

- L4 / L5の正式な進捗だけを既存store actionから`applyVaultChange()`へ流す。
- note入力、Step進行、dirty round、Key bag、transposed eventsは保存しない。
- Mix Sessionでは`updateProgressionBlock()`を呼ばず、`lastPracticedAt`を含めVault差分を0にする。
- repositoryを直接呼ばない。
- `fileVersion = 1`を維持する。

## 14. 変更予定ファイル

以下は現行コード監査と計画書から特定した変更予定であり、T0では変更していない。

| パス | 予定 |
|---|---|
| `src/domain/practiceTransposition/*` | canonical Key、major/minor guard、移調、spelling、Key bag、coverage、confirmation、target planの純粋domainを新設 |
| `src/domain/practiceMix/*` | preflight、Progression bag、Mix reducer、summaryの純粋domainを新設 |
| `src/domain/practice/types.ts` | L4 / L5 sessionおよびtransposition progress型を既存型へ最小追加 |
| `src/domain/practice/practiceProgress.ts` | L1〜L3の既存処理を維持しつつL4 / L5 coverage・confirmation処理を追加 |
| `src/domain/schema.ts` | optional transposition・confirmation fieldsを後方互換で追加 |
| `src/domain/practice/progressionFingerprint.ts` | effective Keyとstale境界を整合 |
| `src/views/PracticeView.tsx` | L4 / L5、Key rail、manual Key、Mix orchestrationを統合 |
| `src/components/practice/*` | L4 / L5表示、Guide非表示、Mix選択・summary UI |
| `src/components/music-keyboard/*` | L4 / L5でGuideを漏らさずlive入力だけを表示 |
| 対応する`*.test.ts(x)` | pure domain、schema後方互換、UI、非永続境界を追加 |

React / Zustand / Tauri / Tone / clockへ依存しない規律は、新設する`src/domain/practiceTransposition/*`と`src/domain/practiceMix/*`の純粋domainへ適用する。UI、store、`src/practice/PracticeClock.ts`までを同じ純粋性要件の対象とはしない。特に`src/domain/repository.ts`は配置名に`domain`を含むが、`VaultStorage`によるI/Oと注入された時計を扱う永続化境界であり、この規律の例外である。

Mix内で進行を参照する識別子は、計画例の`blockId`単独ではなく、既存の選択・更新境界に合わせて次の複合参照を採用する。

```ts
{ ideaId: string; blockId: string }
```

Mix config、snapshot、Progression bagではこの複合参照を失わない。これによりIdeaをまたいだ同一`blockId`の衝突を避け、既存`updateProgressionBlock(ideaId, blockId, ...)`と同じ所有境界を維持する。ただしMixから同store actionを呼ぶことはせず、参照用途に限定する。

## 15. Risks

1. **型とschemaの不一致**
   Practice schemaは`.strict()`である。optional field追加をTypeScriptだけに行うと保存データを読み戻せない。

2. **Keyの文字列重複解析**
   現在は共通Key型がなく、parserが複数箇所にある。既存挙動を壊さずcanonical Key境界へ接続する必要がある。

3. **fingerprintとeffective Keyの不一致**
   UIのfallback Keyとfingerprint対象が異なるため、stale progressを誤って有効扱いする可能性がある。

4. **累積移調とspelling**
   現行には移調APIがない。直前target版からの累積移調や固定音名による誤表記を避け、毎回保存済み元進行から生成する必要がある。

5. **Voicingの音域調整**
   chordごとにoctaveを変えると元のvoice-leadingが壊れる。計画どおり進行全体へ一つのoctave offsetだけを適用する必要がある。

6. **Mixから既存保存処理への流入**
   現行`PracticeView`はclose / cleanup / session終了時に進捗保存する。Mixで同じ経路を無条件再利用するとVault差分ゼロ要件に違反する。

7. **PracticeViewの責務集中**
   MIDI、Clock、再生、Style、保存、UIが一つのviewに集まっている。Key bagとMix state machineを純粋domainへ分離しないと保存guardや決定性を見落としやすい。

8. **Mix識別子**
   計画例の`blockId`単独は採用しない。既存境界に合わせ、Mix全体で`{ ideaId, blockId }`複合参照を使う。型変換時に`ideaId`を落とすと別Ideaの進行を誤参照するriskがある。

9. **拍子**
   現行Flowは4拍を直接渡す。Mix Flowは開始前preflightで全進行の4/4を確認し、黙って除外しない必要がある。

10. **L4 / L5の情報漏れ**
    現行UIはコード名とGuideを表示する前提である。L4 / L5ではtarget keyとdegree以外の正解情報を表示しない分岐が必要である。

## 16. Rollback

計画書§32のfeature rollbackと、古い実行ファイルへ戻すbinary rollbackを区別する。

### 16.1 Feature rollback

1. L4 / L5をfeature flagで非表示にする。
2. Mix Sessionを別feature flagで非表示にする。
3. 既存L1〜L3単独練習を維持する。
4. optional transposition progressは新バイナリのschemaで読み続け、機能非表示時は更新しない。
5. Mixは非永続のためmigrationを行わない。
6. transposed target eventsとfallback event IDはsession-onlyのため削除対象データを作らない。
7. `fileVersion = 1`を維持する。
8. Vault、Voicing memory、Style generatorの保存済みデータを変更しない。

### 16.2 Binary rollback / downgrade互換

Phase 3.9.3のoptional fieldを含むdata.jsonを一度保存した後は、旧バイナリのstrictな`progressionPracticeProgressSchema`が未知fieldを拒否する。このため、**旧バイナリへのdowngrade互換はない**。`fileVersion = 1`と「新バイナリが旧data.jsonを読める」後方互換は維持するが、その逆方向を保証するものではない。

binary rollbackが必要な場合は、Phase 3.9.3 fieldが書き込まれる前のbackupを旧バイナリでrestoreするか、新バイナリ側で当該optional fieldを除去したexportを明示的に用意する必要がある。通常のfeature flag無効化だけなら保存済みoptional fieldを残したまま新バイナリを使う。

## 17. BaselineとT0完了条件

監査開始時の基準は以下である。

- `npm test -- --run`: 137ファイル、761テスト成功
- L1〜L3回帰基準: 既存テストを1件も落とさない
- L4 / L5: 未実装
- Mix Session: 未実装
- Phase 3.9.3によるソースコード変更: なし

T0成果物は次の2ファイルだけである。

- `docs/phase3.9.3-l4-l5-mix-session-plan.md`
- `docs/phase3.9.3-l4-l5-audit.md`
