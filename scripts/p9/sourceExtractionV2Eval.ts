/** P9.3 public-only matched source extraction study. Never opens sealed/private sources. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import { parseChordLabel } from "../../src/domain/chords";
import { attachSourceVoicings } from "../../src/domain/voicing/sourceVoicing";
import type { ChordTimelineItem } from "../../src/domain/types";
import { harmonyFiles, type GoldFile } from "../p7/tier1Harness";
import { encodeTemporalGoldMidi, temporalGoldCases } from "../p7/temporalGold";
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";
import { encodeUsageCase } from "./encodeUsage.mjs";
import { extractSourceV2 } from "./sourceExtractionV2";

type Arm = "product" | "source-rank" | "product-guarded" | "product-safe-prune";
interface Row { events: number; exact: number; gold: number; matched: number; missing: number; extra: number;
  bassMissing: number; supportGold: number; supportMatched: number; unavailable: number; candidateExact: number;
  candidateUnionGold: number; rawGold: number; excludedRestorable: number; excludedTotal: number }
const blank = (): Row => ({ events: 0, exact: 0, gold: 0, matched: 0, missing: 0, extra: 0,
  bassMissing: 0, supportGold: 0, supportMatched: 0, unavailable: 0, candidateExact: 0,
  candidateUnionGold: 0, rawGold: 0, excludedRestorable: 0, excludedTotal: 0 });
const unique = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b);
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
function tally(row: Row, gold: number[], predicted: number[], support: number[] | undefined,
  candidates: number[][], raw: number[], excludedTotal: number, excludedRestorable: number) {
  const found = new Set(predicted), truth = unique(gold), union = new Set(candidates.flat());
  row.events++; row.gold += truth.length; row.matched += truth.filter((n) => found.has(n)).length;
  row.missing += truth.filter((n) => !found.has(n)).length; row.extra += predicted.filter((n) => !truth.includes(n)).length;
  if (same(truth, predicted)) row.exact++;
  if (truth[0] !== undefined && !found.has(truth[0])) row.bassMissing++;
  if (support) { row.supportGold += support.length; row.supportMatched += support.filter((n) => found.has(n)).length; }
  if (predicted.length === 0) row.unavailable++;
  if (candidates.some((candidate) => same(candidate, truth))) row.candidateExact++;
  row.candidateUnionGold += truth.filter((n) => union.has(n)).length;
  row.rawGold += truth.filter((n) => raw.includes(n)).length;
  row.excludedTotal += excludedTotal; row.excludedRestorable += excludedRestorable;
}
interface Input { file: GoldFile; support?: Array<number[] | undefined> }
function temporal(split: "dev" | "validation"): Input[] {
  const cases = split === "dev" ? temporalGoldCases.slice(0, 9) : temporalGoldCases.slice(9);
  return cases.map((entry) => ({ file: { bytes: encodeTemporalGoldMidi(entry), category: entry.category,
    events: entry.voicingSpans.map((span) => ({ startBeat: span.startBeat, endBeat: span.endBeat,
      chordSymbol: entry.harmonicSpans.find((harmonic) => harmonic.startBeat <= span.startBeat && harmonic.endBeat > span.startBeat)?.identity ?? "",
      goldVoicingMidi: [...span.targetMidi] })) } }));
}
function usage(): Input[] {
  return generateUsageCorpusV2().cases.map((item) => {
    const bytes = encodeUsageCase(item), analysis = analyzeMidi(bytes, { enablePresentationGrouping: false });
    const meterBeats = item.meter[0] * 4 / item.meter[1];
    const events = item.gold.map((event) => {
      const startBeat = event.startTick / item.ppq;
      const product = [...analysis.fullTimeline].reverse().find((entry) =>
        (entry.bar - 1) * meterBeats + entry.beat - 1 <= startBeat + .001);
      if (!product) throw new Error("Public usage Product identity unavailable");
      return { startBeat, endBeat: event.endTick / item.ppq, chordSymbol: product.chord.label,
        goldVoicingMidi: [...event.sourceNotes] };
    });
    const support = item.gold.map((event) => unique(item.notes.filter((note) =>
      ["support", "harmony", "bass"].includes(note.role) && note.startTick < event.endTick
      && note.startTick + note.durationTick > event.startTick && event.sourceNotes.includes(note.pitch))
      .map((note) => note.pitch)));
    return { file: { bytes, events, category: item.family }, support };
  });
}
function timelineItem(event: GoldFile["events"][number], meterBeats: number): ChordTimelineItem {
  const chord = parseChordLabel(event.chordSymbol);
  if (!chord) throw new Error("Public Gold identity cannot be represented");
  return { bar: Math.floor(event.startBeat / meterBeats) + 1, beat: event.startBeat % meterBeats + 1,
    durationBeats: event.endBeat - event.startBeat, chord, confidence: 1, alternatives: [], warnings: [] };
}
async function evaluate(inputs: Input[], corpus: string, split: string, manifestSha: string, codeCommit: string) {
  const totals = Object.fromEntries(["product", "source-rank", "product-guarded", "product-safe-prune"].map((arm) => [arm, blank()])) as Record<Arm, Row>;
  const byCategory: Record<string, Record<Arm, Row>> = {};
  let invariantFiles = 0, candidateMs = 0, peakHeapMiB = 0;
  for (const { file, support } of inputs) {
    const hash = createHash("sha256").update(file.bytes).digest("hex");
    const data = parseMidi(file.bytes), analysis = analyzeMidi(file.bytes, { enablePresentationGrouping: false });
    const voices = annotateVoiceRolesV2(buildVoices(data), normalizeNotes(data));
    const parts = (data.timeSignature ?? "4/4").split("/").map(Number), meter = parts[0]! * 4 / parts[1]!;
    const items = file.events.map((event) => timelineItem(event, meter));
    const product = attachSourceVoicings(items, { analysis, sourceData: data, sourceVoices: voices }, new Map());
    byCategory[file.category] ??= { product: blank(), "source-rank": blank(), "product-guarded": blank(), "product-safe-prune": blank() };
    for (const [index, event] of file.events.entries()) {
      const baseline = unique(product[index]?.voicingMemory?.sourceVoicing?.midiNotes ?? []);
      const window = { startBeat: event.startBeat, endBeat: event.endBeat };
      const started = performance.now();
      const source = extractSourceV2(data.notes, data.ticksPerBeat, window, voices, baseline, "SOURCE_RANK");
      if (source.sourceTruth.length !== data.notes.length || source.sourceTruth.some((note, noteIndex) =>
        note.pitch !== data.notes[noteIndex]?.pitch || note.onsetTick !== data.notes[noteIndex]?.startTick
        || note.offsetTick !== data.notes[noteIndex]!.startTick + data.notes[noteIndex]!.durationTick))
        throw new Error("Raw source note facts changed");
      const guarded = extractSourceV2(data.notes, data.ticksPerBeat, window, voices, baseline, "PRODUCT_GUARDED");
      const safePrune = extractSourceV2(data.notes, data.ticksPerBeat, window, voices, baseline, "PRODUCT_SAFE_PRUNE");
      candidateMs += performance.now() - started;
      const raw = unique(source.sourceTruth.filter((n) => n.channel !== 9 && n.onsetTick < event.endBeat * data.ticksPerBeat
        && n.offsetTick > event.startBeat * data.ticksPerBeat).map((n) => n.pitch));
      const candidates = source.candidates.map((candidate) => candidate.midiNotes);
      for (const [arm, selection, detail] of [["product", baseline, source], ["source-rank", source.selected, source],
        ["product-guarded", guarded.selected, guarded], ["product-safe-prune", safePrune.selected, safePrune]] as const) {
        const used = arm as Arm;
        tally(totals[used], event.goldVoicingMidi, selection, support?.[index], candidates, raw,
          detail.excluded.length, detail.excluded.filter((entry) => entry.restorable
            && detail.sourceTruth.some((note) => note.id === entry.id)).length);
        tally(byCategory[file.category]![used], event.goldVoicingMidi, selection, support?.[index], candidates, raw,
          detail.excluded.length, detail.excluded.filter((entry) => entry.restorable
            && detail.sourceTruth.some((note) => note.id === entry.id)).length);
      }
    }
    if (createHash("sha256").update(file.bytes).digest("hex") !== hash) throw new Error("Source bytes changed");
    invariantFiles++; peakHeapMiB = Math.max(peakHeapMiB, process.memoryUsage().heapUsed / 1048576);
  }
  const shared = { corpusId: corpus, corpusVersion: corpus === "harmony-support" ? "1.0.0"
    : corpus === "p9-usage-profile-public" ? "p9-usage-profile-v2" : "p7-temporal-gold-v1",
    manifestSha, split, codeCommit, policyId: "p9.3-extraction-shadow-v1", boundarySource: "gold",
    identitySource: corpus === "p9-usage-profile-public" ? "product-predicted" : "gold",
    scoringContract: "p9.3-tier1-note-set-v1", metricVersion: "1" };
  return { provenanceByArm: Object.fromEntries(Object.keys(totals).map((arm) => [arm,
    { ...shared, snapshotSource: arm === "product" ? "product-extractor" : "p9.3-" + arm }])),
    files: inputs.length, sourceInvariantFiles: invariantFiles, totals, byCategory,
    runtime: { candidateMs: Math.round(candidateMs), peakHeapMiB: Math.round(peakHeapMiB) } };
}
function option(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const split = option("--split") ?? "dev";
if (split !== "dev" && split !== "validation") throw new Error("Invalid split");
const corpusDir = option("--corpus"), useUsage = process.argv.includes("--usage");
if (useUsage && (corpusDir || split !== "dev")) throw new Error("Usage corpus is dev-only");
const manifestSha = useUsage ? generateUsageCorpusV2().manifest.sha256
  : corpusDir ? createHash("sha256").update(await readFile(resolve(corpusDir, "manifest.json"))).digest("hex")
    : createHash("sha256").update(JSON.stringify(temporalGoldCases)).digest("hex");
const inputs: Input[] = useUsage ? usage() : corpusDir ? (await harmonyFiles(corpusDir, split)).map((file) => ({ file })) : temporal(split);
process.stdout.write(JSON.stringify(await evaluate(inputs, useUsage ? "p9-usage-profile-public"
  : corpusDir ? "harmony-support" : "p7-temporal-synthetic", split, manifestSha,
  option("--code-commit") ?? "working-tree"), null, 2) + "\n");
