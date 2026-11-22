import { describe, expect, it, vi } from "vitest";
import { bankProgression } from "../../domain/earPractice/bank";
import { EarSession } from "../../domain/earPractice/earSession";
import { buildBankQuestion } from "../../domain/earPractice/question";
import { answerListenNotes, playAnswerListen, type EarPlayHandle } from "./earPlayback";

const answer = [60, 64, 67];

describe("the ways one answer can be heard (P23-22 J3)", () => {
  it("C4 sounds only the lowest note for 「ベースだけ」", () => {
    const { notes, endBeat } = answerListenNotes(answer, "bass", { chordBeats: 2 });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.pitch).toBe(60);
    expect(notes[0]?.startBeat).toBe(0);
    expect(notes[0]?.durationBeats).toBe(2);
    expect(endBeat).toBe(2);
  });

  it("C4 sounds the notes one at a time from the bottom for 「ばらして聴く」", () => {
    const { notes, endBeat } = answerListenNotes(answer, "spread", { chordBeats: 2 });
    expect(notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(notes.map((note) => note.startBeat)).toEqual([0, 1, 2]);
    expect(notes.every((note) => note.durationBeats < 1)).toBe(true);
    expect(endBeat).toBe(3);
  });

  it("C4 still sounds the whole chord when asked", () => {
    const { notes, endBeat } = answerListenNotes(answer, "chord", { chordBeats: 2 });
    expect(notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(notes.map((note) => note.startBeat)).toEqual([0, 0, 0]);
    expect(endBeat).toBe(2);
  });

  it("C4 counts no listen when the shapes are sounded through the answer helper", () => {
    const session = new EarSession({ question: buildBankQuestion(bankProgression("L1-4-01")!, 0), showFirstName: false });
    session.startPlaying();
    const play = vi.fn<(id: string, notes: { pitch: number }[], endBeat: number) => EarPlayHandle>(() => ({
      started: Promise.resolve(undefined),
      ended: Promise.resolve("completed"),
    }));
    playAnswerListen(play, "ear:answer:bass", answer, "bass", { chordBeats: 2 });
    playAnswerListen(play, "ear:answer:spread", answer, "spread", { chordBeats: 2 });
    expect(play).toHaveBeenCalledTimes(2);
    expect(play.mock.calls[1]![1].map((note: { pitch: number }) => note.pitch)).toEqual([60, 64, 67]);
    expect(session.listens).toBe(0);
    expect(session.current.listens).toBe(0);
  });
});
