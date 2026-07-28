import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../src/domain/chordIdentity";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { TimedNote } from "../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../src/domain/midi/voices";
import { classifyCounterfactualChange } from "./phase46/counterfactualRisk";
import {
  generateRootPositionMin7Shadows,
  shadowCandidateToChord,
  type ShadowSupportingNote,
} from "./phase46/shadowCandidateGenerator";

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

interface RankedCandidate {
  label: string;
  identity: NormalizedChordIdentity;
  canonicalIdentity: string;
  score: number;
  source: "raw" | "shadow";
}

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as Manifest;
const rows = [];

for (const file of manifest.files.filter((entry) => entry.split === "dev")) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const parsed = parseMidi(bytes);
  const evidenceNotes = selectChordEvidenceNotes(parsed.notes);
  const windows = diagnoseLegacyWindowCandidates(bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
  const beatsPerBar = file.timeSignature.numerator * (4 / file.timeSignature.denominator);
  for (const event of file.events) {
    const window = bestWindow(windows, event, beatsPerBar);
    if (!window) continue;
    const raw = deduplicateAndRank(window.candidates.flatMap((candidate) => {
      const identity = normalizeChordLabel(candidate.chord.label);
      return identity ? [{
        label: candidate.chord.label,
        identity,
        canonicalIdentity: chordIdentityKey(identity),
        score: candidate.rawScore,
        source: "raw" as const,
      }] : [];
    }));
    const generated = generateRootPositionMin7Shadows({
      rawCandidates: window.candidates,
      supportingNotes: notesForWindow(
        file.fileId,
        evidenceNotes,
        parsed.ticksPerBeat,
        window,
        beatsPerBar,
      ),
    });
    const shadow = generated.candidates.flatMap((candidate) => {
      const chord = shadowCandidateToChord(candidate);
      const identity = chord ? normalizeChordLabel(chord.label) : null;
      return chord && identity ? [{
        label: chord.label,
        identity,
        canonicalIdentity: candidate.canonicalIdentity,
        score: candidate.counterfactualScore ?? Number.NEGATIVE_INFINITY,
        source: "shadow" as const,
      }] : [];
    });
    const combined = deduplicateAndRank([...raw, ...shadow]);
    const before = raw[0];
    const after = combined[0];
    const expected = normalizeChordLabel(event.chordSymbol);
    const expectedKey = expected ? chordIdentityKey(expected) : null;
    const changed = before?.canonicalIdentity !== after?.canonicalIdentity;
    const categories = changed && before && after
      ? classifyCounterfactualChange({
          before: before.identity,
          after: after.identity,
          expected,
          beforeScore: before.score,
          afterScore: after.score,
        })
      : [];
    const beforeCorrect = expectedKey !== null
      && before?.canonicalIdentity === expectedKey;
    const afterCorrect = expectedKey !== null
      && after?.canonicalIdentity === expectedKey;
    const outcome = !changed
      ? "unchanged"
      : (!beforeCorrect && afterCorrect
        ? "improved"
        : (beforeCorrect && !afterCorrect ? "regressed" : "neutral"));
    rows.push({
      fileId: file.fileId,
      eventId: event.eventId,
      scenarioId: file.scenarioId,
      scenarioSlug: file.scenarioSlug,
      variant: file.variant,
      expected: event.chordSymbol,
      before: before ? candidateView(before) : null,
      after: after ? candidateView(after) : null,
      changed,
      outcome,
      categories,
      scoreMargin: before && after ? after.score - before.score : null,
      beforeGoldRank: rankOf(raw, expectedKey),
      afterGoldRank: rankOf(combined, expectedKey),
      beforeTop3Canonical: rankOf(raw, expectedKey) !== null
        && rankOf(raw, expectedKey)! <= 3,
      afterTop3Canonical: rankOf(combined, expectedKey) !== null
        && rankOf(combined, expectedKey)! <= 3,
      beforeTop3Root: expected
        ? raw.slice(0, 3).some((candidate) =>
            candidate.identity.rootPitchClass === expected.rootPitchClass)
        : false,
      afterTop3Root: expected
        ? combined.slice(0, 3).some((candidate) =>
            candidate.identity.rootPitchClass === expected.rootPitchClass)
        : false,
      shadowCandidateCount: shadow.length,
    });
  }
}

