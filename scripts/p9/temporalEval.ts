/** P9.2 public temporal Gold only. No holdout or private witness loading. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { harmonyFiles } from "../p7/tier1Harness";
import { encodeTemporalGoldMidi, temporalGoldCases } from "../p7/temporalGold";
import { buildTemporalSourceEvidence } from "./temporalSourceEvidence";
import { encodeExpandedTemporal, expandedTemporalDev } from "./temporalExpandedGold";
import { proposeTemporalHeads, selectTemporalBoundaries, type TemporalHead, type TemporalSelector } from "./temporalV2";

type Head = TemporalHead;
type Method = "ALL_LATTICE" | "P8_SCORE_TOPK" | "P8_CORROBORATED" | "P9_STRUCTURAL" | "PRODUCT";
type Row = { files: number; gold: number; proposed: number; hit: number; falseProposals: number; correctionCost: number; predictedCards: number; goldCards: number; passingPreserved: number; passingTotal: number; maxFileProposals: number };
interface Source {
  bytes: Uint8Array;
  category: string;
  gold: Record<Head, number[]>;
  passing?: number[];
}
const heads: Head[] = ["HARMONIC", "VOICING", "ORNAMENT_NOTE_EVENT"];
const methods: Method[] = ["ALL_LATTICE", "P8_SCORE_TOPK", "P8_CORROBORATED", "P9_STRUCTURAL", "PRODUCT"];
const blank = (): Row => ({ files: 0, gold: 0, proposed: 0, hit: 0, falseProposals: 0, correctionCost: 0,
  predictedCards: 0, goldCards: 0, passingPreserved: 0, passingTotal: 0, maxFileProposals: 0 });
const same = (a: number, b: number, ppq: number) => Math.abs(a - b) <= 1 / ppq + 1e-6;
function score(target: Row, truth: number[], proposed: number[], ppq: number, passing?: number[]) {
  const hit = truth.filter((beat) => proposed.some((value) => same(value, beat, ppq))).length;
  const extra = proposed.filter((beat) => !truth.some((value) => same(value, beat, ppq))).length;
  target.files++; target.gold += truth.length; target.proposed += proposed.length;
  target.hit += hit; target.falseProposals += extra; target.correctionCost += truth.length - hit + extra;
  target.predictedCards += proposed.length + 1; target.goldCards += truth.length + 1;
  target.maxFileProposals = Math.max(target.maxFileProposals, proposed.length);
  if (passing) { target.passingTotal++; if (passing.every((beat) => proposed.some((value) => same(value, beat, ppq)))) target.passingPreserved++; }
}
function sourceFromTemporal(split: "dev" | "validation"): Source[] {
  const cases = split === "dev" ? temporalGoldCases.slice(0, 9) : temporalGoldCases.slice(9);
  return cases.map((item) => ({
    bytes: encodeTemporalGoldMidi(item), category: item.category,
    gold: {
      HARMONIC: item.harmonicSpans.slice(1).map((span) => span.startBeat),
      VOICING: item.voicingSpans.slice(1).map((span) => span.startBeat),
      ORNAMENT_NOTE_EVENT: [...new Set(item.noteEvents.map((event) => event.startBeat))],
    },
    ...(["one-beat-passing-chord", "half-beat-passing-chord"].includes(item.category)
      ? { passing: item.harmonicSpans.slice(1).map((span) => span.startBeat) } : {}),
  }));
}
function sourceFromExpanded(): Source[] {
  return expandedTemporalDev.map((item) => ({
    bytes: encodeExpandedTemporal(item), category: item.id,
    gold: { HARMONIC: item.harmonic, VOICING: item.voicing, ORNAMENT_NOTE_EVENT: item.noteEvents },
    ...(item.passing ? { passing: item.passing } : {}),
  }));
}
async function sourceFromHarmony(corpusDir: string, split: "dev" | "validation"): Promise<{ sources: Source[]; manifestSha: string }> {
  const manifestBytes = await readFile(resolve(corpusDir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files: Array<{
    split: string; scenarioParameters: { mode: string };
    events: Array<{ startBeat: number; chordSymbol: string; goldVoicingMidi: number[] }> }> };
  const verified = await harmonyFiles(corpusDir, split);
  const selected = manifest.files.filter((file) => file.split === split);
  if (verified.length !== selected.length) throw new Error("Public Harmony manifest mismatch");
  const sources = verified.map((file, index): Source => {
    const meta = selected[index]!;
    const harmonic: number[] = [], voicing: number[] = [];
    for (let i = 1; i < meta.events.length; i++) {
      const previous = meta.events[i - 1]!, current = meta.events[i]!;
      if (current.chordSymbol !== previous.chordSymbol) harmonic.push(current.startBeat);
      if (JSON.stringify([...current.goldVoicingMidi].sort((a, b) => a - b))
        !== JSON.stringify([...previous.goldVoicingMidi].sort((a, b) => a - b))) voicing.push(current.startBeat);
    }
    const diagnostic = ["allch0", "allch0clear", "status"].includes(meta.scenarioParameters.mode);
    return { bytes: file.bytes, category: diagnostic ? "diagnostic" : "harmony-primary",
      gold: { HARMONIC: harmonic, VOICING: voicing, ORNAMENT_NOTE_EVENT: [] } };
  });
  return { sources, manifestSha: createHash("sha256").update(manifestBytes).digest("hex") };
}
function methodMode(method: Method): TemporalSelector {
  if (method === "P8_SCORE_TOPK") return "SCORE_TOPK";
  if (method === "P8_CORROBORATED") return "CORROBORATED";
  if (method === "P9_STRUCTURAL") return "STRUCTURAL";
  return "ALL_LATTICE";
}
async function evaluate(sources: Source[], corpus: string, split: string, manifestSha: string) {
  const totals: Record<string, Row> = {}, byCategory: Record<string, Record<string, Row>> = {};
  let proposalMs = 0, selectionMs = 0, productMs = 0, peakHeapBytes = process.memoryUsage().heapUsed;
  let sourceInvariant = 0;
  const boundaryFeatures = { goldOnsetCount: {} as Record<string, number>,
    goldScoreBand: {} as Record<string, number>, nonGoldOnsetCount: {} as Record<string, number> };
  const bump = (target: Record<string, number>, key: string) => { target[key] = (target[key] ?? 0) + 1; };
  for (const source of sources) {
    const beforeHash = createHash("sha256").update(source.bytes).digest("hex");
    const data = parseMidi(source.bytes);
    const meterParts = (data.timeSignature ?? "4/4").split("/").map(Number);
    const meterBeats = meterParts[0]! * 4 / meterParts[1]!;
    const started = performance.now();
    const bundle = buildTemporalSourceEvidence(data);
    const proposed = proposeTemporalHeads(bundle);
    proposalMs += performance.now() - started;
    for (const row of proposed.proposals.HARMONIC) {
      const gold = source.gold.HARMONIC.some((beat) => same(beat, row.beat, data.ticksPerBeat));
      if (gold) {
        bump(boundaryFeatures.goldOnsetCount, String(Math.min(5, row.onsetCount)));
        bump(boundaryFeatures.goldScoreBand, String(Math.floor(row.score * 10) / 10));
      } else if (row.score >= 0.5) bump(boundaryFeatures.nonGoldOnsetCount, String(Math.min(5, row.onsetCount)));
    }
    const selectedStarted = performance.now();
    const output: Record<Method, Partial<Record<Head, number[]>>> = {
      ALL_LATTICE: {}, P8_SCORE_TOPK: {}, P8_CORROBORATED: {}, P9_STRUCTURAL: {}, PRODUCT: {},
    };
    for (const method of methods.filter((value) => value !== "PRODUCT")) {
      for (const head of heads) output[method][head] = selectTemporalBoundaries(proposed, head, methodMode(method));
    }
    selectionMs += performance.now() - selectedStarted;
    const productStarted = performance.now();
    output.PRODUCT.HARMONIC = analyzeMidi(source.bytes, { enablePresentationGrouping: false })
      .fullTimeline.slice(1).map((item) => (item.bar - 1) * meterBeats + item.beat - 1);
    productMs += performance.now() - productStarted;
    for (const method of methods) {
      for (const head of heads) {
        if ((corpus === "harmony-support" && head === "ORNAMENT_NOTE_EVENT")
          || (method === "PRODUCT" && head !== "HARMONIC")) continue;
        const key = method + "/" + head;
        totals[key] ??= blank();
        byCategory[source.category] ??= {};
        byCategory[source.category]![key] ??= blank();
        const selected = output[method][head] ?? [];
        score(totals[key], source.gold[head], selected, data.ticksPerBeat,
          head === "HARMONIC" ? source.passing : undefined);
        score(byCategory[source.category]![key], source.gold[head], selected, data.ticksPerBeat,
          head === "HARMONIC" ? source.passing : undefined);
      }
    }
    if (createHash("sha256").update(source.bytes).digest("hex") !== beforeHash
      || proposed.ppq !== data.ticksPerBeat || proposed.sourceMeter !== data.timeSignature) {
      throw new Error("Temporal source bytes, PPQ, or meter changed");
    }
    sourceInvariant++;
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }
  const provenance = { corpusId: corpus, corpusVersion: corpus === "harmony-support" ? "1.0.0" : corpus === "p9-expanded-temporal-public" ? "p9-temporal-expanded-dev-v1" : "p7-temporal-gold-v1",
    manifestSha, split, codeCommit: option("--code-commit") ?? "working-tree",
    policyId: "p9.2-temporal-shadow-v1", boundarySource: corpus === "harmony-support"
      ? "independent-manifest-identity-and-voicing-change" : "authored-temporal-gold",
    identitySource: "none-boundary-only", snapshotSource: "raw-midi-source-evidence",
    scoringContract: "p9.2-three-head-boundary-v1", metricVersion: "1" };
  return { provenance, files: sources.length, sourceInvariant, totals, byCategory, boundaryFeatures,
    runtime: { proposalMs: Math.round(proposalMs), selectionMs: Math.round(selectionMs),
      productMs: Math.round(productMs), peakHeapBytes } };
}
function option(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const split = option("--split") ?? "dev";
if (split !== "dev" && split !== "validation") throw new Error("Only dev/validation permitted");
const corpusDir = option("--corpus");
const expanded = process.argv.includes("--expanded");
if (expanded && (corpusDir || split !== "dev")) throw new Error("Expanded authored corpus is dev only");
const temporalSha = createHash("sha256").update(JSON.stringify(temporalGoldCases)).digest("hex");
const expandedSha = createHash("sha256").update(JSON.stringify(expandedTemporalDev)).digest("hex");
const { sources, manifestSha } = expanded
  ? { sources: sourceFromExpanded(), manifestSha: expandedSha }
  : corpusDir ? await sourceFromHarmony(corpusDir, split)
  : { sources: sourceFromTemporal(split), manifestSha: temporalSha };
const result = await evaluate(sources, expanded ? "p9-expanded-temporal-public" : corpusDir ? "harmony-support" : "p7-temporal-synthetic", split, manifestSha);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
