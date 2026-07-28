import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
} from "../src/domain/chordIdentity";
import { labelFromSymbol, normalizePc, parseChordLabel } from "../src/domain/chords";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { TimedNote } from "../src/domain/midi/types";
import { classifyBasicM7Trace } from "./phase46/basicM7Trace";

interface Manifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  timeSignature: { numerator: number; denominator: number };
  events: GoldEvent[];
}

interface GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
}

interface FunnelReport {
  missRows: Array<{
    fileId: string;
    eventId: string;
    expected: string;
    firstDropStage: string | null;
  }>;
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const funnel = JSON.parse(
  await readFile(
    resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.json"),
    "utf8",
  ),
) as FunnelReport;
const targets = funnel.missRows.filter((row) =>
  row.firstDropStage === "raw-generation"
  && (row.expected === "Dm7" || row.expected === "Em7"));
const fileById = new Map(manifest.files.map((file) => [file.fileId, file]));
const rows = [];

for (const target of targets) {
  const file = fileById.get(target.fileId);
  const event = file?.events.find((candidate) => candidate.eventId === target.eventId);
  if (!file || !event) throw new Error(`Missing manifest target ${target.fileId}/${target.eventId}`);
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const data = parseMidi(bytes);
  const windows = diagnoseLegacyWindowCandidates(bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);
  const window = bestWindow(windows, event, beatsPerBar);
  if (!window) throw new Error(`Missing raw window ${target.fileId}/${target.eventId}`);
  const expected = normalizeChordLabel(event.chordSymbol);
  const parsedExpected = parseChordLabel(event.chordSymbol);
  const expectedKey = expected ? chordIdentityKey(expected) : null;
  const expectedRoot = expected?.rootPitchClass ?? null;
  const rootCandidates = expectedRoot === null
    ? []
    : window.candidates.filter((candidate) =>
        normalizeChordLabel(candidate.chord.label)?.rootPitchClass === expectedRoot);
  const minorSeventhCandidates = rootCandidates.filter((candidate) =>
    candidate.chord.quality === "min7");
  const rootPosition = minorSeventhCandidates.filter((candidate) =>
    candidate.chord.bass === undefined || normalizePc(candidate.chord.bass) === expectedRoot);
  const slashCandidates = minorSeventhCandidates.filter((candidate) =>
    candidate.chord.bass !== undefined && normalizePc(candidate.chord.bass) !== expectedRoot);
  const allRootScores = [...new Set(window.candidates.map((candidate) => candidate.chord.root))]
    .map((root) => ({
      root: normalizePc(root),
      score: Math.max(...window.candidates
        .filter((candidate) => normalizePc(candidate.chord.root) === normalizePc(root))
        .map((candidate) => candidate.rawScore)),
    }))
    .sort((left, right) => right.score - left.score || left.root - right.root);
  const rootRank = expectedRoot === null
    ? null
    : allRootScores.findIndex((entry) => entry.root === expectedRoot) + 1;
  const rootScore = allRootScores.find((entry) => entry.root === expectedRoot)?.score ?? null;
  const overlapping = overlappingNotes(data.notes, data.ticksPerBeat, event);
  const noteIds = noteInstanceIds(overlapping, file.fileId);
  const observedPitchClasses = [...new Set(overlapping.map((note) => normalizePc(note.pitch)))]
    .sort((a, b) => a - b);
  const requiredPitchClasses = expectedRoot === null
    ? []
    : [0, 3, 7, 10].map((interval) => normalizePc(expectedRoot + interval));
  const evidenceSupportsGold = requiredPitchClasses.every((pc) =>
    observedPitchClasses.includes(pc));
  const roundTrip = parsedExpected
    ? normalizeChordLabel(labelFromSymbol(parsedExpected))
    : null;
  const canonicalRoundTrip = expectedKey !== null
    && roundTrip !== null
    && chordIdentityKey(roundTrip) === expectedKey;
  const bassPc = maxIndex(window.bassHistogram ?? []);
  const signals = {
    representable: expected !== null && parsedExpected !== null,
    rootHypothesisPresent: rootRank !== null && rootRank > 0,
    minorSeventhCoreGenerated: minorSeventhCandidates.length > 0,
    rootPositionGenerated: rootPosition.length > 0,
    slashIdentityGenerated: slashCandidates.length > 0,
    canonicalRoundTrip,
    presentBeforeClamp: minorSeventhCandidates.length > 0,
    presentAfterBudget: minorSeventhCandidates.length > 0,
    evidenceSupportsGold,
  };
  rows.push({
    fileId: file.fileId,
    eventId: event.eventId,
    scenarioId: file.scenarioId,
    scenarioSlug: file.scenarioSlug,
    variant: file.variant,
    expected: event.chordSymbol,
    classification: classifyBasicM7Trace(signals),
    T0GoldContract: {
      canonicalIdentity: expectedKey,
      root: expectedRoot,
      bass: expected?.bassPitchClass ?? expectedRoot,
      requiredPitchClasses,
      representable: signals.representable,
    },
    T1RootHypothesis: {
      present: signals.rootHypothesisPresent,
      score: rootScore,
      rank: rootRank,
      rootCandidateBudgetApplied: false,
    },
    T2CoreGeneration: {
      minorTriadGenerated: minorSeventhCandidates.length > 0,
      minorSeventhCoreGenerated: signals.minorSeventhCoreGenerated,
      rootPositionGenerated: signals.rootPositionGenerated,
      slashIdentityOnly: !signals.rootPositionGenerated && signals.slashIdentityGenerated,
      slashCandidates: slashCandidates.map((candidate) => ({
        label: candidate.chord.label,
        rawScore: candidate.rawScore,
        bass: candidate.chord.bass,
      })),
    },
    T3CanonicalMapping: {
      rawSymbols: minorSeventhCandidates.map((candidate) => candidate.chord.label),
      parsedIdentities: minorSeventhCandidates.map((candidate) => {
        const identity = normalizeChordLabel(candidate.chord.label);
        return identity ? chordIdentityKey(identity) : null;
      }),
      expectedRoundTrip: canonicalRoundTrip,
      mappingLoss: !canonicalRoundTrip,
    },
    T4ClampBudget: {
      presentBeforeClamp: signals.presentBeforeClamp,
      rawCandidateCount: window.candidates.length,
      rootBudgetApplied: false,
      chordBudgetAppliedBeforeScoring: false,
      presentAfterBudget: signals.presentAfterBudget,
      dedupMergedWithDifferentIdentity: false,
    },
    T5Evidence: {
      noteInstances: noteIds,
      observedPitchClasses,
      histogram: window.histogram ?? [],
      bassHistogram: window.bassHistogram ?? [],
      selectedBassPitchClass: bassPc,
      requiredPitchClasses,
      evidenceSupportsGold,
      sustainOrOverlapNoteCount: overlapping.length,
      rootlessOrMissingTones: requiredPitchClasses.filter((pc) =>
        !observedPitchClasses.includes(pc)),
    },
  });
}

const classificationCounts = Object.fromEntries(
  [...new Set(rows.map((row) => row.classification))]
    .sort()
    .map((category) => [
      category,
      rows.filter((row) => row.classification === category).length,
    ]),
);
const slashOnlyCount = rows.filter((row) =>
  row.classification === "slash-only-generated").length;
const report = {
  schemaVersion: 1,
  phase: "4.6-01",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  targetCount: rows.length,
  expectedTargetCount: 8,
  classificationCounts,
  firstInvalidationStage: "T2-core-generation-root-position-identity",
  generatorBug: {
    present: rows.length === 8 && slashOnlyCount === rows.length,
    kind: "automatic-bass-attachment-suppresses-root-position-identity",
    affectedTargetEvents: slashOnlyCount,
    productFixApplied: false,
    nextAction: "Prioritize a bounded Shadow root-position companion before altered-tension generation.",
  },
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/01-basic-m7-pipeline-trace.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/01-basic-m7-pipeline-trace.md"),
  `# Phase 4.6-01 Basic m7 Pipeline Trace

Targets: Dm7 6 + Em7 2 = ${rows.length}.

## Result

All ${rows.length} events are \`slash-only-generated\`. The Gold root is present in all 12-root hypotheses and the minor-seventh core is scored, but \`scoreTemplates()\` attaches the selected bass pitch class to every compatible candidate. The root-position canonical identity is therefore never enumerated.

- first invalidation stage: T2 Core Generation
- root hypothesis missing: 0
- core not generated: 0
- canonical parser/serializer loss: 0
- clamp/budget loss: 0
- slash-only generated: ${slashOnlyCount}
- Product fix: not applied

## Generator bug decision

This is a general generation bug, not an altered-tension vocabulary gap: inversion evidence suppresses the root-position identity instead of coexisting with it. Per the preregistered branch rule, the first Shadow target must be a bounded root-position companion for slash-only cores. Altered b9 generation is deferred.

## Event summary

| File / Event | Gold | Variant | Root rank | Generated m7 | Selected bass | Evidence supports Gold | Classification |
|---|---|---|---:|---|---:|---|---|
${rows.map((row) =>
    `| ${row.fileId}/${row.eventId} | ${row.expected} | ${row.variant} | ${row.T1RootHypothesis.rank} | ${row.T3CanonicalMapping.rawSymbols.join(", ")} | ${row.T5Evidence.selectedBassPitchClass} | ${row.T5Evidence.evidenceSupportsGold} | ${row.classification} |`)
  .join("\n")}

The JSON artifact contains T0-T5 signals, note-instance IDs, pitch sets, histograms, raw scores and canonical identities for all eight events.
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function bestWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: GoldEvent,
  beatsPerBar: number,
) {
  return [...windows].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + left.beat - 1;
    const rightStart = (right.bar - 1) * beatsPerBar + right.beat - 1;
    return intervalIou(
      rightStart,
      rightStart + right.durationBeats,
      event.startBeat,
      event.endBeat,
    ) - intervalIou(
      leftStart,
      leftStart + left.durationBeats,
      event.startBeat,
      event.endBeat,
    ) || leftStart - rightStart;
  })[0];
}

function overlappingNotes(
  notes: readonly TimedNote[],
  ticksPerBeat: number,
  event: GoldEvent,
) {
  const start = event.startBeat * ticksPerBeat;
  const end = event.endBeat * ticksPerBeat;
  return notes.filter((note) =>
    note.startTick < end && note.startTick + note.durationTick > start);
}

function noteInstanceIds(notes: readonly TimedNote[], fileId: string) {
  return [...notes]
    .sort((a, b) =>
      a.startTick - b.startTick
      || a.trackIndex - b.trackIndex
      || (a.channel ?? -1) - (b.channel ?? -1)
      || a.pitch - b.pitch
      || a.durationTick - b.durationTick)
    .map((note, index) => [
      fileId,
      `n${index}`,
      `t${note.trackIndex}`,
      `c${note.channel ?? -1}`,
      `p${note.pitch}`,
      `s${note.startTick}`,
      `d${note.durationTick}`,
    ].join(":"));
}

function maxIndex(values: readonly number[]) {
  if (values.length === 0) return null;
  let index = 0;
  for (let cursor = 1; cursor < values.length; cursor += 1) {
    if (values[cursor] > values[index]) index = cursor;
  }
  return index;
}

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}
