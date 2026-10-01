import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel, notesByCard, usedShape, type CorrectionModel } from "./correctionModel";
import { chooseName, markReviewed, mergeSameNotes, mergeWithNext, moveBoundary, positionLabel, sameFixTargets, sameNotesGroups, splitCard } from "./cardEdits";
import { addNote, deleteNotes, movePitch, restoreNotes } from "./edits";
import { commitEdit, startHistory, undo } from "./history";
import { reviewThresholds } from "./reviewThresholds";

const inputs = new Map<string, ReturnType<typeof analyzeScenario>>();
function fresh(id: string): CorrectionModel {
  if (!inputs.has(id)) inputs.set(id, analyzeScenario(p10Scenario(id)));
  return buildCorrectionModel(inputs.get(id)!, reviewThresholds);
}
const notesOf = (model: CorrectionModel, cardId: string) => model.notes.filter((note) => note.cardId === cardId);
const shapeOf = (model: CorrectionModel, cardId: string) => usedShape(notesOf(model, cardId));
/** Every beat of every source note is covered exactly once by a fragment. */
function coverage(model: CorrectionModel): Map<string, number> {
  const out = new Map<string, number>();
  for (const note of model.notes) if (note.sourceNoteId) out.set(note.sourceNoteId, (out.get(note.sourceNoteId) ?? 0) + note.duration);
  return out;
}
const close = (a: Map<string, number>, b: Map<string, number>) => [...a].every(([id, beats]) => Math.abs((b.get(id) ?? 0) - beats) < 1e-6) && a.size === b.size;

