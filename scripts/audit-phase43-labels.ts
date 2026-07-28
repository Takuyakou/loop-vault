import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../src/domain/chordIdentity";
import { labelFromSymbol, parseChordLabel } from "../src/domain/chords";
import { analyzeMidi } from "../src/domain/midi";
import {
  operationCorrectionCostResult,
  summarizeOperationCorrectionCosts,
} from "../src/domain/midi/correctionCost";
import type { ChordTimelineItem } from "../src/domain/types";

type Split = "dev" | "validation" | "holdout";

interface CorpusManifest {
  corpusVersion: string;
  generatorVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: Split;
  timeSignature: { numerator: number; denominator: number };
  events: GoldEvent[];
}

interface GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
}

const corpusDir = resolve(cwd(), option("--corpus")
  ?? "test/loop-vault-voicing-gold-corpus-v1");
const split = (option("--split") ?? "dev") as Split;
const output = resolve(cwd(), option("--output")
  ?? "docs/phase4.3/01-label-alternative-audit.json");

const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as CorpusManifest;
const files = manifest.files.filter((file) => file.split === split);

const rows = [];
const familyCounts = new Map<string, number>();
const top3MissLabelCounts = new Map<string, number>();
let representable = 0;
let top3Canonical = 0;
let top3Root = 0;
let canonicalAt1 = 0;
let rootAt1 = 0;
let qualityAt1 = 0;
let seventhAt1 = 0;
let tensionAt1 = 0;
let reciprocalRank = 0;
let rankedCanonical = 0;
let rankTotal = 0;
let rootDiversity = 0;
let canonicalDiversity = 0;
let duplicateIdentityCount = 0;

for (const file of files) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const analysis = analyzeMidi(bytes, { mode: "phase4-v1", fileName: file.path });
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);

  for (const event of file.events) {
    const item = bestTimelineItem(analysis.fullTimeline, event, beatsPerBar);
    const candidates = item
      ? [item.chord, ...item.alternatives.map((entry) => entry.chord)].slice(0, 3)
      : [];
    const expected = normalizeChordLabel(event.chordSymbol);
    const expectedKey = expected ? chordIdentityKey(expected) : undefined;
    const identities = candidates
      .map((candidate) => normalizeChordLabel(candidate.label))
      .filter((identity): identity is NormalizedChordIdentity => identity !== null);
    const candidateKeys = identities.map(chordIdentityKey);
    const canonicalRank = expectedKey
      ? candidateKeys.findIndex((key) => key === expectedKey) + 1
      : 0;
    const rootRank = expected
      ? identities.findIndex((identity) => identity.rootPitchClass === expected.rootPitchClass) + 1
      : 0;
    const isRepresentable = identityRoundTrips(event.chordSymbol);
    if (isRepresentable) representable += 1;
    else bump(familyCounts, unsupportedFamily(event.chordSymbol));
    if (canonicalRank > 0) {
      top3Canonical += 1;
      reciprocalRank += 1 / canonicalRank;
      rankTotal += canonicalRank;
      rankedCanonical += 1;
    }
    else bump(top3MissLabelCounts, event.chordSymbol);
    if (rootRank > 0) top3Root += 1;
    if (canonicalRank === 1) canonicalAt1 += 1;
    if (rootRank === 1) rootAt1 += 1;

    const primary = identities[0];
    if (primary && expected) {
      if (primary.triad === expected.triad) qualityAt1 += 1;
      if (primary.seventh === expected.seventh) seventhAt1 += 1;
      if (sameStrings(primary.extensions, expected.extensions)
        && sameStrings(primary.alterations, expected.alterations)) tensionAt1 += 1;
    }

    const rootCount = new Set(identities.map((identity) => identity.rootPitchClass)).size;
    const canonicalCount = new Set(candidateKeys).size;
    rootDiversity += rootCount;
    canonicalDiversity += canonicalCount;
    duplicateIdentityCount += candidateKeys.length - canonicalCount;
    const correction = operationCorrectionCostResult(
      item ? { primary: item.chord, alternatives: item.alternatives.map((entry) => entry.chord) } : undefined,
      [event.chordSymbol],
    );

    rows.push({
      fileId: file.fileId,
      eventId: event.eventId,
      startBeat: event.startBeat,
      endBeat: event.endBeat,
      expected: event.chordSymbol,
      representable: isRepresentable,
      candidates: candidates.map((candidate) => candidate.label),
      canonicalRank: canonicalRank || null,
      rootRank: rootRank || null,
      rootDiversityAt3: rootCount,
      canonicalDiversityAt3: canonicalCount,
      correctionCost: correction.cost,
      correctionCategory: correction.category,
    });
  }
}

