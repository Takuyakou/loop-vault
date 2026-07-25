import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { normaliseEvidence, scoreBlockQuality } from "../src/domain/midi/blockQuality";
import { recoverRawMatchScore } from "../src/domain/midi/candidateBlock";
import { harmonicActiveBars } from "../src/domain/midi/coverageCandidates";
import { selectOccurrencesByCoverage } from "../src/domain/midi/coverageSelector";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores } from "../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import {
  buildOccurrences, groupIntoPatterns, scoreOccurrences,
  type CandidateOccurrence,
} from "../src/domain/midi/occurrence";
import { parseMidi } from "../src/domain/midi/parser";
import { beatsPerBar } from "../src/domain/midi/timing";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * P4.1.1-00 candidate usefulness decomposition.
 *
 * The coverage gates asked which bars the candidate list reached. They never
 * asked whether the cards differ from each other, so a list of three positions
 * of the same one-chord vamp passed every gate while offering the user one
 * usable progression.
 *
 * This walks the five stages a card passes through — generated, scored,
 * selected, grouped, displayed — and reports at each one how many distinct
 * patterns survive and how many display slots they consume. The point is to
 * locate the stage where duplication enters before anything is changed.
 *
 * Only aggregate numbers and a content fingerprint are written; no absolute
 * path and no MIDI bytes leave this script.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const outputDir = resolve(cwd(), "docs/phase4.1.1");
const outputName = optionValue("--output") ?? "candidate-usefulness.json";
const mode = (optionValue("--mode") ?? "phase4.1-v1") as MidiAnalyzerMode;
const visibleLimit = Number(optionValue("--visible") ?? 10);

if (!midiPath || midiPath === cwd()) {
  throw new Error(
    "Usage: vite-node scripts/diagnose-candidate-usefulness.ts --midi <path> [--mode <mode>] [--output <name>]",
  );
}

const bytes = new Uint8Array(await readFile(midiPath));
const analysis = analyzeMidi(bytes, { fileName: basename(midiPath), mode });
const song = parseMidi(bytes);
const meter = beatsPerBar(analysis.timeSignature);
const totalBars = analysis.totalBars;

/**
 * The pipeline is rebuilt here rather than read off the analysis, because the
 * intermediate stages are exactly what the analysis does not expose. Every step
 * uses the product's own functions so the numbers describe the shipped path.
 */
const internal = analyzeMidiWithRankingScores(bytes, { fileName: basename(midiPath) }, {
  useQualityEvidence: true,
  qualityEvidence: phase4QualityEvidence,
  useCoverageSelection: mode === "phase4.1-v1",
  useExtractionProfile: mode === "phase4.1-v1",
});
// The internal ranking scores, not `confidence`. Confidence saturates at 1 and
// cannot separate blocks; rebuilding on it would score every occurrence
// differently from the product and make the stage numbers incomparable.
const rawMatchScores = internal.timelineRankingScores.map(recoverRawMatchScore);
const normalise = normaliseEvidence(rawMatchScores);
const generated = buildOccurrences(analysis.fullTimeline, totalBars, {
  beatsPerBar: meter,
  rawMatchScores,
});
const scored = scoreOccurrences(generated, {
  beatsPerBar: meter,
  rawMatchScores,
  normaliseEvidence: normalise,
  scoreBlockQuality,
});
const active = harmonicActiveBars(song, totalBars);
const selection = selectOccurrencesByCoverage(scored, { harmonicActiveBars: active });
const patterns = groupIntoPatterns(scored);

const patternOf = new Map<string, string>();
for (const pattern of patterns) {
  for (const occurrence of pattern.occurrences) patternOf.set(occurrence.id, pattern.patternId);
}

/**
 * A "display slot" is one card in the candidate list.
 *
 * The cards are taken from the analysis rather than from the rebuilt selection,
 * so this reports what the chosen mode actually ships: `phase4.1-v1` hands the
 * UI its selected occurrences, `phase4-v1` hands it the ranking selector's
 * blocks. Matching back to an occurrence by position is what lets both be
 * described in the same terms.
 */
const occurrenceByPosition = new Map(
  scored.map((occurrence) => [`${occurrence.startBar}:${occurrence.lengthBars}`, occurrence]),
);
const displayed = analysis.blockCandidates
  .slice(0, visibleLimit)
  .map((block) => occurrenceByPosition.get(`${block.startBar}:${block.lengthBars}`))
  .filter((occurrence): occurrence is CandidateOccurrence => occurrence !== undefined);

