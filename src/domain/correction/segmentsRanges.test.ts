import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel, type CorrectionCard, type CorrectionModel, type CorrectionSegment } from "./correctionModel";
import { addNote, setTempo } from "./edits";
import { buildMetricsRecord } from "./metrics";
import { commitEdit, editCount, editKindCounts, savedContentDiffers, startHistory, undo } from "./history";
import { cardForBar, cardsBarRange, pickRangeCard } from "./rangePick";
import { reviewThresholds } from "./reviewThresholds";
import { moveSegmentEdge } from "./segmentEdits";

/** P10.2 §8 (a bar selects its first card), §9 (right-click save ranges), §11 (segment edges). */

const input = analyzeScenario(p10Scenario("plain-8"));
const segment = (id: string, startBar: number, endBar: number): CorrectionSegment => ({ id, startBar, endBar, label: `区切り${id}`, source: "segmentSections" });
// plain-8: C Am F G7 C Am F G7, a bar each. Three segments, the last two touching, a gap before them.
const model = (): CorrectionModel => ({ ...buildCorrectionModel(input, reviewThresholds), segments: [segment("1", 1, 2), segment("2", 4, 6), segment("3", 7, 8)] });
const bounds = (out: CorrectionModel) => out.segments.map((entry) => [entry.startBar, entry.endBar]);

describe("segment edges (P10.2 §11)", () => {
  it("a border shared with the next segment moves as one; one shrinks, one grows", () => {
    const out = moveSegmentEdge(model(), "2", "end", 5);
    expect(out).toMatchObject({ changed: true, kind: "segment", label: "区切り2 の終わりを 6 → 5小節" });
    expect(bounds(out.model)).toEqual([[1, 2], [4, 5], [6, 8]]);
    expect(bounds(moveSegmentEdge(model(), "3", "start", 6).model)).toEqual([[1, 2], [4, 5], [6, 8]]);
  });

  it("an edge with a gap moves alone and never overlaps the neighbour", () => {
    expect(bounds(moveSegmentEdge(model(), "2", "start", 3).model)).toEqual([[1, 2], [3, 6], [7, 8]]);
    expect(bounds(moveSegmentEdge(model(), "2", "start", 1).model)).toEqual([[1, 2], [3, 6], [7, 8]]); // stops after 区切り1
    expect(bounds(moveSegmentEdge(model(), "1", "end", 3).model)).toEqual([[1, 3], [4, 6], [7, 8]]);
  });

  it("no segment gets shorter than a bar (it stops), and the song's first start and last end stay", () => {
    expect(bounds(moveSegmentEdge(model(), "2", "end", 8).model)).toEqual([[1, 2], [4, 7], [8, 8]]);
    expect(bounds(moveSegmentEdge(model(), "2", "end", 2).model)).toEqual([[1, 2], [4, 4], [5, 8]]);
    expect(moveSegmentEdge(model(), "1", "start", 2).changed).toBe(false);
    expect(moveSegmentEdge(model(), "3", "end", 7).changed).toBe(false);
    expect(moveSegmentEdge(model(), "2", "end", 6).changed).toBe(false);
  });

  it("counts 「n回出てくる」 again", () => {
    const even = { ...model(), segments: [segment("1", 1, 3), segment("2", 4, 8)] };
    expect(even.segments.every((entry) => entry.repeatCount === undefined)).toBe(true);
    const out = moveSegmentEdge(even, "1", "end", 4).model; // 1–4 and 5–8 hold the same chords
    expect(out.segments.map((entry) => entry.repeatCount)).toEqual([2, 2]);
  });

  it("goes in the history (undo) but not in 「直した回数」 or unsaved changes", () => {
    const start = model();
    let history = commitEdit(startHistory(start), moveSegmentEdge(start, "2", "end", 5));
    expect(editCount(history)).toBe(0);
    expect(editKindCounts(history)).toMatchObject({ segment: 1 });
    expect(savedContentDiffers(history.present, start)).toBe(false);
    history = commitEdit(history, addNote(history.present, history.present.cards[0]!.id, 70));
    expect(editCount(history)).toBe(1);
    expect(savedContentDiffers(history.present, start)).toBe(true);
    history = undo(undo(history));
    expect(bounds(history.present)).toEqual([[1, 2], [4, 6], [7, 8]]);
  });
});

