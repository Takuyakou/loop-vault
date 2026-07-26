import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, normalizeChordLabel, type NormalizedChordIdentity } from "../src/domain/chordIdentity";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import type { ObservedNote } from "../src/domain/midi/shadowEvidence";
import {
  rootAndBassAreInvariant,
  shadowIdentity,
  shadowQuality,
  type ShadowQualityInput,
} from "../src/domain/midi/shadowQuality";
import type { MidiAnalyzerMode, TrackRole } from "../src/domain/midi/types";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Stage F3a: with the root and bass fixed, does the tri-state pick a better
 * quality than the product does?
 *
 * The comparison is only ever within one root, because the root comes from
 * `phase4-v1` and stays there. That is also what makes the result attributable:
 * the triad and the seventh are the only things that differ between the product's
 * identity and the shadow's, so a change in `canonicalExact` is a change in the
 * quality layer and nothing else.
 *
 * Root and bass invariance under a quality-parameter perturbation is measured
 * per file rather than asserted from the fact that they are inputs.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/06-f3a-results.json");
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

function notesIn(
  song: ReturnType<typeof parseMidi>,
  roles: Map<number, TrackRole>,
  startBeat: number,
  endBeat: number,
): ObservedNote[] {
  const ticksPerBeat = song.ticksPerBeat;
  const startTick = startBeat * ticksPerBeat;
  const endTick = endBeat * ticksPerBeat;
  const observed: ObservedNote[] = [];
  for (const note of song.notes) {
    const role = roles.get(note.trackIndex) ?? "mixed";
    if (role === "percussion") continue;
    const noteEnd = note.startTick + note.durationTick;
    if (note.startTick >= endTick || noteEnd <= startTick) continue;
    const overlap = Math.min(noteEnd, endTick) - Math.max(note.startTick, startTick);
    if (overlap <= 0) continue;
    observed.push({ pitch: note.pitch, weight: overlap / ticksPerBeat, role });
  }
  return observed;
}

interface CorpusFile {
  source: string;
  corpus: string;
  path: string;
  variant: string;
  subsets: string[];
  gold: Map<string, NormalizedChordIdentity>;
}

/**
 * Subsets from the scenario's declared title and stress features.
 *
 * Never from a scenario id: keying on `S16` would be the fixture-id hard-coding
 * the contract forbids and would break the moment a scenario is renamed.
 */
function subsetsFor(title: string, stressFeatures: readonly string[], variant: string): string[] {
  const text = `${title} ${stressFeatures.join(" ")}`.toLowerCase();
  const subsets: string[] = [];
  if (/pedal|slash|ostinato/.test(text)) subsets.push("pedal");
  if (/rootless/.test(text)) subsets.push("rootless");
  if (/inversion|slash/.test(text)) subsets.push("inversion");
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
          title: string;
          scenarioId: string;
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
            variant: variant.variant,
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
        chordTimeline?: Array<{
          barNumber: number;
          beatInBar: number;
          chordSymbol?: { label: string };
        }>;
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
        variant: "clean",
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
      variant: "clean",
      subsets: ["clean"],
      gold: new Map(),
    });
  }

  return files;
}

interface Tally {
  windows: number;
  goldWindows: number;
  productTriad: number;
  shadowTriad: number;
  productSeventh: number;
  shadowSeventh: number;
  productQuality: number;
  shadowQuality: number;
  productCanonicalExact: number;
  shadowCanonicalExact: number;
  triadUnsupported: number;
  seventhUnsupported: number;
  eliminated: number;
  survivingUnderdetermined: number;
}

const empty = (): Tally => ({
  windows: 0, goldWindows: 0,
  productTriad: 0, shadowTriad: 0, productSeventh: 0, shadowSeventh: 0,
  productQuality: 0, shadowQuality: 0,
  productCanonicalExact: 0, shadowCanonicalExact: 0,
  triadUnsupported: 0, seventhUnsupported: 0, eliminated: 0, survivingUnderdetermined: 0,
});

const buckets: Record<string, Tally> = {};
const bucketFor = (name: string) => (buckets[name] ??= empty());
const overall = empty();

