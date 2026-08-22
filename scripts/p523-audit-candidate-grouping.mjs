import assert from "node:assert/strict";
import { stdout } from "node:process";

// P5.23-00 synthetic audit only. This intentionally imports no production code
// and cannot change analyzer, generator, scoring, boundary, or UI behavior.

const relationThresholds = Object.freeze({
  overlapCoefficient: 0.75,
  proximityBars: 2,
});

function intervalMetrics(left, right) {
  const intersection = Math.max(
    0,
    Math.min(left.endBar, right.endBar) - Math.max(left.startBar, right.startBar) + 1,
  );
  const leftLength = left.endBar - left.startBar + 1;
  const rightLength = right.endBar - right.startBar + 1;
  const union = leftLength + rightLength - intersection;
  return {
    intersection,
    union,
    iou: intersection / Math.max(1, union),
    overlapCoefficient: intersection / Math.max(1, Math.min(leftLength, rightLength)),
    startDistance: Math.abs(left.startBar - right.startBar),
    endDistance: Math.abs(left.endBar - right.endBar),
    centerDistance: Math.abs(
      (left.startBar + left.endBar) / 2 - (right.startBar + right.endBar) / 2,
    ),
  };
}

function related(left, right) {
  const metrics = intervalMetrics(left, right);
  return metrics.overlapCoefficient >= relationThresholds.overlapCoefficient
    && Math.min(metrics.startDistance, metrics.endDistance, metrics.centerDistance)
      <= relationThresholds.proximityBars;
}

function anchorOrder(left, right) {
  return left.startBar - right.startBar
    || right.endBar - left.endBar
    || left.id.localeCompare(right.id);
}

function groupByAnchor(candidates) {
  const remaining = [...candidates].sort(anchorOrder);
  const groups = [];
  while (remaining.length > 0) {
    const anchor = remaining.shift();
    const variants = [anchor];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (related(anchor, remaining[index])) variants.push(remaining.splice(index, 1)[0]);
    }
    groups.push({ anchor, variants: variants.sort(anchorOrder) });
  }
  return groups;
}

function candidateScore(candidate) {
  return Number.isFinite(candidate.selectionScore)
    ? candidate.selectionScore
    : candidate.confidence;
}

function representativeOrder(left, right) {
  return right.lengthBars - left.lengthBars
    || candidateScore(right) - candidateScore(left)
    || left.startBar - right.startBar
    || left.endBar - right.endBar
    || left.id.localeCompare(right.id);
}

function selectedVariantOrder(left, right) {
  return candidateScore(right) - candidateScore(left)
    || right.confidence - left.confidence
    || left.startBar - right.startBar
    || left.lengthBars - right.lengthBars
    || left.endBar - right.endBar
    || left.id.localeCompare(right.id);
}

function candidate(id, startBar, endBar, selectionScore, confidence = selectionScore) {
  return {
    id,
    startBar,
    endBar,
    lengthBars: endBar - startBar + 1,
    selectionScore,
    confidence,
  };
}

function assertPreserved(input, groups) {
  const original = input.map(({ id }) => id).sort();
  const flattened = groups.flatMap(({ variants }) => variants.map(({ id }) => id)).sort();
  assert.deepEqual(flattened, original);
  assert.equal(new Set(flattened).size, flattened.length);
}

function groupSummary(input) {
  const groups = groupByAnchor(input);
  assertPreserved(input, groups);
  return {
    underlyingCandidateCount: input.length,
    visibleGroupCount: groups.length,
    averageVariantsPerGroup: groups.length === 0
      ? 0
      : Number((input.length / groups.length).toFixed(3)),
    maximumVariantsPerGroup: groups.reduce(
      (maximum, { variants }) => Math.max(maximum, variants.length),
      0,
    ),
    groups: groups.map(({ anchor, variants }) => ({
      anchorId: anchor.id,
      variantIds: variants.map(({ id }) => id),
      representativeId: [...variants].sort(representativeOrder)[0].id,
      selectedVariantId: [...variants].sort(selectedVariantOrder)[0].id,
    })),
  };
}

