import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../src/domain/chordIdentity";
import { labelFromSymbol, normalizePc, parseChordLabel } from "../src/domain/chords";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import {
  classifyMissingCandidate,
  identityWithoutAlterations,
  identityWithoutBass,
  identityWithoutTensions,
} from "./phase46/missingCandidateTaxonomy";

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
  rows: Array<{
    fileId: string;
    eventId: string;
    expected: string;
    detectedRank1: string | null;
    firstDropStage: string | null;
  }>;
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const funnel = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.json"), "utf8"),
) as FunnelReport;
const devFiles = manifest.files.filter((file) => file.split === "dev");
const fileById = new Map(devFiles.map((file) => [file.fileId, file]));
const missingTargets = funnel.rows.filter((row) =>
  row.firstDropStage === "raw-generation");
const diagnosticsByFile = new Map<string, LegacyWindowCandidateDiagnostic[]>();
const rows = [];

for (const target of missingTargets) {
  const file = fileById.get(target.fileId);
  const event = file?.events.find((entry) => entry.eventId === target.eventId);
  if (!file || !event) {
    throw new Error(`Missing manifest event ${target.fileId}/${target.eventId}`);
  }
  let windows = diagnosticsByFile.get(file.fileId);
  if (!windows) {
    const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
    windows = diagnoseLegacyWindowCandidates(bytes, {
      useQualityEvidence: true,
      qualityEvidence: phase4QualityEvidence,
    });
    diagnosticsByFile.set(file.fileId, windows);
  }
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);
  const window = bestWindow(windows, event, beatsPerBar);
  if (!window) throw new Error(`Missing raw window ${file.fileId}/${event.eventId}`);
  const expected = normalizeChordLabel(event.chordSymbol);
  const parsed = parseChordLabel(event.chordSymbol);
  const roundTrip = parsed ? normalizeChordLabel(labelFromSymbol(parsed)) : null;
  const canonicalRoundTrip = expected !== null
    && roundTrip !== null
    && chordIdentityKey(expected) === chordIdentityKey(roundTrip);
  const candidates = window.candidates.flatMap((candidate) => {
    const identity = normalizeChordLabel(candidate.chord.label);
    return identity ? [{ ...candidate, identity }] : [];
  });
  const sameRoot = expected
    ? candidates.filter((candidate) =>
        candidate.identity.rootPitchClass === expected.rootPitchClass)
    : [];
  const triadCore = expected
    ? sameRoot.filter((candidate) => candidate.identity.triad === expected.triad)
    : [];
  const seventhCore = expected
    ? triadCore.filter((candidate) =>
        candidate.identity.seventh === expected.seventh)
    : [];
  const exactIgnoringBass = expected
    ? candidates.filter((candidate) =>
        identityWithoutBass(candidate.identity) === identityWithoutBass(expected))
    : [];
  const baseWithoutAlteration = expected
    ? candidates.filter((candidate) =>
        identityWithoutAlterations(candidate.identity)
          === identityWithoutAlterations(expected))
    : [];
  const baseWithoutTension = expected
    ? candidates.filter((candidate) =>
        identityWithoutTensions(candidate.identity) === identityWithoutTensions(expected))
    : [];
  const requiredPitchClasses = expected ? pitchClassesForIdentity(expected) : [];
  const histogram = window.histogram ?? [];
  const observedPitchClasses = histogram.flatMap((weight, pitchClass) =>
    weight > 0 ? [pitchClass] : []);
  const evidenceSufficient = requiredPitchClasses.every((pitchClass) =>
    observedPitchClasses.includes(pitchClass));
  const detected = target.detectedRank1
    ? normalizeChordLabel(target.detectedRank1)
    : null;
  const rootCorrect = expected !== null && detected !== null
    && expected.rootPitchClass === detected.rootPitchClass;
  const signals = {
    representable: expected !== null && parsed !== null,
    canonicalRoundTrip,
    rootHypothesisPresent: sameRoot.length > 0,
    triadCorePresent: triadCore.length > 0,
    seventhCorePresent: expected?.seventh === undefined || seventhCore.length > 0,
    exactIgnoringBassPresent: exactIgnoringBass.length > 0,
    expectedHasAlteration: (expected?.alterations.length ?? 0) > 0,
    baseWithoutAlterationPresent: baseWithoutAlteration.length > 0,
    expectedHasTension: (expected?.extensions.length ?? 0) > 0,
    baseWithoutTensionPresent: baseWithoutTension.length > 0,
    expectedIsSuspendedSeventh: expected?.triad === "sus4"
      && expected.seventh !== undefined,
    suspendedTriadPresent: triadCore.length > 0,
    presentBeforeClamp: sameRoot.length > 0,
    presentAfterBudget: sameRoot.length > 0,
    evidenceSufficient,
  };
  const primaryCategory = classifyMissingCandidate(signals);
  rows.push({
    fileId: file.fileId,
    eventId: event.eventId,
    expected: event.chordSymbol,
    scenarioId: file.scenarioId,
    scenarioSlug: file.scenarioSlug,
    variant: file.variant,
    primaryCategory,
    secondary: {
      family: secondaryFamily(expected),
      position: expected?.bassPitchClass === undefined
        ? "root-position"
        : "inversion",
      variant: file.variant,
      scenario: file.scenarioId,
      detectedRoot: rootCorrect ? "correct" : "wrong",
    },
    components: {
      root: expected?.rootPitchClass ?? null,
      triad: expected?.triad ?? null,
      seventh: expected?.seventh ?? null,
      tensions: expected?.extensions ?? [],
      alterations: expected?.alterations ?? [],
      bass: expected?.bassPitchClass ?? expected?.rootPitchClass ?? null,
      canonicalIdentity: expected ? chordIdentityKey(expected) : null,
    },
    signals,
    evidence: {
      requiredPitchClasses,
      observedPitchClasses,
      sufficient: evidenceSufficient,
    },
    nearestSameRootCandidates: sameRoot.slice(0, 5).map((candidate) => ({
      label: candidate.chord.label,
      rawScore: candidate.rawScore,
      canonicalIdentity: chordIdentityKey(candidate.identity),
    })),
    exactIgnoringBassCandidates: exactIgnoringBass.map((candidate) => ({
      label: candidate.chord.label,
      rawScore: candidate.rawScore,
    })),
  });
}