const changedRows = rows.filter((row) => row.changed);
const improvedCount = changedRows.filter((row) => row.outcome === "improved").length;
const regressedCount = changedRows.filter((row) => row.outcome === "regressed").length;
const neutralCount = changedRows.filter((row) => row.outcome === "neutral").length;
const beforeTop3Canonical = rate(rows.filter((row) => row.beforeTop3Canonical).length, rows.length);
const afterTop3Canonical = rate(rows.filter((row) => row.afterTop3Canonical).length, rows.length);
const beforeTop3Root = rate(rows.filter((row) => row.beforeTop3Root).length, rows.length);
const afterTop3Root = rate(rows.filter((row) => row.afterTop3Root).length, rows.length);
const beforeMrr = mean(rows.map((row) => reciprocalRank(row.beforeGoldRank)));
const afterMrr = mean(rows.map((row) => reciprocalRank(row.afterGoldRank)));
const report = {
  schemaVersion: 1,
  phase: "4.6-06",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "dev",
  eventCount: rows.length,
  competitionPoint: "deduplicated pre-clamp raw candidate ranking",
  scorePolicy: "Shadow keeps its source raw score; score ties use canonical identity ascending.",
  metrics: {
    rank1ChangedCount: changedRows.length,
    rank1ChangedRate: rate(changedRows.length, rows.length),
    improvedCount,
    regressedCount,
    neutralCount,
    unchangedCount: rows.length - changedRows.length,
    changedRootCount: changedRows.filter((row) =>
      row.categories.includes("root-changed")).length,
    plainStolenByAlteredCount: changedRows.filter((row) =>
      row.categories.includes("plain-stolen-by-altered")).length,
    tieBreakOnlyChangeCount: changedRows.filter((row) =>
      row.categories.includes("tie-break-only")).length,
    slashOnlyChangeCount: changedRows.filter((row) =>
      row.categories.includes("slash-only-change")).length,
    top3Canonical: {
      before: beforeTop3Canonical,
      after: afterTop3Canonical,
      delta: afterTop3Canonical - beforeTop3Canonical,
    },
    top3Root: {
      before: beforeTop3Root,
      after: afterTop3Root,
      delta: afterTop3Root - beforeTop3Root,
    },
    mrr: {
      before: beforeMrr,
      after: afterMrr,
      delta: afterMrr - beforeMrr,
    },
    scoreMargin: summarizeNumbers(changedRows.flatMap((row) =>
      row.scoreMargin === null ? [] : [row.scoreMargin])),
    categoryCounts: countBy(changedRows.flatMap((row) => row.categories)),
  },
  familyRisk: groupRisk(rows, (row) => row.expected),
  variantRisk: groupRisk(rows, (row) => row.variant),
  scenarioRisk: groupRisk(rows, (row) => row.scenarioId),
  interpretation: {
    level: regressedCount > 0 ? "high-risk" : "low-risk",
    recallImproved: improvedCount > 0,
    productConnectionAllowed: false,
    reason: regressedCount > 0
      ? "Counterfactual ranking regressed at least one event."
      : "No regression was observed, but Phase 4.6 forbids Product connection.",
  },
  productChanged: false,
  validationOrHoldoutRun: false,
  changedRows,
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/06-counterfactual-competition.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/06-counterfactual-competition.md"),
  `# Phase 4.6-06 Counterfactual Competition

Shadow candidates were hypothetically inserted into the deduplicated pre-clamp raw ranking. Product was not changed.

## Rank 1

- changed: ${changedRows.length} / ${rows.length} (${percent(rate(changedRows.length, rows.length))})
- improved / regressed / neutral: ${improvedCount} / ${regressedCount} / ${neutralCount}
- tie-break-only: ${report.metrics.tieBreakOnlyChangeCount}
- slash-only: ${report.metrics.slashOnlyChangeCount}
- root changed: ${report.metrics.changedRootCount}
- plain stolen by altered: ${report.metrics.plainStolenByAlteredCount}

## Ranking metrics

| Metric | Before | Counterfactual | Delta |
|---|---:|---:|---:|
| Top-3 canonical | ${percent(beforeTop3Canonical)} | ${percent(afterTop3Canonical)} | ${percent(afterTop3Canonical - beforeTop3Canonical)} |
| Top-3 root | ${percent(beforeTop3Root)} | ${percent(afterTop3Root)} | ${percent(afterTop3Root - beforeTop3Root)} |
| MRR | ${beforeMrr.toFixed(6)} | ${afterMrr.toFixed(6)} | ${(afterMrr - beforeMrr).toFixed(6)} |

## Interpretation

Risk: **${report.interpretation.level}**.

${report.interpretation.reason} Generated companions retain the source raw score, so changes caused by equal score are explicitly classified as tie-break-only. Detailed family, variant, scenario and event rows are in the JSON artifact.

Validation and Holdout were not run. Analyzer, Timeline, Product candidates, score, schema and Vault data remain unchanged.
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  metrics: report.metrics,
  interpretation: report.interpretation,
  changedRows: report.changedRows,
}, null, 2)}\n`);