function harmonicActivity(totalBars, beatsPerBar, events) {
  return Array.from({ length: totalBars }, (_unused, index) => {
    const barStart = index * beatsPerBar;
    const barEnd = barStart + beatsPerBar;
    const overlapBeats = events.reduce((sum, event) => {
      if (!Number.isFinite(event.startBeat) || !Number.isFinite(event.durationBeats)) return sum;
      if (event.durationBeats <= 0) return sum;
      const overlap = Math.max(
        0,
        Math.min(barEnd, event.startBeat + event.durationBeats) - Math.max(barStart, event.startBeat),
      );
      return sum + overlap;
    }, 0);
    const normalized = Math.min(1, Math.max(0, overlapBeats / beatsPerBar));
    const bucket = normalized === 0 ? 0 : normalized <= 0.25 ? 1 : normalized <= 0.75 ? 2 : 3;
    return { bar: index + 1, normalized, bucket };
  });
}

const nested = [
  candidate("nested-4", 37, 40, 0.82),
  candidate("nested-8", 37, 44, 0.91),
  candidate("nested-16", 37, 52, 0.88),
];
const shifted = [
  candidate("shifted-a", 37, 44, 0.88),
  candidate("shifted-b", 39, 46, 0.92),
];
const chain = [
  candidate("chain-a", 1, 8, 0.90),
  candidate("chain-b", 3, 10, 0.89),
  candidate("chain-c", 5, 12, 0.88),
];
const separated = [
  candidate("region-a", 1, 8, 0.91),
  candidate("region-b", 33, 40, 0.90),
  candidate("region-c", 65, 72, 0.89),
];
const anchorStableIdTie = [
  candidate("anchor-b", 17, 24, 0.9, 0.9),
  candidate("anchor-a", 17, 24, 0.9, 0.9),
];
const representativeEarlierStart = [
  candidate("representative-later", 3, 10, 0.9, 0.9),
  candidate("representative-earlier", 1, 8, 0.9, 0.9),
];
const initialSelectionCandidates = [
  candidate("initial-a", 1, 8, 0.88, 0.88),
  candidate("initial-b-16", 33, 48, 0.82, 0.82),
  candidate("initial-b-8", 33, 40, 0.96, 0.96),
  candidate("initial-c", 65, 72, 0.91, 0.91),
];
const initialSelectionGroups = groupByAnchor(initialSelectionCandidates);
const initialSelectionSelectedVariants = initialSelectionGroups.map(
  ({ variants }) => [...variants].sort(selectedVariantOrder)[0],
);
const initialSelectionWinner = [...initialSelectionSelectedVariants].sort(
  selectedVariantOrder,
)[0];

const longCandidates = [
  ...nested,
  candidate("cluster-1-shift-a", 39, 46, 0.86),
  candidate("cluster-1-shift-b", 41, 48, 0.84),
  candidate("cluster-2-a", 73, 80, 0.88),
  candidate("cluster-2-b", 75, 82, 0.90),
  candidate("cluster-2-long", 73, 88, 0.87),
  candidate("cluster-3-a", 93, 100, 0.86),
  candidate("cluster-3-b", 95, 102, 0.85),
  candidate("cluster-3-c", 97, 104, 0.84),
  candidate("cluster-4", 130, 137, 0.83),
];

const chainGroups = groupByAnchor(chain);
assert.deepEqual(chainGroups.map(({ variants }) => variants.map(({ id }) => id)), [
  ["chain-a", "chain-b"],
  ["chain-c"],
]);
assert.equal(related(chain[0], chain[1]), true);
assert.equal(related(chain[1], chain[2]), true);
assert.equal(related(chain[0], chain[2]), false);
assert.equal(groupByAnchor(anchorStableIdTie)[0].anchor.id, "anchor-a");
assert.equal(
  [...representativeEarlierStart].sort(representativeOrder)[0].id,
  "representative-earlier",
);
assert.equal([...anchorStableIdTie].sort(representativeOrder)[0].id, "anchor-a");
assert.deepEqual(
  initialSelectionGroups.map(({ variants }) => variants.map(({ id }) => id)),
  [["initial-a"], ["initial-b-16", "initial-b-8"], ["initial-c"]],
);
assert.deepEqual(
  initialSelectionSelectedVariants.map(({ id }) => id),
  ["initial-a", "initial-b-8", "initial-c"],
);
assert.equal(initialSelectionWinner.id, "initial-b-8");

