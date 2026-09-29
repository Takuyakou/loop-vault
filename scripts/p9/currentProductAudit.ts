/** Research-only, Gold-boundary/Gold-identity source extraction audit. */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HarmonySupportManifest } from "../phase442/harmonySupportCorpus";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { parseChordLabel } from "../../src/domain/chords";
import { attachSourceVoicings } from "../../src/domain/voicing/sourceVoicing";
import { harmonyFiles, syntheticFiles, type GoldFile } from "../p7/tier1Harness";
import { temporalGoldCases } from "../p7/temporalGold";
import type { ChordTimelineItem } from "../../src/domain/types";

type Count = { events: number; exact: number; gold: number; matched: number; predicted: number; missing: number; extra: number; bassMissing: number };
type AuditEvent = GoldFile["events"][number] & { goldBassMidi?: number[] };
const zero = (): Count => ({ events: 0, exact: 0, gold: 0, matched: 0, predicted: 0, missing: 0, extra: 0, bassMissing: 0 });
function tally(out: Count, goldNotes: readonly number[], candidate: readonly number[], goldBass?: readonly number[]) {
  const gold = new Set(goldNotes), predicted = new Set(candidate);
  const matched = [...gold].filter((note) => predicted.has(note)).length;
  out.events++; out.gold += gold.size; out.predicted += predicted.size; out.matched += matched;
  out.missing += gold.size - matched; out.extra += predicted.size - matched;
  if (gold.size === predicted.size && matched === gold.size) out.exact++;
  const bass = goldBass ?? (gold.size ? [Math.min(...gold)] : []);
  if (bass.some((note) => !predicted.has(note))) out.bassMissing++;
}
function item(event: GoldFile["events"][number], meter: number): ChordTimelineItem {
  const chord = parseChordLabel(event.chordSymbol);
  if (!chord) throw new Error("Gold identity unsupported by current Product parser.");
  return { bar: Math.floor(event.startBeat / meter) + 1, beat: event.startBeat % meter + 1,
    durationBeats: event.endBeat - event.startBeat, chord, confidence: 1, alternatives: [], warnings: [] };
}
async function runGroup(files: GoldFile[]) {
  const raw = zero(), optionalFilter = zero();
  const boundaries = { gold: 0, product: 0, exactHits: 0 };
  const tier2Structural = { events: 0, root: 0, quality: 0, bass: 0, all: 0 };
  const filterImpact = { newlyMissingGold: 0, recoveredGold: 0, extraRemoved: 0, extraAdded: 0 };
  let elapsedMs = 0, peakHeap = process.memoryUsage().heapUsed;
  for (const file of files) {
    const started = performance.now();
    const analysis = analyzeMidi(file.bytes, { enablePresentationGrouping: false });
    const data = parseMidi(file.bytes);
    const voices = annotateVoiceRolesV2(buildVoices(data), normalizeNotes(data));
    const meter = beatsPerBar(analysis.timeSignature);
    const timeline = file.events.map((event) => item(event, meter));
    const context = { analysis, sourceData: data, sourceVoices: voices };
    const normal = attachSourceVoicings(timeline, context);
    const filtered = attachSourceVoicings(timeline, { ...context, accuracyFirst: { melodyContaminationFilter: true } });
    elapsedMs += performance.now() - started;
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    const goldStarts = file.events.slice(1).map((event) => event.startBeat);
    const predictedStarts = analysis.fullTimeline.slice(1).map((event) => (event.bar - 1) * meter + event.beat - 1);
    boundaries.gold += goldStarts.length;
    boundaries.product += predictedStarts.length;
    boundaries.exactHits += goldStarts.filter((beat) => predictedStarts.some((value) => Math.abs(value - beat) < 0.001)).length;
    file.events.forEach((event, index) => {
      const goldChord = parseChordLabel(event.chordSymbol);
      const candidate = [...analysis.fullTimeline].reverse().find((row) =>
        (row.bar - 1) * meter + row.beat - 1 <= event.startBeat + 0.001);
      if (goldChord) {
        tier2Structural.events++;
        const root = candidate?.chord.root === goldChord.root;
        const quality = candidate?.chord.quality === goldChord.quality;
        const bass = (candidate?.chord.bass ?? candidate?.chord.root) === (goldChord.bass ?? goldChord.root);
        if (root) tier2Structural.root++;
        if (quality) tier2Structural.quality++;
        if (bass) tier2Structural.bass++;
        if (root && quality && bass) tier2Structural.all++;
      }
      const gold = new Set(event.goldVoicingMidi);
      const rawNotes = new Set(normal[index]?.voicingMemory?.sourceVoicing?.midiNotes ?? []);
      const filteredNotes = new Set(filtered[index]?.voicingMemory?.sourceVoicing?.midiNotes ?? []);
      const bass = (event as AuditEvent).goldBassMidi;
      tally(raw, event.goldVoicingMidi, [...rawNotes], bass);
      tally(optionalFilter, event.goldVoicingMidi, [...filteredNotes], bass);
      for (const note of gold) {
        if (rawNotes.has(note) && !filteredNotes.has(note)) filterImpact.newlyMissingGold++;
        if (!rawNotes.has(note) && filteredNotes.has(note)) filterImpact.recoveredGold++;
      }
      for (const note of rawNotes) if (!gold.has(note) && !filteredNotes.has(note)) filterImpact.extraRemoved++;
      for (const note of filteredNotes) if (!gold.has(note) && !rawNotes.has(note)) filterImpact.extraAdded++;
    });
  }
  return { files: files.length, raw, optionalFilter, boundaries, tier2Structural, filterImpact, elapsedMs: Math.round(elapsedMs), peakHeapBytes: peakHeap };
}
function arg(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const split = arg("--split") ?? "dev";
if (split !== "dev" && split !== "validation") throw new Error("Only dev/validation are available; sealed holdout is forbidden.");
const corpusDir = arg("--corpus");
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const groups: Record<string, GoldFile[]> = { "p7-temporal-synthetic": syntheticFiles() };
const provenanceByGroup: Record<string, Record<string, string>> = {
  "p7-temporal-synthetic": {
    corpusId: "p7-temporal-synthetic", corpusVersion: "p7-temporal-gold-v1",
    manifestSha: digest(JSON.stringify(temporalGoldCases)), split: "authored-regression",
    codeCommit, policyId: "current-product-default-filter-off",
    boundarySource: "gold", identitySource: "gold", snapshotSource: "product-extractor",
    scoringContract: "tier1-conditional+structural-proxy-v1", metricVersion: "1",
  },
};
if (corpusDir) {
  const manifestBytes = await readFile(resolve(corpusDir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as HarmonySupportManifest;
  provenanceByGroup["public-harmony-" + split] = {
    corpusId: "harmony-support", corpusVersion: manifest.corpusVersion,
    manifestSha: digest(manifestBytes), split, codeCommit,
    policyId: "current-product-default-filter-off", boundarySource: "gold",
    identitySource: "gold", snapshotSource: "product-extractor",
    scoringContract: "tier1-conditional+structural-proxy-v1", metricVersion: "1",
  };
  const selected = manifest.files.filter((file) => file.split === split);
  const loaded = await harmonyFiles(corpusDir, split);
  groups["public-harmony-" + split] = loaded.map((file, fileIndex) => ({
    ...file, events: file.events.map((event, eventIndex) => ({
      ...event, goldBassMidi: selected[fileIndex]?.events[eventIndex]?.goldBassMidi,
    })),
  }));
}
const result: Record<string, Awaited<ReturnType<typeof runGroup>>> = {};
for (const [name, files] of Object.entries(groups)) result[name] = await runGroup(files);
process.stdout.write(JSON.stringify({ version: "p9-current-product-audit-v1", comparisonCondition: "Gold boundary + Gold identity", comparisonAblation: ["policyId"],
  provenanceByGroup: Object.fromEntries(Object.entries(provenanceByGroup).map(([group, raw]) => [group, {
    raw, optionalFilter: { ...raw, policyId: "current-product-relative-support-filter-on" },
  }])), result }, null, 2) + "\n");
