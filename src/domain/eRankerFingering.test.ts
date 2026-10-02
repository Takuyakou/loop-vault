import { expect, it } from "vitest";
import { commonToneCostModel } from "../../scripts/p11-13/commonTone";
import { eRankerCostModel, E_RANKER_POLICY } from "./eRankerFingering";
import { generateFingeringCandidates, rankCyclicFingerings, type ProgressionFingeringEvent } from "./progressionFingering";
import { preferredFingeringDistance } from "./progressionFingering";
import { handPositionProxy } from "./handPositionFingering";
import { syntheticSnapshots } from "../../scripts/p11-12/integration";
import { resolveProgressionPracticeVoicings } from "./progressionVoicingPractice";
import { assignPracticeHandsAcrossProgression } from "../voicingPractice/fingeringDisplay";
import { rankPracticeHandFingerings } from "../voicingPractice/rankPracticeFingerings";
import { computeNextMoves } from "../voicingPractice/nextMove";

const events = (notes: number[][], seconds = 1, hand: "left" | "right" = "right"): ProgressionFingeringEvent[] =>
  notes.map((midiPitches, i) => ({ id: String(i), hand, midiPitches, startSeconds: i * seconds, durationSeconds: seconds }));

it("production candidate preserves frozen diagnostic costs and selections, including wrap and exact shared pitches", () => {
  expect(E_RANKER_POLICY).toEqual({ variant: "E1-T", curve: "inverse", lambda: 2, gamma: 1 });
  for (const hand of ["left", "right"] as const) {
    const input = events([[48, 52, 55], [48, 53, 57], [60, 64, 67]], 0.25, hand);
    const original = JSON.stringify(input), groups = input.map(generateFingeringCandidates);
    const frozen = commonToneCostModel(1), production = eRankerCostModel();
    for (let e = 0; e < groups.length; e++) {
      const a = groups[e]!, b = groups[(e + 1) % groups.length]!;
      if (a.status !== "supported" || b.status !== "supported") throw Error("fixture");
      a.candidates.forEach((_, i) => {
        expect(production.local(input[e]!, a, i)).toBe(frozen.local(input[e]!, a, i));
        b.candidates.forEach((_, j) => {
          for (const seconds of [0.125, 1, 4]) expect(production.transition(a, i, b, j, seconds)).toBe(frozen.transition(a, i, b, j, seconds));
        });
      });
    }
    expect(rankCyclicFingerings(input, { costModel: production })).toEqual(rankCyclicFingerings(input, { costModel: frozen }));
    expect(JSON.stringify(input)).toBe(original); expect(input.map(generateFingeringCandidates)).toEqual(groups);
  }
  const right = generateFingeringCandidates({ hand: "right", midiPitches: [60] });
  const left = generateFingeringCandidates({ hand: "left", midiPitches: [60] });
  if (right.status !== "supported" || left.status !== "supported") throw Error("fixture");
  expect(eRankerCostModel().transition(right, 0, left, 0, 1)).toBe(commonToneCostModel(1).transition(right, 0, left, 0, 1));
});

it("keeps contradictory Saved anchors fixed and segment/empty-hand timing intact under candidate costs", () => {
  const costModel = eRankerCostModel();
  expect(rankCyclicFingerings(events([[60], [60]]), { costModel, anchors: new Map([
    ["0", { signature: "R:60", fingers: [1] as const }], ["1", { signature: "R:60", fingers: [5] as const }],
  ]) })).toMatchObject([{ fingers: [1] }, { fingers: [5] }]);
  const input = events([[60], [], [64], [], [60, 61, 62, 63, 64, 65], [67], [69]]);
  const seconds: number[] = [];
  const result = rankCyclicFingerings(input, { costModel: { ...costModel, transition: (...args) => { seconds.push(args[4]); return costModel.transition(...args); } } });
  expect(result.slice(0, 4)).toEqual(rankCyclicFingerings(input.slice(0, 4), { costModel, cyclic: false }));
  expect(result.slice(5)).toEqual(rankCyclicFingerings(input.slice(5), { costModel, cyclic: false }));
  expect(result[4]!.status).toBe("unavailable"); expect(new Set(seconds)).toEqual(new Set([1, 2]));
});

it("keeps slow Bass preferred while fast Bass responds to available time deterministically", () => {
  const model = eRankerCostModel();
  const slow = events([[48], [50], [52], [53]], 2, "left"), fast = events([[48], [50], [52], [53]], 0.125, "left");
  const solve = (input: ProgressionFingeringEvent[]) => rankCyclicFingerings(input, { costModel: model });
  const a = solve(slow), b = solve(fast);
  expect(a).toMatchObject([{ fingers: [5] }, { fingers: [5] }, { fingers: [5] }, { fingers: [5] }]);
  expect(b).not.toEqual(a); expect(solve(fast)).toEqual(b);
  const distance = b.reduce((sum, r, i) => sum + (r.status === "supported" ? preferredFingeringDistance(fast[i]!, r.fingers) : 0), 0);
  expect(distance).toBeGreaterThan(0);
  expect(b.every(r => r.status === "supported" && handPositionProxy("left", r.pitches, r.fingers) === 28)).toBe(true);
});

it("all fixed/generated sources retain notes, hands and full-progression Range scope; Next Move consumes selected IDs", () => {
  for (const [selection, snapshot] of Object.entries(syntheticSnapshots())) {
    if (!snapshot) continue;
    const plan = resolveProgressionPracticeVoicings(snapshot);
    const hands = assignPracticeHandsAcrossProgression(snapshot.selection, plan.events.map(e => e.status === "SUPPORTED" ? e.voicing : undefined));
    const before = JSON.stringify({ snapshot, hands });
    for (const hand of ["left", "right"] as const) {
      const options = { costModel: eRankerCostModel() };
      const run = (range?: { start: number; end: number }) => rankPracticeHandFingerings({ ...snapshot, ...(range ? { range } : {}) }, hands, snapshot.selection, hand, undefined, options, plan.events.map(e => e.status !== "SUPPORTED"));
      const ranked = run(); expect(run({ start: 1, end: 2 })).toEqual(ranked); expect(run()).toEqual(ranked);
      ranked.forEach((r, i) => { if (r.status === "supported") expect(r.pitches).toEqual(hands[i]![hand]); });
      const first = ranked[0], next = ranked[1];
      if (first?.status === "supported" && next?.status === "supported") {
        const moves = computeNextMoves(hands[0]!, hands[1]!, { [hand]: first }, { [hand]: next }).filter(m => m.hand === hand);
        for (const move of moves) {
          expect(move.finger).toBeDefined();
          if (move.from !== undefined) expect(first.pitches[first.fingers.indexOf(move.finger!)]).toBe(move.from);
          if (move.to !== undefined) expect(next.pitches[next.fingers.indexOf(move.finger!)]).toBe(move.to);
        }
      }
    }
    expect(JSON.stringify({ snapshot, hands }), selection).toBe(before);
  }
});
