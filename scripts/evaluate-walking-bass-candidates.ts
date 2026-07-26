import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import type { NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { shadowDiagnostics } from "../src/domain/midi/shadowEvidence";
import {
  bassWeightingVariants,
  compareVariants,
  looksLikeWalkingBass,
  type BassWeightingVariant,
  type TimedObservedNote,
  type WalkingObservation,
} from "../src/domain/midi/walkingBassShadow";
import type { MidiAnalyzerMode, TrackRole } from "../src/domain/midi/types";
import { stageFCorpus } from "./shadowCorpus";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Stage F2W: is the right root even a candidate when the bass walks?
 *
 * Stage F2 measured walking at 11.8% top1 and 60.9% top3, and the working
 * hypothesis was that the answer is missing from the candidate set — a
 * generation failure that no amount of ranking could fix. Six different answers
 * to "which low notes should count" are run over the same windows with the
 * ranking held fixed, so any difference belongs to the evidence rather than to
 * the scorer.
 *
 * The measurement disproved the hypothesis. `walkingCandidateRecall` is 100% for
 * every variant and every subset: the gold root always carries a positive score.
 * It is outranked, not absent. The comment is left standing rather than quietly
 * rewritten because the disproof is the result.
 *
 * The subset is defined three ways — from the corpus's declared stress feature,
 * from the notes, and from Stage F1's relation — and all three are reported.
 * Using F1's own classifier alone would be circular: a window it mislabels would
 * quietly leave the subset and the measurement would flatter it.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/04-f2w-results.json");
const extraFiles = argv.flatMap((value, index) => (
  value === "--file" && argv[index + 1]
    ? [{ source: `${optionValue("--label") ?? "private"}:${index}`, path: argv[index + 1] }]
    : []
));

function beatsPerBarOf(timeSignature: string | undefined): number {
  if (!timeSignature) return 4;
  const [beats] = timeSignature.split("/").map(Number);
  return Number.isFinite(beats) && beats > 0 ? beats : 4;
}

/** Notes overlapping a window, keeping when each one starts. */
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

async function goldRoots(): Promise<Map<string, Map<string, number>>> {
  const byFile = new Map<string, Map<string, number>>();
  for (const corpus of [
    { path: ".local-evaluation/synthetic-gold-v1", name: "synthetic-gold-v1" },
    { path: ".local-evaluation/long-form-v1.1", name: "long-form-v1.1" },
    { path: ".local-evaluation/holdout-v3", name: "regression-v3" },
  ]) {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(cwd(), corpus.path, "manifest.json"), "utf8"),
      ) as {
        scenarios: Array<{
          scenarioId: string;
          variants: Array<{
            variant: string;
            events: Array<{ startBar: number; startBeatInBar: number; primary: string }>;
          }>;
        }>;
      };
      for (const scenario of manifest.scenarios) {
        for (const variant of scenario.variants) {
          const roots = new Map<string, number>();
          for (const event of variant.events) {
            const parsed = parseGoldLabel(event.primary) as NormalizedChordIdentity | null;
            if (!parsed || parsed.noChord) continue;
            roots.set(`${event.startBar}.${event.startBeatInBar}`, parsed.rootPitchClass);
          }
          byFile.set(`${corpus.name}:${scenario.scenarioId}_${variant.variant}`, roots);
        }
      }
    } catch { /* not generated locally */ }
  }
  try {
    const manifest = JSON.parse(
      await readFile(resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json"), "utf8"),
    ) as {
      files: Array<{
        caseId: string;
        chordTimeline?: Array<{ barNumber: number; beatInBar: number; chordSymbol?: { root: number } }>;
      }>;
    };
    for (const entry of manifest.files) {
      const roots = new Map<string, number>();
      for (const event of entry.chordTimeline ?? []) {
        if (event.chordSymbol === undefined) continue;
        roots.set(`${event.barNumber}.${event.beatInBar + 1}`, ((event.chordSymbol.root % 12) + 12) % 12);
      }
      byFile.set(`chord-drip:${entry.caseId}`, roots);
    }
  } catch { /* not available */ }
  return byFile;
}

interface VariantTally {
  windows: number;
  at1: number;
  at3: number;
  at5: number;
  /** Gold root anywhere in the twelve with a non-zero score. */
  candidateRecall: number;
  entropySum: number;
  wrongPassingToneRemoved: number;
  correctRootRemoved: number;
  correctionCost: number;
}

const emptyVariant = (): VariantTally => ({
  windows: 0, at1: 0, at3: 0, at5: 0, candidateRecall: 0,
  entropySum: 0, wrongPassingToneRemoved: 0, correctRootRemoved: 0, correctionCost: 0,
});

