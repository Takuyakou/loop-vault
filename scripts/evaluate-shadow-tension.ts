import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, normalizeChordLabel, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import {
  ALTERATION_SLOTS,
  coreIsInvariant,
  shadowTensions,
  slotsFromIdentity,
  type ShadowTensionInput,
  type TensionSlot,
  type TimedNote,
} from "../src/domain/midi/shadowTension";
import type { MidiAnalyzerMode, TrackRole } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Stage F5a: can tensions be detected on their own?
 *
 * The core — root, bass, triad, seventh — comes from `phase4-v1` and is compared
 * against itself at the end, so a change in `canonicalExact` can only be a change
 * in the tensions. That is the whole reason this stage is allowed to run after
 * the root and quality research closed: it provably cannot reopen either.
 *
 * Precision and recall are both reported and neither is allowed to stand alone.
 * A tension detector that finds everything by asserting everything has perfect
 * recall and is useless, and the false-positive count per window is what makes
 * that visible.
 *
 * Gold is used only to score. Stage F3a's tri-state verdicts are not consulted
 * for what counts as a correct tension.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/07-f5a-results.json");
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

function timedNotesIn(
  song: ReturnType<typeof parseMidi>,
  roles: Map<number, TrackRole>,
  startBeat: number,
  endBeat: number,
): TimedNote[] {
  const ticksPerBeat = song.ticksPerBeat;
  const startTick = startBeat * ticksPerBeat;
  const endTick = endBeat * ticksPerBeat;
  const observed: TimedNote[] = [];
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
  corpus: string;
  path: string;
  subsets: string[];
  gold: Map<string, NormalizedChordIdentity>;
}

/** Subsets from the scenario's declared title and stress features, never its id. */
function subsetsFor(title: string, stressFeatures: readonly string[], variant: string): string[] {
  const text = `${title} ${stressFeatures.join(" ")}`.toLowerCase();
  const subsets: string[] = [];
  if (/extension|tension|jazz|rootless/.test(text)) subsets.push("tension-rich");
  if (/arpeggi/.test(text)) subsets.push("arpeggiated");
  if (/humaniz|anticipat/.test(text)) subsets.push("humanized");
  if (/triad/.test(text) && !/seventh|extension/.test(text)) subsets.push("plain-triad");
  subsets.push(variant === "stress" ? "stress" : "clean");
  return subsets;
}

async function loadCorpus(): Promise<CorpusFile[]> {
  const files: CorpusFile[] = [];
  for (const corpus of [
    { path: ".local-evaluation/synthetic-gold-v1", name: "synthetic" },
    { path: ".local-evaluation/long-form-v1.1", name: "long-form" },
    { path: ".local-evaluation/holdout-v3", name: "regression-v3" },
  ]) {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(cwd(), corpus.path, "manifest.json"), "utf8"),
      ) as {
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
      for (const scenario of manifest.scenarios) {
        for (const variant of scenario.variants) {
          const gold = new Map<string, NormalizedChordIdentity>();
          for (const event of variant.events) {
            const parsed = parseGoldLabel(event.primary) as NormalizedChordIdentity | null;
            if (!parsed || parsed.noChord) continue;
            gold.set(`${event.startBar}.${event.startBeatInBar}`, parsed);
          }
          files.push({
            source: `${corpus.name}:${scenario.scenarioId}_${variant.variant}`,
            corpus: corpus.name,
            path: resolve(cwd(), corpus.path, "midi", variant.fileName),
            subsets: subsetsFor(scenario.title, scenario.stressFeatures ?? [], variant.variant),
            gold,
          });
        }
      }
    } catch { /* not generated locally */ }
  }

  try {
    const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      files: Array<{
        caseId: string;
        midiFile: string;
        chordTimeline?: Array<{ barNumber: number; beatInBar: number; chordSymbol?: { label: string } }>;
      }>;
    };
    for (const entry of manifest.files) {
      const gold = new Map<string, NormalizedChordIdentity>();
      for (const event of entry.chordTimeline ?? []) {
        if (event.chordSymbol === undefined) continue;
        const parsed = normalizeChordLabel(event.chordSymbol.label);
        if (!parsed || parsed.noChord) continue;
        gold.set(`${event.barNumber}.${event.beatInBar + 1}`, parsed);
      }
      files.push({
        source: `chord-drip:${entry.caseId}`,
        corpus: "chord-drip",
        path: resolve(dirname(manifestPath), entry.midiFile),
        subsets: ["clean"],
        gold,
      });
    }
  } catch { /* not available */ }

  for (const extra of extraFiles) {
    files.push({
      source: extra.source,
      corpus: extra.source.split(":")[0],
      path: extra.path,
      subsets: ["clean"],
      gold: new Map(),
    });
  }
  return files;
}