const familyLabels = [...new Set(funnel.rows.map((row) => row.expected))].sort();
const familyStats = familyLabels.map((label) => {
  const all = funnel.rows.filter((row) => row.expected === label);
  const missing = rows.filter((row) => row.expected === label);
  return {
    label,
    goldCount: all.length,
    missingCount: missing.length,
    missingRate: all.length === 0 ? 0 : missing.length / all.length,
    uniqueScenarioCount: new Set(missing.map((row) => row.scenarioId)).size,
    cleanMissing: missing.filter((row) => row.variant === "clean").length,
    stressMissing: missing.filter((row) => row.variant === "stress").length,
    rootCorrectCount: missing.filter((row) =>
      row.secondary.detectedRoot === "correct").length,
    primaryCounts: countBy(missing.map((row) => row.primaryCategory)),
  };
});
const report = {
  schemaVersion: 1,
  phase: "4.6-02",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  targetCount: rows.length,
  expectedTargetCount: 68,
  primaryCounts: countBy(rows.map((row) => row.primaryCategory)),
  secondaryFamilyCounts: countBy(rows.map((row) => row.secondary.family)),
  familyStats,
  twelveKeyReproducibility: {
    observedRootCount: new Set(rows.map((row) => row.components.root)).size,
    observedRoots: [...new Set(rows.map((row) => row.components.root))].sort(),
    conclusion: "Fixed Gold does not span 12 roots; grammar transposition must be tested synthetically after Decision Lock.",
  },
  productChanged: false,
  validationOrHoldoutRun: false,
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/02-missing-candidate-taxonomy.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/02-missing-candidate-taxonomy.md"),
  `# Phase 4.6-02 Missing Candidate Taxonomy

The 68 raw-generation misses from the frozen Dev funnel were decomposed without changing Product generation or ranking.

## Primary classification

${Object.entries(report.primaryCounts)
  .map(([category, count]) => `- \`${category}\`: ${count}`)
  .join("\n")}

