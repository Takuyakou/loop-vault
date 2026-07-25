import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { buildCandidateEvents, candidateStats, structuredSignature } from "../src/domain/midi/candidateBlock";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { parseMidi } from "../src/domain/midi/parser";
import { beatsPerBar } from "../src/domain/midi/timing";
import { selectChordEvidenceNotes } from "../src/domain/midi/voices";

/**
 * P4.1-00 coverage decomposition.
 *
 * "The chorus is missing" can happen at four different places: the bar never
 * had harmony to begin with, no candidate window was generated over it, the
 * window was generated but lost during ranking, or it was dropped as a
 * duplicate of an identical progression elsewhere. This measures each stage
 * separately so the fix targets the right one.
 *
 * Only aggregate numbers and a content fingerprint are written; no absolute
 * path and no MIDI bytes leave this script.
 */
const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "coverage-pipeline.json";
const focusFrom = Number(optionValue("--focus-from") ?? 33);
const focusTo = Number(optionValue("--focus-to") ?? 46);

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (!midiPath || midiPath === cwd()) {
  throw new Error("Usage: vite-node scripts/diagnose-coverage-pipeline.ts --midi <path> [--output <name>]");
}

const bytes = new Uint8Array(await readFile(midiPath));
const analysis = analyzeMidi(bytes, { fileName: basename(midiPath) });
const song = parseMidi(bytes);
const meter = beatsPerBar(analysis.timeSignature);
const totalBars = analysis.totalBars;

/**
 * Denominator definition, fixed here so every later stage measures the same set.
 *
 * A bar counts as harmonic-active when the notes that survive chord-evidence
 * selection (percussion already removed) sound during it. Silent bars, drum-only
 * bars and bars below the evidence threshold are excluded from coverage: a
 * candidate cannot meaningfully cover a bar that carries no harmony.
 */
const evidenceNotes = selectChordEvidenceNotes(song.notes);
const harmonicActiveBars: number[] = [];
const barNoteCounts: number[] = [];
for (let bar = 1; bar <= totalBars; bar += 1) {
  const startTick = (bar - 1) * meter * song.ticksPerBeat;
  const endTick = bar * meter * song.ticksPerBeat;
  const sounding = evidenceNotes.filter(
    (note) => note.startTick < endTick && note.startTick + note.durationTick > startTick,
  );
  barNoteCounts.push(sounding.length);
  if (sounding.length > 0) harmonicActiveBars.push(bar);
}
const harmonicActive = new Set(harmonicActiveBars);

function coveredBars(blocks: ReadonlyArray<{ startBar: number; endBar: number }>): Set<number> {
  const covered = new Set<number>();
  for (const block of blocks) {
    for (let bar = block.startBar; bar <= block.endBar; bar += 1) {
      if (harmonicActive.has(bar)) covered.add(bar);
    }
  }
  return covered;
}

function coverageRatio(covered: Set<number>): number {
  return harmonicActive.size === 0 ? 0 : Number((covered.size / harmonicActive.size).toFixed(6));
}

