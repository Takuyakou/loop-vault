import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { normalizeChordLabel } from "../src/domain/chordIdentity";
import { chordPitchClasses } from "../src/domain/chordVoicing";
import { analyzeMidi } from "../src/domain/midi";
import {
  bestWindow,
  countBy,
  diagnoseLoadedFile,
  identityKey,
  identityKeyForLabel,
  isNonRootSlash,
  loadPhase47Files,
  notesForWindow,
  percent,
  plainCompanion,
  qualityFamily,
  regressionCorpusDir,
} from "./phase47/evaluationShared";

const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const rows = [];
let eventCount = 0;
let rawCandidateCount = 0;
let deduplicatedCandidateCount = 0;
let attachmentEventCount = 0;
let attachmentCandidateCount = 0;
let slashOnlyIdentityCount = 0;
let plainIdentityLostCount = 0;
let coexistCount = 0;
let provenanceEligibleCompanionCount = 0;
let applicableEventCount = 0;
let top3SlashOnlyCount = 0;
let rank1SlashOnlyCount = 0;
let pairCompetitionEventCount = 0;
let rank1TieEventCount = 0;
let rootPositionGoldCount = 0;
let slashGoldCount = 0;
const attachmentFamilies: string[] = [];
const attachmentBassClasses: string[] = [];
const scoreMargins: number[] = [];

for (const loaded of files) {
  const windows = diagnoseLoadedFile(loaded);
  const analysis = analyzeMidi(loaded.bytes, {
    mode: "phase4-v1",
    fileName: loaded.file.path,
  });
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);
  for (const event of loaded.file.events) {
    const window = bestWindow(windows, event, beatsPerBar);
    if (!window) continue;
    const raw = window.candidates;
    const rawKeys = raw.map((candidate) => identityKey(candidate.chord));
    const deduplicatedKeys = [...new Set(rawKeys)];
    const keySet = new Set(rawKeys);
    const slashCandidates = raw.filter((candidate) =>
      isNonRootSlash(candidate.chord));
    const lostPlain = slashCandidates.filter((candidate) =>
      !keySet.has(identityKey(plainCompanion(candidate.chord))));
    const supportingPitchClasses = new Set(
      notesForWindow(loaded, window, beatsPerBar).map((note) => note.pitchClass),
    );
    const applicableCandidates = lostPlain.filter((candidate) =>
      chordPitchClasses(plainCompanion(candidate.chord))
        .every((pitchClass) => supportingPitchClasses.has(pitchClass)));
    const coexist = slashCandidates.filter((candidate) =>
      keySet.has(identityKey(plainCompanion(candidate.chord))));
    const applicable = applicableCandidates.length > 0;
    const productItem = bestProductTimelineItem(
      analysis.fullTimeline,
      event.startBeat,
      event.endBeat,
      beatsPerBar,
    );
    const productTop3 = productItem
      ? [productItem.chord, ...productItem.alternatives.map((entry) => entry.chord)]
        .slice(0, 3)
      : [];
    const productKeys = new Set(productTop3.map(identityKey));
    const slashOnlyTop3 = productTop3.filter((chord) =>
      isNonRootSlash(chord)
      && !productKeys.has(identityKey(plainCompanion(chord))));
    const expected = normalizeChordLabel(event.chordSymbol);
    const expectedRootPosition = expected?.bassPitchClass === undefined;
    const margin = raw.length >= 2
      ? raw[0].rawScore - raw[1].rawScore
      : Number.POSITIVE_INFINITY;
    const tiedRank1 = margin === 0;
    const rootsWithBoth = new Set(slashCandidates
      .filter((candidate) =>
        keySet.has(identityKey(plainCompanion(candidate.chord))))
      .map((candidate) => `${candidate.chord.root}:${candidate.chord.quality}`));

    eventCount += 1;
    rawCandidateCount += raw.length;
    deduplicatedCandidateCount += deduplicatedKeys.length;
    if (slashCandidates.length > 0) attachmentEventCount += 1;
    attachmentCandidateCount += slashCandidates.length;
    slashOnlyIdentityCount += lostPlain.length;
    plainIdentityLostCount += lostPlain.length;
    coexistCount += coexist.length;
    provenanceEligibleCompanionCount += applicableCandidates.length;
    if (applicable) applicableEventCount += 1;
    top3SlashOnlyCount += slashOnlyTop3.length;
    if (productTop3[0] && isNonRootSlash(productTop3[0])) {
      rank1SlashOnlyCount += 1;
    }
    if (rootsWithBoth.size > 0) pairCompetitionEventCount += 1;
    if (tiedRank1) rank1TieEventCount += 1;
    if (expectedRootPosition) rootPositionGoldCount += 1;
    else slashGoldCount += 1;
    scoreMargins.push(Number.isFinite(margin) ? margin : 0);
    for (const candidate of slashCandidates) {
      attachmentFamilies.push(qualityFamily(candidate.chord));
      attachmentBassClasses.push(String(candidate.chord.bass));
    }
    rows.push({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      expected: event.chordSymbol,
      expectedCanonical: identityKeyForLabel(event.chordSymbol),
      rawCandidateCount: raw.length,
      deduplicatedCandidateCount: deduplicatedKeys.length,
      attachmentCandidateCount: slashCandidates.length,
      slashOnlyIdentityCount: lostPlain.length,
      plainIdentityLostCount: lostPlain.length,
      provenanceEligibleCompanionCount: applicableCandidates.length,
      coexistCount: coexist.length,
      applicable,
      productTop3: productTop3.map((chord) => chord.label),
      productTop3SlashOnlyCount: slashOnlyTop3.length,
      productRank1: productTop3[0]?.label ?? null,
      productRank1SlashOnly: productTop3[0]
        ? isNonRootSlash(productTop3[0])
        : false,
      rawRank1ScoreMargin: Number.isFinite(margin) ? margin : null,
      rawRank1Tied: tiedRank1,
    });
  }
}