let rootSequenceStable = 0;
let bassSequenceStable = 0;
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

  const inputs: ShadowQualityInput[] = [];
  const productRoots: number[] = [];
  const productBasses: number[] = [];
  const shadowRoots: number[] = [];
  const shadowBasses: number[] = [];

  for (const item of analysis.fullTimeline) {
    const identity = normalizeChordLabel(item.chord.label);
    if (!identity || identity.noChord) continue;
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const observation = {
      notes: notesIn(song, roles, startBeat, startBeat + item.durationBeats),
      windowBeats: item.durationBeats,
    };
    const root = identity.rootPitchClass;
    const bass = identity.bassPitchClass ?? root;
    const input: ShadowQualityInput = { observation, root, bass };
    inputs.push(input);
    productRoots.push(root);
    productBasses.push(bass);

    const quality = shadowQuality(input);
    shadowRoots.push(quality.root);
    shadowBasses.push(quality.bass);

    const shadow = shadowIdentity(quality, identity);
    const gold = file.gold.get(`${item.bar}.${item.beat}`);

    const names = [...file.subsets, "all", file.corpus];
    for (const name of names) {
      const tally = name === "all" ? overall : bucketFor(name);
      tally.windows += 1;
      if (quality.triadUnsupported) tally.triadUnsupported += 1;
      if (quality.seventhUnsupported) tally.seventhUnsupported += 1;
      tally.eliminated += quality.eliminatedByContradiction.length;
      tally.survivingUnderdetermined += quality.survivingUnderdetermined.length;
      if (gold === undefined) continue;

      tally.goldWindows += 1;
      const productTriadRight = identity.triad === gold.triad;
      const shadowTriadRight = quality.triad === gold.triad;
      const productSeventhRight = (identity.seventh ?? null) === (gold.seventh ?? null);
      const shadowSeventhRight = quality.seventh === (gold.seventh ?? null);
      if (productTriadRight) tally.productTriad += 1;
      if (shadowTriadRight) tally.shadowTriad += 1;
      if (productSeventhRight) tally.productSeventh += 1;
      if (shadowSeventhRight) tally.shadowSeventh += 1;
      if (productTriadRight && productSeventhRight) tally.productQuality += 1;
      if (shadowTriadRight && shadowSeventhRight) tally.shadowQuality += 1;
      if (chordIdentityKey(identity) === chordIdentityKey(gold)) tally.productCanonicalExact += 1;
      if (chordIdentityKey(shadow) === chordIdentityKey(gold)) tally.shadowCanonicalExact += 1;
    }
  }

  // The two sequences the contract requires to be untouched, compared directly
  // rather than inferred from the fact that they are inputs.
  if (JSON.stringify(productRoots) === JSON.stringify(shadowRoots)) rootSequenceStable += 1;
  if (JSON.stringify(productBasses) === JSON.stringify(shadowBasses)) bassSequenceStable += 1;

  const invariance = rootAndBassAreInvariant(inputs, [0.7, 1.0, 1.3]);
  if (invariance.invariant) invariantFiles += 1;
  if (invariance.perturbationHadEffect) perturbationEffective += 1;
}

const rate = (numerator: number, denominator: number) => (denominator === 0
  ? null
  : Number((numerator / denominator).toFixed(6)));

const summarise = (tally: Tally) => ({
  windows: tally.windows,
  goldWindows: tally.goldWindows,
  productTriadAccuracy: rate(tally.productTriad, tally.goldWindows),
  shadowTriadAccuracy: rate(tally.shadowTriad, tally.goldWindows),
  productSeventhAccuracy: rate(tally.productSeventh, tally.goldWindows),
  shadowSeventhAccuracy: rate(tally.shadowSeventh, tally.goldWindows),
  productQualityAccuracy: rate(tally.productQuality, tally.goldWindows),
  shadowQualityAccuracy: rate(tally.shadowQuality, tally.goldWindows),
  productCanonicalExact: rate(tally.productCanonicalExact, tally.goldWindows),
  shadowCanonicalExact: rate(tally.shadowCanonicalExact, tally.goldWindows),
  correctionCostProduct: tally.goldWindows - tally.productCanonicalExact,
  correctionCostShadow: tally.goldWindows - tally.shadowCanonicalExact,
  correctionCostDelta: (tally.goldWindows - tally.shadowCanonicalExact)
    - (tally.goldWindows - tally.productCanonicalExact),
  triadUnsupportedRate: rate(tally.triadUnsupported, tally.windows),
  seventhUnsupportedRate: rate(tally.seventhUnsupported, tally.windows),
  eliminatedPerWindow: rate(tally.eliminated, tally.windows),
  underdeterminedPerWindow: rate(tally.survivingUnderdetermined, tally.windows),
});

