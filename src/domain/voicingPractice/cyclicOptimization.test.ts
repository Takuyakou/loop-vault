import { describe, expect, it } from "vitest";
import type { StyleVoicingCandidate } from "./candidateTools";
import { compareCandidate } from "./candidateTools";
import { optimizeCandidateGroups } from "./optimizeProgression";
import { styleVoicingStartCost, styleVoicingTransitionCost } from "./transitionCost";

describe("P5.33 cyclic candidate optimization", () => {
  it("returns the exact minimum including the final-to-first transition", () => {
    const groups = [
      [candidate([43], [55, 59]), candidate([48], [60, 64])],
      [candidate([45], [57, 60]), candidate([50], [62, 65])],
      [candidate([47], [59, 62]), candidate([55], [67, 71])],
    ];
    const chosen = optimizeCandidateGroups(groups);
    const everyPath = cartesian(groups);
    const expected = everyPath
      .map((path) => ({ path, cost: loopCost(path) }))
      .sort((left, right) => left.cost - right.cost || comparePaths(left.path, right.path))[0]!;

    expect(loopCost(chosen)).toBe(expected.cost);
    expect(chosen).toEqual(expected.path);
  });

  it("is deterministic and does not mutate harmonic candidates", () => {
    const groups = [
      [candidate([48], [60, 64]), candidate([48], [59, 64])],
      [candidate([50], [60, 65]), candidate([50], [62, 65])],
    ];
    const before = structuredClone(groups);
    const first = optimizeCandidateGroups(groups);
    const second = optimizeCandidateGroups(groups);
    expect(second).toEqual(first);
    expect(groups).toEqual(before);
    expect(first.every((selected, index) => groups[index].includes(selected))).toBe(true);
  });

  it("keeps the stable single-event ranking without applying a self-loop bonus", () => {
    const group = [candidate([36], [60, 67]), candidate([48], [60, 64])];
    const expected = [...group].sort((left, right) => (
      styleVoicingStartCost(left) - styleVoicingStartCost(right)
      || compareCandidate(left, right)
    ))[0];
    expect(optimizeCandidateGroups([group])).toEqual([expected]);
  });
});

function candidate(leftHandNotes: number[], rightHandNotes: number[]): StyleVoicingCandidate {
  return {
    styleId: "lesson-v2",
    leftHandNotes,
    rightHandNotes,
    allNotes: [...leftHandNotes, ...rightHandNotes].sort((left, right) => left - right),
    requiredIntervals: [],
    addedColorIntervals: [],
    omittedIntervals: [],
    warnings: [],
  };
}

function cartesian(groups: readonly StyleVoicingCandidate[][]): StyleVoicingCandidate[][] {
  return groups.reduce<StyleVoicingCandidate[][]>(
    (paths, group) => paths.flatMap((path) => group.map((item) => [...path, item])),
    [[]],
  );
}

function loopCost(path: readonly StyleVoicingCandidate[]): number {
  if (path.length === 0) return 0;
  let cost = styleVoicingStartCost(path[0]);
  for (let index = 1; index < path.length; index += 1) {
    cost += styleVoicingTransitionCost(path[index - 1], path[index]);
  }
  if (path.length > 1) cost += styleVoicingTransitionCost(path[path.length - 1], path[0]);
  return cost;
}

function comparePaths(
  left: readonly StyleVoicingCandidate[],
  right: readonly StyleVoicingCandidate[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (!left[index]) return -1;
    if (!right[index]) return 1;
    const difference = compareCandidate(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}