const report = {
  schemaVersion: 1,
  phase: "4.7-01",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "existing-dev-regression",
  files: files.length,
  events: eventCount,
  scope: {
    bassAttachmentEventCount: attachmentEventCount,
    bassAttachmentEventRate: attachmentEventCount / eventCount,
    bassAttachmentCandidateCount: attachmentCandidateCount,
    slashOnlyIdentityCount,
    plainIdentityLostCount,
    plainSlashCoexistCount: coexistCount,
    provenanceEligibleCompanionCount,
    candidatePoolImpactRate: slashOnlyIdentityCount / rawCandidateCount,
    top3SlashOnlyCount,
    rank1SlashOnlyCount,
    pairCompetitionEventCount,
    rawRank1ScoreTieCount: rank1TieEventCount,
    rawRank1ScoreTieRate: rank1TieEventCount / eventCount,
    rawRank1ScoreMargin: {
      minimum: Math.min(...scoreMargins),
      maximum: Math.max(...scoreMargins),
      mean: scoreMargins.reduce((sum, value) => sum + value, 0) / scoreMargins.length,
    },
    applicableEventCount,
    applicabilityRate: applicableEventCount / eventCount,
    rootPositionGoldCount,
    slashGoldCount,
  },
  candidatePool: {
    rawCandidateCount,
    deduplicatedCandidateCount,
    duplicateCount: rawCandidateCount - deduplicatedCandidateCount,
  },
  byFamily: countBy(attachmentFamilies),
  byBassPitchClass: countBy(attachmentBassClasses),
  productChanged: false,
  validationOrHoldoutRun: false,
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.7/01-real-scope.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.7/01-real-scope.md"),
  `# Phase 4.7-01 Real Scope

Existing Dev ${files.length} MIDI / ${eventCount} eventsを、raw candidate、canonical dedup、
Product Top-3、rank 1の全境界で測定した。Product変更、Validation、Holdout実行はない。

## Scope

| Metric | Value |
|---|---:|
| bass attachment events | ${attachmentEventCount} / ${eventCount} (${percent(attachmentEventCount / eventCount)}) |
| bass attachment candidates | ${attachmentCandidateCount} |
| slash-only identities | ${slashOnlyIdentityCount} |
| lost plain identities | ${plainIdentityLostCount} |
| plain/slash coexist identities | ${coexistCount} |
| provenance-eligible companions | ${provenanceEligibleCompanionCount} |
| candidate pool impact | ${percent(slashOnlyIdentityCount / rawCandidateCount)} |
| applicable events | ${applicableEventCount} / ${eventCount} (${percent(applicableEventCount / eventCount)}) |
| Product Top-3 slash-only | ${top3SlashOnlyCount} |
| Product rank 1 slash-only | ${rank1SlashOnlyCount} |
| existing pair competition events | ${pairCompetitionEventCount} |
| raw rank 1 exact ties | ${rank1TieEventCount} (${percent(rank1TieEventCount / eventCount)}) |
| root-position / slash Gold | ${rootPositionGoldCount} / ${slashGoldCount} |

## Candidate pool

- raw: ${rawCandidateCount}
- deduplicated: ${deduplicatedCandidateCount}
- canonical duplicate removed: ${rawCandidateCount - deduplicatedCandidateCount}
- rank 1 margin min / mean / max: ${Math.min(...scoreMargins).toFixed(6)} / ${(scoreMargins.reduce((sum, value) => sum + value, 0) / scoreMargins.length).toFixed(6)} / ${Math.max(...scoreMargins).toFixed(6)}

## Family別 attachment candidates

| Family | Count |
|---|---:|
${Object.entries(report.byFamily).map(([family, count]) => `| ${family} | ${count} |`).join("\n")}

## Bass pitch class別

| Pitch class | Count |
|---|---:|
${Object.entries(report.byBassPitchClass).map(([bass, count]) => `| ${bass} | ${count} |`).join("\n")}

## Interpretation

automatic bass attachmentはcandidate生成時にcore identityをその場でslash化するため、
同じcoreのplain candidateはbaseline集合へ残らない。Part Aのapplicabilityは
Gold miss 28件より広く、candidate pool全体で測定する。
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  scope: report.scope,
  candidatePool: report.candidatePool,
  byFamily: report.byFamily,
}, null, 2)}\n`);

function bestProductTimelineItem(
  timeline: ReturnType<typeof analyzeMidi>["fullTimeline"],
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

function iou(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}