for (const fixture of [nested, shifted, chain, separated, longCandidates]) {
  const forward = groupSummary(fixture);
  const reversed = groupSummary([...fixture].reverse());
  assert.deepEqual(reversed, forward);
}

const activity = harmonicActivity(145, 4, [
  { startBeat: 0, durationBeats: 24 * 4 },
  { startBeat: 24 * 4, durationBeats: 1 },
  { startBeat: 25 * 4, durationBeats: 2 },
  { startBeat: 32 * 4, durationBeats: 64 * 4 },
  { startBeat: 104 * 4, durationBeats: 41 * 4 },
  // An overlapping synthetic outlier proves the clamp remains bounded.
  { startBeat: 36 * 4, durationBeats: 4 },
]);
assert.equal(Math.max(...activity.map(({ normalized }) => normalized)), 1);
assert.equal(Math.min(...activity.map(({ normalized }) => normalized)), 0);

const activeBars = new Set(activity.filter(({ bucket }) => bucket > 0).map(({ bar }) => bar));
const coveredBars = new Set(longCandidates.flatMap(({ startBar, endBar }) => (
  Array.from({ length: endBar - startBar + 1 }, (_unused, index) => startBar + index)
)));
const activeCoveredBars = [...activeBars].filter((bar) => coveredBars.has(bar));

const output = {
  relationThresholds,
  pairwise: {
    nested4v16: intervalMetrics(nested[0], nested[2]),
    shifted8By2: intervalMetrics(shifted[0], shifted[1]),
    chainAvB: intervalMetrics(chain[0], chain[1]),
    chainBvC: intervalMetrics(chain[1], chain[2]),
    chainAvC: intervalMetrics(chain[0], chain[2]),
    separated: intervalMetrics(separated[0], separated[1]),
  },
  initialSelection: {
    groupSelectedVariantIds: initialSelectionSelectedVariants.map(({ id }) => id),
    globalInitialWinnerId: initialSelectionWinner.id,
  },
  fixtures: {
    nested: groupSummary(nested),
    shifted: groupSummary(shifted),
    chain: groupSummary(chain),
    separated: groupSummary(separated),
    oneCandidate: groupSummary([candidate("only", 17, 24, 0.9)]),
    zeroCandidates: groupSummary([]),
    longTimeline: {
      ...groupSummary(longCandidates),
      totalBars: 145,
      harmonicActiveBars: activeBars.size,
      activeBarsCoveredByCandidates: activeCoveredBars.length,
      activeBarsWithoutCandidate: activeBars.size - activeCoveredBars.length,
      candidateCoverageOfActiveBars: Number((activeCoveredBars.length / activeBars.size).toFixed(6)),
      inactiveBars: activity.filter(({ bucket }) => bucket === 0).length,
      activityBucketCounts: Object.fromEntries([0, 1, 2, 3].map((bucket) => [
        bucket,
        activity.filter((entry) => entry.bucket === bucket).length,
      ])),
    },
  },
};