describe("card edits (P10.0-04)", () => {
  it("merges with the next card: lengths and attacks add, same-state pieces of one note join, different ones stay", () => {
    const model = fresh("melody-track-8");
    // A melody note that crosses a card boundary has one fragment on each side.
    const byCard = notesByCard(model.notes);
    const index = model.cards.findIndex((card, at) => {
      const next = model.cards[at + 1];
      return next && (byCard.get(card.id) ?? []).some((note) => (byCard.get(next.id) ?? []).some((other) => other.sourceNoteId === note.sourceNoteId));
    });
    const [a, b] = [model.cards[index]!, model.cards[index + 1]!];
    const shared = notesOf(model, a.id).find((note) => notesOf(model, b.id).some((other) => other.sourceNoteId === note.sourceNoteId))!;
    const out = mergeWithNext(model, a.id);
    const merged = out.model.cards.find((card) => card.id === a.id)!;
    expect(out.model.cards).toHaveLength(model.cards.length - 1);
    expect(merged).toMatchObject({ start: a.start, duration: a.duration + b.duration, attacks: 2, name: a.name });
    expect(out.model.notes.filter((note) => note.sourceNoteId === shared.sourceNoteId)).toHaveLength(1);
    expect(close(coverage(model), coverage(out.model))).toBe(true);
    // Excluded on one side only: the two pieces keep their own state.
    const half = deleteNotes(model, [shared.id]).model;
    const split = mergeWithNext(half, a.id).model.notes.filter((note) => note.sourceNoteId === shared.sourceNoteId);
    expect(split.map((note) => note.used).sort()).toEqual([false, true]);
    expect(out.label).toMatch(/と次をつないだ$/);
  });

  it("keeps a person's name when merging and joins added notes of the same pitch", () => {
    let model = fresh("plain-8");
    const [a, b] = model.cards;
    model = chooseName(model, b!.id, { ...b!.name, label: "Am7" } as never).model;
    model = addNote(model, a!.id, 71).model;
    model = addNote(model, b!.id, 71).model;
    const out = mergeWithNext(model, a!.id).model;
    expect(out.cards[0]).toMatchObject({ nameSource: "user" });
    expect(out.cards[0]!.name.label).toBe("Am7");
    const manual = out.notes.filter((note) => note.provenance === "MANUAL_ADDED");
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ cardId: a!.id, start: a!.start, duration: a!.duration + b!.duration });
  });

  it("splits on a beat, re-cuts notes with their state, copies added notes, and never leaves one beat or less", () => {
    let model = fresh("plain-8");
    const card = model.cards[0]!;
    const off = notesOf(model, card.id).find((note) => note.used)!;
    model = deleteNotes(model, [off.id]).model;
    model = addNote(model, card.id, 71).model;
    const out = splitCard(model, card.id);
    const [first, second] = out.model.cards;
    expect(first).toMatchObject({ id: card.id, start: card.start, duration: 2, bar: 1, beat: 1 });
    expect(second).toMatchObject({ start: 2, duration: 2, bar: 1, beat: 3 });
    expect(second!.id).not.toBe(card.id);
    for (const half of [first!, second!]) {
      expect(notesOf(out.model, half.id).find((note) => note.sourceNoteId === off.sourceNoteId)!.used).toBe(false);
      expect(notesOf(out.model, half.id).filter((note) => note.provenance === "MANUAL_ADDED")).toHaveLength(1);
    }
    expect(new Set(out.model.notes.map((note) => note.id)).size).toBe(out.model.notes.length);
    expect(close(coverage(model), coverage(out.model))).toBe(true);
    const twoBeats = splitCard(out.model, first!.id);
    expect(twoBeats.changed).toBe(false);
    expect(twoBeats.message).toBe("1拍以下になるので分けません");
  });

  it("moves a boundary: the neighbour changes too, moved pieces keep their state, never under ¼ beat", () => {
    let model = fresh("plain-8");
    const [a, b] = model.cards;
    model = addNote(model, a!.id, 71).model;
    const out = moveBoundary(model, a!.id, 3);
    expect(out.model.cards[0]).toMatchObject({ start: 0, duration: 3 });
    expect(out.model.cards[1]).toMatchObject({ start: 3, duration: b!.duration + 1, bar: 1, beat: 4 });
    const movedPieces = notesOf(out.model, b!.id).filter((note) => note.start < 4 - 1e-6 && note.provenance === "SOURCE");
    expect(movedPieces.length).toBeGreaterThan(0);
    expect(movedPieces.every((note) => notesOf(model, a!.id).some((old) => old.sourceNoteId === note.sourceNoteId && old.used === note.used))).toBe(true);
    expect(notesOf(out.model, a!.id).find((note) => note.provenance === "MANUAL_ADDED")).toMatchObject({ start: 0, duration: 3 });
    expect(close(coverage(model), coverage(out.model))).toBe(true);
    expect(moveBoundary(model, a!.id, 0.1).changed).toBe(false);
    expect(moveBoundary(model, a!.id, 0.25).changed).toBe(true);
    expect(moveBoundary(model, a!.id, b!.start).changed).toBe(false);
    expect(out.label).toBe("境目を 1.4 へ");
    expect(positionLabel(4 * 4 + 2.25, 4)).toBe("5.3¼");
  });

  it("chooses names as a person's, never replaced by note edits, and finds the same fix elsewhere", () => {
    const model = fresh("plain-8");
    const card = model.cards[0]!;
    const named = chooseName(model, card.id, model.cards[1]!.name);
    expect(named.model.cards[0]).toMatchObject({ nameSource: "user", name: model.cards[1]!.name });
    const afterEdit = addNote(named.model, card.id, 70).model;
    expect(afterEdit.cards[0]!.name.label).toBe(model.cards[1]!.name.label);
    // plain-8 loops C Am F G7: bar 5 plays the same notes with the same name.
    const targets = sameFixTargets(named.model, card.id, card.name.label);
    expect(targets).toContain(model.cards[4]!.id);
    expect(targets.every((id) => shapeOf(model, id) === shapeOf(model, card.id))).toBe(true);
    const all = chooseName(named.model, targets, model.cards[1]!.name);
    expect(all.label).toMatch(/か所の名前を|名前を/);
    expect(all.model.cards[4]!.nameSource).toBe("user");
  });

  it("Y clears the review marks of a card for the rest of the import", () => {
    const model = fresh("melody-track-8");
    const flagged = model.cards.find((card) => card.reviewReasons.length)!;
    const out = markReviewed(model, flagged.id).model;
    expect(out.cards.find((card) => card.id === flagged.id)).toMatchObject({ reviewed: true, reviewReasons: [] });
    const later = restoreNotes(out, notesOf(out, flagged.id).map((note) => note.id)).model;
    expect(later.cards.find((card) => card.id === flagged.id)!.reviewReasons).toEqual([]);
  });

  it("Shift+M merges only neighbours with exactly the same notes, in one step, and the suggestion follows edits", () => {
    const model = fresh("plain-8");
    expect(sameNotesGroups(model)).toEqual([]);
    const split = splitCard(model, model.cards[0]!.id).model;
    expect(sameNotesGroups(split)).toEqual([[split.cards[0]!.id, split.cards[1]!.id]]);
    // Not an edit of notes yet: no song-wide suggestion.
    expect(split.suggestions.some((entry) => entry.kind === "same-notes-run")).toBe(false);
    const target = notesOf(split, split.cards[1]!.id).find((note) => note.used)!;
    const touched = restoreNotes(deleteNotes(split, [target.id]).model, [target.id]).model;
    expect(touched.suggestions.find((entry) => entry.kind === "same-notes-run")).toMatchObject({ count: 1 });
    const merged = mergeSameNotes(touched);
    expect(merged.model.cards).toHaveLength(model.cards.length);
    expect(merged.model.cards[0]!.attacks).toBe(2);
    expect(merged.label).toBe("同じ音が続く1か所をつないだ");
    // Same name, different voicing (lowest note an octave up): not merged.
    const lowest = notesOf(split, split.cards[1]!.id).filter((note) => note.used).sort((x, y) => x.pitch - y.pitch)[0]!;
    const voiced = movePitch(split, [lowest.id], 12).model;
    expect(voiced.cards[0]!.name.label).toBe(voiced.cards[1]!.name.label);
    expect(sameNotesGroups(voiced)).toEqual([]);
    expect(mergeSameNotes(voiced).changed).toBe(false);
  });

  it("goes back with Ctrl+Z and never changes the source MIDI", () => {
    const input = analyzeScenario(p10Scenario("plain-8"));
    const before = JSON.stringify(input.sourceData);
    const model = buildCorrectionModel(input, reviewThresholds);
    let history = startHistory(model);
    history = commitEdit(history, splitCard(history.present, model.cards[0]!.id));
    history = commitEdit(history, moveBoundary(history.present, model.cards[1]!.id, 7));
    history = commitEdit(history, mergeWithNext(history.present, model.cards[2]!.id));
    history = commitEdit(history, chooseName(history.present, model.cards[4]!.id, model.cards[1]!.name));
    history = commitEdit(history, markReviewed(history.present, model.cards[5]!.id));
    expect(history.past).toHaveLength(5);
    for (let step = 0; step < 5; step += 1) history = undo(history);
    expect(history.present).toBe(model);
    expect(JSON.stringify(input.sourceData)).toBe(before);
  });
});
