/** Privacy-safe Stage03b diagnostic. No private source or candidate label is printed. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { argv, stderr, stdout } from "node:process";
import { resolve } from "node:path";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { ChordTimelineItem } from "../../src/domain/types";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { projectUnionChimeraEndToEnd } from "../p537/e2eProjection";
import { selectSinglePrivateCandidate } from "./privatePromotionRunner";
import { changedRegionIndices, type LocalRegionBinding } from "./groundTruthPacket";
import { parseShadowChordLabel, shadowIdentityKey } from "./shadowRootRelativeIdentity";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "./stage03bInteraction";

const ENTRYPOINT = /(?:^|\/)run-stage03b-private-evaluation\.(?:[cm]?js|ts)$/;

function inputDirectory(args: readonly string[]): string {
  const index = args.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const supplied = index < 0 ? [] : args.slice(index + 1);
  if (supplied.length !== 1 || !supplied[0]) throw new Error("One private input directory required");
  return supplied[0];
}

function sealedBindings(): LocalRegionBinding[] {
  const path = resolve(".local-evaluation/p539-03a-review/sealed-binding.private.json");
  execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("regions" in parsed)
    || !Array.isArray(parsed.regions) || parsed.regions.length !== 2) {
    throw new Error("Frozen anonymous binding unavailable");
  }
  return parsed.regions as LocalRegionBinding[];
}

function productionStateAt(
  timeline: readonly ChordTimelineItem[],
  barLength: number,
  absoluteBeat: number,
): ChordTimelineItem | null {
  return timeline.find((item) => {
    const start = (item.bar - 1) * barLength + (item.beat - 1);
    return start <= absoluteBeat && absoluteBeat < start + item.durationBeats;
  }) ?? null;
}

function main(): void {
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(inputDirectory(argv)));
  const bytes = new Uint8Array(readFileSync(source));
  const before = Uint8Array.from(bytes);
  const parsedBefore = parseMidi(bytes);
  const bindings = sealedBindings();
  const changed = changedRegionIndices(bytes);
  if (changed.length !== 2 || bindings[0]?.id !== "FC-REAL-01"
    || bindings[1]?.id !== "FC-REAL-02"
    || bindings.some((binding, index) => binding.windowIndex !== changed[index]?.index)) {
    throw new Error("Frozen anonymous region binding mismatch");
  }
  const { data, windows } = evaluateStage03bInteractions(bytes);
  const one = windows.find((row) => row.index === bindings[0]!.windowIndex);
  const two = windows.find((row) => row.index === bindings[1]!.windowIndex);
  const selected = bindings[0]!.choices.B;
  const selectedIdentity = parseShadowChordLabel(selected.label);
  const selectedKey = selectedIdentity && shadowIdentityKey(selectedIdentity);
  if (!one || !two || selected.origin !== "shadow" || !selectedKey) {
    throw new Error("Independent selected target unavailable");
  }
  const winner = one.w2.expanded;
  const firstOther = one.w2.result.rankedCandidates[1];
  const countChanged = windows.filter((row) => row.w2.control.identityKey !== row.w2.expanded.identityKey).length;
  const controlFinal = projectStage03bTimeline(data, windows, "control");
  const modelAFinal = projectStage03bTimeline(data, windows, "model-a");
  const modelBFinal = projectStage03bTimeline(data, windows, "model-b");
  const production = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const productionProjection = projectUnionChimeraEndToEnd(bytes, data, inferTrackRoles(data));
  const barLength = beatsPerBar(data.timeSignature);
  const at = (spans: typeof modelAFinal, index: number, offset: number) => (
    projectedStateAt(spans, index * 2 + offset + 0.5)
  );
  const prodAt = (index: number, offset: number) => (
    productionStateAt(production.fullTimeline, barLength, index * 2 + offset + 0.5)
  );
  const productionKeyAt = (beat: number) => {
    const label = productionStateAt(production.fullTimeline, barLength, beat + 0.5)?.chord.label;
    const identity = label ? parseShadowChordLabel(label) : null;
    return identity ? shadowIdentityKey(identity) : null;
  };
  const evaluatedBeats = Array.from({ length: data.totalBars * barLength }, (_, beat) => beat)
    .filter((beat) => Math.floor(beat / 2) !== one.index && Math.floor(beat / 2) !== two.index);
  const productionVsControlChangedBeats = evaluatedBeats.filter((beat) => (
    productionKeyAt(beat) !== projectedStateAt(controlFinal, beat + 0.5)?.identityKey
  ));
  const productionVsModelAChangedBeats = evaluatedBeats.filter((beat) => (
    productionKeyAt(beat) !== projectedStateAt(modelAFinal, beat + 0.5)?.identityKey
  ));
  const otherChangedBeatPositions = Array.from({ length: data.totalBars * barLength }, (_, beat) => beat)
    .filter((beat) => Math.floor(beat / 2) !== one.index && Math.floor(beat / 2) !== two.index)
    .filter((beat) => projectedStateAt(controlFinal, beat + 0.5)?.identityKey
      !== projectedStateAt(modelAFinal, beat + 0.5)?.identityKey);
  const addedOutside = windows.filter((row) => row.index !== one.index && row.index !== two.index
    && !row.controlDecision.triggered && row.expandedDecision.triggered);
  const outsideBeatChanges = windows.filter((row) => row.index !== one.index && row.index !== two.index)
    .flatMap((row) => [row.b0, row.b1])
    .filter((pair): pair is NonNullable<typeof pair> => !!pair
      && pair.control.identityKey !== pair.expanded.identityKey);
  const changedOtherWindowIndices = [...new Set(otherChangedBeatPositions.map((beat) => Math.floor(beat / 2)))];
  const second = evaluateStage03bInteractions(bytes);
  const visits = windows.flatMap((row) => [row.w2, row.b0, row.b1]
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .map((pair) => pair.result.candidateVisits));
  const summary = {
    fixtureId: "LF-MIDI-001",
    comparableRegions: windows.length,
    unchangedW2Regions: windows.length - countChanged,
    changedW2Regions: countChanged,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    fcReal01: {
      legacyIncorrect: one.w2.control.identityKey !== selectedKey,
      shadowMatchesGroundTruth: winner.identityKey === selectedKey,
      generated: one.w2.result.rankedCandidates.some((row) => row.identityKey === selectedKey),
      topRank: winner.identityKey === selectedKey ? winner.rank : null,
      isFamilyC: winner.generationReason !== "production-base-candidate",
      winnerMargin: firstOther ? Math.round((winner.score - firstOther.score) * 1000) / 1000 : null,
      explicitModifierPenalty: winner.explanation.explicitModifierPenalty,
      omissionConflictPenalty: winner.explanation.omissionConflictPenalty,
      controlTrigger: one.controlDecision.triggered,
      expandedTrigger: one.expandedDecision.triggered,
      modelAFinalMatchesGroundTruth: at(modelAFinal, one.index, 0)?.identityKey === selectedKey
        && at(modelAFinal, one.index, 1)?.identityKey === selectedKey,
      modelBFinalMatchesGroundTruth: at(modelBFinal, one.index, 0)?.identityKey === selectedKey
        && at(modelBFinal, one.index, 1)?.identityKey === selectedKey,
    },
    fcReal02: {
      groundTruth: "INSUFFICIENT-EVIDENCE",
      productionTrigger: two.productionTriggered,
      stage02ControlTrigger: two.controlDecision.triggered,
      stage02ExpandedTrigger: two.expandedDecision.triggered,
      expandedWholeWindowFamilyC: two.w2.expanded.generationReason !== "production-base-candidate",
      controlBeatRootsDistinct: two.b0?.control.identity.rootPitchClass !== two.b1?.control.identity.rootPitchClass,
      expandedBeatRootsDistinct: two.b0?.expanded.identity.rootPitchClass !== two.b1?.expanded.identity.rootPitchClass,
      productionFinalDistinctStates: prodAt(two.index, 0)?.chord.label !== prodAt(two.index, 1)?.chord.label,
      modelAFinalDistinctStates: at(modelAFinal, two.index, 0)?.identityKey
        !== at(modelAFinal, two.index, 1)?.identityKey,
      modelBFinalDistinctStates: at(modelBFinal, two.index, 0)?.identityKey
        !== at(modelBFinal, two.index, 1)?.identityKey,
      modelAFinalWholeWindowFamilyC: at(modelAFinal, two.index, 0)?.identityKey
        === at(modelAFinal, two.index, 1)?.identityKey
        && (at(modelAFinal, two.index, 0)?.familyC ?? false),
    },
    productionTriggers: windows.filter((row) => row.productionTriggered).length,
    stage02ControlTriggers: windows.filter((row) => row.controlDecision.triggered).length,
    stage02ExpandedTriggers: windows.filter((row) => row.expandedDecision.triggered).length,
    expansionChangedTriggers: windows.filter((row) => row.controlDecision.triggered !== row.expandedDecision.triggered).length,
    expansionLostTriggers: windows.filter((row) => row.controlDecision.triggered && !row.expandedDecision.triggered).length,
    expansionAddedTriggers: windows.filter((row) => !row.controlDecision.triggered && row.expandedDecision.triggered).length,
    expansionChangedOutsideReviewed: windows.filter((row) => row.index !== one.index
      && row.index !== two.index
      && row.controlDecision.triggered !== row.expandedDecision.triggered).length,
    expansionLostOutsideReviewed: windows.filter((row) => row.index !== one.index
      && row.index !== two.index
      && row.controlDecision.triggered && !row.expandedDecision.triggered).length,
    expansionAddedOutsideReviewed: windows.filter((row) => row.index !== one.index
      && row.index !== two.index
      && !row.controlDecision.triggered && row.expandedDecision.triggered).length,
    productionLostTriggers: windows.filter((row) => row.productionTriggered && !row.expandedDecision.triggered).length,
    productionAddedTriggers: windows.filter((row) => !row.productionTriggered && row.expandedDecision.triggered).length,
    modelAOtherChangedBeats: otherChangedBeatPositions.length,
    modelAOtherChangedWindows: changedOtherWindowIndices.length,
    productionVsControlOtherChangedBeats: productionVsControlChangedBeats.length,
    productionVsModelAOtherChangedBeats: productionVsModelAChangedBeats.length,
    productionVsModelAOtherChangedWindows: new Set(productionVsModelAChangedBeats.map((beat) => (
      Math.floor(beat / 2)
    ))).size,
    modelAOtherChangesNotAtAddedSplit: otherChangedBeatPositions.filter((beat) => (
      !addedOutside.some((row) => row.index === Math.floor(beat / 2))
    )).length,
    outsideBeatCandidateChanges: windows.filter((row) => row.index !== one.index && row.index !== two.index)
      .reduce((sum, row) => sum
        + Number(row.b0?.control.identityKey !== row.b0?.expanded.identityKey)
        + Number(row.b1?.control.identityKey !== row.b1?.expanded.identityKey), 0),
    addedSplitSurvivesSmoothing: addedOutside.every((row) => (
      at(modelAFinal, row.index, 0)?.identityKey !== at(modelAFinal, row.index, 1)?.identityKey
    )),
    addedSplitWinnersHaveExplicitSupport: addedOutside.every((row) => (
      [row.b0?.expanded, row.b1?.expanded].every((candidate) => candidate
        && candidate.explanation.missingExpectedTones.length === 0
        && candidate.explanation.omissionConflicts.length === 0)
    )),
    addedSplitFamilyCBeatWinners: addedOutside.reduce((sum, row) => sum
      + [row.b0?.expanded, row.b1?.expanded].filter((candidate) => candidate
        && candidate.generationReason !== "production-base-candidate").length, 0),
    addedSplitFamilyCPenaltyViolations: addedOutside.reduce((sum, row) => sum
      + [row.b0?.expanded, row.b1?.expanded].filter((candidate) => candidate
        && candidate.generationReason !== "production-base-candidate"
        && (candidate.explanation.explicitModifierPenalty > 0
          || candidate.explanation.omissionConflictPenalty > 0)).length, 0),
    addedSplitBeatWinnerChanges: addedOutside.reduce((sum, row) => sum
      + Number(row.b0?.control.identityKey !== row.b0?.expanded.identityKey)
      + Number(row.b1?.control.identityKey !== row.b1?.expanded.identityKey), 0),
    outsideBeatChangesWithNewFamilyC: outsideBeatChanges.filter((pair) => (
      pair.expanded.generationReason !== "production-base-candidate"
    )).length,
    outsideBeatRootChanges: outsideBeatChanges.filter((pair) => (
      pair.control.identity.rootPitchClass !== pair.expanded.identity.rootPitchClass
    )).length,
    outsideBeatFamilyCPenaltyViolations: outsideBeatChanges.filter((pair) => (
      pair.expanded.generationReason !== "production-base-candidate"
      && (pair.expanded.explanation.explicitModifierPenalty > 0
        || pair.expanded.explanation.omissionConflictPenalty > 0)
    )).length,
    outsideBeatMissingExpectedTones: outsideBeatChanges.reduce((sum, pair) => (
      sum + pair.expanded.explanation.missingExpectedTones.length
    ), 0),
    outsideBeatConflictingPresentTones: outsideBeatChanges.reduce((sum, pair) => (
      sum + pair.expanded.explanation.conflictingPresentTones.length
    ), 0),
    outsideBeatOutsideRatioMax: Math.round(Math.max(0, ...outsideBeatChanges.map((pair) => (
      pair.expanded.explanation.outsideRatio
    ))) * 1000) / 1000,
    outsideBeatWinnerMarginMin: Math.round(Math.min(1, ...outsideBeatChanges.map((pair) => (
      pair.expanded.score - pair.control.score
    ))) * 1000) / 1000,
    outsideExistingCoherentSplitsLostAfterSmoothing: windows.filter((row) => (
      row.index !== one.index && row.index !== two.index && row.productionTriggered
      && at(controlFinal, row.index, 0)?.identityKey !== at(controlFinal, row.index, 1)?.identityKey
      && at(modelAFinal, row.index, 0)?.identityKey === at(modelAFinal, row.index, 1)?.identityKey
    )).length,
    productionBaselineProjectionExact: JSON.stringify(productionProjection.correctedTimeline)
      === JSON.stringify(production.fullTimeline.map((item) => item.chord.label)),
    deterministic: JSON.stringify(second.windows) === JSON.stringify(windows)
      && JSON.stringify(projectStage03bTimeline(second.data, second.windows, "model-a"))
        === JSON.stringify(modelAFinal),
    sourceBytesUnchanged: before.length === bytes.length && before.every((value, index) => value === bytes[index]),
    sourceNotesAndTimingUnchanged: JSON.stringify(parseMidi(bytes)) === JSON.stringify(parsedBefore),
  };
  if (summary.changedW2Regions !== 2 || summary.unchangedW2Regions !== 31) {
    throw new Error("Private whole-file conservation failed");
  }
  stdout.write(`${JSON.stringify(summary)}\n`);
}

try {
  main();
} catch {
  // Filesystem and parse errors can carry private filenames or MIDI data.
  stderr.write("Stage03b private evaluation could not complete.\n");
  process.exitCode = 1;
}
