import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { cwd, stdout } from "node:process";
import { parseChordLabel } from "../src/domain/chords";
import { analyzeMidi } from "../src/domain/midi/analysis";
import {
  operationCorrectionCostResult,
  summarizeOperationCorrectionCosts,
} from "../src/domain/midi/correctionCost";
import {
  aggregateV2,
  evaluateCaseV2,
} from "../src/domain/midi/evaluation/metricsV2";
import {
  adaptChordDripManifest,
  type ChordDripCorpusManifest,
} from "../src/domain/midi/evaluation/manifest";
import type {
  EvaluationCaseInput,
  MidiEvaluationCase,
  MidiEvaluationCategory,
} from "../src/domain/midi/evaluation/types";
import type {
  MidiAnalyzerMode,
} from "../src/domain/midi/types";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  filterRelativeSupportMelodyContamination,
} from "../src/domain/voicing/relativeSupportMelodyFilter";
import {
  loadHarmonySupportManifest,
} from "./phase442/harmonySupportCorpus";
import {
  aggregateSupportRows,
  evaluateSupportSplit,
  type ShadowFilter,
} from "./phase442/supportEvaluation";

const root = cwd();
const outputDir = resolve(root, "docs/phase5");
const modes: ReadonlyArray<{
  id: string;
  mode: MidiAnalyzerMode;
  bassCompanion: boolean;
}> = [
  { id: "legacy", mode: "legacy", bassCompanion: false },
  { id: "legacy-boundary-rerank", mode: "legacy-boundary-rerank", bassCompanion: false },
  { id: "voice-aware-rerank-v1", mode: "voice-aware-rerank-v1", bassCompanion: false },
  { id: "hybrid-v1", mode: "hybrid-v1", bassCompanion: false },
  { id: "phase4-v1", mode: "phase4-v1", bassCompanion: false },
  { id: "phase4-v1+R1", mode: "phase4-v1", bassCompanion: true },
];

const corpora = await loadCorpora();
const corpusResults = [];
for (const corpus of corpora) {
  stdout.write(`Evaluating ${corpus.id}: ${corpus.cases.length} files\n`);
  corpusResults.push({
    id: corpus.id,
    sourceKind: corpus.sourceKind,
    caseCount: corpus.cases.length,
    eventCount: corpus.cases.reduce(
      (sum, input) => sum + input.definition.expected.chordTimeline.length,
      0,
    ),
    modes: await evaluateModes(corpus.cases),
  });
}

const r2 = await evaluateR2();
const realMidi = await evaluateRealMidi();
const phase4Rows = corpusResults.map((corpus) => ({
  corpus: corpus.id,
  phase4: corpus.modes.find((entry) => entry.id === "phase4-v1")!,
  hybrid: corpus.modes.find((entry) => entry.id === "hybrid-v1")!,
  r1: corpus.modes.find((entry) => entry.id === "phase4-v1+R1")!,
}));
const hybridImprovement = phase4Rows.filter(({ phase4, hybrid }) =>
  hybrid.canonicalExact > phase4.canonicalExact
  || hybrid.top3Canonical > phase4.top3Canonical
  || hybrid.candidateRecall > phase4.candidateRecall
  || hybrid.correctionCostMean < phase4.correctionCostMean
  || hybrid.manualInputRate < phase4.manualInputRate);
const r1Improvement = phase4Rows.filter(({ phase4, r1 }) =>
  r1.candidateRecall > phase4.candidateRecall
  || r1.correctionCostMean < phase4.correctionCostMean
  || r1.manualInputRate < phase4.manualInputRate);
const overTenSeconds = realMidi.flatMap((file) =>
  file.modes.filter((entry) => file.estimatedDurationSeconds >= 120
    && file.estimatedDurationSeconds <= 300
    && entry.runtimeMs > 10_000)
    .map((entry) => `${file.alias}/${entry.id}`));
const hybridRuntimeStopped = overTenSeconds.some((entry) =>
  entry.endsWith("/hybrid-v1"));