const count = rows.length;
const correction = summarizeOperationCorrectionCosts(rows.map((row) => ({
  cost: row.correctionCost,
  category: row.correctionCategory,
})));
const ratio = (value: number) => count ? rounded(value / count) : 0;
const report = {
  schemaVersion: 1,
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split,
  fileCount: files.length,
  eventCount: count,
  metrics: {
    representableRate: ratio(representable),
    top3Canonical: ratio(top3Canonical),
    top3Root: ratio(top3Root),
    correctCandidateMeanRank: rankedCanonical ? rounded(rankTotal / rankedCanonical) : null,
    MRR: ratio(reciprocalRank),
    correctionCost: correction,
    manualInputRequiredRate: ratio(correction.byCategory["manual-input"]
      + correction.byCategory.unrepresentable),
    rootDiversityAt3: count ? rounded(rootDiversity / count) : 0,
    canonicalDiversityAt3: count ? rounded(canonicalDiversity / count) : 0,
    alternativeDuplicateIdentityCount: duplicateIdentityCount,
    canonicalExactAt1: ratio(canonicalAt1),
    rootAt1: ratio(rootAt1),
    qualityAt1: ratio(qualityAt1),
    seventhAt1: ratio(seventhAt1),
    tensionAt1: ratio(tensionAt1),
  },
  unsupportedLabelFamilyCounts: Object.fromEntries(
    [
      "maj13", "dom13sus", "minMaj7", "altered-dominant",
      "parenthesized-tensions", "no3-or-omit", "multiple-tensions",
      "slash-complex-quality", "parser-unsupported", "serializer-unsupported",
    ].map((family) => [family, familyCounts.get(family) ?? 0]),
  ),
  top3MissLabelCounts: Object.fromEntries(
    [...top3MissLabelCounts]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  ),
  rows,
};

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`Phase 4.3 label audit: ${files.length} files / ${count} events (${split})\n`);
stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  event: GoldEvent,
  beatsPerBar: number,
): ChordTimelineItem | undefined {
  return [...timeline].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + (left.beat - 1);
    const rightStart = (right.bar - 1) * beatsPerBar + (right.beat - 1);
    const leftIou = intervalIou(leftStart, leftStart + left.durationBeats, event.startBeat, event.endBeat);
    const rightIou = intervalIou(rightStart, rightStart + right.durationBeats, event.startBeat, event.endBeat);
    return rightIou - leftIou || leftStart - rightStart;
  })[0];
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function identityRoundTrips(label: string): boolean {
  const parsed = parseChordLabel(label);
  const expected = normalizeChordLabel(label);
  if (!parsed || !expected) return false;
  const actual = normalizeChordLabel(labelFromSymbol(parsed));
  return actual !== null && chordIdentityKey(expected) === chordIdentityKey(actual);
}

function unsupportedFamily(label: string): string {
  const compact = label.toLowerCase().replace(/\s+/g, "");
  if (/maj13/.test(compact)) return "maj13";
  if (/13sus/.test(compact)) return "dom13sus";
  if (/m(?:maj|minmaj)7/.test(compact)) return "minMaj7";
  if (/(?:#|b)(?:5|9|11|13)/.test(compact)) return "altered-dominant";
  if (/\([^)]*\)/.test(compact)) return "parenthesized-tensions";
  if (/(?:no3|omit)/.test(compact)) return "no3-or-omit";
  if ((compact.match(/(?:#|b)?(?:9|11|13)/g) ?? []).length > 1) return "multiple-tensions";
  if (compact.includes("/") && compact.length > 8) return "slash-complex-quality";
  return parseChordLabel(label) ? "serializer-unsupported" : "parser-unsupported";
}

function sameStrings(left: readonly (number | string)[], right: readonly (number | string)[]): boolean {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