describe("right-click save ranges (P10.2 §9)", () => {
  const cards = buildCorrectionModel(input, reviewThresholds).cards;
  const at = (index: number) => cards[index]!;

  it("first marks 「ここから」, then decides; either order gives the same bars", () => {
    const first = pickRangeCard(undefined, at(1), 4);
    expect(first).toEqual({ pending: at(1) });
    expect(pickRangeCard(first.pending, at(4), 4)).toEqual({ range: { startBar: 2, endBar: 5 } });
    expect(pickRangeCard(at(4), at(1), 4)).toEqual({ range: { startBar: 2, endBar: 5 } });
  });

  it("the same card twice, or Shift, is that card's bars", () => {
    expect(pickRangeCard(at(3), at(3), 4)).toEqual({ range: { startBar: 4, endBar: 4 } });
    expect(pickRangeCard(undefined, at(6), 4, true)).toEqual({ range: { startBar: 7, endBar: 7 } });
    expect(pickRangeCard(at(1), at(6), 4, true)).toEqual({ range: { startBar: 7, endBar: 7 } });
  });

  it("takes whole bars for cards off the bar line", () => {
    const off = (start: number, duration: number) => ({ ...at(0), start, duration }) as CorrectionCard;
    expect(cardsBarRange(off(5, 2), off(13, 6), 4)).toEqual({ startBar: 2, endBar: 5 });
  });
});

describe("a click on the bar row (P10.2 §8)", () => {
  const cards = [{ id: "a", start: 0, duration: 6 }, { id: "b", start: 6, duration: 2 }, { id: "c", start: 13, duration: 3 }];

  it("selects the card sounding on the bar's first beat, carried over or not", () => {
    expect(cardForBar(cards, 1, 4)?.id).toBe("a");
    expect(cardForBar(cards, 2, 4)?.id).toBe("a"); // a continues from bar 1
  });

  it("on a rest, the first card starting in the bar; nothing when the bar has none", () => {
    expect(cardForBar(cards, 4, 4)?.id).toBe("c"); // beat 12 is a rest, c starts at 13
    expect(cardForBar(cards, 3, 4)).toBeUndefined();
    expect(cardForBar(cards, 5, 4)).toBeUndefined();
  });
});

describe("「最初からやり直す」 (P10.2 §12)", () => {
  it("is the workspace right after the import again, with an empty history and nothing unsaved", () => {
    const imported = model();
    let history = startHistory(imported);
    history = commitEdit(history, addNote(history.present, history.present.cards[0]!.id, 70));
    history = commitEdit(history, setTempo(history.present, 100));
    history = commitEdit(history, moveSegmentEdge(history.present, "2", "end", 5));
    expect(editCount(history)).toBe(2);
    // The workspace restarts from the model it was opened with (the analysis is not run again).
    const restarted = startHistory(imported);
    expect(restarted.present).toEqual({ ...buildCorrectionModel(input, reviewThresholds), segments: imported.segments });
    expect(restarted.past).toEqual([]);
    expect(restarted.future).toEqual([]);
    expect(editCount(restarted)).toBe(0);
    expect(undo(restarted)).toBe(restarted); // nothing to go back to
  });

  it("is counted in the local metrics, only when used", () => {
    const session = { startedAtMs: 0, bars: 8, cards: 8, reviewAtStart: 0, saves: [], undos: 0 };
    const now = { ms: 1000, iso: "2026-10-02T00:00:01.000Z" };
    expect(buildMetricsRecord({ ...session, restarts: 2 }, now, { reviewedCards: 0, edits: {} }).restarts).toBe(2);
    expect(buildMetricsRecord(session, now, { reviewedCards: 0, edits: {} })).not.toHaveProperty("restarts");
  });
});
