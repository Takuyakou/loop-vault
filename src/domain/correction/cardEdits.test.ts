import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel, notesByCard, usedShape, type CorrectionCard, type CorrectionModel, type CorrectionNote, type SourceNoteRef } from "./correctionModel";
import { chooseName, deleteCard, markReviewed, mergeSameNotes, mergeWithNext, moveBoundary, positionLabel, sameFixTargets, sameNotesGroups, splitCard } from "./cardEdits";
import { addNote, deleteNotes, movePitch, restoreNotes } from "./edits";
import { commitEdit, redo, startHistory, undo } from "./history";
import { buildSaveCandidate, cardAuditionNotes } from "./saveCandidate";
import { songPlaybackNotes } from "./songPlayback";
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

  it("keeps a typed name when merging (P10.1 §11.2) and joins added notes of the same pitch", () => {
    let model = fresh("plain-8");
    const [a, b] = model.cards;
    model = addNote(model, a!.id, 71).model;
    model = addNote(model, b!.id, 71).model;
    model = chooseName(model, b!.id, { ...b!.name, label: "Am7" } as never, "typed").model;
    const out = mergeWithNext(model, a!.id).model;
    expect(out.cards[0]).toMatchObject({ nameSource: "typed" });
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

  it("chooses names (chosen / typed) and finds the same fix elsewhere; note edits follow §11.2", () => {
    const model = fresh("plain-8");
    const card = model.cards[0]!;
    const named = chooseName(model, card.id, model.cards[1]!.name);
    expect(named.model.cards[0]).toMatchObject({ nameSource: "chosen", name: model.cards[1]!.name });
    // P10.1: a chosen name turns automatic on a note edit and follows the notes …
    const afterEdit = addNote(named.model, card.id, 70).model; // C E G + Bb
    expect(afterEdit.cards[0]).toMatchObject({ nameSource: "auto" });
    expect(afterEdit.cards[0]!.name.label).not.toBe(model.cards[1]!.name.label);
    // … a typed one stays, with the notes' reading offered.
    const typed = chooseName(model, card.id, model.cards[1]!.name, "typed").model;
    const afterTyped = addNote(typed, card.id, 70).model;
    expect(afterTyped.cards[0]).toMatchObject({ nameSource: "typed", name: model.cards[1]!.name });
    expect(afterTyped.cards[0]!.suggestedName?.label).toBe(afterEdit.cards[0]!.name.label);
    // plain-8 loops C Am F G7: bar 5 plays the same notes with the same name.
    const targets = sameFixTargets(named.model, card.id, card.name.label);
    expect(targets).toContain(model.cards[4]!.id);
    expect(targets.every((id) => shapeOf(model, id) === shapeOf(model, card.id))).toBe(true);
    const all = chooseName(named.model, targets, model.cards[1]!.name);
    expect(all.label).toMatch(/か所の名前を|名前を/);
    expect(all.model.cards[4]!.nameSource).toBe("chosen");
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

/** P17-01 §1.1: the source-note fragments never overlap, never leave a gap, and keep unique ids. */
function assertFragments(model: CorrectionModel) {
  const bySource = new Map<string, CorrectionModel["notes"]>();
  for (const note of model.notes) {
    if (note.provenance !== "SOURCE" || !note.sourceNoteId) continue;
    const list = bySource.get(note.sourceNoteId) ?? [];
    list.push(note);
    bySource.set(note.sourceNoteId, list);
  }
  for (const list of bySource.values()) {
    expect(new Set(list.map((note) => note.id)).size).toBe(list.length);
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let index = 0; index < sorted.length; index += 1) {
      const note = sorted[index]!;
      expect(note.duration).toBeGreaterThan(0);
      // P17-01 §1.1: a fragment keeps its source and, when a person fixed its pitch, the pitch before the fix.
      expect(note.sourceNoteId).toBeTruthy();
      const source = model.context.sourceNotes.find((entry) => entry.id === note.sourceNoteId);
      if (note.originalPitch !== undefined) {
        expect(note.originalPitch).not.toBe(note.pitch);
        expect(note.originalPitch).toBe(source?.pitch);
      }
      if (!index) continue;
      const prev = sorted[index - 1]!;
      expect(prev.start + prev.duration).toBeLessThanOrEqual(note.start + 1e-6);
      expect(note.start).toBeLessThanOrEqual(prev.start + prev.duration + 1e-6);
    }
  }
}

describe("card delete in the MIDI capture (P17-01)", () => {
  it("extends the previous card: one card less, its span, sounds and name stay, the deleted range is unused", () => {
    const model = fresh("plain-8");
    const [a, b] = model.cards;
    const before = coverage(model);
    const used = shapeOf(model, a!.id);
    const out = deleteCard(model, b!.id, "extend-previous");
    expect(out.changed).toBe(true);
    expect(out.model.cards).toHaveLength(model.cards.length - 1);
    expect(out.model.cards[0]).toMatchObject({ id: a!.id, start: a!.start, duration: a!.duration + b!.duration, attacks: a!.attacks });
    expect(out.model.cards[0]!.name.label).toBe(a!.name.label);
    expect(shapeOf(out.model, a!.id)).toBe(used);
    expect(out.label).toBe(`${positionLabel(b!.start, model.context.meter)} のカードを消した`);
    expect(out.message).toContain("Ctrl+Z");
    const inDeleted = notesOf(out.model, a!.id).filter((note) => note.provenance === "SOURCE" && note.start >= b!.start - 1e-6);
    expect(inDeleted.length).toBeGreaterThan(0);
    expect(inDeleted.every((note) => !note.used)).toBe(true);
    expect(close(before, coverage(out.model))).toBe(true);
    assertFragments(out.model);
  });

  it("extends the next card: it starts where the deleted card started", () => {
    const model = fresh("plain-8");
    const [a, b] = model.cards;
    const out = deleteCard(model, a!.id, "extend-next");
    expect(out.model.cards[0]).toMatchObject({ id: b!.id, start: a!.start, duration: a!.duration + b!.duration });
    expect(close(coverage(model), coverage(out.model))).toBe(true);
    assertFragments(out.model);
  });

  it("falls back at the first and last card and refuses to delete the only card", () => {
    const model = fresh("plain-8");
    expect(deleteCard(model, model.cards[0]!.id, "extend-previous").model.cards[0]!.id).toBe(model.cards[1]!.id);
    const removedLast = deleteCard(model, model.cards[model.cards.length - 1]!.id, "extend-next").model;
    expect(removedLast.cards[removedLast.cards.length - 1]!.id).toBe(model.cards[model.cards.length - 2]!.id);
    let one = model;
    while (one.cards.length > 1) one = deleteCard(one, one.cards[one.cards.length - 1]!.id, "extend-previous").model;
    const refused = deleteCard(one, one.cards[0]!.id, "extend-previous");
    expect(refused.changed).toBe(false);
    expect(refused.message).toBe("最後の1枚は消せません");
  });

  it("cuts a source note that crosses the boundary: the remaining side keeps its state, the deleted side is unused", () => {
    const model = fresh("melody-track-8");
    const byCard = notesByCard(model.notes);
    const index = model.cards.findIndex((card, at) => {
      const next = model.cards[at + 1];
      return Boolean(next && (byCard.get(card.id) ?? []).some((note) => (byCard.get(next.id) ?? []).some((other) => other.sourceNoteId === note.sourceNoteId)));
    });
    expect(index).toBeGreaterThanOrEqual(0);
    const shared = notesOf(model, model.cards[index]!.id).find((note) => notesOf(model, model.cards[index + 1]!.id).some((other) => other.sourceNoteId === note.sourceNoteId))!;
    const out = deleteCard(model, model.cards[index + 1]!.id, "extend-previous").model;
    const pieces = out.notes.filter((note) => note.sourceNoteId === shared.sourceNoteId).sort((x, y) => x.start - y.start);
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    expect(close(coverage(model), coverage(out))).toBe(true);
    assertFragments(out);
  });

  it("drops the deleted card's added notes and keeps a fixed pitch as an unused note", () => {
    let model = fresh("plain-8");
    const [a, b] = model.cards;
    model = addNote(model, b!.id, 71).model;
    const source = notesOf(model, b!.id).find((note) => note.provenance === "SOURCE" && note.used)!;
    model = movePitch(model, [source.id], 1).model;
    const out = deleteCard(model, b!.id, "extend-previous").model;
    expect(out.notes.some((note) => note.provenance === "MANUAL_ADDED" && note.cardId === a!.id)).toBe(false);
    const moved = out.notes.find((note) => note.sourceNoteId === source.sourceNoteId)!;
    expect(moved).toMatchObject({ used: false, pitch: source.pitch + 1, originalPitch: source.pitch });
    assertFragments(out);
  });

  it("keeps a typed name on the remaining card", () => {
    let model = fresh("plain-8");
    const [a, b] = model.cards;
    model = chooseName(model, a!.id, { ...a!.name, label: "Cmaj7" } as never, "typed").model;
    const out = deleteCard(model, b!.id, "extend-previous").model;
    expect(out.cards[0]).toMatchObject({ nameSource: "typed" });
    expect(out.cards[0]!.name.label).toBe("Cmaj7");
  });

  it("restores the deleted range with R and does not turn unused pieces back on by itself", () => {
    const model = fresh("plain-8");
    const [a, b] = model.cards;
    const out = deleteCard(model, b!.id, "extend-previous").model;
    const unused = notesOf(out, a!.id).filter((note) => !note.used);
    expect(unused.length).toBeGreaterThan(0);
    const split = splitCard(out, a!.id);
    if (split.changed) expect(notesOf(split.model, split.model.cards[1]!.id).filter((note) => !note.used).length).toBeGreaterThan(0);
    const restored = restoreNotes(out, unused.map((note) => note.id)).model;
    expect(notesOf(restored, a!.id).filter((note) => !note.used)).toHaveLength(0);
    expect(close(coverage(model), coverage(restored))).toBe(true);
  });

  it("undoes and redoes the delete in one step", () => {
    const model = fresh("plain-8");
    const [, b] = model.cards;
    let history = startHistory(model);
    history = commitEdit(history, deleteCard(history.present, b!.id, "extend-previous"));
    expect(history.present.cards).toHaveLength(model.cards.length - 1);
    history = undo(history);
    expect(history.present).toEqual(model);
    history = redo(history);
    expect(history.present.cards).toHaveLength(model.cards.length - 1);
  });

  it("keeps the fragment rules through delete, split, merge and boundary, with 4 undo and 4 redo", () => {
    let model = fresh("plain-8");
    const before = coverage(model);
    const states: CorrectionModel[] = [model];
    const run = (result: ReturnType<typeof deleteCard>) => {
      expect(result.changed).toBe(true);
      model = result.model;
      states.push(model);
      assertFragments(model);
    };
    run(deleteCard(model, model.cards[2]!.id, "extend-previous"));
    run(splitCard(model, model.cards[2]!.id));
    run(mergeWithNext(model, model.cards[2]!.id));
    run(moveBoundary(model, model.cards[2]!.id, model.cards[2]!.start + 1));
    expect(close(before, coverage(model))).toBe(true);
    let history = startHistory(states[0]!);
    for (const state of states.slice(1)) history = commitEdit(history, { changed: true, label: "x", model: state });
    for (let step = states.length - 1; step > 0; step -= 1) {
      history = undo(history);
      expect(history.present).toEqual(states[step - 1]);
      assertFragments(history.present);
    }
    for (let step = 1; step < states.length; step += 1) {
      history = redo(history);
      expect(history.present).toEqual(states[step]);
      assertFragments(history.present);
    }
  });

  it("keeps each fragment's own pitch through delete, merge and split (§5-13)", () => {
    const model = fresh("melody-track-8");
    const pair = crossingPair(model);
    expect(pair).toBeDefined();
    const { front, back, sourceNoteId } = pair!;
    const backPiece = notesOf(model, back.id).find((note) => note.sourceNoteId === sourceNoteId)!;
    const fixed = movePitch(model, [backPiece.id], 1).model;
    const frontPiece = notesOf(fixed, front.id).find((note) => note.sourceNoteId === sourceNoteId)!;
    const backFixed = notesOf(fixed, back.id).find((note) => note.sourceNoteId === sourceNoteId)!;
    expect(backFixed.originalPitch).toBe(backPiece.pitch);
    const frontRange = { start: front.start, end: back.start };
    const backRange = { start: back.start, end: back.start + back.duration };
    const expectsOwnPitch = (next: CorrectionModel, label: string) => {
      const pieces = next.notes.filter((note) => note.sourceNoteId === sourceNoteId);
      expect(pieces.length, label).toBeGreaterThan(0);
      for (const piece of pieces) {
        // Time decides which original fragment it belongs to: the front card's range or the back card's.
        const fromFront = piece.start >= frontRange.start - 1e-6 && piece.start < frontRange.end - 1e-6;
        const fromBack = piece.start >= backRange.start - 1e-6 && piece.start < backRange.end - 1e-6;
        expect(fromFront || fromBack, `${label}: ${piece.start} is outside both original ranges`).toBe(true);
        const want = fromFront ? frontPiece : backFixed;
        expect(piece.pitch, `${label}: ${piece.start} pitch`).toBe(want.pitch);
        expect(piece.originalPitch, `${label}: ${piece.start} originalPitch`).toBe(want.originalPitch);
      }
      assertFragments(next);
    };
    expectsOwnPitch(deleteCard(fixed, back.id, "extend-previous").model, "delete back");
    expectsOwnPitch(deleteCard(fixed, front.id, "extend-next").model, "delete front");
    const merged = mergeWithNext(fixed, front.id);
    expect(merged.changed).toBe(true);
    expectsOwnPitch(merged.model, "merge");
    const split = splitCard(merged.model, front.id);
    expect(split.changed).toBe(true);
    expectsOwnPitch(split.model, "split");
  });

  it("saves without the deleted card and without used:false notes (§5-9)", () => {
    const model = fresh("plain-8");
    const timeline = inputs.get("plain-8")!.result.fullTimeline;
    const [, b] = model.cards;
    const out = deleteCard(model, b!.id, "extend-previous").model;
    const saved = buildSaveCandidate(out, { startBar: 1, endBar: Math.ceil(out.totalBeats / out.context.meter) }, timeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.cardIds).toHaveLength(out.cards.length);
    expect(saved.cardIds).not.toContain(b!.id);
    for (const [index, card] of out.cards.entries()) {
      const used = new Set(out.notes.filter((note) => note.cardId === card.id && note.used).map((note) => note.pitch));
      const item = saved.candidate.chords[index]!;
      const notes = item.voicingMemory?.practiceVoicingOverride?.midiNotes ?? item.voicingMemory?.sourceVoicing?.midiNotes ?? [];
      expect(notes.every((pitch) => used.has(pitch)), `${card.id}: ${notes.join(",")} / ${[...used].join(",")}`).toBe(true);
    }
  });

  it("plays no used:false notes in the card or the song (§5-10)", () => {
    const model = fresh("plain-8");
    const timeline = inputs.get("plain-8")!.result.fullTimeline;
    const [, b] = model.cards;
    const out = deleteCard(model, b!.id, "extend-previous").model;
    const card = out.cards[0]!;
    const cardUsed = new Set(out.notes.filter((note) => note.cardId === card.id && note.used).map((note) => note.pitch));
    const audition = cardAuditionNotes(out, card, timeline);
    expect(audition.length).toBeGreaterThan(0);
    expect(audition.every((pitch) => cardUsed.has(pitch)), `card ${audition.join(",")}`).toBe(true);
    const song = songPlaybackNotes(out, timeline, 0, 120);
    const allUsed = new Set(out.notes.filter((note) => note.used).map((note) => note.pitch));
    expect(song.length).toBeGreaterThan(0);
    expect(song.every((note) => allUsed.has(note.pitch)), `song ${[...new Set(song.map((note) => note.pitch))].join(",")}`).toBe(true);
  });

  it("keeps the deleted range unused through split, merge and boundary, then saves (§5-11)", () => {
    const model = fresh("melody-track-8");
    const pair = crossingPair(model);
    expect(pair).toBeDefined();
    const { front, back, sourceNoteId } = pair!;
    const own = notesOf(model, back.id).find((note) => note.sourceNoteId !== sourceNoteId);
    expect(own).toBeDefined();
    const deletedStart = back.start;
    const deletedEnd = back.start + back.duration;
    const deletedSources = new Set(notesOf(model, back.id).map((note) => note.sourceNoteId!));
    let current = deleteCard(model, back.id, "extend-previous").model;
    const states: CorrectionModel[] = [current];
    const check = (next: CorrectionModel, label: string) => {
      for (const note of next.notes) {
        if (!deletedSources.has(note.sourceNoteId!)) continue;
        if (note.start < deletedStart - 1e-6 || note.start >= deletedEnd - 1e-6) continue;
        expect(note.used, `${label}: ${note.sourceNoteId}@${note.start}`).toBe(false);
      }
      assertFragments(next);
    };
    check(current, "delete");
    const stay = current.cards.find((card) => card.id === front.id)!;
    const split = splitCard(current, stay.id);
    if (split.changed) { current = split.model; states.push(current); check(current, "split"); }
    const target = current.cards.find((card) => card.start >= deletedStart - 1e-6) ?? current.cards[current.cards.length - 1]!;
    const merged = mergeWithNext(current, target.id);
    if (merged.changed) { current = merged.model; states.push(current); check(current, "merge"); }
    const boundary = current.cards.find((card) => card.id === front.id) ?? current.cards[0]!;
    const moved = moveBoundary(current, boundary.id, boundary.start + 1);
    if (moved.changed) { current = moved.model; states.push(current); check(current, "boundary"); }
    const timeline = inputs.get("melody-track-8")!.result.fullTimeline;
    const saved = buildSaveCandidate(current, { startBar: 1, endBar: Math.ceil(current.totalBeats / current.context.meter) }, timeline);
    expect(saved.ok).toBe(true);
    let history = startHistory(states[0]!);
    for (const state of states.slice(1)) history = commitEdit(history, { changed: true, label: "x", model: state });
    for (let step = states.length - 1; step > 0; step -= 1) {
      history = undo(history);
      expect(history.present).toEqual(states[step - 1]);
      check(history.present, `undo ${step}`);
    }
    for (let step = 1; step < states.length; step += 1) {
      history = redo(history);
      expect(history.present).toEqual(states[step]);
      check(history.present, `redo ${step}`);
    }
  });

  it("splits the three boundary kinds with the remaining side unchanged (§5-12)", () => {
    const model = boundaryModel();
    const kinds = threeKinds(model);
    expect(kinds).toBeDefined();
    const { previous, middle, next, fromPrevious, toNext, both } = kinds!;
    const deletedStart = middle.start;
    const deletedEnd = middle.start + middle.duration;
    for (const mode of ["extend-previous", "extend-next"] as const) {
      const out = deleteCard(model, middle.id, mode).model;
      for (const id of [fromPrevious, toNext, both]) {
        const before = model.notes.filter((note) => note.sourceNoteId === id);
        const pieces = out.notes.filter((note) => note.sourceNoteId === id);
        expect(pieces.length, `${mode} ${id}`).toBeGreaterThan(0);
        for (const piece of pieces) {
          const inside = piece.start >= deletedStart - 1e-6 && piece.start + piece.duration <= deletedEnd + 1e-6;
          if (inside) {
            expect(piece.used, `${mode} ${id} inside ${piece.start}`).toBe(false);
          } else {
            const old = before.find((note) => note.start <= piece.start + 1e-6 && note.start + note.duration >= piece.start + piece.duration - 1e-6);
            expect(piece.used, `${mode} ${id} outside ${piece.start}`).toBe(old?.used ?? piece.used);
          }
        }
      }
      assertFragments(out);
      void (mode === "extend-previous" ? previous : next);
    }
  });
});

function crossingPair(model: CorrectionModel) {
  const byCard = notesByCard(model.notes);
  for (let index = 0; index + 1 < model.cards.length; index += 1) {
    const front = model.cards[index]!;
    const back = model.cards[index + 1]!;
    const shared = (byCard.get(front.id) ?? []).find((note) => (byCard.get(back.id) ?? []).some((other) => other.sourceNoteId === note.sourceNoteId));
    if (shared?.sourceNoteId) return { front, back, sourceNoteId: shared.sourceNoteId };
  }
  return undefined;
}

function threeKinds(model: CorrectionModel) {
  const byCard = notesByCard(model.notes);
  const ids = (cardId: string) => new Set((byCard.get(cardId) ?? []).map((note) => note.sourceNoteId!));
  for (let index = 1; index + 1 < model.cards.length; index += 1) {
    const previous = model.cards[index - 1]!;
    const middle = model.cards[index]!;
    const next = model.cards[index + 1]!;
    const p = ids(previous.id), m = ids(middle.id), n = ids(next.id);
    const fromPrevious = [...p].find((id) => m.has(id) && !n.has(id));
    const toNext = [...n].find((id) => m.has(id) && !p.has(id));
    const both = [...m].find((id) => p.has(id) && n.has(id));
    if (fromPrevious && toNext && both) return { previous, middle, next, fromPrevious, toNext, both };
  }
  return undefined;
}

/** Three cards and the three kinds of note that cross the middle card's boundaries. */
function boundaryModel(): CorrectionModel {
  const base = fresh("plain-8");
  const meter = base.context.meter;
  const cards: CorrectionCard[] = [1, 2, 3].map((bar) => ({
    ...base.cards[0]!,
    id: `b${bar}`,
    start: (bar - 1) * meter,
    duration: meter,
    bar,
    beat: 1,
    timelineIndex: bar - 1,
    reviewReasons: [],
    reviewed: true,
    attacks: 1,
    edited: false,
    nameSource: "auto",
  }));
  const sources: SourceNoteRef[] = [
    { id: "from", pitch: 60, start: 2, end: 6 },
    { id: "next", pitch: 64, start: 6, end: 10 },
    { id: "both", pitch: 67, start: 2, end: 10 },
    { id: "own", pitch: 69, start: 4, end: 8 },
  ];
  const notes: CorrectionNote[] = cards.flatMap((card) => sources.filter((source) => source.start < card.start + card.duration && source.end > card.start).map((source) => {
    const start = Math.max(source.start, card.start);
    return { id: `${source.id}@${card.id}`, provenance: "SOURCE" as const, sourceNoteId: source.id, cardId: card.id, pitch: source.pitch, start, duration: Math.min(source.end, card.start + card.duration) - start, continuesFromBefore: source.start < card.start, used: true };
  }));
  return { ...base, cards, notes, totalBeats: 3 * meter, context: { ...base.context, sourceNotes: sources } };
}
