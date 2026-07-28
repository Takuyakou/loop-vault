import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi";
import { parseMidi } from "../src/domain/midi/parser";
import type { ChordTimelineItem } from "../src/domain/types";
import {
  bestWindow,
  diagnoseLoadedFile,
  loadPhase47Files,
  regressionCorpusDir,
} from "./phase47/evaluationShared";
import {
  analyzePhase48EventEvidence,
  buildPhase48EvidenceNotes,
} from "./phase48/eventEvidence";

interface PreviousTaxonomyRow {
  fileId: string;
  eventId: string;
  primaryCategory: string;
  signals: Record<string, boolean>;
}

interface PreviousTaxonomy {
  rows: PreviousTaxonomyRow[];
}

const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const previous = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.6/02-missing-candidate-taxonomy.json"), "utf8"),
) as PreviousTaxonomy;
const previousByEvent = new Map(
  previous.rows.map((row) => [`${row.fileId}:${row.eventId}`, row]),
);
const rows = [];

for (const loaded of files) {
  const parsed = parseMidi(loaded.bytes);
  const evidenceNotes = buildPhase48EvidenceNotes(parsed, loaded.file.fileId);
  const windows = diagnoseLoadedFile(loaded);
  const analysis = analyzeMidi(loaded.bytes, {
    mode: "phase4-v1",
    fileName: loaded.file.path,
  });
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);

  for (const event of loaded.file.events.filter((entry) =>
    entry.chordSymbol === "A7b9")) {
    const evidence = analyzePhase48EventEvidence(
      evidenceNotes,
      9,
      event.startBeat,
      event.endBeat,
    );
    const window = bestWindow(windows, event, beatsPerBar);
    const sourceCore = window?.candidates
      .filter((candidate) =>
        candidate.chord.root === 9
        && candidate.chord.quality === "dom7"
        && candidate.chord.tensions.length === 0)
      .sort((left, right) =>
        right.rawScore - left.rawScore
        || left.chord.label.localeCompare(right.chord.label))[0];
    const item = bestTimelineItem(
      analysis.fullTimeline,
      event.startBeat,
      event.endBeat,
      beatsPerBar,
    );
    const productTop3 = item
      ? [item.chord, ...item.alternatives.map((alternative) => alternative.chord)]
        .slice(0, 3)
        .map((chord) => chord.label)
      : [];
    const prior = previousByEvent.get(`${loaded.file.fileId}:${event.eventId}`);
    rows.push({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      scenarioId: loaded.file.scenarioId,
      scenarioSlug: loaded.file.scenarioSlug,
      variant: loaded.file.variant,
      event: {
        startBeat: event.startBeat,
        endBeat: event.endBeat,
        durationBeats: event.endBeat - event.startBeat,
      },
      gold: {
        label: "A7b9",
        canonicalLabel: "A7(b9)",
        root: 9,
        canonicalIdentity: "9|major|minor7||b9|-",
      },
      rootHypothesis: {
        present: window?.candidates.some((candidate) =>
          candidate.chord.root === 9) ?? false,
        sourceCoreLabel: sourceCore?.chord.label ?? null,
        sourceCoreRawScore: sourceCore?.rawScore ?? null,
      },
      core: {
        complete: evidence.completeCore,
        p5Omitted: evidence.p5OmittedCore,
        root: evidence.rootNotes.map(noteTrace),
        majorThird: evidence.majorThirdNotes.map(noteTrace),
        perfectFifth: evidence.perfectFifthNotes.map(noteTrace),
        minorSeventh: evidence.minorSeventhNotes.map(noteTrace),
      },
      flatNine: {
        notes: evidence.flatNineNotes.map(noteTrace),
        roles: evidence.roles,
        durationBeats: evidence.flatNineDurationBeats,
        durationRatio: evidence.flatNineDurationRatio,
        onsetCount: evidence.flatNineOnsets.length,
        onsets: evidence.flatNineOnsets,
        firstOnsetRatio: evidence.flatNineFirstOnsetRatio,
        strictCoreOverlapRatio: evidence.strictOverlapRatio,
      },
      evidence: {
        class: evidence.evidenceClass,
        e1Eligible: evidence.e1Eligible,
        e2Eligible: evidence.e2Eligible,
        e3Eligible: evidence.e3Eligible,
        noteInstanceCount: evidence.notes.length,
        provenanceComplete: [
          evidence.rootNotes,
          evidence.majorThirdNotes,
          evidence.minorSeventhNotes,
          evidence.flatNineNotes,
        ].every((group) =>
          group.every((note) => note.noteInstanceId.length > 0)),
      },
      product: {
        rank1: productTop3[0] ?? null,
        top3: productTop3,
        targetInTop3: productTop3.includes("A7(b9)"),
      },
      firstMissingStage: prior?.primaryCategory ?? "unclassified",
      previousSignals: prior?.signals ?? {},
    });
  }
}

