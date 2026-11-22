import { rankCyclicFingerings, type FingeringHand, type ProgressionFingeringEvent } from "../../src/domain/progressionFingering";
import { eRankerCostModel } from "../../src/domain/eRankerFingering";
import { p21ERankerCostModel } from "../../src/domain/p21SingleNoteFingering";
import { handPositionProxy, keyboardPositionProxy } from "../../src/domain/handPositionFingering";
import { syntheticSnapshots } from "../p11-12/integration";
import { resolveProgressionPracticeVoicings } from "../../src/domain/progressionVoicingPractice";
import { assignPracticeHandsAcrossProgression } from "../../src/voicingPractice/fingeringDisplay";
import { rankPracticeHandFingerings } from "../../src/voicingPractice/rankPracticeFingerings";

type Model = "before" | "after";
const model = (which: Model) => which === "before" ? eRankerCostModel() : p21ERankerCostModel();
const events = (hand: FingeringHand, pitches: readonly number[], starts?: number) => pitches.map((pitch, index): ProgressionFingeringEvent => ({
  id: String(index), hand, midiPitches: [pitch], startSeconds: starts?.[index] ?? index, durationSeconds: 1,
}));
const solve = (which: Model, hand: FingeringHand, pitches: readonly number[]) => rankCyclicFingerings(events(hand, pitches), { costModel: model(which), cyclic: true });
const positions = (which: Model, hand: FingeringHand, pitches: readonly number[]) => solve(which, hand, pitches).map((result, index) => result.status === "supported" ? handPositionProxy(hand, [pitches[index]!], result.fingers) : NaN);
const fingers = (which: Model, hand: FingeringHand, pitches: readonly number[]) => solve(which, hand, pitches).map((result) => result.status === "supported" ? result.fingers[0]! : 0);
const near = (pitches: readonly number[]) => pitches.reduce((count, pitch, index) => index === 0 ? 0 : count + (Math.abs(keyboardPositionProxy(pitch) - keyboardPositionProxy(pitches[index - 1]!)) <= 4 ? 1 : 0), 0);
const preserved = (pitches: readonly number[], pos: readonly number[]) => pitches.reduce((count, pitch, index) => index === 0 ? 0 : count + (Math.abs(keyboardPositionProxy(pitch) - keyboardPositionProxy(pitches[index - 1]!)) <= 4 && Math.abs(pos[index]! - pos[index - 1]!) <= 0.5 ? 1 : 0), 0);
const movement = (pos: readonly number[]) => pos.reduce((sum, value, index) => index === 0 ? 0 : sum + Math.abs(value - pos[index - 1]!), 0);
const sameNoteChanges = (pitches: readonly number[], finger: readonly number[]) => pitches.reduce((count, pitch, index) => index === 0 ? 0 : count + (pitch === pitches[index - 1] && finger[index] !== finger[index - 1] ? 1 : 0), 0);
const outOfRange = (pitches: readonly number[], pos: readonly number[]) => pitches.reduce((count, pitch, index) => index === 0 ? 0 : count + (Math.abs(keyboardPositionProxy(pitch) - keyboardPositionProxy(pitches[index - 1]!)) > 4 && Math.abs(pos[index]! - pos[index - 1]!) <= 0.5 ? 1 : 0), 0);

const sequences = {
  L1: [36, 38, 40, 41], L2: [41, 40, 38, 36], L3: [36, 41, 43, 36], L4: [36, 45, 38, 43], L5: [36, 36], L6: [36, 48], L7: [36, 39, 41, 43],
  L8close: [36, 43], L8far: [36, 45], R1: [60, 62, 64, 65], R2: [65, 64, 62, 60], R3: [60, 65, 67, 60], R4: [60, 72], R5close: [60, 67], R5far: [60, 69], R6: [60, 63, 65, 67],
} as const;

const singleMetrics = (which: Model) => {
  let nearTotal = 0, preservedCount = 0, totalMovement = 0, sameChanges = 0, out = 0;
  const distribution: Record<string, number> = {};
  for (const [name, pitches] of Object.entries(sequences)) {
    const hand: FingeringHand = name.startsWith("R") ? "right" : "left";
    const f = fingers(which, hand, pitches), p = positions(which, hand, pitches);
    nearTotal += near(pitches); preservedCount += preserved(pitches, p); totalMovement += movement(p);
    sameChanges += sameNoteChanges(pitches, f); out += outOfRange(pitches, p);
    for (const finger of f) distribution[`${hand === "left" ? "L" : "R"}${finger}`] = (distribution[`${hand === "left" ? "L" : "R"}${finger}`] ?? 0) + 1;
  }
  return { nearTotal, preservedCount, preservedRate: preservedCount / nearTotal, totalMovement, sameNoteChanges: sameChanges, outOfRange: out, distribution };
};