interface Tally {
  windows: number;
  goldWindows: number;
  productTruePositive: number;
  productFalsePositive: number;
  productFalseNegative: number;
  shadowTruePositive: number;
  shadowFalsePositive: number;
  shadowFalseNegative: number;
  altProductTruePositive: number;
  altProductFalsePositive: number;
  altProductFalseNegative: number;
  altShadowTruePositive: number;
  altShadowFalsePositive: number;
  altShadowFalseNegative: number;
  productCanonicalExact: number;
  shadowCanonicalExact: number;
  /** Tensions added to a window whose gold has none. */
  productFalseAdditionWindows: number;
  shadowFalseAdditionWindows: number;
  underdeterminedTotal: number;
}

const empty = (): Tally => ({
  windows: 0, goldWindows: 0,
  productTruePositive: 0, productFalsePositive: 0, productFalseNegative: 0,
  shadowTruePositive: 0, shadowFalsePositive: 0, shadowFalseNegative: 0,
  altProductTruePositive: 0, altProductFalsePositive: 0, altProductFalseNegative: 0,
  altShadowTruePositive: 0, altShadowFalsePositive: 0, altShadowFalseNegative: 0,
  productCanonicalExact: 0, shadowCanonicalExact: 0,
  productFalseAdditionWindows: 0, shadowFalseAdditionWindows: 0,
  underdeterminedTotal: 0,
});

const buckets: Record<string, Tally> = {};
const bucketFor = (name: string) => (buckets[name] ??= empty());
const overall = empty();

let coreSequenceStable = 0;
let invariantFiles = 0;
let perturbationEffective = 0;
const runtimes: number[] = [];
const corpus = await loadCorpus();

for (const file of corpus) {
  const bytes = new Uint8Array(await readFile(file.path));
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  runtimes.push(Number((performance.now() - started).toFixed(1)));
  const song = parseMidi(bytes);
  const roles = inferTrackRoles(song, detectExtractionProfile(song));
  const beatsPerBar = beatsPerBarOf(analysis.timeSignature);

  const inputs: ShadowTensionInput[] = [];
  const productCore: string[] = [];
  const shadowCore: string[] = [];

  for (const item of analysis.fullTimeline) {
    const identity = normalizeChordLabel(item.chord.label);
    if (!identity || identity.noChord) continue;
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const timedNotes = timedNotesIn(song, roles, startBeat, startBeat + item.durationBeats);
    const root = identity.rootPitchClass;
    const bass = identity.bassPitchClass ?? root;
    const seventh = identity.seventh ?? null;

    const input: ShadowTensionInput = {
      observation: {
        notes: timedNotes.map((note) => ({ pitch: note.pitch, weight: note.weight, role: note.role })),
        timedNotes,
        windowBeats: item.durationBeats,
      },
      root, bass, triad: identity.triad, seventh, beatsPerBar,
    };
    inputs.push(input);
    productCore.push(`${root}:${bass}:${identity.triad}:${seventh ?? "-"}`);

    const result = shadowTensions(input);
    shadowCore.push(`${result.root}:${result.bass}:${result.triad}:${result.seventh ?? "-"}`);

    const productSlots = new Set(slotsFromIdentity(identity.extensions, identity.alterations));
    const shadowSlots = new Set(result.tensions);
    const gold = file.gold.get(`${item.bar}.${item.beat}`);

    // The shadow identity keeps the product's core and swaps only the tensions,
    // so a canonicalExact difference is attributable to the tensions alone.
    const toIdentity = (slots: ReadonlySet<TensionSlot>): NormalizedChordIdentity => {
      const extensions: number[] = [];
      const alterations: string[] = [];
      for (const slot of slots) {
        if (slot === "6") extensions.push(6);
        else if (slot === "9") extensions.push(9);
        else if (slot === "11") extensions.push(11);
        else if (slot === "13") extensions.push(13);
        else alterations.push(slot);
      }
      return {
        rootPitchClass: root,
        triad: identity.triad,
        ...(seventh ? { seventh } : {}),
        extensions: [...new Set(extensions)].sort((left, right) => left - right),
        alterations: [...new Set(alterations)].sort(),
        ...(bass !== root ? { bassPitchClass: bass } : {}),
      };
    };

    for (const name of [...file.subsets, "all", file.corpus]) {
      const tally = name === "all" ? overall : bucketFor(name);
      tally.windows += 1;
      tally.underdeterminedTotal += result.underdetermined.length;
      if (gold === undefined) continue;
      tally.goldWindows += 1;

      const goldSlots = new Set(slotsFromIdentity(gold.extensions, gold.alterations));
      const score = (predicted: ReadonlySet<TensionSlot>, onlyAlterations: boolean) => {
        const filter = (slot: TensionSlot) => (onlyAlterations ? ALTERATION_SLOTS.has(slot) : true);
        const predictedSet = [...predicted].filter(filter);
        const goldSet = [...goldSlots].filter(filter);
        return {
          truePositive: predictedSet.filter((slot) => goldSet.includes(slot)).length,
          falsePositive: predictedSet.filter((slot) => !goldSet.includes(slot)).length,
          falseNegative: goldSet.filter((slot) => !predictedSet.includes(slot)).length,
        };
      };

      const product = score(productSlots, false);
      const shadow = score(shadowSlots, false);
      tally.productTruePositive += product.truePositive;
      tally.productFalsePositive += product.falsePositive;
      tally.productFalseNegative += product.falseNegative;
      tally.shadowTruePositive += shadow.truePositive;
      tally.shadowFalsePositive += shadow.falsePositive;
      tally.shadowFalseNegative += shadow.falseNegative;

      const altProduct = score(productSlots, true);
      const altShadow = score(shadowSlots, true);
      tally.altProductTruePositive += altProduct.truePositive;
      tally.altProductFalsePositive += altProduct.falsePositive;
      tally.altProductFalseNegative += altProduct.falseNegative;
      tally.altShadowTruePositive += altShadow.truePositive;
      tally.altShadowFalsePositive += altShadow.falsePositive;
      tally.altShadowFalseNegative += altShadow.falseNegative;

      if (goldSlots.size === 0) {
        if (productSlots.size > 0) tally.productFalseAdditionWindows += 1;
        if (shadowSlots.size > 0) tally.shadowFalseAdditionWindows += 1;
      }

      if (chordIdentityKey(identity) === chordIdentityKey(gold)) tally.productCanonicalExact += 1;
      if (chordIdentityKey(toIdentity(shadowSlots)) === chordIdentityKey(gold)) {
        tally.shadowCanonicalExact += 1;
      }
    }
  }

  if (JSON.stringify(productCore) === JSON.stringify(shadowCore)) coreSequenceStable += 1;
  const invariance = coreIsInvariant(inputs, [0.7, 1.0, 1.3]);
  if (invariance.invariant) invariantFiles += 1;
  if (invariance.perturbationHadEffect) perturbationEffective += 1;
}