const report = {
  schemaVersion: 1,
  phase: "4.8-01",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  target: "A7(b9)",
  targetCount: rows.length,
  cleanCount: rows.filter((row) => row.variant === "clean").length,
  stressCount: rows.filter((row) => row.variant === "stress").length,
  rootHypothesisPresent: rows.filter((row) => row.rootHypothesis.present).length,
  completeCore: rows.filter((row) => row.core.complete).length,
  flatNineObserved: rows.filter((row) => row.flatNine.notes.length > 0).length,
  provenanceComplete: rows.filter((row) =>
    row.evidence.provenanceComplete).length,
  eligible: {
    E1: rows.filter((row) => row.evidence.e1Eligible).length,
    E2: rows.filter((row) => row.evidence.e2Eligible).length,
    E3: rows.filter((row) => row.evidence.e3Eligible).length,
  },
  firstMissingStageCounts: countBy(rows.map((row) => row.firstMissingStage)),
  evidenceClassCounts: countBy(rows.map((row) => row.evidence.class)),
  productTargetTop3: rows.filter((row) => row.product.targetInTop3).length,
  productChanged: false,
  rows,
};

if (report.targetCount !== 40) {
  throw new Error(`Expected 40 A7(b9) events, found ${report.targetCount}.`);
}
if (report.provenanceComplete !== report.targetCount) {
  throw new Error("Phase 4.8 trace has missing note-instance provenance.");
}

await Promise.all([
  writeFile(
    resolve(cwd(), "docs/phase4.8/01-a7b9-pipeline-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(cwd(), "docs/phase4.8/01-a7b9-pipeline-trace.md"),
    `# Phase 4.8-01 A7(b9) Pipeline Trace

## Summary

- Existing Dev target: ${report.targetCount} (clean ${report.cleanCount} / stress ${report.stressCount})
- Root hypothesis present: ${report.rootHypothesisPresent}/${report.targetCount}
- Complete dom7 core: ${report.completeCore}/${report.targetCount}
- Observed b9 note: ${report.flatNineObserved}/${report.targetCount}
- Note-instance provenance complete: ${report.provenanceComplete}/${report.targetCount}
- E1 / E2 / E3 eligible: ${report.eligible.E1} / ${report.eligible.E2} / ${report.eligible.E3}
- Product Top-3 target: ${report.productTargetTop3}/${report.targetCount}
- First missing stage: ${JSON.stringify(report.firstMissingStageCounts)}
- Evidence classes: ${JSON.stringify(report.evidenceClassCounts)}

## Event Trace

| File | Variant | Core | b9 role | overlap | duration | onsets | E1/E2/E3 | Product Top-3 | first missing stage |
|---|---|---:|---|---:|---:|---:|---|---|---|
${rows.map((row) => `| ${row.fileId} | ${row.variant} | ${row.core.complete ? "complete" : row.core.p5Omitted ? "P5 omit" : "missing"} | ${row.flatNine.roles.join(", ") || "-"} | ${(row.flatNine.strictCoreOverlapRatio * 100).toFixed(1)}% | ${(row.flatNine.durationRatio * 100).toFixed(1)}% | ${row.flatNine.onsetCount} | ${row.evidence.e1Eligible ? "Y" : "N"}/${row.evidence.e2Eligible ? "Y" : "N"}/${row.evidence.e3Eligible ? "Y" : "N"} | ${row.product.top3.join(", ")} | ${row.firstMissingStage} |`).join("\n")}

Product候補生成、score、rank、Analyzer、schema、fileVersionは変更していない。
`,
    "utf8",
  ),
]);

stdout.write(`${JSON.stringify({
  targetCount: report.targetCount,
  rootHypothesisPresent: report.rootHypothesisPresent,
  completeCore: report.completeCore,
  flatNineObserved: report.flatNineObserved,
  eligible: report.eligible,
  firstMissingStageCounts: report.firstMissingStageCounts,
  evidenceClassCounts: report.evidenceClassCounts,
}, null, 2)}\n`);

function noteTrace(note: {
  noteInstanceId: string;
  pitch: number;
  pitchClass: number;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  trackIndex: number;
  channel?: number;
  trackName?: string;
  role: string;
  roleConfidence: number;
}) {
  return { ...note };
}

function bestTimelineItem(
  timeline: readonly ChordTimelineItem[],
  startBeat: number,
  endBeat: number,
  beatsPerBar: number,
) {
  return [...timeline].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + left.beat - 1;
    const rightStart = (right.bar - 1) * beatsPerBar + right.beat - 1;
    return iou(rightStart, rightStart + right.durationBeats, startBeat, endBeat)
      - iou(leftStart, leftStart + left.durationBeats, startBeat, endBeat)
      || leftStart - rightStart;
  })[0];
}

function iou(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  const intersection = Math.max(
    0,
    Math.min(aEnd, bEnd) - Math.max(aStart, bStart),
  );
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}
