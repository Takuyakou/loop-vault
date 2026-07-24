import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";

/**
 * P4.0-00 low-density candidate diagnostic.
 *
 * Recreates the legacy candidate scoring from the public analysis result so the
 * score components and the drop stage can be measured without instrumenting
 * product code. Mirrors `buildCandidates` in src/domain/midi/legacy.ts:
 *
 *   selectionScore = averageRankingScore + repeatBonus + diversityBonus
 *   repeatBonus    = min(0.25, repeatCount * 0.08)
 *   diversityBonus = min(0.15, uniqueChordCount * 0.03)
 *
 * It also reports the per-bar compression that `chordLabelsByBar` performs,
 * which is where multi-chord bars and sustained chords lose information.
 */
const path = argv[argv.length - 1];
if (!path || path.endsWith(".ts")) throw new Error("Usage: vite-node scripts/diagnose-candidate-selection.ts <midi-path>");
const bytes = new Uint8Array(await readFile(resolve(cwd(), path)));
const analysis = analyzeMidi(bytes, { mode: "legacy", fileName: basename(path) });
const totalBars = analysis.totalBars;

const byBar: string[] = [];
const barDetail: Array<{ bar: number; representative: string; timelineEvents: string[]; lostEvents: string[] }> = [];
for (let bar = 1; bar <= totalBars; bar += 1) {
  const starting = analysis.fullTimeline.filter((item) => item.bar === bar);
  const sounding = analysis.fullTimeline.filter((item) => {
    const startBeat = (item.bar - 1) * 4 + item.beat - 1;
    return startBeat < bar * 4 && startBeat + item.durationBeats > (bar - 1) * 4;
  });
  const representative = [...starting]
    .sort((left, right) => right.durationBeats - left.durationBeats || right.confidence - left.confidence)[0]
    ?.chord.label ?? "N.C.";
  byBar.push(representative);
  barDetail.push({
    bar,
    representative,
    timelineEvents: sounding.map((item) => `${item.chord.label}@${item.beat}+${item.durationBeats}`),
    lostEvents: sounding.filter((item) => item.chord.label !== representative).map((item) => item.chord.label),
  });
}

const countRepeats = (labels: string[]) => {
  let count = 0;
  for (let index = 0; index <= byBar.length - labels.length; index += 1) {
    if (byBar.slice(index, index + labels.length).every((label, offset) => label === labels[offset])) count += 1;
  }
  return count;
};

const selectedIds = new Set(analysis.blockCandidates.map((block) => block.id));
const rows: Array<Record<string, unknown>> = [];
for (const lengthBars of [4, 8, 16] as const) {
  if (totalBars < lengthBars) continue;
  for (let start = 1; start <= totalBars - lengthBars + 1; start += 1) {
    const labels = byBar.slice(start - 1, start - 1 + lengthBars);
    const summaryText = `| ${labels.join(" | ")} |`;
    const chords = analysis.fullTimeline.filter((item) => item.bar >= start && item.bar < start + lengthBars);
    const confidence = chords.length ? chords.reduce((sum, item) => sum + item.confidence, 0) / chords.length : 0;
    const repeatCount = countRepeats(labels);
    const uniqueChordCount = new Set(labels).size;
    const repeatBonus = Math.min(0.25, repeatCount * 0.08);
    const diversityBonus = Math.min(0.15, uniqueChordCount * 0.03);
    const id = `bars-${start}-${start + lengthBars - 1}`;
    rows.push({
      id,
      startBar: start,
      endBar: start + lengthBars - 1,
      lengthBars,
      summaryText,
      eventCount: chords.length,
      uniqueChordCount,
      ncBars: labels.filter((label) => label === "N.C.").length,
      repeatCount,
      approxRankingScore: Number(confidence.toFixed(6)),
      repeatBonus: Number(repeatBonus.toFixed(6)),
      diversityBonus: Number(diversityBonus.toFixed(6)),
      approxSelectionScore: Number((confidence + repeatBonus + diversityBonus).toFixed(6)),
      densityClass: uniqueChordCount <= 1 ? "vamp" : uniqueChordCount <= 5 ? "compact" : "standard",
      selected: selectedIds.has(id),
    });
  }
}

const dedupeGroups = new Map<string, string[]>();
rows.forEach((row) => {
  const key = row.summaryText as string;
  dedupeGroups.set(key, [...(dedupeGroups.get(key) ?? []), row.id as string]);
});
const collisions = [...dedupeGroups].filter(([, ids]) => ids.length > 1);

const report = {
  schemaVersion: 1,
  file: basename(path),
  totalBars,
  detectedKey: analysis.detectedKey,
  generatedLengths: [4, 8, 16].filter((length) => totalBars >= length),
  barCompression: barDetail,
  rawCandidates: rows,
  dedupeCollisions: collisions.map(([summaryText, ids]) => ({ summaryText, ids })),
  selectedCandidates: analysis.blockCandidates.map((block) => ({
    id: block.id, startBar: block.startBar, endBar: block.endBar,
    lengthBars: block.lengthBars, summaryText: block.summaryText,
    confidence: block.confidence, labels: block.labels,
  })),
};

const outputDir = resolve(cwd(), "docs/phase4.0");
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "00-candidate-selection-diagnostic.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`${basename(path)}: ${totalBars} bars, key ${analysis.detectedKey}, lengths ${report.generatedLengths.join("/")}\n`);
stdout.write(`\n-- per-bar compression --\n`);
barDetail.forEach((bar) => stdout.write(
  `  bar ${String(bar.bar).padStart(2)}: rep=${bar.representative.padEnd(10)} sounding=[${bar.timelineEvents.join(" ")}]${bar.lostEvents.length ? `  LOST=[${bar.lostEvents.join(",")}]` : ""}\n`,
));
stdout.write(`\n-- raw candidates --\n`);
rows.forEach((row) => stdout.write(
  `  ${String(row.id).padEnd(14)} len=${row.lengthBars} uniq=${row.uniqueChordCount} nc=${row.ncBars} rep=${row.repeatCount} `
  + `rank=${row.approxRankingScore} +rep=${row.repeatBonus} +div=${row.diversityBonus} => ${row.approxSelectionScore} `
  + `[${row.densityClass}] ${row.selected ? "SELECTED" : "dropped"}\n`,
));
stdout.write(`\ndedupe collisions: ${collisions.length}\n`);
stdout.write(`selected: ${analysis.blockCandidates.length}\n`);
