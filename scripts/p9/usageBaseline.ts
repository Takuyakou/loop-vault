/** Research-only operational SourceSnapshot baseline on authored public synthetic. */
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import { attachSourceVoicing } from "../../src/domain/voicing/sourceVoicing";
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";
import { encodeUsageCase } from "./encodeUsage.mjs";
import type { UsageCase, UsageGoldEvent } from "./usageProfile.mjs";

type Count = { events: number; exact: number; expected: number; matched: number; predicted: number; missing: number; extra: number; bassMissing: number; supportExpected: number; supportMatched: number };
const zero = (): Count => ({ events: 0, exact: 0, expected: 0, matched: 0, predicted: 0, missing: 0, extra: 0, bassMissing: 0, supportExpected: 0, supportMatched: 0 });
function score(count: Count, source: UsageCase, event: UsageGoldEvent, prediction: number[]) {
  const gold = new Set<number>(event.sourceNotes), found = new Set<number>(prediction);
  const matched = [...gold].filter((pitch) => found.has(pitch)).length;
  const support = new Set<number>(source.notes.filter((note) =>
    (note.role === "support" || note.role === "bass") &&
    note.startTick < event.endTick && note.startTick + note.durationTick > event.startTick &&
    gold.has(note.pitch)).map((note) => note.pitch));
  count.events++; count.expected += gold.size; count.predicted += found.size; count.matched += matched;
  count.missing += gold.size - matched; count.extra += found.size - matched;
  count.supportExpected += support.size;
  count.supportMatched += [...support].filter((pitch) => found.has(pitch)).length;
  if (gold.size === found.size && matched === gold.size) count.exact++;
  const bass = source.notes.filter((note) =>
    note.role === "bass" && note.startTick < event.endTick && note.startTick + note.durationTick > event.startTick &&
    gold.has(note.pitch)).map((note) => note.pitch);
  if (bass.length && bass.every((pitch: number) => !found.has(pitch))) count.bassMissing++;
}
const corpus = generateUsageCorpusV2();
const totals = zero();
const byFamily: Record<string, Count> = {};
let elapsedMs = 0, peakHeapBytes = process.memoryUsage().heapUsed;
let goldBoundaryCount = 0, productBoundaryCount = 0, boundaryHits = 0;
for (const source of corpus.cases) {
  const started = performance.now();
  const bytes = encodeUsageCase(source);
  const analysis = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const data = parseMidi(bytes);
  const voices = annotateVoiceRolesV2(buildVoices(data), normalizeNotes(data));
  const meterBeats = source.meter[0] * 4 / source.meter[1];
  const product = analysis.fullTimeline;
  const productStarts = product.slice(1).map((item) => (item.bar - 1) * meterBeats + item.beat - 1);
  const goldStarts = source.gold.slice(1).map((event) => event.startTick / source.ppq);
  goldBoundaryCount += goldStarts.length; productBoundaryCount += productStarts.length;
  boundaryHits += goldStarts.filter((beat) => productStarts.some((value) => Math.abs(value - beat) < 0.001)).length;
  byFamily[source.family] ??= zero();
  for (const event of source.gold) {
    const startBeat = event.startTick / source.ppq;
    const productEvent = [...product].reverse().find((item) =>
      (item.bar - 1) * meterBeats + item.beat - 1 <= startBeat + 0.001);
    const selected = productEvent && {
      ...productEvent,
      bar: Math.floor(startBeat / meterBeats) + 1,
      beat: startBeat % meterBeats + 1,
      durationBeats: (event.endTick - event.startTick) / source.ppq,
    };
    const captured = selected && attachSourceVoicing(selected, { analysis, sourceData: data, sourceVoices: voices });
    const notes = captured?.voicingMemory?.sourceVoicing?.midiNotes ?? [];
    score(totals, source, event, notes);
    score(byFamily[source.family]!, source, event, notes);
  }
  elapsedMs += performance.now() - started;
  peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
}
const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const provenance = { corpusId: "p9-usage-profile-public", corpusVersion: corpus.manifest.generatorVersion,
  manifestSha: corpus.manifest.sha256, split: "dev", codeCommit, policyId: "current-product-default",
  boundarySource: "authored-gold", identitySource: "product-predicted",
  snapshotSource: "product-extractor", scoringContract: "tier1-note-set-conditional-v1", metricVersion: "1" };
process.stdout.write(JSON.stringify({ provenance, condition: "Gold source windows + Product-predicted identity",
  totals, byFamily, boundaries: { gold: goldBoundaryCount, product: productBoundaryCount, hits: boundaryHits },
  elapsedMs: Math.round(elapsedMs), peakHeapBytes }, null, 2) + "\n");