function deduplicateAndRank(
  candidates: readonly RankedCandidate[],
): RankedCandidate[] {
  const byIdentity = new Map<string, RankedCandidate>();
  for (const candidate of candidates) {
    const previous = byIdentity.get(candidate.canonicalIdentity);
    if (!previous || candidate.score > previous.score
      || (candidate.score === previous.score && candidate.source === "raw"
        && previous.source === "shadow")) {
      byIdentity.set(candidate.canonicalIdentity, candidate);
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    right.score - left.score
    || left.canonicalIdentity.localeCompare(right.canonicalIdentity));
}

function candidateView(candidate: RankedCandidate) {
  return {
    label: candidate.label,
    canonicalIdentity: candidate.canonicalIdentity,
    score: candidate.score,
    source: candidate.source,
  };
}

function rankOf(
  candidates: readonly RankedCandidate[],
  expectedKey: string | null,
) {
  if (!expectedKey) return null;
  const index = candidates.findIndex((candidate) =>
    candidate.canonicalIdentity === expectedKey);
  return index < 0 ? null : index + 1;
}

function notesForWindow(
  fileId: string,
  notes: readonly TimedNote[],
  ticksPerBeat: number,
  window: LegacyWindowCandidateDiagnostic,
  beatsPerBar: number,
): ShadowSupportingNote[] {
  const startBeat = (window.bar - 1) * beatsPerBar + window.beat - 1;
  const endBeat = startBeat + window.durationBeats;
  const startTick = startBeat * ticksPerBeat;
  const endTick = endBeat * ticksPerBeat;
  return notes
    .filter((note) =>
      note.startTick < endTick
      && note.startTick + note.durationTick > startTick)
    .map((note, index) => ({
      noteInstanceId: [
        fileId,
        `n${index}`,
        `t${note.trackIndex}`,
        `c${note.channel ?? -1}`,
        `p${note.pitch}`,
        `s${note.startTick}`,
        `d${note.durationTick}`,
      ].join(":"),
      pitchClass: ((note.pitch % 12) + 12) % 12,
    }));
}

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

function reciprocalRank(rank: number | null) {
  return rank === null ? 0 : 1 / rank;
}

function rate(count: number, total: number) {
  return total === 0 ? 0 : count / total;
}

function mean(values: readonly number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(values: readonly string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

function summarizeNumbers(values: readonly number[]) {
  if (values.length === 0) return { count: 0, min: null, max: null, mean: null };
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: mean(values),
  };
}

function groupRisk<T extends { changed: boolean; outcome: string }>(
  values: readonly T[],
  keyOf: (value: T) => string,
) {
  return [...new Set(values.map(keyOf))].sort().map((key) => {
    const group = values.filter((value) => keyOf(value) === key);
    return {
      key,
      count: group.length,
      changed: group.filter((value) => value.changed).length,
      improved: group.filter((value) => value.outcome === "improved").length,
      regressed: group.filter((value) => value.outcome === "regressed").length,
      neutral: group.filter((value) => value.outcome === "neutral").length,
    };
  });
}

function percent(value: number) {
  return `${(value * 100).toFixed(4)}%`;
}