type Bucket = Record<BassWeightingVariant, VariantTally>;
const emptyBucket = (): Bucket => Object.fromEntries(
  bassWeightingVariants.map((variant) => [variant, emptyVariant()]),
) as Bucket;

const buckets: Record<string, Bucket> = {};
const bucketFor = (name: string) => (buckets[name] ??= emptyBucket());

const subsetOverlap = { declared: 0, material: 0, relation: 0, allThree: 0, anyOf: 0 };
const runtimes: number[] = [];
let determinismChecks = 0;
let determinismStable = 0;

const gold = await goldRoots();
const corpus = await stageFCorpus(extraFiles);

for (const entry of corpus) {
  const bytes = new Uint8Array(await readFile(entry.path));
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  const song = parseMidi(bytes);
  const roles = inferTrackRoles(song, detectExtractionProfile(song));
  const beatsPerBar = beatsPerBarOf(analysis.timeSignature);
  runtimes.push(Number((performance.now() - started).toFixed(1)));

  const goldForFile = gold.get(entry.source);
  const declaredWalking = entry.subsets.includes("walking-bass");
  let firstComparison: string | undefined;

  for (const item of analysis.fullTimeline) {
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const timedNotes = timedNotesIn(song, roles, startBeat, startBeat + item.durationBeats);
    const observation: WalkingObservation = {
      timedNotes,
      notes: timedNotes.map((note) => ({ pitch: note.pitch, weight: note.weight, role: note.role })),
      windowBeats: item.durationBeats,
      beatsPerBar,
    };

    const materialWalking = looksLikeWalkingBass(observation);
    const relationWalking = shadowDiagnostics(observation).relation.relation === "walking";
    if (declaredWalking) subsetOverlap.declared += 1;
    if (materialWalking) subsetOverlap.material += 1;
    if (relationWalking) subsetOverlap.relation += 1;
    if (declaredWalking && materialWalking && relationWalking) subsetOverlap.allThree += 1;
    if (declaredWalking || materialWalking || relationWalking) subsetOverlap.anyOf += 1;


    const goldRoot = goldForFile?.get(`${item.bar}.${item.beat}`);

    // Non-regression buckets, so a variant that helps walking and wrecks
    // everything else is visible rather than averaged away.
    const names: string[] = [];
    if (materialWalking) names.push("walking-material");
    if (relationWalking) names.push("walking-relation");
    if (declaredWalking) names.push("walking-declared");
    for (const subset of entry.subsets) {
      if (["plain-triad", "pedal-slash", "inversion"].includes(subset)) names.push(subset);
    }
    names.push("all");
    if (names.length === 1 && !materialWalking) names.push("non-walking");

    const outcomes = compareVariants(observation);
    if (firstComparison === undefined) firstComparison = JSON.stringify(outcomes);

    for (const name of names) {
      const bucket = bucketFor(name);
      for (const outcome of outcomes) {
        const tally = bucket[outcome.variant];
        tally.windows += 1;
        tally.entropySum += outcome.ranking.entropy;

        // A suppressed pitch class that is not the gold root is a passing tone
        // correctly removed; one that is the gold root is the failure mode this
        // whole experiment could introduce.
        for (const suppressed of outcome.suppressedPitchClasses) {
          if (goldRoot === undefined) continue;
          if (suppressed === goldRoot) tally.correctRootRemoved += 1;
          else tally.wrongPassingToneRemoved += 1;
        }

        if (goldRoot === undefined) continue;
        const ranked = outcome.ranking.ranked;
        if (ranked[0]?.pitchClass === goldRoot) tally.at1 += 1;
        else tally.correctionCost += 1;
        if (ranked.slice(0, 3).some((candidate) => candidate.pitchClass === goldRoot)) tally.at3 += 1;
        if (ranked.slice(0, 5).some((candidate) => candidate.pitchClass === goldRoot)) tally.at5 += 1;
        if (ranked.some((candidate) => candidate.pitchClass === goldRoot && candidate.score > 0)) {
          tally.candidateRecall += 1;
        }
      }
    }
  }

  if (firstComparison !== undefined && analysis.fullTimeline.length > 0) {
    const item = analysis.fullTimeline[0];
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const timedNotes = timedNotesIn(song, roles, startBeat, startBeat + item.durationBeats);
    const again = compareVariants({
      timedNotes,
      notes: timedNotes.map((note) => ({ pitch: note.pitch, weight: note.weight, role: note.role })),
      windowBeats: item.durationBeats,
      beatsPerBar,
    });
    determinismChecks += 1;
    if (JSON.stringify(again) === firstComparison) determinismStable += 1;
  }
}