function describe(occurrence: CandidateOccurrence, index: number) {
  const identity = patterns.find(
    (pattern) => pattern.patternId === patternOf.get(occurrence.id),
  );
  return {
    visibleCardIndex: index >= 0 ? index + 1 : null,
    occurrenceId: occurrence.id,
    sourceCandidateId: occurrence.sourceCandidateId ?? null,
    patternId: patternOf.get(occurrence.id) ?? null,
    normalizedProgressionIdentity: identity?.normalizedProgressionIdentity ?? null,
    startBar: occurrence.startBar,
    endBar: occurrence.endBar,
    barLength: occurrence.lengthBars,
    chordEventCount: occurrence.stats.eventCount,
    uniqueCanonicalChordCount: occurrence.stats.uniqueChordCount,
    harmonicChangeCount: occurrence.stats.harmonicChangeCount,
    densityClass: occurrence.stats.densityClass,
    chordLabels: occurrence.events.map((event) => event.chord.label),
    rankingScore: Number(occurrence.score.toFixed(6)),
    occurrenceCountOfPattern: identity?.occurrences.length ?? 1,
  };
}

const selectionSteps = new Map(selection.steps.map((step) => [step.occurrenceId, step]));

const displayedRows = displayed.map((occurrence, index) => ({
  ...describe(occurrence, index),
  marginalCoverage: selectionSteps.get(occurrence.id)?.newBars ?? null,
  selectionUtility: selectionSteps.get(occurrence.id)?.utility ?? null,
  redundantBars: selectionSteps.get(occurrence.id)?.redundantBars ?? null,
}));

/**
 * Duplicate display, measured on the pattern the card belongs to.
 *
 * `visiblePatternDuplicateCount` counts cards beyond the first for a pattern;
 * `visibleSlotWasteCount` is the same quantity seen as slots that could have
 * carried a different progression.
 */
const visiblePatternIds = displayedRows.map((row) => row.patternId ?? row.occurrenceId);
const visibleUniquePatternCount = new Set(visiblePatternIds).size;
const visiblePatternDuplicateCount = visiblePatternIds.length - visibleUniquePatternCount;
const visiblePatternDuplicateRate = visiblePatternIds.length === 0
  ? 0
  : Number((visiblePatternDuplicateCount / visiblePatternIds.length).toFixed(6));

/**
 * Classification, by the definition frozen in P4.1.1-02.
 *
 * `uniqueCanonicalChordCount` comes from `identityKey`, so a spelling difference
 * alone never counts as a chord change.
 */
type CandidateKind = "progression" | "vamp" | "fragment";

function classify(occurrence: CandidateOccurrence): CandidateKind {
  const { uniqueChordCount, harmonicChangeCount } = occurrence.stats;
  if (uniqueChordCount <= 1) return "vamp";
  if (occurrence.lengthBars >= 4 && uniqueChordCount >= 2 && harmonicChangeCount >= 1) {
    return "progression";
  }
  return "fragment";
}

const kindOf = new Map<string, CandidateKind>(
  scored.map((occurrence) => [occurrence.id, classify(occurrence)]),
);

const eligible = scored.filter((occurrence) => occurrence.score >= 0.35);
const progressionPatterns = new Set(
  eligible.filter((occurrence) => kindOf.get(occurrence.id) === "progression")
    .map((occurrence) => patternOf.get(occurrence.id) ?? occurrence.id),
);
const vampPatterns = new Set(
  eligible.filter((occurrence) => kindOf.get(occurrence.id) === "vamp")
    .map((occurrence) => patternOf.get(occurrence.id) ?? occurrence.id),
);
const fragmentPatterns = new Set(
  eligible.filter((occurrence) => kindOf.get(occurrence.id) === "fragment")
    .map((occurrence) => patternOf.get(occurrence.id) ?? occurrence.id),
);

const top3 = displayedRows.slice(0, 3);
const top10 = displayedRows.slice(0, 10);
const kindOfRow = (row: { occurrenceId: string }) => kindOf.get(row.occurrenceId);

