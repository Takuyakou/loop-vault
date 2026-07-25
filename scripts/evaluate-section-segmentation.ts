import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { parseMidi } from "../src/domain/midi/parser";
import { evaluateSegmentation, segmentSections } from "../src/domain/midi/sections";

const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "section-segmentation.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
if (!midiPath || midiPath === cwd()) throw new Error("Usage: --midi <path>");

const bytes = new Uint8Array(await readFile(midiPath));
const analysis = analyzeMidi(bytes);
const song = parseMidi(bytes);
const sections = segmentSections(song, analysis.fullTimeline);

/** Frozen P4.1-00 boundaries, used only as a reference for comparison. */
const baseline = JSON.parse(await readFile(
  resolve(cwd(), "docs/phase4.1/00-suran-baseline.json"), "utf8")) as {
  sections: { ranges: Array<{ startBar: number }> };
};
const reference = baseline.sections.ranges.slice(1).map((range) => range.startBar);
const quality = evaluateSegmentation(sections, reference);

const report = {
  schemaVersion: 1,
  stage: "P4.1-03",
  source: { fingerprint: fingerprintMidiBytes(bytes), byteLength: bytes.length },
  naming: "sections are numbered; no chorus/verse labels are inferred",
  connectedToSelection: false,
  sections: sections.map((section) => ({
    id: section.id,
    startBar: section.startBar,
    endBar: section.endBar,
    confidence: section.confidence,
    reasons: section.reasons,
    dominantPitchClass: section.chromaSummary.dominantPitchClass,
    noteCount: section.activitySummary.noteCount,
  })),
  versusFrozenReference: quality,
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`sections ${sections.length}: ${sections.map((s) => `${s.startBar}-${s.endBar}`).join(", ")}\n`);
stdout.write(`vs frozen reference: precision ${(quality.boundaryPrecision * 100).toFixed(1)}%, recall ${(quality.boundaryRecall * 100).toFixed(1)}%\n`);
stdout.write(`over-segmentation ${quality.overSegmentationRate.toFixed(3)}, under ${quality.underSegmentationRate.toFixed(3)}\n`);