function longestUncoveredRun(covered: Set<number>): number {
  let longest = 0;
  let run = 0;
  for (const bar of harmonicActiveBars) {
    if (covered.has(bar)) run = 0;
    else {
      run += 1;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

/**
 * Reference sections for `sectionRecall`.
 *
 * These are derived, not human-labelled: the annotation source carries no
 * section marks. A boundary is placed where the pitch-class content of a
 * four-bar window departs from the previous one, which is the signal that
 * actually separates this song's areas — its bar activity is uniformly dense
 * and offers nothing to segment on. P4.1-03 replaces this with a real
 * segmentation pass; it exists here only to give `sectionRecall` a fixed,
 * reproducible denominator.
 */
const SECTION_WINDOW_BARS = 4;
const SECTION_NOVELTY_THRESHOLD = 0.45;

function windowChroma(startBar: number): number[] {
  const chroma = Array(12).fill(0) as number[];
  for (const item of analysis.fullTimeline) {
    if (item.bar < startBar || item.bar >= startBar + SECTION_WINDOW_BARS) continue;
    chroma[item.chord.root % 12] += item.durationBeats;
    if (item.chord.bass !== undefined) chroma[item.chord.bass % 12] += item.durationBeats * 0.5;
  }
  const total = chroma.reduce((sum, value) => sum + value, 0);
  return total > 0 ? chroma.map((value) => value / total) : chroma;
}

function chromaDistance(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / 2;
}

const derivedSections: Array<{ id: string; startBar: number; endBar: number }> = [];
{
  let sectionStart = harmonicActiveBars[0] ?? 1;
  let previous = windowChroma(sectionStart);
  for (let bar = sectionStart + SECTION_WINDOW_BARS; bar <= totalBars; bar += SECTION_WINDOW_BARS) {
    const current = windowChroma(bar);
    if (chromaDistance(previous, current) >= SECTION_NOVELTY_THRESHOLD
      && bar - sectionStart >= SECTION_WINDOW_BARS) {
      derivedSections.push({
        id: `Section ${derivedSections.length + 1}`,
        startBar: sectionStart,
        endBar: bar - 1,
      });
      sectionStart = bar;
    }
    previous = current;
  }
  derivedSections.push({
    id: `Section ${derivedSections.length + 1}`,
    startBar: sectionStart,
    endBar: totalBars,
  });
}

function sectionRecall(blocks: ReadonlyArray<{ startBar: number; endBar: number }>): number {
  if (derivedSections.length === 0) return 0;
  const hit = derivedSections.filter((section) => blocks.some(
    (block) => block.startBar <= section.endBar && block.endBar >= section.startBar,
  )).length;
  return Number((hit / derivedSections.length).toFixed(6));
}

/** Every window the generator can produce, before ranking or dedup. */
const rawWindows: Array<{ startBar: number; endBar: number; lengthBars: number; signature: string }> = [];
for (const lengthBars of [2, 4, 8, 16] as const) {
  if (totalBars < lengthBars) continue;
  for (let start = 1; start <= totalBars - lengthBars + 1; start += 1) {
    const events = buildCandidateEvents(analysis.fullTimeline, start, lengthBars, meter);
    if (!events.length) continue;
    rawWindows.push({
      startBar: start,
      endBar: start + lengthBars - 1,
      lengthBars,
      signature: structuredSignature(events),
    });
  }
}

/** What survives dedup: one window per distinct structure. */
const seen = new Set<string>();
const dedupedWindows = rawWindows.filter((window) => {
  if (seen.has(window.signature)) return false;
  seen.add(window.signature);
  return true;
});

const selected = analysis.blockCandidates;

const oracleCovered = coveredBars(rawWindows);
const dedupedCovered = coveredBars(dedupedWindows);
const selectedCovered = coveredBars(selected);
const firstTenCovered = coveredBars(selected.slice(0, 10));

/** Occurrences hidden by dedup: windows whose structure survives only elsewhere. */
const dedupLostWindows = rawWindows.length - dedupedWindows.length;
const dedupLostBars = [...oracleCovered].filter((bar) => !dedupedCovered.has(bar));

const generationLostBars = harmonicActiveBars.filter((bar) => !oracleCovered.has(bar));
const selectionLostBars = [...dedupedCovered].filter((bar) => !selectedCovered.has(bar));

const focusBars = harmonicActiveBars.filter((bar) => bar >= focusFrom && bar <= focusTo);
const focusCoveredSelected = focusBars.filter((bar) => selectedCovered.has(bar));
const focusCoveredOracle = focusBars.filter((bar) => oracleCovered.has(bar));
const focusCoveredDeduped = focusBars.filter((bar) => dedupedCovered.has(bar));

const redundancy = harmonicActiveBars.length === 0 ? 0 : Number((
  selected.reduce((sum, block) => {
    let bars = 0;
    for (let bar = block.startBar; bar <= block.endBar; bar += 1) {
      if (harmonicActive.has(bar)) bars += 1;
    }
    return sum + bars;
  }, 0) / Math.max(1, selectedCovered.size)
).toFixed(4));

const scores = selected.map((block) => block.selectionScore ?? 0);
const densityCounts = new Map<string, number>();
for (const block of selected) {
  const density = block.stats?.densityClass
    ?? candidateStats(buildCandidateEvents(analysis.fullTimeline, block.startBar, block.lengthBars, meter), block.lengthBars).densityClass;
  densityCounts.set(density, (densityCounts.get(density) ?? 0) + 1);
}

const report = {
  schemaVersion: 1,
  stage: "P4.1-00",
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
  },
  denominator: {
    definition: "bars where chord-evidence notes sound; percussion excluded upstream; silent and drum-only bars are not counted",
    harmonicActiveBars: harmonicActiveBars.length,
    silentOrNonHarmonicBars: totalBars - harmonicActiveBars.length,
    firstHarmonicBar: harmonicActiveBars[0] ?? null,
    lastHarmonicBar: harmonicActiveBars[harmonicActiveBars.length - 1] ?? null,
  },
  pipeline: {
    rawWindows: rawWindows.length,
    dedupedWindows: dedupedWindows.length,
    selectedCandidates: selected.length,
  },
  coverage: {
    oracleCandidateCoverage: coverageRatio(oracleCovered),
    dedupedCoverage: coverageRatio(dedupedCovered),
    selectedCoverageAt10: coverageRatio(firstTenCovered),
    selectedCoverageAtAllVisible: coverageRatio(selectedCovered),
    longestUncoveredHarmonicRun: longestUncoveredRun(selectedCovered),
    coverageRedundancy: redundancy,
    minimumSelectedCandidateScore: scores.length ? Number(Math.min(...scores).toFixed(6)) : null,
  },
  loss: {
    candidateGenerationLoss: { bars: generationLostBars.length, barNumbers: generationLostBars },
    dedupLoss: { windowsRemoved: dedupLostWindows, barsMadeUnreachable: dedupLostBars },
    selectionLoss: { bars: selectionLostBars.length, barNumbers: selectionLostBars },
  },
  sections: {
    definition: "derived from four-bar chroma novelty; the source has no human section marks",
    windowBars: SECTION_WINDOW_BARS,
    noveltyThreshold: SECTION_NOVELTY_THRESHOLD,
    count: derivedSections.length,
    ranges: derivedSections,
    sectionRecallAt10: sectionRecall(selected.slice(0, 10)),
    sectionRecallAtAllVisible: sectionRecall(selected),
  },
  occurrence: {
    definition: "windows sharing a selected window's structure; the Occurrence model arrives in P4.1-01",
    distinctStructures: dedupedWindows.length,
    structuresReachableFromSelection: new Set(
      selected.map((block) => rawWindows.find(
        (window) => window.startBar === block.startBar && window.endBar === block.endBar,
      )?.signature).filter(Boolean),
    ).size,
    occurrencesOfSelectedStructures: rawWindows.filter((window) => selected.some(
      (block) => rawWindows.find(
        (other) => other.startBar === block.startBar && other.endBar === block.endBar,
      )?.signature === window.signature,
    )).length,
    groupedVisibleCoverage: coverageRatio(coveredBars(
      rawWindows.filter((window) => selected.some((block) => rawWindows.find(
        (other) => other.startBar === block.startBar && other.endBar === block.endBar,
      )?.signature === window.signature)),
    )),
  },
  focusRange: {
    from: focusFrom,
    to: focusTo,
    harmonicActiveBars: focusBars.length,
    coveredByOracle: focusCoveredOracle.length,
    coveredAfterDedup: focusCoveredDeduped.length,
    coveredBySelected: focusCoveredSelected.length,
    uncoveredBars: focusBars.filter((bar) => !selectedCovered.has(bar)),
  },
  barActivity: barNoteCounts.map((count, index) => ({ bar: index + 1, evidenceNotes: count })),
  selectedBlocks: selected.map((block) => ({
    id: block.id,
    startBar: block.startBar,
    endBar: block.endBar,
    lengthBars: block.lengthBars,
    selectionScore: block.selectionScore ?? null,
    densityClass: block.stats?.densityClass ?? null,
  })),
  densityDistribution: Object.fromEntries(densityCounts),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write(`bars ${totalBars}, harmonic-active ${harmonicActiveBars.length}\n`);
stdout.write(`windows raw ${rawWindows.length} -> deduped ${dedupedWindows.length} -> selected ${selected.length}\n\n`);
stdout.write(`oracleCandidateCoverage        ${pct(report.coverage.oracleCandidateCoverage)}\n`);
stdout.write(`dedupedCoverage                ${pct(report.coverage.dedupedCoverage)}\n`);
stdout.write(`selectedCoverageAt10           ${pct(report.coverage.selectedCoverageAt10)}\n`);
stdout.write(`selectedCoverageAtAllVisible   ${pct(report.coverage.selectedCoverageAtAllVisible)}\n`);
stdout.write(`longestUncoveredHarmonicRun    ${report.coverage.longestUncoveredHarmonicRun} bars\n`);
stdout.write(`coverageRedundancy             ${report.coverage.coverageRedundancy}\n\n`);
stdout.write(`loss: generation ${generationLostBars.length} bars, dedup ${dedupLostWindows} windows / ${dedupLostBars.length} bars, selection ${selectionLostBars.length} bars\n`);
stdout.write(`focus ${focusFrom}-${focusTo}: active ${focusBars.length}, oracle ${focusCoveredOracle.length}, deduped ${focusCoveredDeduped.length}, selected ${focusCoveredSelected.length}\n`);
