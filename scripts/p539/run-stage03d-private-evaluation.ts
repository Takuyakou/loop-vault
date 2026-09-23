/** Final, privacy-safe evaluation of the frozen Model A against pre-existing blind review. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { ChordTimelineItem } from "../../src/domain/types";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { changedRegionIndices, type LocalRegionBinding } from "./groundTruthPacket";
import { selectSinglePrivateCandidate } from "./privatePromotionRunner";
import { SAFETY_IDS, selectChangedEndToEndRegions, type LocalSafetyBinding } from "./stage03cSafetyPacket";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "./stage03bInteraction";
import { parseShadowChordLabel, shadowIdentityKey } from "./shadowRootRelativeIdentity";

// Independent human classifications were committed in the 03a/03c reports before this evaluator.
const FROZEN_TRUTH = {
  "FC-REAL-01": "CONFIRMED-FAMILY-C",
  "FC-REAL-02": "INSUFFICIENT-EVIDENCE",
  "FC-SAFETY-01": "CONFIRMED-FAMILY-C",
  "FC-SAFETY-02": "CONFIRMED-FAMILY-C",
  "FC-SAFETY-03": "TEMPORAL-MIXTURE",
} as const;

function ignoredJson(path: string): unknown {
  const absolute = resolve(path);
  execFileSync("git", ["check-ignore", "-q", "--", absolute], { stdio: "ignore" });
  return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
}

function bindings<T>(path: string, count: number): T[] {
  const value = ignoredJson(path);
  if (!value || typeof value !== "object" || !("regions" in value)
    || !Array.isArray(value.regions) || value.regions.length !== count) {
    throw new Error("Frozen binding unavailable");
  }
  return value.regions as T[];
}

function identity(label: string): string {
  const parsed = parseShadowChordLabel(label);
  if (!parsed) throw new Error("Sealed identity unavailable");
  return shadowIdentityKey(parsed);
}

function productionStateAt(timeline: readonly ChordTimelineItem[], barLength: number, beat: number): string {
  const item = timeline.find((row) => {
    const start = (row.bar - 1) * barLength + row.beat - 1;
    return start <= beat && beat < start + row.durationBeats;
  });
  if (!item) throw new Error("Production state unavailable");
  return identity(item.chord.label);
}

function main(): void {
  const entry = argv.findIndex((arg) => /(?:^|[/\\])run-stage03d-private-evaluation\.(?:[cm]?js|ts)$/.test(arg));
  if (entry < 0 || argv.length !== entry + 2) throw new Error("One private input directory required");
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(argv[entry + 1]!));
  const bytes = new Uint8Array(readFileSync(source));
  const originalBytes = Uint8Array.from(bytes);
  const originalParsed = JSON.stringify(parseMidi(bytes));
  const prior = bindings<LocalRegionBinding>(".local-evaluation/p539-03a-review/sealed-binding.private.json", 2);
  const safety = bindings<LocalSafetyBinding>(".local-evaluation/p539-03c-review/sealed-binding.private.json", 3);
  const changedW2 = changedRegionIndices(bytes);
  if (prior[0]?.id !== "FC-REAL-01" || prior[1]?.id !== "FC-REAL-02"
    || prior.some((row, i) => row.windowIndex !== changedW2[i]?.index)
    || safety.some((row, i) => row.id !== SAFETY_IDS[i])) {
    throw new Error("Frozen anonymous binding mismatch");
  }

  const { data, windows } = evaluateStage03bInteractions(bytes);
  const modelA = projectStage03bTimeline(data, windows, "model-a");
  const control = projectStage03bTimeline(data, windows, "control");
  const production = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const barLength = beatsPerBar(data.timeSignature);
  const modelAt = (index: number, offset: number) => {
    const state = projectedStateAt(modelA, index * 2 + offset + 0.5);
    if (!state) throw new Error("Model A final state unavailable");
    return state.identityKey;
  };
  const productionAt = (index: number, offset: number) => (
    productionStateAt(production.fullTimeline, barLength, index * 2 + offset + 0.5)
  );
  const selected = selectChangedEndToEndRegions(
    windows,
    (beat) => productionStateAt(production.fullTimeline, barLength, beat),
    (beat) => projectedStateAt(modelA, beat)?.identityKey ?? null,
    new Set(prior.map((row) => row.windowIndex)),
  );
  if (selected.length !== 3 || safety.some((row, i) => row.windowIndex !== selected[i]?.windowIndex
    || JSON.stringify(row.changedBeatOffsets) !== JSON.stringify(selected[i]?.changedBeatOffsets))) {
    throw new Error("End-to-end selection drift");
  }
  const perSafety = safety.map((binding) => {
    const row = windows.find((window) => window.index === binding.windowIndex);
    if (!row) throw new Error("Bound window unavailable");
    const selectedB = binding.choices.B;
    const modelAChoicesMatchFinal = binding.choices.A.origin === "model-a"
      ? binding.choices.A.beatLabels.every((label, offset) => identity(label) === modelAt(row.index, offset))
      : binding.choices.B.beatLabels.every((label, offset) => identity(label) === modelAt(row.index, offset));
    const changedBeatWinners = binding.changedBeatOffsets.map((offset) => offset === 0 ? row.b0?.expanded : row.b1?.expanded);
    const changedBeatCandidateFinalMatch = binding.changedBeatOffsets.every((offset) => {
      const candidate = offset === 0 ? row.b0?.expanded : row.b1?.expanded;
      return candidate?.identityKey === modelAt(row.index, offset);
    });
    return {
      id: binding.id,
      groundTruth: FROZEN_TRUTH[binding.id],
      selectedBIsModelA: selectedB.origin === "model-a",
      modelAChoicesMatchFinal,
      changedBeats: binding.changedBeatOffsets.length,
      generatedAndTopRanked: changedBeatWinners.every((winner) => winner
        && winner.rank === 1 && winner.generationReason !== "production-base-candidate"),
      changedBeatCandidateFinalMatch,
      changedBeatFamilyCWinners: changedBeatWinners.filter((winner) => winner
        && winner.generationReason !== "production-base-candidate").length,
      changedBeatConflictingToneWinners: changedBeatWinners.filter((winner) => winner
        && winner.explanation.conflictingPresentTones.length > 0).length,
      changedBeatMissingExpectedToneWinners: changedBeatWinners.filter((winner) => winner
        && winner.explanation.missingExpectedTones.length > 0).length,
      productionTrigger: row.productionTriggered,
      controlTrigger: row.controlDecision.triggered,
      expandedTrigger: row.expandedDecision.triggered,
      modelAFinalDistinctStates: modelAt(row.index, 0) !== modelAt(row.index, 1),
      productionFinalDistinctStates: productionAt(row.index, 0) !== productionAt(row.index, 1),
      changedBeatRootChanged: binding.changedBeatOffsets.every((offset) => (
        (offset === 0 ? row.b0 : row.b1)?.control.identity.rootPitchClass
          !== (offset === 0 ? row.b0 : row.b1)?.expanded.identity.rootPitchClass
      )),
      changedBeatConflictingTone: binding.conflictingPresentToneInChangedBeat,
    };
  });
  const real01 = windows.find((row) => row.index === prior[0]!.windowIndex);
  const real02 = windows.find((row) => row.index === prior[1]!.windowIndex);
  if (!real01 || !real02) throw new Error("Prior windows unavailable");
  const real01Truth = prior[0]!.choices.B;
  if (real01Truth.origin !== "shadow") throw new Error("Prior blind mapping mismatch");
  const allBeats = Array.from({ length: data.totalBars * barLength }, (_, beat) => beat);
  const unaffectedW2 = windows.filter((row) => row.w2.control.identityKey === row.w2.expanded.identityKey);
  const current = allBeats.filter((beat) => !prior.some((row) => row.windowIndex === Math.floor(beat / 2)));
  const repeated = Array.from({ length: 3 }, () => {
    const again = evaluateStage03bInteractions(bytes);
    return JSON.stringify(again.windows) === JSON.stringify(windows)
      && JSON.stringify(projectStage03bTimeline(again.data, again.windows, "model-a")) === JSON.stringify(modelA);
  });
  const visits = windows.flatMap((row) => [row.w2, row.b0, row.b1]
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .map((pair) => pair.result.candidateVisits));
  const summary = {
    comparableRegions: windows.length,
    unchangedW2Regions: unaffectedW2.length,
    changedW2Regions: windows.length - unaffectedW2.length,
    unchangedW2WithFinalChanges: unaffectedW2.filter((row) => (
      [0, 1].some((offset) => modelAt(row.index, offset) !== productionAt(row.index, offset))
    )).length,
    changedFinalBeatsOutsidePrior: current.filter((beat) => (
      productionStateAt(production.fullTimeline, barLength, beat + 0.5)
        !== projectedStateAt(modelA, beat + 0.5)?.identityKey
    )).length,
    safety: perSafety,
    real01: {
      groundTruth: FROZEN_TRUTH["FC-REAL-01"],
      generated: real01.w2.result.rankedCandidates.some((candidate) => candidate.identityKey === identity(real01Truth.label)),
      topRanked: real01.w2.expanded.identityKey === identity(real01Truth.label) && real01.w2.expanded.rank === 1,
      finalMatches: [0, 1].every((offset) => modelAt(real01.index, offset) === identity(real01Truth.label)),
    },
    real02: {
      groundTruth: FROZEN_TRUTH["FC-REAL-02"],
      productionTrigger: real02.productionTriggered,
      expandedTrigger: real02.expandedDecision.triggered,
      modelAFinalDistinctStates: modelAt(real02.index, 0) !== modelAt(real02.index, 1),
    },
    triggers: {
      production: windows.filter((row) => row.productionTriggered).length,
      control: windows.filter((row) => row.controlDecision.triggered).length,
      expanded: windows.filter((row) => row.expandedDecision.triggered).length,
      added: windows.filter((row) => !row.controlDecision.triggered && row.expandedDecision.triggered).length,
      lost: windows.filter((row) => row.controlDecision.triggered && !row.expandedDecision.triggered).length,
    },
    newSplits: windows.filter((row) => !row.controlDecision.triggered && row.expandedDecision.triggered
      && modelAt(row.index, 0) !== modelAt(row.index, 1)).length,
    lostSplits: windows.filter((row) => row.controlDecision.triggered
      && projectedStateAt(control, row.index * 2 + 0.5)?.identityKey
        !== projectedStateAt(control, row.index * 2 + 1.5)?.identityKey
      && modelAt(row.index, 0) === modelAt(row.index, 1)).length,
    lostSplitsOutsidePrior: windows.filter((row) => !prior.some((p) => p.windowIndex === row.index)
      && row.controlDecision.triggered
      && projectedStateAt(control, row.index * 2 + 0.5)?.identityKey
        !== projectedStateAt(control, row.index * 2 + 1.5)?.identityKey
      && modelAt(row.index, 0) === modelAt(row.index, 1)).length,
    rootChangingBeatCandidatesOutsidePrior: windows.filter((row) => !prior.some((p) => p.windowIndex === row.index))
      .flatMap((row) => [row.b0, row.b1]).filter((pair) => pair
        && pair.control.identity.rootPitchClass !== pair.expanded.identity.rootPitchClass).length,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    deterministicRepeatCount: repeated.length,
    deterministic: repeated.every(Boolean),
    sourceBytesUnchanged: bytes.length === originalBytes.length && bytes.every((value, i) => value === originalBytes[i]),
    sourceNotesTimingOrderUnchanged: JSON.stringify(parseMidi(bytes)) === originalParsed,
  };
  if (summary.candidateVisits.min !== 276 || summary.candidateVisits.max !== 276
    || !summary.deterministic || !summary.sourceBytesUnchanged || !summary.sourceNotesTimingOrderUnchanged) {
    throw new Error("Frozen bound, determinism, or source fidelity failed");
  }
  stdout.write(`${JSON.stringify(summary)}\n`);
}

try {
  main();
} catch {
  // Never leak private filenames, MIDI evidence, or candidate transcriptions.
  stderr.write("Stage03d private evaluation could not complete.\n");
  process.exitCode = 1;
}