const report = {
  schemaVersion: 1,
  phase: "5-accuracy-first",
  generatedAt: new Date().toISOString(),
  policy: {
    priority: [
      "manual-correction-count",
      "manual-input-rate",
      "rank1-adoption",
      "candidate-recall",
      "user-rejection-rate",
    ],
    runtimeIsGate: false,
    typicalThreeMinuteStopThresholdMs: 10_000,
  },
  corpora: corpusResults,
  r2VoicingFilter: r2,
  realMidi,
  decisions: {
    hybridBeatsPhase4OnAtLeastOneCorpus: hybridImprovement.length > 0,
    hybridImprovementCorpora: hybridImprovement.map((entry) => entry.corpus),
    r1ImprovesAtLeastOneCorpus: r1Improvement.length > 0,
    r1ImprovementCorpora: r1Improvement.map((entry) => entry.corpus),
    r2ImprovesAtLeastOneSplit: r2.splits.some((entry) =>
      entry.candidate.voicingExactRate > entry.baseline.voicingExactRate
      || entry.candidate.noteF1 > entry.baseline.noteF1
      || (entry.candidate.melodyLeakRate ?? 1) < (entry.baseline.melodyLeakRate ?? 1)),
    typicalThreeMinuteOverTenSeconds: overTenSeconds,
    hybridAdoptionStage: hybridRuntimeStopped
      ? "stopped-typical-midi-over-10s"
      : hybridImprovement.length > 0
        ? "eligible-for-feature-flag"
        : "not-selected-no-accuracy-gain",
    candidateUnionStage: hybridRuntimeStopped
      ? "not-started-dependent-hybrid-stage-stopped"
      : "not-started-proposal-follow-up",
    twoWeekPersonalUse: "pending-user-evaluation",
    defaultAnalyzerModeChanged: false,
  },
  safety: {
    vaultSchemaChanged: false,
    fileVersionChanged: false,
    savedProgressionsRewritten: false,
    liveMidiPathChanged: false,
    chordDojoPathChanged: false,
    privateMidiEmbedded: false,
    absolutePathsEmbedded: false,
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  resolve(outputDir, "00-accuracy-first-evaluation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(outputDir, "00-accuracy-first-evaluation.md"),
  markdown(report),
  "utf8",
);
stdout.write(`Wrote Phase 5 evaluation: ${corpusResults.length} corpora, ${realMidi.length} real MIDI files\n`);

async function loadCorpora(): Promise<Array<{
  id: string;
  sourceKind: string;
  cases: EvaluationCaseInput[];
}>> {
  const chordDripRoot = resolve(root, "docs/loop-vault-evaluation-corpus");
  const chordDripManifest = await readJson<ChordDripCorpusManifest>(
    resolve(chordDripRoot, "manifest.json"),
  );
  const chordDrip = await loadCases(
    chordDripRoot,
    adaptChordDripManifest(chordDripManifest),
  );

  const chapterRoot = await firstExisting([
    resolve(root, ".local-evaluation/chapter3-seed"),
    resolve(root, "test/loop-vault-chapter3-seed"),
  ]);
  const chapterManifest = await readJson<{
    cases: SeedCase[];
  }>(resolve(chapterRoot, "manifest.json"));
  const chapter = await loadCases(
    chapterRoot,
    chapterManifest.cases.map(adaptSeedCase),
  );

  const labelRoot = resolve(root, "test/loop-vault-voicing-gold-corpus-v1");
  const labelManifest = await readJson<LabelCorpusManifest>(
    resolve(labelRoot, "manifest.json"),
  );
  const labelDev = await loadCases(
    labelRoot,
    labelManifest.files.filter((file) => file.split === "dev").map((file) =>
      adaptGoldFile(file, "phase4.5-label-dev")),
  );

  const phase47Root = resolve(
    root,
    ".local-evaluation/loop-vault-bass-companion-identity-gold-v1",
  );
  const phase47Manifest = await readJson<Phase47Manifest>(
    resolve(phase47Root, "manifest.json"),
  );
  const phase47 = await loadCases(
    phase47Root,
    phase47Manifest.files.map((file) => adaptGoldFile(file, "phase4.7-gold")),
  );

  return [
    { id: "chord-drip-100", sourceKind: "synthetic-labeled", cases: chordDrip },
    { id: "chapter3-seed-100", sourceKind: "hand-annotated-local", cases: chapter },
    { id: "phase4.5-label-dev", sourceKind: "synthetic-label-dev", cases: labelDev },
    { id: "phase4.7-gold", sourceKind: "fixed-bass-identity-gold", cases: phase47 },
  ];
}

async function evaluateModes(cases: readonly EvaluationCaseInput[]) {
  const output = [];
  for (const mode of modes) {
    const caseMetrics = [];
    const costs = [];
    const runtimes = [];
    let analyzerVersion = "";
    for (const input of cases) {
      const started = performance.now();
      const analysis = analyzeMidi(input.bytes, {
        mode: mode.mode,
        accuracyFirst: {
          bassCompanionCandidates: mode.bassCompanion,
          melodyContaminationFilter: false,
        },
      });
      runtimes.push(performance.now() - started);
      analyzerVersion ||= analysis.analyzerVersion;
      caseMetrics.push(evaluateCaseV2(input.definition, analysis.fullTimeline));
      costs.push(...correctionCosts(input.definition, analysis.fullTimeline));
    }
    const aggregate = aggregateV2(caseMetrics).eventWeighted;
    const correction = summarizeOperationCorrectionCosts(costs);
    output.push({
      id: mode.id,
      analyzerVersion,
      canonicalExact: aggregate.canonicalExactAccuracy,
      rank1Adoption: aggregate.canonicalExactAccuracy,
      top3Canonical: aggregate.top3CanonicalAccuracy,
      candidateRecall: aggregate.top5CanonicalAccuracy,
      rootAccuracy: aggregate.rootAccuracy,
      qualityAccuracy: aggregate.qualityAccuracy,
      correctionCostTotal: correction.total,
      correctionCostMean: correction.mean,
      manualInputRate: ratio(
        correction.byCategory["manual-input"] + correction.byCategory.unrepresentable,
        correction.segmentCount,
      ),
      runtimeMs: rounded(sum(runtimes)),
      runtimePerFileP50Ms: percentile(runtimes, 0.5),
      runtimePerFileP90Ms: percentile(runtimes, 0.9),
    });
  }
  return output;
}

async function evaluateR2() {
  const corpusDir = resolve(root, "test/loop-vault-voicing-harmony-support-gold-v1");
  const manifest = await loadHarmonySupportManifest(corpusDir);
  const passthrough: ShadowFilter = (input) => ({
    notes: [...input.notes],
    removed: [],
  });
  const r2Filter: ShadowFilter = (input, ids) => {
    const result = filterRelativeSupportMelodyContamination(input, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.25,
      minimumSupportBeats: 0.2,
    });
    return {
      notes: result.notes,
      removed: result.removed,
      evidenceByNoteId: Object.fromEntries([...result.evidenceByNote.entries()].map(
        ([note, evidence]) => [ids.get(note) ?? "missing-id", evidence],
      )),
    };
  };
  const splits = [];
  for (const split of ["dev", "validation", "holdout"] as const) {
    const baselineRows = await evaluateSupportSplit(corpusDir, manifest, split, passthrough);
    const candidateRows = await evaluateSupportSplit(corpusDir, manifest, split, r2Filter);
    splits.push({
      split,
      baseline: aggregateSupportRows(baselineRows),
      candidate: aggregateSupportRows(candidateRows),
    });
  }
  return {
    corpus: "phase4.4.2-harmony-support-gold",
    options: {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.25,
      minimumSupportBeats: 0.2,
    },
    splits,
  };
}

async function evaluateRealMidi() {
  const files = [
    { alias: "all-instruments", path: ".local-evaluation/midi/all_instruments.mid" },
    { alias: "captured-chorus", path: ".local-evaluation/midi/chord サビ.mid" },
    { alias: "suran-remix", path: ".local-evaluation/phase4.1/fixtures/suran-remix.mid" },
    { alias: "endless", path: ".local-evaluation/phase4.1.1/fixtures/endless.mid" },
  ];
  const available = [];
  for (const file of files) {
    const path = resolve(root, file.path);
    if (!(await exists(path))) continue;
    const bytes = new Uint8Array(await readFile(path));
    const modeRows = [];
    let firstBars = 0;
    let durationSeconds = 0;
    for (const mode of modes) {
      const started = performance.now();
      const analysis = analyzeMidi(bytes, {
        mode: mode.mode,
        accuracyFirst: {
          bassCompanionCandidates: mode.bassCompanion,
          melodyContaminationFilter: false,
        },
      });
      const elapsed = performance.now() - started;
      const repeated = analyzeMidi(bytes, {
        mode: mode.mode,
        accuracyFirst: {
          bassCompanionCandidates: mode.bassCompanion,
          melodyContaminationFilter: false,
        },
      });
      firstBars ||= analysis.totalBars;
      durationSeconds ||= analysis.totalBars * meter(analysis.timeSignature)
        * 60 / (analysis.bpm ?? 120);
      modeRows.push({
        id: mode.id,
        runtimeMs: rounded(elapsed),
        timelineSegments: analysis.fullTimeline.length,
        blockCandidates: analysis.blockCandidates.length,
        deterministic: JSON.stringify(analysis) === JSON.stringify(repeated),
      });
    }
    available.push({
      alias: file.alias,
      byteLength: bytes.byteLength,
      totalBars: firstBars,
      estimatedDurationSeconds: rounded(durationSeconds),
      modes: modeRows,
    });
  }
  return available;
}

function correctionCosts(
  definition: MidiEvaluationCase,
  timeline: readonly ChordTimelineItem[],
) {
  const ranges = timeline.map((item) => {
    const startBeat = (item.bar - 1) * 4 + item.beat - 1;
    return { startBeat, endBeat: startBeat + item.durationBeats, item };
  });
  return definition.expected.chordTimeline.map((expected) => {
    const best = ranges.map((entry) => ({
      entry,
      overlap: Math.max(
        0,
        Math.min(expected.endBeat, entry.endBeat) - Math.max(expected.startBeat, entry.startBeat),
      ),
    })).sort((left, right) => right.overlap - left.overlap
      || left.entry.startBeat - right.entry.startBeat)[0];
    const match = best?.overlap ? best.entry.item : undefined;
    return operationCorrectionCostResult(
      match
        ? {
            primary: match.chord,
            alternatives: match.alternatives.map((entry) => entry.chord),
          }
        : undefined,
      [expected.primary, ...(expected.acceptableAlternatives ?? [])],
    );
  });
}

interface SeedCase {
  id: string;
  title: string;
  midiPath: string;
  category?: string[];
  difficulty?: string;
  expected: {
    chordTimeline: Array<{
      startBeat: number;
      endBeat: number;
      primary: string;
      acceptableAlternatives?: string[];
    }>;
  };
}

interface GoldEvent {
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  acceptableAlternatives?: string[];
}

interface GoldFile {
  fileId: string;
  path: string;
  split: string;
  events: GoldEvent[];
}

interface LabelCorpusManifest {
  files: GoldFile[];
}

interface Phase47Manifest {
  files: GoldFile[];
}

function adaptSeedCase(seed: SeedCase): MidiEvaluationCase {
  return {
    id: seed.id,
    title: seed.title,
    midiPath: seed.midiPath,
    recipeFamily: "chapter3-seed",
    split: "holdout",
    category: category(seed.category),
    difficulty: difficulty(seed.difficulty),
    expected: {
      chordTimeline: seed.expected.chordTimeline.map((segment) =>
        expectedSegment(segment.primary, segment.startBeat, segment.endBeat, segment.acceptableAlternatives)),
    },
  };
}

function adaptGoldFile(file: GoldFile, family: string): MidiEvaluationCase {
  return {
    id: file.fileId,
    title: file.fileId,
    midiPath: file.path,
    recipeFamily: family,
    split: file.split === "dev" ? "tune" : "holdout",
    category: ["chord-only"],
    difficulty: "hard",
    expected: {
      chordTimeline: file.events.map((event) =>
        expectedSegment(
          event.chordSymbol,
          event.startBeat,
          event.endBeat,
          event.acceptableAlternatives,
        )),
    },
  };
}

function expectedSegment(
  primary: string,
  startBeat: number,
  endBeat: number,
  acceptableAlternatives?: string[],
) {
  const parsed = parseChordLabel(primary);
  return {
    startBeat,
    endBeat,
    primary,
    root: parsed?.root ?? 0,
    quality: parsed?.quality ?? "maj" as const,
    ...(parsed?.bass === undefined ? {} : { bass: parsed.bass }),
    ...(acceptableAlternatives?.length ? { acceptableAlternatives } : {}),
  };
}

async function loadCases(rootDir: string, definitions: MidiEvaluationCase[]) {
  return Promise.all(definitions.map(async (definition) => ({
    definition,
    bytes: new Uint8Array(await readFile(resolve(rootDir, definition.midiPath))),
  })));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) if (await exists(path)) return path;
  throw new Error("Required local evaluation corpus is unavailable.");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function category(values: string[] | undefined): MidiEvaluationCategory[] {
  const known = new Set<MidiEvaluationCategory>([
    "chord-only", "melody-mixed", "bass-separated", "no-bass", "arpeggio",
    "pad", "slash-chord", "tension", "rootless", "ornament-heavy",
    "pedal-point", "two-chords-per-bar", "modulation", "full-song",
    "chord-drip", "fl-studio",
  ]);
  const filtered = (values ?? []).filter(
    (value): value is MidiEvaluationCategory => known.has(value as MidiEvaluationCategory),
  );
  return filtered.length ? filtered : ["chord-only"];
}

function difficulty(value: string | undefined): "easy" | "medium" | "hard" {
  return value === "easy" || value === "hard" ? value : "medium";
}

function meter(value: string | undefined): number {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? "4/4");
  return match ? Number(match[1]) * (4 / Number(match[2])) : 4;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : Number((value / total).toFixed(6));
}

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return rounded(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function markdown(value: typeof report): string {
  const corpusSections = value.corpora.map((corpus) => `### ${corpus.id}

${corpus.caseCount} files / ${corpus.eventCount} annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
${corpus.modes.map((mode) =>
    `| ${mode.id} | ${pct(mode.rank1Adoption)} | ${pct(mode.top3Canonical)} | ${pct(mode.candidateRecall)} | ${mode.correctionCostMean.toFixed(3)} | ${pct(mode.manualInputRate)} | ${mode.runtimeMs.toFixed(1)}ms |`,
  ).join("\n")}`).join("\n\n");
  const r2Rows = value.r2VoicingFilter.splits.map((split) =>
    `| ${split.split} | ${pct(split.baseline.voicingExactRate ?? 0)} | ${pct(split.candidate.voicingExactRate ?? 0)} | ${pct(split.baseline.noteF1)} | ${pct(split.candidate.noteF1)} | ${pct(split.baseline.melodyLeakRate ?? 0)} | ${pct(split.candidate.melodyLeakRate ?? 0)} |`,
  ).join("\n");
  const realRows = value.realMidi.flatMap((file) => file.modes.map((mode) =>
    `| ${file.alias} | ${file.totalBars} | ${file.estimatedDurationSeconds.toFixed(1)}s | ${mode.id} | ${mode.runtimeMs.toFixed(1)}ms | ${mode.timelineSegments} | ${mode.blockCandidates} | ${mode.deterministic ? "PASS" : "FAIL"} |`,
  )).join("\n");
  return `# Phase 5 Accuracy First 評価

## 結論

- Hybridがphase4-v1を1つ以上のCorpusで上回る: **${value.decisions.hybridBeatsPhase4OnAtLeastOneCorpus ? "YES" : "NO"}** (${value.decisions.hybridImprovementCorpora.join(", ") || "なし"})
- R1が1つ以上のCorpusで改善: **${value.decisions.r1ImprovesAtLeastOneCorpus ? "YES" : "NO"}** (${value.decisions.r1ImprovementCorpora.join(", ") || "なし"})
- R2が1つ以上のsplitで改善: **${value.decisions.r2ImprovesAtLeastOneSplit ? "YES" : "NO"}**
- 一般的な約3分MIDIで10秒超過: **${value.decisions.typicalThreeMinuteOverTenSeconds.length ? value.decisions.typicalThreeMinuteOverTenSeconds.join(", ") : "なし"}**
- Hybrid採用Stage: **${value.decisions.hybridAdoptionStage}**
- Candidate union Stage: **${value.decisions.candidateUnionStage}**
- 2週間の本人利用: **未完了（ユーザー確認が必要）**
- defaultAnalyzerMode: **変更なし（phase4-v1）**

解析速度は記録のみとし、Rank 1、Candidate Recall、Correction Cost、Manual input率を優先して比較した。

## 全モード精度

${corpusSections}

## R2 ボイシング混入フィルタ

保守版A1（minimumSupportBeats=0.2）だけを評価した。A1-primeは使用していない。

| Split | Exact before | Exact R2 | F1 before | F1 R2 | Melody leak before | Melody leak R2 |
|---|---:|---:|---:|---:|---:|---:|
${r2Rows}

## 実MIDI性能・決定性

実MIDI本体、絶対パス、解析内容は成果物へ保存していない。

| File alias | Bars | Estimated duration | Mode | Runtime | Timeline | Blocks | Deterministic |
|---|---:|---:|---|---:|---:|---:|---|
${realRows}

## 安全性

- Vault schema / fileVersion: 変更なし
- 保存済み進行の再解析・自動書換え: なし
- Live MIDI / Chord Dojo経路: 変更なし
- private MIDI / 絶対パス: 成果物へ未収録

## 指標の意味

- Rank 1: 保存前の主コードがcanonical identityで正解
- Top-3: 主コードと先頭2候補内に正解
- Candidate Recall: Productが表示可能な先頭5候補内に正解
- Correction mean: 候補選択1、構造編集2、手入力3、表現不能4の平均
- Manual input: 手入力または表現不能が必要なイベント率
`;
}
