import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { parseChordLabel } from "../chords";
import { chooseName, mergeWithNext, moveBoundary, splitCard } from "./cardEdits";
import { buildCorrectionModel, type CorrectionModel } from "./correctionModel";
import { addNote, deleteNotes, effectiveTempo, PLAYER_DEFAULT_BPM, setTempo } from "./edits";
import { commitEdit, editKindCounts, startHistory, undo } from "./history";
import { reviewThresholds } from "./reviewThresholds";
import { buildSaveCandidate } from "./saveCandidate";

/** P10.1 §11 (names follow the notes by where they came from) and §12 (the tempo). */

const input = analyzeScenario(p10Scenario("plain-8"));
const fresh = (): CorrectionModel => buildCorrectionModel(input, reviewThresholds);
const chord = (label: string) => parseChordLabel(label)!;
const used = (model: CorrectionModel, cardId: string) => model.notes.filter((note) => note.cardId === cardId && note.used);
const card = (model: CorrectionModel, id: string) => model.cards.find((entry) => entry.id === id)!;

describe("names follow the notes (P10.1 §11.2)", () => {
  it("automatic: a note edit renames from the notes", () => {
    const out = addNote(fresh(), "card-0", 70).model; // C E G + Bb
    expect(card(out, "card-0")).toMatchObject({ nameSource: "auto" });
    expect(card(out, "card-0").name.label).toMatch(/^C7/);
  });

  it("chosen: turns automatic and follows the notes after a note edit, a boundary, a merge and a split", () => {
    const chosen = (model: CorrectionModel) => chooseName(model, "card-0", chord("Em"), "chosen").model;
    const afterNote = addNote(chosen(fresh()), "card-0", 70).model;
    expect(card(afterNote, "card-0")).toMatchObject({ nameSource: "auto" });
    expect(card(afterNote, "card-0").name.label).not.toBe("Em");
    const afterBoundary = moveBoundary(chosen(fresh()), "card-0", 3).model;
    expect(card(afterBoundary, "card-0")).toMatchObject({ nameSource: "auto" });
    expect(card(afterBoundary, "card-0").name.label).not.toBe("Em");
    const afterSplit = splitCard(chosen(fresh()), "card-0").model;
    expect(afterSplit.cards.slice(0, 2).every((entry) => entry.nameSource === "auto" && entry.name.label !== "Em")).toBe(true);
    const afterMerge = mergeWithNext(chosen(fresh()), "card-0").model; // C + Am together
    expect(card(afterMerge, "card-0")).toMatchObject({ nameSource: "auto" });
  });

  it("typed: stays through a note edit, a split and a merge, with the notes' reading offered", () => {
    const typed = chooseName(fresh(), "card-0", chord("Em"), "typed").model;
    const afterNote = addNote(typed, "card-0", 70).model;
    expect(card(afterNote, "card-0")).toMatchObject({ nameSource: "typed", name: chord("Em") });
    expect(card(afterNote, "card-0").suggestedName?.label).toMatch(/^C7/);
    const afterSplit = splitCard(typed, "card-0").model;
    expect(afterSplit.cards.slice(0, 2).every((entry) => entry.nameSource === "typed" && entry.name.label === "Em")).toBe(true);
    const afterMerge = mergeWithNext(typed, "card-0").model;
    expect(card(afterMerge, "card-0")).toMatchObject({ nameSource: "typed", name: chord("Em") });
    // Taking the suggestion makes it automatic again.
    const taken = chooseName(afterNote, "card-0", card(afterNote, "card-0").suggestedName!, "auto").model;
    expect(card(taken, "card-0")).toMatchObject({ nameSource: "auto" });
    expect(card(taken, "card-0").suggestedName).toBeUndefined();
  });

  it("when the notes read as no chord the name stays, marked, and the mark goes once they read again", () => {
    const model = fresh();
    const notes = used(model, "card-1");
    const thin = deleteNotes(model, notes.slice(1).map((note) => note.id)).model;
    expect(card(thin, "card-1")).toMatchObject({ name: card(model, "card-1").name, nameUnreadable: true });
    const back = addNote(addNote(thin, "card-1", 64).model, "card-1", 67).model;
    expect(card(back, "card-1").nameUnreadable).toBeUndefined();
  });

  it("Ctrl+Z brings the name back with the notes", () => {
    const model = fresh();
    let history = startHistory(chooseName(model, "card-0", chord("Em"), "chosen").model);
    history = commitEdit(history, addNote(history.present, "card-0", 70));
    expect(card(history.present, "card-0").nameSource).toBe("auto");
    history = undo(history);
    expect(card(history.present, "card-0")).toMatchObject({ nameSource: "chosen", name: chord("Em") });
  });

  it("saving treats chosen and typed names alike, as a person's name", () => {
    for (const source of ["chosen", "typed"] as const) {
      const model = chooseName(fresh(), "card-1", chord("Am7"), source).model;
      const result = buildSaveCandidate(model, { startBar: 1, endBar: 8 }, input.result.fullTimeline);
      if (!result.ok) throw new Error("save");
      expect(result.editable.slots[1]!.edited).toBe(true);
      expect(result.candidate.chords[1]!.chord.label).toBe("Am7");
    }
  });
});

describe("the workspace tempo (P10.1 §12)", () => {
  it("is the MIDI's, or the player's 96 without one; 40–240 whole numbers; an undoable edit", () => {
    const model = fresh();
    expect(effectiveTempo(model)).toBe(120);
    expect(effectiveTempo({ bpm: undefined })).toBe(PLAYER_DEFAULT_BPM);
    expect(setTempo(model, 39).changed).toBe(false);
    expect(setTempo(model, 241).changed).toBe(false);
    expect(setTempo(model, 100.5).changed).toBe(false);
    expect(setTempo(model, 120).changed).toBe(false);
    const out = setTempo(model, 100);
    expect(out).toMatchObject({ changed: true, label: "テンポを 120 → 100", kind: "tempo" });
    expect(effectiveTempo(out.model)).toBe(100);
    let history = commitEdit(startHistory(model), out);
    expect(editKindCounts(history)).toMatchObject({ tempo: 1 });
    history = undo(history);
    expect(effectiveTempo(history.present)).toBe(120);
    // Back to the MIDI's tempo is no change of tempo at all.
    expect(setTempo(out.model, 120).model.tempo).toBeUndefined();
  });

  it("goes with the save only when a person set it", () => {
    const model = fresh();
    const plain = buildSaveCandidate(model, { startBar: 1, endBar: 8 }, input.result.fullTimeline);
    const changed = buildSaveCandidate(setTempo(model, 100).model, { startBar: 1, endBar: 8 }, input.result.fullTimeline);
    expect(plain.ok).toBe(true);
    expect(plain.ok ? plain.bpm : "failed").toBeUndefined();
    expect(changed.ok && changed.bpm).toBe(100);
    expect(changed.ok && changed.userEdited).toBe(true);
  });
});
