/** P9.1 public Gold, matched A/B shadow evaluation. Never loads holdout or private witness. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import { parseChordLabel } from "../../src/domain/chords";
import { JsonVaultRepository, createEmptyVault, type VaultStorage } from "../../src/domain/repository";
import { attachSourceVoicings } from "../../src/domain/voicing/sourceVoicing";
import { normalizedChordKey } from "../../src/domain/voicing/normalizeVoicing";
import { createTimelineVoicingPlaybackPlan, resolveTimelineItemVoicing } from "../../src/domain/voicing/resolveVoicing";
import { buildProgressionVoicingPracticeSnapshot } from "../../src/domain/progressionVoicingPractice/snapshot";
import { makeIdea } from "../../src/domain/testFactory";
import type { ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from "../../src/domain/types";
import { harmonyFiles, syntheticFiles, type GoldFile } from "../p7/tier1Harness";
import { inspectSourceCandidates, selectSourceNotes, type SourcePolicy } from "./sourceIndependent";
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";
import { encodeUsageCase } from "./encodeUsage.mjs";

type Checkpoint = "extraction" | "persistence" | "card" | "capture" | "whole";
type Aggregate = { events: number; exact: number; gold: number; predicted: number; matched: number; missing: number; extra: number; bassMissing: number; unavailable: number; duration: number; exactDuration: number };
const checkpoints: Checkpoint[] = ["extraction", "persistence", "card", "capture", "whole"];
const blank = (): Aggregate => ({ events: 0, exact: 0, gold: 0, predicted: 0, matched: 0, missing: 0, extra: 0, bassMissing: 0, unavailable: 0, duration: 0, exactDuration: 0 });
const empty = () => Object.fromEntries(checkpoints.map((key) => [key, blank()])) as Record<Checkpoint, Aggregate>;
const notes = (value: readonly number[] | undefined) => value ? [...new Set(value)].sort((a, b) => a - b) : undefined;
function tally(value: Aggregate, goldNotes: number[], foundNotes: number[] | undefined, duration: number) {
  const gold = new Set(goldNotes), found = new Set(foundNotes ?? []);
  const matched = [...gold].filter((pitch) => found.has(pitch)).length;
  value.events++; value.gold += gold.size; value.predicted += found.size; value.matched += matched;
  value.missing += gold.size - matched; value.extra += found.size - matched;
  if (goldNotes[0] !== undefined && !found.has(goldNotes[0])) value.bassMissing++;
  if (foundNotes === undefined) value.unavailable++;
  value.duration += duration;
  if (foundNotes && gold.size === found.size && gold.size === matched) { value.exact++; value.exactDuration += duration; }
}
class Storage implements VaultStorage {
  files = new Map<string, string>();
  async ensureDir(): Promise<void> {}
  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async readText(path: string): Promise<string> { const value = this.files.get(path); if (value === undefined) throw new Error("Missing research Vault record"); return value; }
  async writeText(path: string, value: string): Promise<void> { this.files.set(path, value); }
  async rename(from: string, to: string): Promise<void> { this.files.set(to, await this.readText(from)); this.files.delete(from); }
  async copyFile(from: string, to: string): Promise<void> { this.files.set(to, await this.readText(from)); }
  async removeFile(path: string): Promise<void> { this.files.delete(path); }
  async listFiles(path: string): Promise<string[]> { return [...this.files.keys()].filter((key) => key.startsWith(path + "/")).map((key) => key.slice(path.length + 1)); }
}
async function roundtrip(items: ChordTimelineItem[], timeSignature: string, bpm: number): Promise<SavedProgressionBlock> {
  const block: SavedProgressionBlock = { id: "22222222-2222-4222-8222-222222222222", summaryText: "P9.1 public evaluation", chords: items, bpm, timeSignature, tags: [], capturedAt: "2026-01-01T00:00:00.000Z", analyzerVersion: "p9-research" };
  const vault = createEmptyVault();
  vault.ideas = [makeIdea({ title: "P9.1 public evaluation", progressionBlocks: [block] })];
  const repo = new JsonVaultRepository(new Storage(), { now: () => new Date("2026-01-01T00:00:00.000Z") });
  await repo.save(vault);
  const loaded = await repo.load();
  if (loaded.quarantine.length || loaded.created) throw new Error("Research Vault roundtrip failed");
  const saved = loaded.vault.ideas[0]?.progressionBlocks?.[0];
  if (!saved) throw new Error("Research Vault lost block");
  return saved;
}
function item(event: GoldFile["events"][number], meterBeats: number): ChordTimelineItem {
  const chord = parseChordLabel(event.chordSymbol);
  if (!chord) throw new Error("Unparsable versioned Gold identity");
  return { bar: Math.floor(event.startBeat / meterBeats) + 1, beat: event.startBeat % meterBeats + 1, durationBeats: event.endBeat - event.startBeat, chord, confidence: 1, alternatives: [], warnings: [] };
}
function sourceSnapshot(item: ChordTimelineItem, selected: number[], bassNote: number | undefined): VoicingSnapshot {
  return { schemaVersion: 1, source: "midi-extracted", representation: "simultaneous-voicing", midiNotes: selected,
    ...(bassNote === undefined ? {} : { bassNote }), capturedForChordKey: normalizedChordKey(item.chord),
    capturedForChordLabel: item.chord.label, confidence: 1, extractorVersion: "p9.1-research-source-independent-v1" };
}
function snapshotNotes(item: ChordTimelineItem | undefined): number[] | undefined {
  return notes(item?.voicingMemory?.sourceVoicing?.midiNotes);
}
async function evaluate(files: GoldFile[], policy: SourcePolicy) {
  const totals = { product: empty(), independent: empty() };
  let elapsedProduct = 0, elapsedIndependent = 0, peakHeapBytes = process.memoryUsage().heapUsed;
  const review = { productUnavailable: 0, independentUnavailable: 0, independentCandidateCount: 0, rawGoldNotesPresent: 0, rawGoldNotesTotal: 0, eventsWithExactSimultaneousCandidate: 0 };
  for (const file of files) {
    const data = parseMidi(file.bytes);
    const analysis = analyzeMidi(file.bytes, { enablePresentationGrouping: false });
    const voices = annotateVoiceRolesV2(buildVoices(data), normalizeNotes(data));
    const timeSignature = data.timeSignature ?? "4/4";
    const meterParts = timeSignature.split("/").map(Number);
    const meterBeats = meterParts[0]! * 4 / meterParts[1]!;
    if (!Number.isFinite(meterBeats) || meterBeats <= 0) throw new Error("Invalid public source meter");
    const baseline = file.events.map((event) => item(event, meterBeats));
    const productStarted = performance.now();
    const product = attachSourceVoicings(baseline, { analysis, sourceData: data, sourceVoices: voices }, new Map());
    elapsedProduct += performance.now() - productStarted;
    const independentStarted = performance.now();
    const independent = baseline.map((entry, index) => {
      const gold = file.events[index]!;
      const candidateFacts = inspectSourceCandidates(data.notes, data.ticksPerBeat,
        { startBeat: gold.startBeat, endBeat: gold.endBeat }, voices);
      const goldSet = new Set(gold.goldVoicingMidi);
      const rawSet = new Set(candidateFacts.rawUnion);
      review.rawGoldNotesTotal += goldSet.size;
      review.rawGoldNotesPresent += [...goldSet].filter((pitch) => rawSet.has(pitch)).length;
      if (candidateFacts.simultaneous.some((candidate) =>
        candidate.length === goldSet.size && candidate.every((pitch) => goldSet.has(pitch)))) {
        review.eventsWithExactSimultaneousCandidate++;
      }
      const selected = selectSourceNotes(data.notes, data.ticksPerBeat, { startBeat: gold.startBeat, endBeat: gold.endBeat }, voices, policy);
      review.independentCandidateCount += selected.candidateCount;
      if (selected.midiNotes.length < 2) return entry;
      return { ...entry, voicingMemory: { sourceVoicing: sourceSnapshot(entry, selected.midiNotes, selected.bassNote), playbackChoice: "SOURCE" as const } };
    });
    elapsedIndependent += performance.now() - independentStarted;
    for (const [arm, entries] of [["product", product], ["independent", independent]] as const) {
      const stored = await roundtrip(entries, timeSignature, data.tempo ?? 120);
      const capture = createTimelineVoicingPlaybackPlan(entries, "p91-capture");
      const whole = buildProgressionVoicingPracticeSnapshot({
        sourceReference: { ideaId: "11111111-1111-4111-8111-111111111111", blockId: stored.id },
        block: stored, selection: "source-midi",
      });
      for (const [index, gold] of file.events.entries()) {
        const source = entries[index], saved = stored.chords[index], captureEntry = capture.timeline[index];
        const captured = captureEntry && (capture.explicitMidiNotesByEventId[captureEntry.eventId!] ?? resolveTimelineItemVoicing(captureEntry).midiNotes);
        const wholeNotes = whole.ok ? whole.snapshot.events[index]?.voicing?.midiNotes : undefined;
        const observations: Record<Checkpoint, number[] | undefined> = {
          extraction: snapshotNotes(source), persistence: snapshotNotes(saved),
          card: saved ? notes(resolveTimelineItemVoicing(saved).midiNotes) : undefined,
          capture: notes(captured), whole: notes(wholeNotes),
        };
        if (!observations.extraction) {
          if (arm === "product") review.productUnavailable++; else review.independentUnavailable++;
        }
        for (const checkpoint of checkpoints) tally(totals[arm][checkpoint], gold.goldVoicingMidi, observations[checkpoint], gold.endBeat - gold.startBeat);
      }
    }
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }
  return { totals, review, runtime: { productMs: Math.round(elapsedProduct), independentMs: Math.round(elapsedIndependent), peakHeapBytes } };
}
function option(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const split = option("--split") ?? "dev";
if (split !== "dev" && split !== "validation") throw new Error("Only dev and validation are allowed");
const corpusDir = option("--corpus");
const policyArg = option("--policy") ?? "densest";
if (!["densest", "onset-support", "duration-support", "role-aware-union"].includes(policyArg)) throw new Error("Unknown policy");
const policy = policyArg as SourcePolicy;
const usage = process.argv.includes("--usage") ? generateUsageCorpusV2() : undefined;
if (usage && corpusDir) throw new Error("Usage and Harmony corpus cannot be combined");
if (usage && split !== "dev") throw new Error("Usage v2 has dev only");
const files: GoldFile[] = usage ? usage.cases.map((source) => {
  const bytes = encodeUsageCase(source);
  const analysis = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const meter = source.meter[0] * 4 / source.meter[1];
  const events = source.gold.map((gold) => {
    const startBeat = gold.startTick / source.ppq;
    const product = [...analysis.fullTimeline].reverse().find((entry) =>
      (entry.bar - 1) * meter + entry.beat - 1 <= startBeat + 0.001);
    if (!product) throw new Error("Missing Product identity at Gold window");
    return { startBeat, endBeat: gold.endTick / source.ppq,
      chordSymbol: product.chord.label, goldVoicingMidi: [...gold.sourceNotes] };
  });
  return { bytes, category: source.family, events };
}) : corpusDir ? await harmonyFiles(corpusDir, split) : syntheticFiles();
const manifestSha = usage ? usage.manifest.sha256 : corpusDir
  ? createHash("sha256").update(await readFile(resolve(corpusDir, "manifest.json"))).digest("hex")
  : createHash("sha256").update(JSON.stringify((await import("../p7/temporalGold")).temporalGoldCases)).digest("hex");
const result = await evaluate(files, policy);
const shared = { corpusId: usage ? "p9-usage-profile-public" : corpusDir ? "harmony-support" : "p7-temporal-synthetic", corpusVersion: usage ? usage.manifest.generatorVersion : corpusDir ? "1.0.0" : "p7-temporal-gold-v1",
  manifestSha, split: usage ? "dev" : corpusDir ? split : "authored-regression", codeCommit: option("--code-commit") ?? "working-tree",
  policyId: "p9.1-source-selection-shadow-v1", boundarySource: "gold", identitySource: usage ? "product-predicted" : "gold",
  scoringContract: "p9.1-tier1-note-set-checkpoints-v1", metricVersion: "1" };
process.stdout.write(JSON.stringify({ policy, files: files.length, events: files.reduce((n, file) => n + file.events.length, 0),
  provenanceByArm: { product: { ...shared, snapshotSource: "product-extractor" }, independent: { ...shared, snapshotSource: "source-independent-" + policy } },
  ...result }, null, 2) + "\n");