const activeSet = new Set(active);
function coverageOf(rows: ReadonlyArray<{ startBar: number; endBar: number }>): number {
  const covered = new Set<number>();
  for (const row of rows) {
    for (let bar = row.startBar; bar <= row.endBar; bar += 1) {
      if (activeSet.has(bar)) covered.add(bar);
    }
  }
  return active.length === 0 ? 0 : Number((covered.size / active.length).toFixed(6));
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.1-00",
  analyzerMode: mode,
  source: {
    // Content fingerprint only: no filename, no path, no bytes.
    fingerprint: fingerprintMidiBytes(bytes),
    byteLength: bytes.length,
  },
  song: {
    totalBars,
    timeSignature: analysis.timeSignature ?? "unknown",
    bpm: analysis.bpm ?? null,
    detectedKey: analysis.detectedKey ?? null,
    timelineEvents: analysis.fullTimeline.length,
    harmonicActiveBars: active.length,
  },
  pipeline: {
    generatedOccurrences: generated.length,
    scoredOccurrences: scored.length,
    eligibleAfterQualityFloor: eligible.length,
    selectedOccurrences: selection.selected.length,
    groupedPatterns: patterns.length,
    displayedCards: displayed.length,
    // The stage where duplication becomes visible: patterns are grouped over
    // every occurrence, but selection hands the UI occurrences, so one pattern
    // can arrive as several cards.
    distinctPatternsAmongSelected: new Set(
      selection.selected.map((occurrence) => patternOf.get(occurrence.id)),
    ).size,
    distinctPatternsAmongDisplayed: visibleUniquePatternCount,
  },
  usefulness: {
    visiblePatternDuplicateCount,
    visiblePatternDuplicateRate,
    visibleSlotWasteCount: visiblePatternDuplicateCount,
    visibleUniquePatternCount,
    top3SingleChordCount: top3.filter((row) => kindOfRow(row) === "vamp").length,
    top10SingleChordRate: top10.length === 0
      ? 0
      : Number((top10.filter((row) => kindOfRow(row) === "vamp").length / top10.length).toFixed(6)),
    top3ProgressionCount: top3.filter((row) => kindOfRow(row) === "progression").length,
    top10ProgressionCount: top10.filter((row) => kindOfRow(row) === "progression").length,
    progressionCandidateAvailability: progressionPatterns.size,
    fragmentCandidateCount: fragmentPatterns.size,
    vampCandidateCount: vampPatterns.size,
  },
  // Measured on the cards the mode actually ships. Reported apart from
  // `progressionCandidateCoverage` because a list can cover the song while every
  // card on it is the same one-chord vamp: coverage alone does not carry the
  // product claim.
  coverage: {
    allCandidateCoverage: coverageOf(analysis.blockCandidates),
    progressionCandidateCoverage: coverageOf(
      analysis.blockCandidates.filter((block) => {
        const occurrence = occurrenceByPosition.get(`${block.startBar}:${block.lengthBars}`);
        return occurrence !== undefined && kindOf.get(occurrence.id) === "progression";
      }),
    ),
    coverageAtVisible: coverageOf(analysis.blockCandidates.slice(0, visibleLimit)),
    longestUncoveredHarmonicRun: selection.longestUncoveredRun,
    rebuiltSelectionCoverage: coverageOf(selection.selected),
    stoppedBecause: selection.stoppedBecause,
  },
  displayedCards: displayedRows.map((row) => ({ ...row, kind: kindOf.get(row.occurrenceId) })),
  /** Patterns holding the most occurrences: what a single card can already reach. */
  largestPatterns: [...patterns]
    .sort((left, right) => right.occurrences.length - left.occurrences.length)
    .slice(0, 10)
    .map((pattern) => ({
      patternId: pattern.patternId,
      occurrenceCount: pattern.occurrences.length,
      lengthBars: pattern.occurrences[0].lengthBars,
      uniqueCanonicalChordCount: pattern.occurrences[0].stats.uniqueChordCount,
      chordLabels: pattern.occurrences[0].events.map((event) => event.chord.label),
      bars: pattern.occurrences.map((occurrence) => [occurrence.startBar, occurrence.endBar]),
    })),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`mode ${mode}, bars ${totalBars}, harmonic-active ${active.length}\n`);
stdout.write(
  `generated ${generated.length} -> eligible ${eligible.length} -> selected ${selection.selected.length} `
  + `-> displayed ${displayed.length} (${visibleUniquePatternCount} distinct patterns)\n\n`,
);
for (const row of report.displayedCards) {
  stdout.write(
    `#${row.visibleCardIndex} bars ${row.startBar}-${row.endBar} (${row.barLength}) `
    + `${row.kind} chords=${row.uniqueCanonicalChordCount} occ=${row.occurrenceCountOfPattern} `
    + `score=${row.rankingScore} ${row.chordLabels.join(" ")}\n`,
  );
}
stdout.write(
  `\nvisiblePatternDuplicateCount ${visiblePatternDuplicateCount}`
  + ` / top3SingleChordCount ${report.usefulness.top3SingleChordCount}`
  + ` / progressionCandidateAvailability ${progressionPatterns.size}\n`,
);
stdout.write(
  `allCandidateCoverage ${report.coverage.allCandidateCoverage}`
  + ` / progressionCandidateCoverage ${report.coverage.progressionCandidateCoverage}\n`,
);