const goldOf = (tally: VariantTally) => tally.at1 + tally.correctionCost;
const rate = (numerator: number, denominator: number) => (denominator === 0
  ? null
  : Number((numerator / denominator).toFixed(6)));

const summariseBucket = (bucket: Bucket) => Object.fromEntries(
  bassWeightingVariants.map((variant) => {
    const tally = bucket[variant];
    const goldWindows = goldOf(tally);
    return [variant, {
      windows: tally.windows,
      goldWindows,
      walkingGoldRootPresentAt1: rate(tally.at1, goldWindows),
      walkingGoldRootPresentAt3: rate(tally.at3, goldWindows),
      walkingGoldRootPresentAt5: rate(tally.at5, goldWindows),
      walkingCandidateRecall: rate(tally.candidateRecall, goldWindows),
      rootCandidateEntropy: rate(tally.entropySum, tally.windows),
      wrongPassingToneRemoved: tally.wrongPassingToneRemoved,
      correctRootRemoved: tally.correctRootRemoved,
      correctionCost: tally.correctionCost,
    }];
  }),
);

const walking = summariseBucket(bucketFor("walking-material"));
const currentAt3 = (walking["current"] as { walkingGoldRootPresentAt3: number | null })
  .walkingGoldRootPresentAt3 ?? 0;
const best = bassWeightingVariants
  .map((variant) => ({
    variant,
    at3: (walking[variant] as { walkingGoldRootPresentAt3: number | null }).walkingGoldRootPresentAt3 ?? 0,
    removed: (walking[variant] as { correctRootRemoved: number }).correctRootRemoved,
  }))
  .sort((left, right) => right.at3 - left.at3)[0];

const report = {
  schemaVersion: 1,
  stage: "Stage F2W (shadow)",
  mode,
  connectedToProduct: false,
  files: corpus.length,
  subsetDefinition: {
    note: "Three independent definitions, all reported. Stage F1's relation is one of them and is never the sole definition: using the classifier whose consequences are being measured to select the windows would be circular.",
    ...subsetOverlap,
  },
  deterministic: {
    checks: determinismChecks,
    stable: determinismStable,
    verdict: determinismChecks === determinismStable ? "pass" : "fail",
  },
  runtimeMs: runtimes.length === 0 ? null : {
    min: Math.min(...runtimes),
    mean: Number((runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length).toFixed(1)),
    max: Math.max(...runtimes),
  },
  bestVariantByAt3: best,
  baselineAt3: currentAt3,
  buckets: Object.fromEntries(
    Object.entries(buckets).sort().map(([name, bucket]) => [name, summariseBucket(bucket)]),
  ),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Stage F2W walking bass candidates  (${corpus.length} files)\n\n`);
stdout.write(`subset overlap ${JSON.stringify(subsetOverlap)}\n`);
stdout.write(`deterministic ${determinismStable}/${determinismChecks}\n\n`);

const show = (name: string) => {
  const bucket = report.buckets[name] as Record<string, {
    goldWindows: number;
    walkingGoldRootPresentAt1: number | null;
    walkingGoldRootPresentAt3: number | null;
    walkingGoldRootPresentAt5: number | null;
    walkingCandidateRecall: number | null;
    rootCandidateEntropy: number | null;
    wrongPassingToneRemoved: number;
    correctRootRemoved: number;
    correctionCost: number;
  }> | undefined;
  if (bucket === undefined) return;
  stdout.write(`${name}\n`);
  for (const variant of bassWeightingVariants) {
    const value = bucket[variant];
    const pct = (input: number | null) => (input === null ? "  -  " : (100 * input).toFixed(1).padStart(5));
    stdout.write(
      `  ${variant.padEnd(32)} gold ${String(value.goldWindows).padStart(5)}`
      + `  @1 ${pct(value.walkingGoldRootPresentAt1)}%`
      + `  @3 ${pct(value.walkingGoldRootPresentAt3)}%`
      + `  @5 ${pct(value.walkingGoldRootPresentAt5)}%`
      + `  recall ${pct(value.walkingCandidateRecall)}%`
      + `  H ${(value.rootCandidateEntropy ?? 0).toFixed(3)}`
      + `  -pass ${String(value.wrongPassingToneRemoved).padStart(5)}`
      + `  -root ${String(value.correctRootRemoved).padStart(4)}`
      + `  cost ${String(value.correctionCost).padStart(5)}\n`,
    );
  }
  stdout.write("\n");
};

for (const name of [
  "walking-material", "walking-relation", "walking-declared",
  "plain-triad", "pedal-slash", "inversion", "non-walking", "all",
]) show(name);
