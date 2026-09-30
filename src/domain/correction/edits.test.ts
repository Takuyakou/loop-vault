import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel, MAX_CARD_PITCHES, TOO_FEW_NOTES, type CorrectionModel } from "./correctionModel";
import { addNote, aboveLineIds, cardNoteIds, chordRegisterPitch, deleteNotes, movePitch, pitchIds, restoreNotes, sameShortPitchIds, TEN_NOTE_LIMIT } from "./edits";
import { commitEdit, editCount, HISTORY_LIMIT, lastEditLabel, redo, startHistory, undo } from "./history";
import { reviewThresholds } from "./reviewThresholds";

const inputs = new Map<string, ReturnType<typeof analyzeScenario>>();
function fresh(id: string): CorrectionModel {
  if (!inputs.has(id)) inputs.set(id, analyzeScenario(p10Scenario(id)));
  return buildCorrectionModel(inputs.get(id)!, reviewThresholds);
}
const cardNotes = (model: CorrectionModel, cardId: string) => model.notes.filter((note) => note.cardId === cardId);
const used = (model: CorrectionModel, cardId: string) => [...new Set(cardNotes(model, cardId).filter((note) => note.used).map((note) => note.pitch))].sort((a, b) => a - b);

describe("note edits (P10.0-03)", () => {
  it("excludes a source note and restores it, marking the card edited", () => {
    const model = fresh("plain-8");
    const card = model.cards[1]!;
    const target = cardNotes(model, card.id).find((note) => note.used)!;
    const out = deleteNotes(model, [target.id]);
    expect(out.changed).toBe(true);
    expect(out.label).toMatch(/を外した$/);
    expect(out.model.notes.find((note) => note.id === target.id)!.used).toBe(false);
    expect(out.model.cards[1]!.edited).toBe(true);
    const back = restoreNotes(out.model, [target.id]);
    expect(back.model.notes.find((note) => note.id === target.id)!.used).toBe(true);
    expect(back.label).toMatch(/を戻した$/);
  });

  it("adds a MANUAL_ADDED note across the card, never twice, and removes it on delete", () => {
    const model = fresh("plain-8");
    const card = model.cards[1]!;
    const out = addNote(model, card.id, 71);
    const added = out.model.notes.find((note) => note.provenance === "MANUAL_ADDED")!;
    expect(added).toMatchObject({ sourceNoteId: null, used: true, pitch: 71, start: card.start, duration: card.duration, cardId: card.id });
    expect(out.label).toBe("B4 を足した");
    expect(addNote(out.model, card.id, 71).changed).toBe(false);
    const usedPitch = used(model, card.id)[0]!;
    expect(addNote(model, card.id, usedPitch).changed).toBe(false);
    const removed = deleteNotes(out.model, [added.id]);
    expect(removed.model.notes.some((note) => note.id === added.id)).toBe(false);
    expect(removed.label).toBe("B4 を消した");
    // Added and source notes stay distinguishable.
    expect(out.model.notes.filter((note) => note.provenance === "SOURCE").every((note) => note.sourceNoteId !== null)).toBe(true);
  });

  it("keeps the first pitch in originalPitch and drops it when the note returns", () => {
    const model = fresh("plain-8");
    const note = cardNotes(model, model.cards[0]!.id).find((entry) => entry.used)!;
    const up = movePitch(model, [note.id], 2);
    const moved = up.model.notes.find((entry) => entry.id === note.id)!;
    expect(moved).toMatchObject({ pitch: note.pitch + 2, originalPitch: note.pitch });
    const back = movePitch(up.model, [note.id], -2);
    expect(back.model.notes.find((entry) => entry.id === note.id)!.originalPitch).toBeUndefined();
    const added = addNote(model, model.cards[0]!.id, 70);
    const manual = added.model.notes.find((entry) => entry.provenance === "MANUAL_ADDED")!;
    expect(movePitch(added.model, [manual.id], 1).model.notes.find((entry) => entry.id === manual.id)).not.toHaveProperty("originalPitch");
    expect(movePitch(model, [note.id], 200).changed).toBe(false);
  });

  it("stops at ten pitches per card and reports skipped cards on a bulk restore", () => {
    let model = fresh("plain-8");
    const cardId = model.cards[0]!.id;
    for (let pitch = 72; used(model, cardId).length < MAX_CARD_PITCHES; pitch += 1) model = addNote(model, cardId, pitch).model;
    const blocked = addNote(model, cardId, 100);
    expect(blocked.changed).toBe(false);
    expect(blocked.message).toBe(TEN_NOTE_LIMIT);
    // Bulk: exclude everything in two cards, fill card 0 back to ten, then restore both.
    const other = model.cards[2]!.id;
    const off = deleteNotes(model, [...cardNoteIds(model, cardId), ...cardNoteIds(model, other)]).model;
    let full = off;
    for (let pitch = 40; used(full, cardId).length < MAX_CARD_PITCHES; pitch += 1) full = addNote(full, cardId, pitch).model;
    const bulk = restoreNotes(full, [...cardNoteIds(full, cardId), ...cardNoteIds(full, other)].filter((id) => !id.startsWith("manual")));
    expect(bulk.changed).toBe(true);
    expect(bulk.message).toMatch(/^1枚のカードは10音を超える/);
    expect(used(bulk.model, other).length).toBeGreaterThan(0);
    expect(used(bulk.model, cardId).length).toBe(MAX_CARD_PITCHES);
  });

  it("allows one note or none but warns 「2音以上にしてください」", () => {
    const model = fresh("plain-8");
    const cardId = model.cards[1]!.id;
    const keep = cardNotes(model, cardId).filter((note) => note.used).slice(1).map((note) => note.id);
    const out = deleteNotes(model, keep);
    expect(used(out.model, cardId).length).toBe(1);
    expect(out.model.cards[1]!.noteWarning).toBe(TOO_FEW_NOTES);
    expect(model.cards[1]!.noteWarning).toBeUndefined();
  });

  it("recomputes the review reasons and the melody suggestion", () => {
    const model = fresh("melody-track-8");
    const flagged = model.cards.find((card) => card.reviewReasons.some((reason) => reason.kind === "melody"))!;
    const reason = flagged.reviewReasons.find((entry) => entry.kind === "melody")!;
    const out = deleteNotes(model, reason.noteIds);
    expect(out.model.cards.find((card) => card.id === flagged.id)!.reviewReasons.some((entry) => entry.kind === "melody")).toBe(false);
    // Removing every melody-voice note drops the song-wide suggestion.
    const suggestion = model.suggestions.find((entry) => entry.kind === "melody-voice")!;
    expect(suggestion.kind === "melody-voice").toBe(true);
    const ids = suggestion.kind === "melody-voice" ? suggestion.noteIds : [];
    expect(deleteNotes(model, ids).model.suggestions.some((entry) => entry.kind === "melody-voice")).toBe(false);
  });

  it("updates an automatic name from the notes, and Ctrl+Z brings notes and name back together", () => {
    const model = fresh("plain-8");
    const card = model.cards[0]!; // C (C E G)
    const history = commitEdit(startHistory(model), addNote(model, card.id, 70)); // + Bb → C7
    expect(history.present.cards[0]!.name.label).not.toBe(card.name.label);
    expect(editCount(history)).toBe(1);
    expect(lastEditLabel(history)).toBe("Bb4 を足した");
    const back = undo(history);
    expect(back.present.cards[0]!.name.label).toBe(card.name.label);
    expect(back.present.notes).toEqual(model.notes);
    expect(editCount(back)).toBe(0);
    expect(redo(back).present).toBe(history.present);
  });

  it("puts a drag in one history entry and keeps at most 200", () => {
    const model = fresh("plain-8");
    const note = cardNotes(model, model.cards[0]!.id).find((entry) => entry.used)!;
    // A drag computes from its start model and commits once.
    const dragged = movePitch(model, [note.id], 3);
    const history = commitEdit(startHistory(model), dragged);
    expect(editCount(history)).toBe(1);
    let long = startHistory(model);
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) long = commitEdit(long, movePitch(long.present, [note.id], index % 2 ? -1 : 1));
    expect(editCount(long)).toBe(HISTORY_LIMIT);
  });

  it("never changes the source MIDI", () => {
    const input = analyzeScenario(p10Scenario("plain-8"));
    const before = JSON.stringify(input.sourceData);
    let model = buildCorrectionModel(input, reviewThresholds);
    model = deleteNotes(model, cardNoteIds(model, model.cards[0]!.id)).model;
    model = addNote(model, model.cards[1]!.id, 80).model;
    model = movePitch(model, cardNoteIds(model, model.cards[2]!.id), 1).model;
    expect(model.notes.some((note) => note.originalPitch !== undefined)).toBe(true);
    expect(JSON.stringify(input.sourceData)).toBe(before);
  });

  it("selects without changing anything: short same pitch, above the line, one pitch, one card", () => {
    const hats = fresh("hats-in-piano-8");
    const hat = hats.notes.find((note) => note.pitch === 37)!;
    const short = sameShortPitchIds(hats, hat.id);
    expect(short.length).toBeGreaterThanOrEqual(64);
    const longNote = hats.notes.find((note) => note.duration >= 1)!;
    expect(sameShortPitchIds(hats, longNote.id)).toEqual([]);
    const melody = fresh("melody-track-8");
    expect(aboveLineIds(melody, 71).every((id) => melody.notes.find((note) => note.id === id)!.pitch > 71)).toBe(true);
    expect(pitchIds(melody, 60).length).toBeGreaterThan(0);
    expect(chordRegisterPitch(7)).toBe(55);
    expect(chordRegisterPitch(6)).toBe(66);
  });
});