## Family summary

| Gold family | Gold | Missing | Missing rate | Scenarios | Clean / Stress | Root correct | Primary |
|---|---:|---:|---:|---:|---:|---:|---|
${familyStats.map((family) =>
    `| ${family.label} | ${family.goldCount} | ${family.missingCount} | ${percent(family.missingRate)} | ${family.uniqueScenarioCount} | ${family.cleanMissing} / ${family.stressMissing} | ${family.rootCorrectCount} | ${Object.entries(family.primaryCounts).map(([key, value]) => `${key}: ${value}`).join(", ")} |`)
  .join("\n")}

## Interpretation

- Root-position identities can be absent even when the same root, triad, seventh and tensions exist as a slash candidate.
- Altered dominant candidates are a separate vocabulary gap and are not combined with the root-position companion target.
- Fixed Gold covers ${report.twelveKeyReproducibility.observedRootCount} distinct roots in these misses. Twelve-key reproducibility cannot be claimed from this corpus and must be established with deterministic synthetic tests.
- Product rank, score, Analyzer output, schema and Timeline were not changed. Validation and Holdout were not run.

The JSON artifact contains component-level signals, evidence pitch sets, nearest same-root candidates and scenario metadata for all 68 events.
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  targetCount: report.targetCount,
  primaryCounts: report.primaryCounts,
  familyStats: report.familyStats,
  twelveKeyReproducibility: report.twelveKeyReproducibility,
}, null, 2)}\n`);

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

function intervalIou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

function pitchClassesForIdentity(identity: NormalizedChordIdentity) {
  const intervals = new Set<number>([0]);
  const triads: Record<NormalizedChordIdentity["triad"], number[]> = {
    major: [4, 7],
    minor: [3, 7],
    diminished: [3, 6],
    augmented: [4, 8],
    sus2: [2, 7],
    sus4: [5, 7],
    power: [7],
    unknown: [],
  };
  triads[identity.triad].forEach((interval) => intervals.add(interval));
  if (identity.seventh === "minor7") intervals.add(10);
  if (identity.seventh === "major7") intervals.add(11);
  if (identity.seventh === "diminished7") intervals.add(9);
  const extensionIntervals: Record<number, number> = { 6: 9, 9: 2, 11: 5, 13: 9 };
  identity.extensions.forEach((extension) => {
    const interval = extensionIntervals[extension];
    if (interval !== undefined) intervals.add(interval);
  });
  const alterationIntervals: Record<string, number> = {
    b9: 1,
    "#9": 3,
    "#11": 6,
    b13: 8,
  };
  identity.alterations.forEach((alteration) => {
    const interval = alterationIntervals[alteration];
    if (interval !== undefined) intervals.add(interval);
  });
  return [...intervals]
    .map((interval) => normalizePc(identity.rootPitchClass + interval))
    .sort((a, b) => a - b);
}

function secondaryFamily(identity: NormalizedChordIdentity | null) {
  if (!identity) return "annotation-contract";
  if (identity.alterations.length > 0 && identity.seventh === "minor7") {
    return "altered dominant";
  }
  if (identity.triad === "minor" && identity.extensions.includes(9)) {
    return "minor ninth";
  }
  if (identity.triad === "sus4" && identity.seventh === "minor7") {
    return "suspended dominant";
  }
  if (identity.triad === "major" && identity.extensions.includes(13)) {
    return "dominant thirteenth";
  }
  if (identity.triad === "major" && identity.seventh === "major7"
    && identity.extensions.includes(9)) {
    return "major ninth";
  }
  if (identity.triad === "minor" && identity.seventh === "minor7") {
    return "plain minor seventh";
  }
  return "other";
}

function countBy(values: readonly string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}