assert.deepEqual(relationThresholds, { overlapCoefficient: 0.75, proximityBars: 2 });
assert.deepEqual(output.pairwise, {
  nested4v16: { intersection: 4, union: 16, iou: 0.25, overlapCoefficient: 1,
    startDistance: 0, endDistance: 12, centerDistance: 6 },
  shifted8By2: { intersection: 6, union: 10, iou: 0.6, overlapCoefficient: 0.75,
    startDistance: 2, endDistance: 2, centerDistance: 2 },
  chainAvB: { intersection: 6, union: 10, iou: 0.6, overlapCoefficient: 0.75,
    startDistance: 2, endDistance: 2, centerDistance: 2 },
  chainBvC: { intersection: 6, union: 10, iou: 0.6, overlapCoefficient: 0.75,
    startDistance: 2, endDistance: 2, centerDistance: 2 },
  chainAvC: { intersection: 4, union: 12, iou: 1 / 3, overlapCoefficient: 0.5,
    startDistance: 4, endDistance: 4, centerDistance: 4 },
  separated: { intersection: 0, union: 16, iou: 0, overlapCoefficient: 0,
    startDistance: 32, endDistance: 32, centerDistance: 32 },
});
assert.deepEqual([
  related(nested[0], nested[2]), related(shifted[0], shifted[1]),
  related(chain[0], chain[1]), related(chain[1], chain[2]),
  related(chain[0], chain[2]), related(separated[0], separated[1]),
], [true, true, true, true, false, false]);

assert.deepEqual(output.initialSelection, {
  groupSelectedVariantIds: ["initial-a", "initial-b-8", "initial-c"],
  globalInitialWinnerId: "initial-b-8",
});
assert.deepEqual(output.fixtures.nested, {
  underlyingCandidateCount: 3, visibleGroupCount: 1, averageVariantsPerGroup: 3,
  maximumVariantsPerGroup: 3,
  groups: [{ anchorId: "nested-16", variantIds: ["nested-16", "nested-8", "nested-4"],
    representativeId: "nested-16", selectedVariantId: "nested-8" }],
});
assert.deepEqual(output.fixtures.shifted, {
  underlyingCandidateCount: 2, visibleGroupCount: 1, averageVariantsPerGroup: 2,
  maximumVariantsPerGroup: 2,
  groups: [{ anchorId: "shifted-a", variantIds: ["shifted-a", "shifted-b"],
    representativeId: "shifted-b", selectedVariantId: "shifted-b" }],
});
assert.deepEqual(output.fixtures.chain, {
  underlyingCandidateCount: 3, visibleGroupCount: 2, averageVariantsPerGroup: 1.5,
  maximumVariantsPerGroup: 2,
  groups: [
    { anchorId: "chain-a", variantIds: ["chain-a", "chain-b"],
      representativeId: "chain-a", selectedVariantId: "chain-a" },
    { anchorId: "chain-c", variantIds: ["chain-c"],
      representativeId: "chain-c", selectedVariantId: "chain-c" },
  ],
});
assert.deepEqual(output.fixtures.separated.groups.map(({ variantIds }) => variantIds),
  [["region-a"], ["region-b"], ["region-c"]]);
assert.deepEqual({ candidates: output.fixtures.separated.underlyingCandidateCount,
  groups: output.fixtures.separated.visibleGroupCount }, { candidates: 3, groups: 3 });
assert.deepEqual(output.fixtures.oneCandidate, {
  underlyingCandidateCount: 1, visibleGroupCount: 1, averageVariantsPerGroup: 1,
  maximumVariantsPerGroup: 1,
  groups: [{ anchorId: "only", variantIds: ["only"],
    representativeId: "only", selectedVariantId: "only" }],
});
assert.deepEqual(output.fixtures.zeroCandidates, {
  underlyingCandidateCount: 0, visibleGroupCount: 0, averageVariantsPerGroup: 0,
  maximumVariantsPerGroup: 0, groups: [],
});
assert.deepEqual(output.fixtures.longTimeline.groups.map(({ variantIds }) => variantIds), [
  ["nested-16", "nested-8", "nested-4", "cluster-1-shift-a", "cluster-1-shift-b"],
  ["cluster-2-long", "cluster-2-a", "cluster-2-b"],
  ["cluster-3-a", "cluster-3-b"], ["cluster-3-c"], ["cluster-4"],
]);
assert.deepEqual({ candidates: output.fixtures.longTimeline.underlyingCandidateCount,
  groups: output.fixtures.longTimeline.visibleGroupCount,
  average: output.fixtures.longTimeline.averageVariantsPerGroup,
  maximum: output.fixtures.longTimeline.maximumVariantsPerGroup,
}, { candidates: 12, groups: 5, average: 2.4, maximum: 5 });
assert.deepEqual(output.fixtures.longTimeline.groups.map(
  ({ representativeId, selectedVariantId }) => [representativeId, selectedVariantId]), [
  ["nested-16", "nested-8"], ["cluster-2-long", "cluster-2-b"],
  ["cluster-3-a", "cluster-3-a"], ["cluster-3-c", "cluster-3-c"],
  ["cluster-4", "cluster-4"],
]);

