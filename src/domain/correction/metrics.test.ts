import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { chooseName, markReviewed, splitCard } from "./cardEdits";
import { buildCorrectionModel } from "./correctionModel";
import { addNote, deleteNotes } from "./edits";
import { commitEdit, editKindCounts, startHistory, undo } from "./history";
import { buildMetricsRecord, parseMetricsJsonl, summarizeMetrics, totalEdits, type CorrectionMetricsRecord } from "./metrics";
import { reviewThresholds } from "./reviewThresholds";

describe("local edit metrics (P10.0-07)", () => {
  const input = analyzeScenario(p10Scenario("melody-track-8"));
  const model = buildCorrectionModel(input, reviewThresholds);

  it("counts operations by kind with undone ones taken off, and times to the first and last save", () => {
    let history = startHistory(model);
    history = commitEdit(history, addNote(history.present, model.cards[0]!.id, 71));
    history = commitEdit(history, deleteNotes(history.present, [history.present.notes.find((note) => note.used && note.cardId === model.cards[1]!.id)!.id]));
    history = commitEdit(history, splitCard(history.present, model.cards[2]!.id));
    history = commitEdit(history, chooseName(history.present, model.cards[3]!.id, model.cards[0]!.name));
    history = commitEdit(history, markReviewed(history.present, model.cards[5]!.id));
    history = undo(history); // 「このままでよい」 undone
    const record = buildMetricsRecord(
      { startedAtMs: 1_000, bars: 9, cards: model.cards.length, reviewAtStart: 3, saves: [{ atMs: 31_000, reviewMarks: 2 }, { atMs: 91_500, reviewMarks: 1 }], undos: 1 },
      { ms: 100_000, iso: "2026-10-01T00:00:00.000Z" },
      { reviewedCards: history.present.cards.filter((card) => card.reviewed).length, edits: editKindCounts(history) },
    );
    expect(record.edits).toMatchObject({ add: 1, exclude: 1, split: 1, name: 1, reviewed: 0, merge: 0 });
    expect(totalEdits(record)).toBe(4);
    expect(record).toMatchObject({ undos: 1, savedRanges: 2, secondsToFirstSave: 30, secondsToLastSave: 90.5, reviewAtLastSave: 1, leftWithoutSave: false, reviewedCards: 0 });
  });

  it("marks leaving without a save, and never records a name, a file, a track or a chord", () => {
    const record = buildMetricsRecord(
      { startedAtMs: 0, bars: 9, cards: model.cards.length, reviewAtStart: 3, saves: [], undos: 0 },
      { ms: 5_000, iso: "2026-10-01T00:00:05.000Z" },
      { reviewedCards: 0, edits: {} },
    );
    expect(record).toMatchObject({ leftWithoutSave: true, savedRanges: 0, secondsToFirstSave: null, reviewAtLastSave: null });
    const line = JSON.stringify(record);
    const forbidden = [
      "melody-track-8", ".mid", "Piano", "Bass", "Lead",
      ...input.result.fullTimeline.map((item) => item.chord.label),
      ...input.sourceData.tracks.map((track) => track.name).filter(Boolean),
    ];
    for (const word of forbidden) expect(line).not.toContain(`"${word}`);
    expect(Object.keys(record).sort()).toEqual(["at", "bars", "cards", "edits", "leftWithoutSave", "reviewAtLastSave", "reviewAtStart", "reviewedCards", "savedRanges", "schemaVersion", "secondsToFirstSave", "secondsToLastSave", "undos"]);
  });

  it("reads the file back and averages the last 20 rows", () => {
    const row = (edits: number, seconds: number | null): CorrectionMetricsRecord => buildMetricsRecord(
      { startedAtMs: 0, bars: 8, cards: 8, reviewAtStart: 0, saves: seconds === null ? [] : [{ atMs: seconds * 1000, reviewMarks: 0 }], undos: 0 },
      { ms: 0, iso: "2026-10-01T00:00:00.000Z" },
      { reviewedCards: 0, edits: { add: edits } },
    );
    const rows = [...Array.from({ length: 5 }, () => row(100, 999)), ...Array.from({ length: 20 }, (_, index) => row(index % 2 ? 4 : 2, index % 2 ? 10 : null))];
    const text = `${rows.map((entry) => JSON.stringify(entry)).join("\n")}\nnot json\n{"schemaVersion":9}\n`;
    const parsed = parseMetricsJsonl(text);
    expect(parsed).toHaveLength(25);
    expect(summarizeMetrics(parsed)).toEqual({ count: 25, recentAverageEdits: 3, recentAverageSecondsToFirstSave: 10 });
    expect(summarizeMetrics([])).toEqual({ count: 0, recentAverageEdits: null, recentAverageSecondsToFirstSave: null });
  });
});
