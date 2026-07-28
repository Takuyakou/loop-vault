import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi";
import { parseMidi } from "../src/domain/midi/parser";
import {
  bestWindow,
  diagnoseLoadedFile,
  loadPhase47Files,
  regressionCorpusDir,
} from "./phase47/evaluationShared";
import {
  buildPhase48EvidenceNotes,
} from "./phase48/eventEvidence";
import {
  generateObservedFlatNineShadowCandidates,
  shadowCandidateToChord,
  type FlatNineEvidenceVariant,
} from "./phase48/observedFlatNineShadow";

const variants: readonly FlatNineEvidenceVariant[] = ["E1", "E2", "E3"];
const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const analyzerBefore = hashProductOutput();
const reports = [];

for (const variant of variants) {
  const rows = [];
  const started = performance.now();
  let generationRuntimeMs = 0;
  for (const loaded of files) {
    const parsed = parseMidi(loaded.bytes);
    const evidenceNotes = buildPhase48EvidenceNotes(parsed, loaded.file.fileId);
    const windows = diagnoseLoadedFile(loaded);
    const beatsPerBar = loaded.file.timeSignature.numerator
      * (4 / loaded.file.timeSignature.denominator);
    for (const event of loaded.file.events) {
      const window = bestWindow(windows, event, beatsPerBar);
      const generationStarted = performance.now();
      const generated = generateObservedFlatNineShadowCandidates(
        window?.candidates ?? [],
        evidenceNotes,
        {
          variant,
          eventStartBeat: event.startBeat,
          eventEndBeat: event.endBeat,
        },
      );
      generationRuntimeMs += performance.now() - generationStarted;
      const target = event.chordSymbol === "A7b9";
      const targetGenerated = generated.some((candidate) =>
        shadowCandidateToChord(candidate).label === "A7(b9)");
      rows.push({
        fileId: loaded.file.fileId,
        eventId: event.eventId,
        scenarioId: loaded.file.scenarioId,
        variant: loaded.file.variant,
        goldLabel: event.chordSymbol,
        target,
        generatedTarget: targetGenerated,
        generated: generated.map((candidate) => ({
          ...candidate,
          label: shadowCandidateToChord(candidate).label,
        })),
      });
    }
  }
  const outputHash = createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex");
  const duplicateCount = rows.reduce((sum, row) =>
    sum + row.generated.length
      - new Set(row.generated.map((candidate) => candidate.canonicalIdentity)).size,
  0);
  reports.push({
    variant,
    events: rows.length,
    applicableEvents: rows.filter((row) => row.generated.length > 0).length,
    targetEvents: rows.filter((row) => row.target).length,
    targetGenerated: rows.filter((row) =>
      row.target && row.generatedTarget).length,
    stillMissing: rows.filter((row) =>
      row.target && !row.generatedTarget).length,
    nonTargetGenerated: rows.filter((row) =>
      !row.target && row.generated.length > 0).length,
    generatedCandidates: rows.reduce((sum, row) =>
      sum + row.generated.length, 0),
    maximumAddedPerEvent: Math.max(...rows.map((row) => row.generated.length)),
    duplicateCount,
    missingProvenance: rows.reduce((sum, row) =>
      sum + row.generated.filter((candidate) =>
        !candidate.supportingCoreNoteInstanceIds.length
        || !candidate.supportingB9NoteInstanceIds.length).length,
    0),
    evidenceClassCounts: countBy(rows.flatMap((row) =>
      row.generated.map((candidate) => candidate.evidenceClass))),
    runtime: {
      totalMs: performance.now() - started,
      generationOnlyMs: generationRuntimeMs,
      generationPerEventMs: generationRuntimeMs / rows.length,
    },
    deterministicHash: outputHash,
    rows,
  });
}

const analyzerAfter = hashProductOutput();
const report = {
  schemaVersion: 1,
  phase: "4.8-02",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  productHashes: {
    before: analyzerBefore,
    after: analyzerAfter,
    unchanged: analyzerBefore === analyzerAfter,
  },
  variants: reports,
  productConnected: false,
  vaultConnected: false,
  uiConnected: false,
};

if (!report.productHashes.unchanged) {
  throw new Error("Product Analyzer output changed during Shadow evaluation.");
}
if (reports.some((entry) =>
  entry.maximumAddedPerEvent > 2
  || entry.duplicateCount > 0
  || entry.missingProvenance > 0)) {
  throw new Error("Phase 4.8 Shadow candidate contract failed.");
}

await Promise.all([
  writeFile(
    resolve(cwd(), "docs/phase4.8/02-shadow-generators.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(cwd(), "docs/phase4.8/02-shadow-generators.md"),
    `# Phase 4.8-02 Shadow Generators

| Variant | applicable | target recall | still missing | non-target generated | candidates | max/event | duplicate | provenance miss | generation ms/event |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${reports.map((entry) => `| ${entry.variant} | ${entry.applicableEvents}/${entry.events} | ${entry.targetGenerated}/${entry.targetEvents} | ${entry.stillMissing} | ${entry.nonTargetGenerated} | ${entry.generatedCandidates} | ${entry.maximumAddedPerEvent} | ${entry.duplicateCount} | ${entry.missingProvenance} | ${entry.runtime.generationPerEventMs.toFixed(4)} |`).join("\n")}

- Product Analyzer hash unchanged: ${report.productHashes.unchanged}
- Product connected: ${report.productConnected}
- UI / Vault connected: ${report.uiConnected} / ${report.vaultConnected}

E1/E2/E3は独立実装であり、結果に基づく混合は行っていない。
`,
    "utf8",
  ),
]);

stdout.write(`${JSON.stringify({
  productHashes: report.productHashes,
  variants: reports.map((entry) => ({
    variant: entry.variant,
    applicableEvents: entry.applicableEvents,
    targetGenerated: entry.targetGenerated,
    stillMissing: entry.stillMissing,
    nonTargetGenerated: entry.nonTargetGenerated,
    generatedCandidates: entry.generatedCandidates,
    maximumAddedPerEvent: entry.maximumAddedPerEvent,
    duplicateCount: entry.duplicateCount,
    missingProvenance: entry.missingProvenance,
    runtime: entry.runtime,
    deterministicHash: entry.deterministicHash,
  })),
}, null, 2)}\n`);

function hashProductOutput(): string {
  const hash = createHash("sha256");
  for (const loaded of files) {
    hash.update(JSON.stringify(analyzeMidi(loaded.bytes, {
      mode: "phase4-v1",
      fileName: loaded.file.path,
    })));
  }
  return hash.digest("hex");
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}