const gates = [
  {
    id: "root-sequence-unchanged",
    verdict: rootSequenceStable === corpus.length ? "pass" : "fail",
    detail: `${rootSequenceStable}/${corpus.length}`,
  },
  {
    id: "bass-sequence-unchanged",
    verdict: bassSequenceStable === corpus.length ? "pass" : "fail",
    detail: `${bassSequenceStable}/${corpus.length}`,
  },
  {
    id: "root-bass-invariant-under-perturbation",
    verdict: invariantFiles === corpus.length ? "pass" : "fail",
    detail: `${invariantFiles}/${corpus.length} at 0.7 / 1.0 / 1.3`,
  },
  {
    id: "perturbation-not-vacuous",
    verdict: perturbationEffective > 0 ? "pass" : "fail",
    detail: `${perturbationEffective}/${corpus.length} files where the perturbation moved a quality score`,
  },
];

const report = {
  schemaVersion: 1,
  stage: "Stage F3a (shadow)",
  mode,
  connectedToProduct: false,
  rootAndBassSource: "phase4-v1, taken as input and never re-derived",
  tensionDetectionChanged: false,
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

stdout.write(`Stage F3a quality tri-state: ${report.verdict}  (${corpus.length} files)\n\n`);
for (const gate of gates) {
  stdout.write(`${gate.verdict === "pass" ? "PASS" : "FAIL"}  ${gate.id.padEnd(40)} ${gate.detail}\n`);
}

const line = (name: string, value: ReturnType<typeof summarise>) => {
  const pct = (input: number | null) => (input === null ? "  -  " : (100 * input).toFixed(1).padStart(5));
  stdout.write(
    `  ${name.padEnd(16)} gold ${String(value.goldWindows).padStart(5)}`
    + `  triad ${pct(value.productTriadAccuracy)}→${pct(value.shadowTriadAccuracy)}`
    + `  7th ${pct(value.productSeventhAccuracy)}→${pct(value.shadowSeventhAccuracy)}`
    + `  qual ${pct(value.productQualityAccuracy)}→${pct(value.shadowQualityAccuracy)}`
    + `  exact ${pct(value.productCanonicalExact)}→${pct(value.shadowCanonicalExact)}`
    + `  cost ${String(value.correctionCostDelta).padStart(6)}\n`,
  );
};

stdout.write("\noverall (product → shadow)\n");
line("all", report.overall);
stdout.write("\nby subset\n");
for (const name of ["plain-triad", "pedal", "inversion", "rootless", "clean", "stress"]) {
  const value = report.buckets[name];
  if (value) line(name, value);
}
stdout.write("\nby corpus\n");
for (const name of ["synthetic", "long-form", "regression-v3", "chord-drip", "private"]) {
  const value = report.buckets[name];
  if (value) line(name, value);
}
stdout.write(
  `\ntri-state: eliminated/window ${report.overall.eliminatedPerWindow}`
  + `  underdetermined/window ${report.overall.underdeterminedPerWindow}`
  + `  triad unsupported ${(100 * (report.overall.triadUnsupportedRate ?? 0)).toFixed(1)}%`
  + `  seventh unsupported ${(100 * (report.overall.seventhUnsupportedRate ?? 0)).toFixed(1)}%\n`,
);
stdout.write(`runtime ${JSON.stringify(report.runtimeMs)}\n`);