const actual = () => {
  const before = { nearTotal: 0, preserved: 0, movement: 0, sameChanges: 0, out: 0, singleCards: 0, multiChanged: 0, currentChanged: 0 };
  const after = { ...before };
  for (const [, snapshot] of Object.entries(syntheticSnapshots())) {
    if (!snapshot) continue;
    const plan = resolveProgressionPracticeVoicings(snapshot);
    const hands = assignPracticeHandsAcrossProgression(snapshot.selection, plan.events.map((event) => event.status === "SUPPORTED" ? event.voicing : undefined));
    for (const hand of ["left", "right"] as const) {
      const old = rankPracticeHandFingerings(snapshot, hands, snapshot.selection, hand, undefined, { costModel: eRankerCostModel() }, plan.events.map((event) => event.status !== "SUPPORTED"));
      const now = rankPracticeHandFingerings(snapshot, hands, snapshot.selection, hand, undefined, { costModel: p21ERankerCostModel() }, plan.events.map((event) => event.status !== "SUPPORTED"));
      const positionsFor = (result: typeof old, previous: number, current: number) => {
        if (result[previous]?.status !== "supported" || result[current]?.status !== "supported") return undefined;
        return { previous: handPositionProxy(hand, hands[previous]![hand]!, result[previous]!.fingers), current: handPositionProxy(hand, hands[current]![hand]!, result[current]!.fingers) };
      };
      for (let index = 1; index < hands.length; index += 1) {
        if (hands[index]?.[hand]?.length !== 1 || hands[index - 1]?.[hand]?.length !== 1) continue;
        if (Math.abs(keyboardPositionProxy(hands[index]![hand]![0]!) - keyboardPositionProxy(hands[index - 1]![hand]![0]!)) > 4) continue;
        before.nearTotal += 1; after.nearTotal += 1;
        const oldPositions = positionsFor(old, index - 1, index), newPositions = positionsFor(now, index - 1, index);
        if (oldPositions) {
          if (Math.abs(oldPositions.current - oldPositions.previous) <= 0.5) before.preserved += 1;
          before.movement += Math.abs(oldPositions.current - oldPositions.previous);
        }
        if (newPositions) {
          if (Math.abs(newPositions.current - newPositions.previous) <= 0.5) after.preserved += 1;
          after.movement += Math.abs(newPositions.current - newPositions.previous);
        }
      }
      for (let index = 0; index < hands.length; index += 1) {
        const pitches = hands[index]?.[hand] ?? [];
        if (pitches.length === 1) {
          before.singleCards += 1; after.singleCards += 1;
          const oldResult = old[index], newResult = now[index];
          if (index > 0 && hands[index - 1]?.[hand]?.length === 1 && oldResult?.status === "supported" && newResult?.status === "supported") {
            const oldPrevious = old[index - 1], newPrevious = now[index - 1];
            if (oldPrevious?.status === "supported" && newPrevious?.status === "supported") {
              if (pitches[0] === hands[index - 1]![hand]![0] && oldResult.fingers[0] !== oldPrevious.fingers[0]) before.sameChanges += 1;
              if (pitches[0] === hands[index - 1]![hand]![0] && newResult.fingers[0] !== newPrevious.fingers[0]) after.sameChanges += 1;
            }
          }
        }
        if (pitches.length > 1 && old[index]?.status === "supported" && now[index]?.status === "supported" && old[index].fingers.join() !== now[index].fingers.join()) after.multiChanged += 1;
      }
      const currentOld = rankPracticeHandFingerings(snapshot, hands, snapshot.selection, hand, undefined, {}, plan.events.map((event) => event.status !== "SUPPORTED"));
      const currentNew = rankPracticeHandFingerings(snapshot, hands, snapshot.selection, hand, undefined, {}, plan.events.map((event) => event.status !== "SUPPORTED"));
      if (JSON.stringify(currentOld) !== JSON.stringify(currentNew)) after.currentChanged += 1;
    }
  }
  return { before, after };
};

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const timing = (which: Model, notes: number[], anchors: boolean) => {
  const input = events("left", notes, notes.map((_p, i) => i));
  if (anchors) input[3] = { ...input[3]!, unresolved: false };
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    rankCyclicFingerings(input, { costModel: model(which), cyclic: true, ...(anchors ? { anchors: new Map([["5", { signature: "L:36", fingers: [5] as const }]]) } : {}) });
    samples.push(performance.now() - start);
  }
  return median(samples);
};

const hundred28 = Array.from({ length: 128 }, (_, i) => 36 + (i % 12));
const mixed = Array.from({ length: 128 }, (_, i) => i % 4 === 0 ? [36 + (i % 12), 43 + (i % 12)] : [36 + (i % 12)]);
const mixedTiming = (which: Model) => {
  const input = mixed.map((pitches, i) => ({ id: String(i), hand: "left" as const, midiPitches: pitches, startSeconds: i, durationSeconds: 1 }));
  const start = performance.now();
  for (let run = 0; run < 5; run += 1) rankCyclicFingerings(input, { costModel: model(which), cyclic: true });
  return (performance.now() - start) / 5;
};

console.log(JSON.stringify({
  single: { before: singleMetrics("before"), after: singleMetrics("after") },
  actual: actual(),
  timing: {
    single128: { before: timing("before", hundred28, false), after: timing("after", hundred28, false) },
    mixed128: { before: mixedTiming("before"), after: mixedTiming("after") },
    anchored128: { before: timing("before", hundred28, true), after: timing("after", hundred28, true) },
  },
}, null, 2));