const rate = (numerator: number, denominator: number) => (denominator === 0
  ? null
  : Number((numerator / denominator).toFixed(6)));
const f1 = (precision: number | null, recall: number | null) => (
  precision === null || recall === null || precision + recall === 0
    ? null
    : Number(((2 * precision * recall) / (precision + recall)).toFixed(6))
);

const summarise = (tally: Tally) => {
  const productPrecision = rate(tally.productTruePositive, tally.productTruePositive + tally.productFalsePositive);
  const productRecall = rate(tally.productTruePositive, tally.productTruePositive + tally.productFalseNegative);
  const shadowPrecision = rate(tally.shadowTruePositive, tally.shadowTruePositive + tally.shadowFalsePositive);
  const shadowRecall = rate(tally.shadowTruePositive, tally.shadowTruePositive + tally.shadowFalseNegative);
  return {
    windows: tally.windows,
    goldWindows: tally.goldWindows,
    productTensionPrecision: productPrecision,
    productTensionRecall: productRecall,
    productTensionF1: f1(productPrecision, productRecall),
    shadowTensionPrecision: shadowPrecision,
    shadowTensionRecall: shadowRecall,
    shadowTensionF1: f1(shadowPrecision, shadowRecall),
    productAlterationPrecision: rate(tally.altProductTruePositive, tally.altProductTruePositive + tally.altProductFalsePositive),
    productAlterationRecall: rate(tally.altProductTruePositive, tally.altProductTruePositive + tally.altProductFalseNegative),
    shadowAlterationPrecision: rate(tally.altShadowTruePositive, tally.altShadowTruePositive + tally.altShadowFalsePositive),
    shadowAlterationRecall: rate(tally.altShadowTruePositive, tally.altShadowTruePositive + tally.altShadowFalseNegative),
    productFalsePositivePerWindow: rate(tally.productFalsePositive, tally.goldWindows),
    shadowFalsePositivePerWindow: rate(tally.shadowFalsePositive, tally.goldWindows),
    productCanonicalExact: rate(tally.productCanonicalExact, tally.goldWindows),
    shadowCanonicalExact: rate(tally.shadowCanonicalExact, tally.goldWindows),
    correctionCostProduct: tally.goldWindows - tally.productCanonicalExact,
    correctionCostShadow: tally.goldWindows - tally.shadowCanonicalExact,
    correctionCostDelta: (tally.goldWindows - tally.shadowCanonicalExact)
      - (tally.goldWindows - tally.productCanonicalExact),
    productFalseAdditionWindows: tally.productFalseAdditionWindows,
    shadowFalseAdditionWindows: tally.shadowFalseAdditionWindows,
    underdeterminedPerWindow: rate(tally.underdeterminedTotal, tally.windows),
  };
};

