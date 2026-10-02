import { withRepeatCounts, type CorrectionModel } from "./correctionModel";
import { unchanged, type EditResult } from "./edits";

export type SegmentEdge = "start" | "end";

/**
 * P10.2 §11: move a segment's start or end to `bar` (whole bars). An edge touching the
 * neighbour moves as the border of the two (one shrinks, one grows). The song's first
 * start and last end stay; no segment gets shorter than one bar (it stops there).
 * 「n回出てくる」 is counted again. Segments are not saved, so this is a "segment" edit
 * (history yes, unsaved changes and 「直した回数」 no).
 */
export function moveSegmentEdge(model: CorrectionModel, segmentId: string, edge: SegmentEdge, bar: number): EditResult {
  const segments = model.segments;
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const segment = segments[index];
  if (!segment || !Number.isFinite(bar)) return unchanged(model);
  const next = segments.map((entry) => ({ ...entry }));
  if (edge === "start") {
    if (index === 0) return unchanged(model);
    const previous = segments[index - 1]!;
    const touching = previous.endBar === segment.startBar - 1;
    const low = touching ? previous.startBar + 1 : previous.endBar + 1;
    const to = Math.min(segment.endBar, Math.max(low, Math.round(bar)));
    if (to === segment.startBar) return unchanged(model);
    next[index]!.startBar = to;
    if (touching) next[index - 1]!.endBar = to - 1;
    return done(model, next, `${segment.label} の始まりを ${segment.startBar} → ${to}小節`);
  }
  if (index === segments.length - 1) return unchanged(model);
  const following = segments[index + 1]!;
  const touching = following.startBar === segment.endBar + 1;
  const high = touching ? following.endBar - 1 : following.startBar - 1;
  const to = Math.max(segment.startBar, Math.min(high, Math.round(bar)));
  if (to === segment.endBar) return unchanged(model);
  next[index]!.endBar = to;
  if (touching) next[index + 1]!.startBar = to + 1;
  return done(model, next, `${segment.label} の終わりを ${segment.endBar} → ${to}小節`);
}

function done(model: CorrectionModel, segments: CorrectionModel["segments"], label: string): EditResult {
  return { model: { ...model, segments: withRepeatCounts(segments, model.cards, model.context.meter) }, changed: true, label, kind: "segment" };
}