function selectedId(values) {
  return [...values].sort(selectedVariantOrder)[0].id;
}
assert.equal(selectedId([
  candidate("score-low", 1, 4, 0.8, 0.99), candidate("score-high", 1, 4, 0.9, 0.5),
]), "score-high");
assert.equal(selectedId([
  candidate("fallback", 1, 4, undefined, 0.95), candidate("finite", 1, 4, 0.9, 0.9),
]), "fallback");
assert.equal(selectedId([
  candidate("nan-fallback", 1, 4, Number.NaN, 0.96),
  candidate("nan-finite", 1, 4, 0.95, 0.95),
]), "nan-fallback");
assert.equal(selectedId([
  candidate("infinity-fallback", 1, 4, Number.POSITIVE_INFINITY, 0.97),
  candidate("infinity-finite", 1, 4, 0.96, 0.96),
]), "infinity-fallback");
assert.equal(selectedId([
  candidate("confidence-low", 1, 4, 0.9, 0.8), candidate("confidence-high", 1, 4, 0.9, 0.9),
]), "confidence-high");
assert.equal(selectedId([
  candidate("later", 2, 5, 0.9, 0.9), candidate("earlier", 1, 4, 0.9, 0.9),
]), "earlier");
assert.equal(selectedId([
  candidate("longer", 1, 8, 0.9, 0.9), candidate("shorter", 1, 4, 0.9, 0.9),
]), "shorter");
const endEarly = { ...candidate("end-early", 1, 8, 0.9, 0.9), lengthBars: 8 };
const endLate = { ...candidate("end-late", 1, 9, 0.9, 0.9), lengthBars: 8 };
assert.equal(selectedId([endLate, endEarly]), "end-early");
assert.equal(selectedId([
  candidate("b-id", 1, 4, 0.9, 0.9), candidate("a-id", 1, 4, 0.9, 0.9),
]), "a-id");
assert.equal([...nested].sort(representativeOrder)[0].id, "nested-16");
assert.equal([...nested].sort(selectedVariantOrder)[0].id, "nested-8");

const boundaryActivity = harmonicActivity(4, 4, [
  { startBeat: Number.NaN, durationBeats: 4 },
  { startBeat: 0, durationBeats: Number.POSITIVE_INFINITY },
  { startBeat: 0, durationBeats: 0 },
  { startBeat: 0, durationBeats: -1 },
  { startBeat: 4, durationBeats: 1 },
  { startBeat: 8, durationBeats: 3 },
  { startBeat: 12, durationBeats: 4 },
]);
assert.deepEqual(boundaryActivity, [
  { bar: 1, normalized: 0, bucket: 0 },
  { bar: 2, normalized: 0.25, bucket: 1 },
  { bar: 3, normalized: 0.75, bucket: 2 },
  { bar: 4, normalized: 1, bucket: 3 },
]);
assert.deepEqual({
  totalBars: output.fixtures.longTimeline.totalBars,
  active: output.fixtures.longTimeline.harmonicActiveBars,
  covered: output.fixtures.longTimeline.activeBarsCoveredByCandidates,
  uncovered: output.fixtures.longTimeline.activeBarsWithoutCandidate,
  inactive: output.fixtures.longTimeline.inactiveBars,
  buckets: output.fixtures.longTimeline.activityBucketCounts,
}, { totalBars: 145, active: 131, covered: 44, uncovered: 87, inactive: 14,
  buckets: { 0: 14, 1: 1, 2: 1, 3: 129 } });

stdout.write(`${JSON.stringify(output, null, 2)}\n`);
