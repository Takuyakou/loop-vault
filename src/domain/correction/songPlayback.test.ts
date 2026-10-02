import { describe, expect, it } from "vitest";
import type { MidiPreviewNote } from "../../audio/chordPreview";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { parseChordLabel } from "../chords";
import { chooseName, mergeWithNext, moveBoundary, splitCard } from "./cardEdits";
import { buildCorrectionModel, type CorrectionModel } from "./correctionModel";
import { addNote, deleteNotes, movePitch } from "./edits";
import { reviewThresholds } from "./reviewThresholds";
import { cardAuditionNotes } from "./saveCandidate";
import { songClicks, songPlaybackNotes } from "./songPlayback";

/** P10.2 §2 (the song plays the workspace's notes) and §6 (the header's metronome in song playback). */

const input = analyzeScenario(p10Scenario("melody-track-8"));
const timeline = input.result.fullTimeline;
const fresh = (): CorrectionModel => buildCorrectionModel(input, reviewThresholds);
const CLICKS = new Set([84, 96]);

/** The notes each card plays in the song, keyed by the card's (shifted) start. */
function soundsByStart(notes: readonly MidiPreviewNote[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const note of notes.filter((entry) => entry.velocity !== 46)) out.set(note.startBeat, [...(out.get(note.startBeat) ?? []), note.pitch]);
  return out;
}

function expectCardsPlayTheirB(model: CorrectionModel, fromBeat = 0) {
  const sounds = soundsByStart(songPlaybackNotes(model, timeline, fromBeat, 120));
  const playing = model.cards.filter((card) => card.start + card.duration > fromBeat);
  expect(sounds.size).toBe(playing.length);
  for (const card of playing) {
    const at = Math.max(card.start, fromBeat) - fromBeat;
    expect([...(sounds.get(at) ?? [])].sort((a, b) => a - b), `${card.bar}.${card.beat}`)
      .toEqual([...cardAuditionNotes(model, card, timeline)].sort((a, b) => a - b));
  }
}

describe("the song plays the workspace's notes (P10.2 §2)", () => {
  it("every card plays its 「B カードの音」, the whole song and from the middle", () => {
    expectCardsPlayTheirB(fresh());
    expectCardsPlayTheirB(fresh(), fresh().cards[3]!.start);
    expectCardsPlayTheirB(fresh(), fresh().cards[3]!.start + 1); // a card sounding at the start is clipped to begin there
  });

  it("still matches B after removing, adding, moving notes, a boundary, a merge and a split", () => {
    let model = fresh();
    const melody = model.suggestions.find((entry) => entry.kind === "melody-voice");
    if (melody?.kind === "melody-voice") model = deleteNotes(model, melody.noteIds).model;
    model = addNote(model, model.cards[0]!.id, 71).model;
    const low = model.notes.filter((note) => note.cardId === model.cards[2]!.id && note.used).sort((a, b) => a.pitch - b.pitch)[0]!;
    model = movePitch(model, [low.id], 12).model;
    model = moveBoundary(model, model.cards[1]!.id, model.cards[1]!.start + model.cards[1]!.duration - 1).model;
    model = mergeWithNext(model, model.cards[4]!.id).model;
    model = splitCard(model, model.cards[5]!.id).model;
    model = chooseName(model, model.cards[6]!.id, parseChordLabel("Fmaj7")!).model;
    expectCardsPlayTheirB(model);
    expectCardsPlayTheirB(model, model.cards[2]!.start);
    // A removed note is not played.
    const removed = model.notes.find((note) => !note.used && note.cardId === model.cards[0]!.id);
    if (removed) expect(soundsByStart(songPlaybackNotes(model, timeline, 0, 120)).get(model.cards[0]!.start)).not.toContain(removed.pitch);
  });

  it("starts at beat 0 from where it was asked to, with no clicks unless the metronome is on", () => {
    const model = fresh();
    const from = model.cards[2]!.start;
    const notes = songPlaybackNotes(model, timeline, from, 120);
    expect(Math.min(...notes.map((note) => note.startBeat))).toBe(0);
    expect(notes.some((note) => note.velocity === 46)).toBe(false);
  });
});

describe("the metronome in song playback (P10.2 §6)", () => {
  it("clicks every beat to the end of the song, the bar head counted in the song's bars", () => {
    const model = fresh();
    const notes = songPlaybackNotes(model, timeline, 0, 120, true);
    const clicks = notes.filter((note) => note.velocity === 46);
    const end = Math.max(...model.cards.map((card) => card.start + card.duration));
    expect(clicks).toHaveLength(Math.ceil(end));
    expect(clicks.every((click) => CLICKS.has(click.pitch))).toBe(true);
    expect(clicks.filter((click) => click.pitch === 96).map((click) => click.startBeat)).toEqual(Array.from({ length: Math.ceil(end / 4) }, (_, bar) => bar * 4));
  });

  it("from the middle of a bar, the first click is on the next beat and the accents stay on the song's bar heads", () => {
    // 4/4 from beat 9.5: clicks at song beats 10, 11, 12 (bar 4's head), … → 0.5, 1.5, 2.5 (accent), …
    const clicks = songClicks(9.5, 16, 4);
    expect(clicks.map((click) => click.startBeat)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
    expect(clicks.map((click) => click.pitch)).toEqual([84, 84, 96, 84, 84, 84]);
  });

  it("counts 3/4 in threes", () => {
    const clicks = songClicks(3, 9, 3);
    expect(clicks.map((click) => [click.startBeat, click.pitch])).toEqual([[0, 96], [1, 84], [2, 84], [3, 96], [4, 84], [5, 84]]);
  });
});