const gates = [
  {
    id: "core-sequence-unchanged",
    verdict: coreSequenceStable === corpus.length ? "pass" : "fail",
    detail: `${coreSequenceStable}/${corpus.length} (root, bass, triad, seventh)`,
  },
  {
    id: "core-invariant-under-perturbation",
    verdict: invariantFiles === corpus.length ? "pass" : "fail",
    detail: `${invariantFiles}/${corpus.length} at 0.7 / 1.0 / 1.3`,
  },
  {
    id: "perturbation-not-vacuous",
    verdict: perturbationEffective > 0 ? "pass" : "fail",
    detail: `${perturbationEffective}/${corpus.length} files where the perturbation moved a tension`,
  },
];

const report = {
  schemaVersion: 1,
  stage: "Stage F5a (shadow)",
  mode,
  connectedToProduct: false,
  coreSource: "phase4-v1 root / bass / triad / seventh, taken as input",
  goldUsedForScoringOnly: true,
  triStateReusedForTruth: false,
  files: corpus.length,
  gates,
  verdict: gates.some((gate) => gate.verdict === "fail") ? "FAIL" : "PASS",
  overall: summarise(overall),
  buckets: Object.fromEntries(
    Object.entries(buckets).sort().map(([name, tally]) => [name, summarise(tally)]),
  ),
  runtimeMs: runtimes.length === 0 ? null : {
    min: Math.min(...runtimes),
    mean: Number((runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length).toFixed(1)),
    max: Math.max(...runtimes),
  },
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Stage F5a independent tension detection: ${report.verdict}  (${corpus.length} files)\n\n`);
for (const gate of gates) {
  stdout.write(`${gate.verdict === "pass" ? "PASS" : "FAIL"}  ${gate.id.padEnd(38)} ${gate.detail}\n`);
}

const pct = (input: number | null) => (input === null ? "  -  " : (100 * input).toFixed(1).padStart(5));
const line = (name: string, value: ReturnType<typeof summarise>) => stdout.write(
  `  ${name.padEnd(14)} gold ${String(value.goldWindows).padStart(5)}`
  + `  P ${pct(value.productTensionPrecision)}→${pct(value.shadowTensionPrecision)}`
  + `  R ${pct(value.productTensionRecall)}→${pct(value.shadowTensionRecall)}`
  + `  F1 ${pct(value.productTensionF1)}→${pct(value.shadowTensionF1)}`
  + `  FP/w ${(value.productFalsePositivePerWindow ?? 0).toFixed(3)}→${(value.shadowFalsePositivePerWindow ?? 0).toFixed(3)}`
  + `  exact ${pct(value.productCanonicalExact)}→${pct(value.shadowCanonicalExact)}`
  + `  cost ${String(value.correctionCostDelta).padStart(6)}\n`,
);

stdout.write("\noverall (product → shadow)\n");
line("all", report.overall);
stdout.write("\nby subset\n");
for (const name of ["plain-triad", "tension-rich", "arpeggiated", "humanized", "clean", "stress"]) {
  if (report.buckets[name]) line(name, report.buckets[name]);
}
stdout.write("\nby corpus\n");
for (const name of ["synthetic", "long-form", "regression-v3", "chord-drip", "private"]) {
  if (report.buckets[name]) line(name, report.buckets[name]);
}
stdout.write("\nalteration only (product → shadow)\n");
const overallValue = report.overall;
stdout.write(
  `  precision ${pct(overallValue.productAlterationPrecision)}→${pct(overallValue.shadowAlterationPrecision)}`
  + `  recall ${pct(overallValue.productAlterationRecall)}→${pct(overallValue.shadowAlterationRecall)}\n`,
);
stdout.write(
  `\nfalse additions to gold-tensionless windows: product ${overallValue.productFalseAdditionWindows}`
  + ` → shadow ${overallValue.shadowFalseAdditionWindows}\n`
  + `plain-triad false additions: product ${report.buckets["plain-triad"]?.productFalseAdditionWindows ?? 0}`
  + ` → shadow ${report.buckets["plain-triad"]?.shadowFalseAdditionWindows ?? 0}\n`
  + `underdetermined per window ${overallValue.underdeterminedPerWindow}\n`
  + `runtime ${JSON.stringify(report.runtimeMs)}\n`,
);
