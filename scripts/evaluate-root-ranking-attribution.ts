import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { normalizeChordLabel, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { bassEvidence, rootEvidence, shadowDiagnostics } from "../src/domain/midi/shadowEvidence";
import { looksLikeWalkingBass, type TimedObservedNote, type WalkingObservation } from "../src/domain/midi/walkingBassShadow";
import type { MidiAnalyzerMode, TrackRole } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Stage F2A: which term is costing the right root its place?
 *
 * Stage F2W established that the answer is always among the candidates with a
 * positive score — it is outranked, not absent. So the question is now narrow
 * and answerable: for each window where the gold root is not first, which of the
 * seven scoring terms gives the winner its lead?
 *
 * Attribution is per term and per window. Nothing is aggregated before the blame
 * is assigned, because a mean over terms would hide the case this exists to find:
 * one term losing badly and consistently looks the same, in the average, as
 * seven terms each losing slightly.
 *
 * The primary subset is the corpus's own annotation. Stage F1's `relation` is
 * measured against it as a classifier rather than used to select windows —
 * F2W found the three definitions of "walking" agree on four windows out of
 * five hundred, so which one is used decides the answer.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/05-f2a-results.json");

/** The same weights Stage F2 uses. Not refitted; F2A explains, it does not tune. */
const TERM_WEIGHTS = {
  rootPresence: 0.30,
  tertianSkeleton: 0.24,
  susSkeleton: 0.10,
  shellSkeleton: 0.14,
  guideToneImplication: 0.12,
  keyPrior: 0.05,
  continuity: 0.05,
} as const;

type TermName = keyof typeof TERM_WEIGHTS;
const TERM_NAMES = Object.keys(TERM_WEIGHTS) as TermName[];

function beatsPerBarOf(timeSignature: string | undefined): number {
  if (!timeSignature) return 4;
  const [beats] = timeSignature.split("/").map(Number);
  return Number.isFinite(beats) && beats > 0 ? beats : 4;
}

function timedNotesIn(
  song: ReturnType<typeof parseMidi>,
  roles: Map<number, TrackRole>,
  startBeat: number,
  endBeat: number,
): TimedObservedNote[] {
  const ticksPerBeat = song.ticksPerBeat;
  const startTick = startBeat * ticksPerBeat;
  const endTick = endBeat * ticksPerBeat;
  const observed: TimedObservedNote[] = [];
  for (const note of song.notes) {
    const role = roles.get(note.trackIndex) ?? "mixed";
    if (role === "percussion") continue;
    const noteEnd = note.startTick + note.durationTick;
    if (note.startTick >= endTick || noteEnd <= startTick) continue;
    const overlap = Math.min(noteEnd, endTick) - Math.max(note.startTick, startTick);
    if (overlap <= 0) continue;
    observed.push({
      pitch: note.pitch,
      weight: overlap / ticksPerBeat,
      role,
      onsetBeat: Math.max(0, (note.startTick - startTick) / ticksPerBeat),
    });
  }
  return observed;
}

interface CorpusFile {
  source: string;
  path: string;
  split: string;
  variant: string;
  /** The corpus's own annotation. The primary subset, and never inferred. */
  declaredWalking: boolean;
  goldByPosition: Map<string, number>;
}

async function loadCorpus(): Promise<CorpusFile[]> {
  const files: CorpusFile[] = [];
  for (const corpus of [
    { path: ".local-evaluation/synthetic-gold-v1", name: "synthetic-gold-v1" },
    { path: ".local-evaluation/long-form-v1.1", name: "long-form-v1.1" },
    { path: ".local-evaluation/holdout-v3", name: "regression-v3" },
  ]) {
    let manifest: {
      scenarios: Array<{
        scenarioId: string;
        title: string;
        stressFeatures?: string[];
        variants: Array<{
          fileName: string;
          variant: string;
          events: Array<{ startBar: number; startBeatInBar: number; primary: string }>;
        }>;
      }>;
    };
    try {
      manifest = JSON.parse(await readFile(resolve(cwd(), corpus.path, "manifest.json"), "utf8"));
    } catch { continue; }

    // regression-v3 has no splits file; it is a held-out set in its entirety.
    const splitOf = await (async () => {
      try {
        const splits = JSON.parse(
          await readFile(resolve(cwd(), corpus.path, "splits.json"), "utf8"),
        ) as Record<string, string[]>;
        return new Map<string, string>(
          Object.entries(splits).flatMap(
            ([split, names]) => names.map((name): [string, string] => [name, split]),
          ),
        );
      } catch {
        return new Map<string, string>();
      }
    })();

    for (const scenario of manifest.scenarios) {
      // The annotation, read from the scenario's declared stress features. Not
      // from the scenario id, and not from the notes.
      const declaredWalking = (scenario.stressFeatures ?? []).includes("walking-bass");
      for (const variant of scenario.variants) {
        const goldByPosition = new Map<string, number>();
        for (const event of variant.events) {
          const parsed = parseGoldLabel(event.primary) as NormalizedChordIdentity | null;
          if (!parsed || parsed.noChord) continue;
          goldByPosition.set(`${event.startBar}.${event.startBeatInBar}`, parsed.rootPitchClass);
        }
        files.push({
          source: `${corpus.name}:${scenario.scenarioId}_${variant.variant}`,
          path: resolve(cwd(), corpus.path, "midi", variant.fileName),
          split: splitOf.get(variant.fileName) ?? (corpus.name === "regression-v3" ? "regression-v3" : "dev"),
          variant: variant.variant,
          declaredWalking,
          goldByPosition,
        });
      }
    }
  }
  return files;
}

interface WindowRecord {
  source: string;
  split: string;
  variant: string;
  bar: number;
  beat: number;
  goldRoot: number;
  productRoot: number | null;
  productCorrect: boolean;
  shadowTop5: number[];
  goldRank: number;
  goldScore: number;
  topScore: number;
  goldTerms: Record<TermName, number>;
  topTerms: Record<TermName, number>;
  /** Weighted advantage the winner has over the gold root, per term. */
  termDelta: Record<TermName, number>;
  dominantBlame: TermName | null;
  bassTop1: number;
  bassMargin: number;
  bassEvidenceAmount: number;
  relation: string;
  /** Semitones from the gold root to the wrong winner. Generic, not a chord name. */
  wrongTop1Interval: number | null;
}

const records: WindowRecord[] = [];
const classifier = {
  declaredWindows: 0,
  relationWalking: 0,
  acousticWalking: 0,
  relationTruePositive: 0,
  relationFalsePositive: 0,
  relationFalseNegative: 0,
  relationAgreement: 0,
  acousticAgreement: 0,
  totalWindows: 0,
};

const corpus = await loadCorpus();

for (const file of corpus) {
  const bytes = new Uint8Array(await readFile(file.path));
  const analysis = analyzeMidi(bytes, { mode });
  const song = parseMidi(bytes);
  const roles = inferTrackRoles(song, detectExtractionProfile(song));
  const beatsPerBar = beatsPerBarOf(analysis.timeSignature);
  let previousShadowRoot: number | undefined;

  for (const item of analysis.fullTimeline) {
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const timedNotes = timedNotesIn(song, roles, startBeat, startBeat + item.durationBeats);
    const observation: WalkingObservation = {
      timedNotes,
      notes: timedNotes.map((note) => ({ pitch: note.pitch, weight: note.weight, role: note.role })),
      windowBeats: item.durationBeats,
      beatsPerBar,
    };

    const context = previousShadowRoot === undefined ? {} : { previousRoot: previousShadowRoot };
    const evidence = rootEvidence(observation, context);
    const combined = Array.from({ length: 12 }, (_unused, pitchClass) => TERM_NAMES.reduce(
      (sum, term) => sum + TERM_WEIGHTS[term] * evidence[term][pitchClass], 0,
    ));
    const ranked = combined
      .map((score, pitchClass) => ({ pitchClass, score }))
      .sort((left, right) => right.score - left.score || left.pitchClass - right.pitchClass);
    previousShadowRoot = ranked[0].pitchClass;

    const relation = shadowDiagnostics(observation, context).relation.relation;
    const acoustic = looksLikeWalkingBass(observation);

    classifier.totalWindows += 1;
    if (file.declaredWalking) classifier.declaredWindows += 1;
    if (relation === "walking") classifier.relationWalking += 1;
    if (acoustic) classifier.acousticWalking += 1;
    if (file.declaredWalking && relation === "walking") classifier.relationTruePositive += 1;
    if (!file.declaredWalking && relation === "walking") classifier.relationFalsePositive += 1;
    if (file.declaredWalking && relation !== "walking") classifier.relationFalseNegative += 1;
    if (file.declaredWalking === (relation === "walking")) classifier.relationAgreement += 1;
    if (file.declaredWalking === acoustic) classifier.acousticAgreement += 1;

    if (!file.declaredWalking) continue;
    const goldRoot = file.goldByPosition.get(`${item.bar}.${item.beat}`);
    if (goldRoot === undefined) continue;

    const goldRank = ranked.findIndex((candidate) => candidate.pitchClass === goldRoot) + 1;
    const winner = ranked[0];
    const identity = normalizeChordLabel(item.chord.label);
    const productRoot = identity && !identity.noChord ? identity.rootPitchClass : null;

    const termsFor = (pitchClass: number) => Object.fromEntries(
      TERM_NAMES.map((term) => [term, Number((TERM_WEIGHTS[term] * evidence[term][pitchClass]).toFixed(6))]),
    ) as Record<TermName, number>;
    const goldTerms = termsFor(goldRoot);
    const topTerms = termsFor(winner.pitchClass);
    const termDelta = Object.fromEntries(
      TERM_NAMES.map((term) => [term, Number((topTerms[term] - goldTerms[term]).toFixed(6))]),
    ) as Record<TermName, number>;

    // The term that gives the winner the most of its lead. Only meaningful when
    // the gold root actually lost.
    const dominantBlame = goldRank === 1
      ? null
      : TERM_NAMES.reduce<TermName | null>((worst, term) => (
        termDelta[term] > 0 && (worst === null || termDelta[term] > termDelta[worst]) ? term : worst
      ), null);

    const bass = bassEvidence(observation);
    records.push({
      source: file.source,
      split: file.split,
      variant: file.variant,
      bar: item.bar,
      beat: item.beat,
      goldRoot,
      productRoot,
      productCorrect: productRoot === goldRoot,
      shadowTop5: ranked.slice(0, 5).map((candidate) => candidate.pitchClass),
      goldRank,
      goldScore: Number(combined[goldRoot].toFixed(6)),
      topScore: Number(winner.score.toFixed(6)),
      goldTerms,
      topTerms,
      termDelta,
      dominantBlame,
      bassTop1: bass.top3[0]?.pitchClass ?? -1,
      bassMargin: bass.margin,
      bassEvidenceAmount: bass.evidenceAmount,
      relation,
      wrongTop1Interval: goldRank === 1 ? null : ((winner.pitchClass - goldRoot + 12) % 12),
    });
  }
}

// --- Aggregation ------------------------------------------------------------

function summarise(rows: readonly WindowRecord[]) {
  if (rows.length === 0) return null;
  const lost = rows.filter((row) => row.goldRank > 1);
  const blame: Record<string, number> = {};
  const intervals: Record<string, number> = {};
  const termLossShare: Record<TermName, number> = Object.fromEntries(
    TERM_NAMES.map((term) => [term, 0]),
  ) as Record<TermName, number>;

  for (const row of lost) {
    if (row.dominantBlame) blame[row.dominantBlame] = (blame[row.dominantBlame] ?? 0) + 1;
    if (row.wrongTop1Interval !== null) {
      intervals[String(row.wrongTop1Interval)] = (intervals[String(row.wrongTop1Interval)] ?? 0) + 1;
    }
    // Every term that contributed any of the winner's lead, so a loss spread
    // across several terms is visible as such rather than credited to one.
    for (const term of TERM_NAMES) if (row.termDelta[term] > 0) termLossShare[term] += 1;
  }

  const ranks = rows.map((row) => row.goldRank);
  const dominant = Object.entries(blame).sort((left, right) => right[1] - left[1])[0];

  return {
    windows: rows.length,
    productCorrect: rows.filter((row) => row.productCorrect).length,
    goldRootMeanRank: Number((ranks.reduce((sum, value) => sum + value, 0) / ranks.length).toFixed(4)),
    goldRootMedianRank: [...ranks].sort((left, right) => left - right)[Math.floor(ranks.length / 2)],
    top1: Number((rows.filter((row) => row.goldRank === 1).length / rows.length).toFixed(6)),
    top3: Number((rows.filter((row) => row.goldRank <= 3).length / rows.length).toFixed(6)),
    top5: Number((rows.filter((row) => row.goldRank <= 5).length / rows.length).toFixed(6)),
    lostWindows: lost.length,
    dominantFailureComponent: dominant ? { term: dominant[0], windows: dominant[1], share: Number((dominant[1] / lost.length).toFixed(6)) } : null,
    dominantBlameCounts: blame,
    termLossShare: Object.fromEntries(
      TERM_NAMES.map((term) => [term, Number((termLossShare[term] / Math.max(1, lost.length)).toFixed(6))]),
    ),
    wrongTop1IntervalCounts: intervals,
    meanTermDelta: Object.fromEntries(TERM_NAMES.map((term) => [
      term,
      Number((lost.reduce((sum, row) => sum + row.termDelta[term], 0) / Math.max(1, lost.length)).toFixed(6)),
    ])),
  };
}

const bySplit: Record<string, ReturnType<typeof summarise>> = {};
for (const split of [...new Set(records.map((row) => row.split))].sort()) {
  bySplit[split] = summarise(records.filter((row) => row.split === split));
}
const byVariant: Record<string, ReturnType<typeof summarise>> = {};
for (const variant of [...new Set(records.map((row) => row.variant))].sort()) {
  byVariant[variant] = summarise(records.filter((row) => row.variant === variant));
}

const declared = classifier.declaredWindows;
const report = {
  schemaVersion: 1,
  stage: "Stage F2A (shadow)",
  mode,
  connectedToProduct: false,
  productOutputUnchanged: true,
  weightsRefitted: false,
  primarySubset: "corpus-annotated walking-bass stressFeature",
  files: corpus.length,
  overall: summarise(records),
  bySplit,
  byVariant,
  classifierAgreement: {
    note: "Stage F1's relation and the acoustic heuristic are measured against the corpus annotation rather than used to select windows.",
    totalWindows: classifier.totalWindows,
    declaredWalkingWindows: declared,
    f1RelationWalkingWindows: classifier.relationWalking,
    acousticWalkingWindows: classifier.acousticWalking,
    f1RelationPrecision: classifier.relationWalking === 0
      ? null
      : Number((classifier.relationTruePositive / classifier.relationWalking).toFixed(6)),
    f1RelationRecall: declared === 0
      ? null
      : Number((classifier.relationTruePositive / declared).toFixed(6)),
    f1RelationAgreement: Number((classifier.relationAgreement / classifier.totalWindows).toFixed(6)),
    acousticAgreement: Number((classifier.acousticAgreement / classifier.totalWindows).toFixed(6)),
  },
  // Capped and free of paths or chord names; positions are bar/beat only.
  sample: records.filter((row) => row.goldRank > 1).slice(0, 60),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const overall = report.overall!;
stdout.write(`Stage F2A root ranking attribution  (${corpus.length} files)\n\n`);
stdout.write(
  `gold walking windows ${overall.windows}`
  + `  product correct ${overall.productCorrect}`
  + `  gold mean rank ${overall.goldRootMeanRank} (median ${overall.goldRootMedianRank})\n`
  + `top1 ${(100 * overall.top1).toFixed(1)}%  top3 ${(100 * overall.top3).toFixed(1)}%`
  + `  top5 ${(100 * overall.top5).toFixed(1)}%  lost ${overall.lostWindows}\n\n`,
);
stdout.write("dominant failure component (per losing window)\n");
for (const [term, count] of Object.entries(overall.dominantBlameCounts)
  .sort((left, right) => right[1] - left[1])) {
  stdout.write(`  ${term.padEnd(24)} ${String(count).padStart(5)}  ${(100 * count / overall.lostWindows).toFixed(1)}%\n`);
}
stdout.write("\nterms contributing any of the winner's lead\n");
for (const [term, share] of Object.entries(overall.termLossShare)
  .sort((left, right) => (right[1] as number) - (left[1] as number))) {
  stdout.write(`  ${term.padEnd(24)} ${(100 * (share as number)).toFixed(1)}%\n`);
}
stdout.write("\nmean weighted advantage of the winner, per term\n");
for (const [term, delta] of Object.entries(overall.meanTermDelta)
  .sort((left, right) => (right[1] as number) - (left[1] as number))) {
  stdout.write(`  ${term.padEnd(24)} ${(delta as number).toFixed(6)}\n`);
}
stdout.write("\nsemitones from gold root to the wrong winner\n");
for (const [interval, count] of Object.entries(overall.wrongTop1IntervalCounts)
  .sort((left, right) => right[1] - left[1])) {
  stdout.write(`  +${interval.padStart(2)} ${String(count).padStart(5)}  ${(100 * count / overall.lostWindows).toFixed(1)}%\n`);
}
stdout.write("\nby split\n");
for (const [split, value] of Object.entries(bySplit)) {
  if (!value) continue;
  stdout.write(
    `  ${split.padEnd(16)} win ${String(value.windows).padStart(5)}`
    + `  top1 ${(100 * value.top1).toFixed(1)}%  meanRank ${value.goldRootMeanRank}`
    + `  dominant ${value.dominantFailureComponent?.term ?? "-"}`
    + ` ${value.dominantFailureComponent ? (100 * value.dominantFailureComponent.share).toFixed(1) : "-"}%\n`,
  );
}
stdout.write("\nby variant\n");
for (const [variant, value] of Object.entries(byVariant)) {
  if (!value) continue;
  stdout.write(
    `  ${variant.padEnd(16)} win ${String(value.windows).padStart(5)}`
    + `  top1 ${(100 * value.top1).toFixed(1)}%  meanRank ${value.goldRootMeanRank}`
    + `  dominant ${value.dominantFailureComponent?.term ?? "-"}\n`,
  );
}
stdout.write(`\nclassifier agreement ${JSON.stringify(report.classifierAgreement)}\n`);
