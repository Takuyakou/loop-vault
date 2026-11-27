import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { buildShapeVoicing, pickShapeForm, placementNotes, type VoicingShapeOptions } from "../voicingShapes";
import {
  achievement, audibleBeat, cardAtBeat, createPlayAlongState, enterCard, judgeNotes, pausePlayAlong, resetPlayAlong, updateNotes,
  type PlayAlongCard, type PlayAlongMode, type PlayAlongState,
} from "./playAlong";

const chord = (label: string) => parseExtendedTextChordLabel(label)!;
const MS = 500; // 120 BPM
const card = (label: string, target: readonly number[], startBeat: number, durationBeats = 4): PlayAlongCard =>
  ({ startBeat, durationBeats, target, chord: chord(label) });
const shapeNotes = (label: string, options: Partial<VoicingShapeOptions>) =>
  placementNotes(pickShapeForm(buildShapeVoicing(chord(label), { shape: "shell", tension: false, spread: false, rootlessOrder: "auto", ...options }), "auto")!.staticChoice);

const CMAJ7 = [48, 52, 55, 59];
const DM7 = [50, 53, 57, 60];

function play(state: PlayAlongState, cards: readonly PlayAlongCard[], held: number[], nowMs: number, mode: PlayAlongMode = "exact", sustained: number[] = []) {
  return updateNotes(state, cards, { mode, held, sustained, nowMs, msPerBeat: MS, counting: true });
}

describe("P25-09 I3-1: the card is the one being heard", () => {
  it("uses the audio output time, not the transport's look-ahead", () => {
    const cards = [card("Cmaj7", CMAJ7, 0), card("Dm7", DM7, 4)];
    // The transport already scheduled beat 4 for an audio time 0.3s ahead: the ear is still in card 0.
    const beat = audibleBeat({ beat: 4, time: 10.3 }, 4, 10.0, 0, 120, 0.5);
    expect(beat).toBe(4);
    // The fallback while no pair arrived, and the clamp to the maximum extrapolation.
    expect(audibleBeat(undefined, 3.5, 0, 0, 120, 0.5)).toBe(3.5);
    expect(audibleBeat({ beat: 3, time: 10 }, 0, 12, 0, 120, 0.5)).toBe(3.5);
    expect(cardAtBeat(cards, 3.99)).toBe(0);
    expect(cardAtBeat(cards, audibleBeat({ beat: 3.8, time: 10.3 }, 0, 10, 0, 120, 0.5))).toBe(0);
    expect(cardAtBeat(cards, 4)).toBe(1);
  });
});

describe("P25-09 I3-5: 押さえ方どおり (exact)", () => {
  it("accepts the shape moved 0, ±1 or ±2 octaves", () => {
    const target = card("Cmaj7", CMAJ7, 0);
    for (const shift of [0, 12, -12, 24, -24]) {
      expect(judgeNotes({ mode: "exact", card: target, held: CMAJ7.map((n) => n + shift), sustained: [] }).complete).toBe(true);
    }
    expect(judgeNotes({ mode: "exact", card: target, held: CMAJ7.map((n) => n + 7), sustained: [] }).complete).toBe(false);
  });

  it("picks one shift before colouring: [48,52,55] vs [48,64,79] → only 48 green, not achieved", () => {
    const judged = judgeNotes({ mode: "exact", card: card("C", [48, 52, 55], 0), held: [48, 64, 79], sustained: [] });
    expect(Object.fromEntries(judged.keys)).toEqual({ 48: "ok", 64: "wrong", 79: "wrong" });
    expect(judged.complete).toBe(false);
  });

  it("waits (green, no red) while notes are only missing", () => {
    const judged = judgeNotes({ mode: "exact", card: card("Cmaj7", CMAJ7, 0), held: [48, 52], sustained: [] });
    expect([...judged.keys.values()]).toEqual(["ok", "ok"]);
    expect(judged.complete).toBe(false);
  });
});

describe("P25-09 I3-6: コード一致 (chord)", () => {
  it("needs 3 and 7, lets the root and 5 go, and rejects an outside note", () => {
    const cm7 = card("Cm7", [48, 58, 63, 67], 0);
    expect(judgeNotes({ mode: "chord", card: cm7, held: [63, 70], sustained: [] }).complete).toBe(true);
    expect(judgeNotes({ mode: "chord", card: cm7, held: [63], sustained: [] }).complete).toBe(false);
    const wrong = judgeNotes({ mode: "chord", card: cm7, held: [63, 70, 64], sustained: [] });
    expect(wrong.complete).toBe(false);
    expect(wrong.keys.get(64)).toBe("wrong");
  });

  it("achieves the K shapes played as shown: ① シェル and ② ルートレス", () => {
    for (const shape of ["shell", "rootless", "triad", "quartal"] as const) {
      for (const label of ["Em7", "A7", "Dm7", "G7", "Cmaj7", "Fmaj7"]) {
        const notes = shapeNotes(label, { shape });
        expect(judgeNotes({ mode: "chord", card: card(label, notes, 0), held: notes, sustained: [] }).complete).toBe(true);
        expect(judgeNotes({ mode: "exact", card: card(label, notes, 0), held: notes, sustained: [] }).complete).toBe(true);
      }
    }
  });

  it("targets: ② is four left-hand notes, 広げる uses both hands, and a card falling back to ① keeps its root", () => {
    const rootless = buildShapeVoicing(chord("Dm7"), { shape: "rootless", tension: false, spread: false, rootlessOrder: "auto" });
    expect(rootless.oneHand).toBe(true);
    expect(pickShapeForm(rootless, "auto")!.staticChoice.left).toHaveLength(4);
    const spread = pickShapeForm(buildShapeVoicing(chord("Dm7"), { shape: "rootless", tension: false, spread: true, rootlessOrder: "auto" }), "auto")!.staticChoice;
    expect(spread.left.length).toBeGreaterThan(0);
    expect(spread.right.length).toBeGreaterThan(0);
    const fallback = buildShapeVoicing(chord("C"), { shape: "rootless", tension: false, spread: false, rootlessOrder: "auto" });
    expect(fallback.used.startsWith("shell")).toBe(true);
    const notes = placementNotes(pickShapeForm(fallback, "auto")!.staticChoice);
    expect(notes.some((note) => note % 12 === 0)).toBe(true);
    expect(judgeNotes({ mode: "exact", card: card("C", notes, 0), held: notes.filter((note) => note % 12 !== 0), sustained: [] }).complete).toBe(false);
  });

  it("a slash chord needs its bass lowest (C7alt/G and Cmaj7/G)", () => {
    const slash = card("Cmaj7/G", [43, 52, 59, 64], 0);
    expect(judgeNotes({ mode: "chord", card: slash, held: [43, 52, 59], sustained: [] }).complete).toBe(true);
    expect(judgeNotes({ mode: "chord", card: slash, held: [52, 55, 59], sustained: [] }).complete).toBe(false);
    const alt = card("C7alt/G", [43, 52, 58, 61], 0);
    expect(judgeNotes({ mode: "chord", card: alt, held: [43, 52, 58, 61], sustained: [] }).complete).toBe(true);
    expect(judgeNotes({ mode: "chord", card: alt, held: [52, 58, 61, 67], sustained: [] }).complete).toBe(false);
  });

  it("C5 needs both the root and the fifth", () => {
    const power = card("C5", [48, 55], 0);
    expect(judgeNotes({ mode: "chord", card: power, held: [48], sustained: [] }).complete).toBe(false);
    expect(judgeNotes({ mode: "chord", card: power, held: [55], sustained: [] }).complete).toBe(false);
    expect(judgeNotes({ mode: "chord", card: power, held: [48, 55], sustained: [] }).complete).toBe(true);
  });
});

describe("P25-09 I3-1..4 and the original rules: latch, grace, early chord, pedal", () => {
  const cards = [card("Cmaj7", CMAJ7, 0), card("Dm7", DM7, 4), card("Dm7", DM7, 8), { startBeat: 12, durationBeats: 4 }];

  it("latches a hit for the loop, settles a passed card as a miss, and skips rests", () => {
    let state = enterCard(createPlayAlongState(), cards, 0, 0, 0);
    state = play(state, cards, CMAJ7, 100).state;
    expect(state.results.get(0)).toBe("hit");
    state = play(state, cards, [], 1500).state;
    expect(state.results.get(0)).toBe("hit");
    state = enterCard(state, cards, 1, 0, 2000);
    state = enterCard(state, cards, 2, 0, 4000);
    expect(state.results.get(1)).toBe("miss");
    state = enterCard(state, cards, 3, 0, 6000);
    state = enterCard(state, cards, 0, 1, 8000);
    expect(state.previous.get(3)).toBeUndefined();
    expect(achievement(state, cards)).toEqual({ hit: 0, total: 3 });
  });

  it("the same chord again needs a new press (the pedal alone never achieves)", () => {
    let state = enterCard(createPlayAlongState(), cards, 1, 0, 2000);
    state = play(state, cards, DM7, 2100).state;
    expect(state.results.get(1)).toBe("hit");
    state = enterCard(state, cards, 2, 0, 4000);
    // Same keys still held / sustained: no new press since entry → not achieved.
    state = play(state, cards, [], 4050, "exact", DM7).state;
    expect(state.results.get(2)).toBeUndefined();
    state = play(state, cards, DM7, 4300, "exact").state;
    expect(state.results.get(2)).toBe("hit");
  });

  it("does not turn the previous card's notes red just after entry (I3-3)", () => {
    let state = enterCard(createPlayAlongState(), cards, 1, 0, 2000);
    const early = play(state, cards, [...DM7, 48], 2100);
    expect(early.judgement.keys.get(48)).toBeUndefined();
    expect(early.state.results.get(1)).toBe("hit");
    state = enterCard(createPlayAlongState(), cards, 1, 0, 2000);
    const late = play(state, cards, [...DM7, 48], 2600);
    expect(late.judgement.keys.get(48)).toBe("wrong");
    expect(late.state.results.get(1)).toBeUndefined();
  });

  it("counts a chord pressed just before the next card for that card (I3-2)", () => {
    let state = enterCard(createPlayAlongState(), cards, 0, 0, 0);
    state = play(state, cards, CMAJ7, 100).state;
    // 1900ms: inside card 0's last 150ms; Dm7's notes are not red there.
    const early = play(state, cards, DM7, 1900);
    expect([...early.judgement.keys.values()].includes("wrong")).toBe(false);
    state = enterCard(early.state, cards, 1, 0, 2000);
    state = play(state, cards, DM7, 2000).state;
    expect(state.results.get(1)).toBe("hit");
  });

  it("judges with pedal notes only when they are targets, never red for the rest (I3-4)", () => {
    const state = enterCard(createPlayAlongState(), cards, 1, 0, 2000);
    const judged = play(state, cards, [50, 53], 2600, "exact", [57, 60, 64]);
    expect(judged.judgement.keys.get(57)).toBe("ok");
    expect(judged.judgement.keys.get(64)).toBe("pedal");
    expect(judged.state.results.get(1)).toBe("hit");
  });

  it("colours only during the count-in (no result)", () => {
    const state = enterCard(createPlayAlongState(), cards, 0, 0, 0);
    const counting = updateNotes(state, cards, { mode: "exact", held: CMAJ7, sustained: [], nowMs: 10, msPerBeat: MS, counting: false });
    expect(counting.judgement.complete).toBe(true);
    expect(counting.state.results.size).toBe(0);
  });

  it("pause clears the current card only; stop clears everything; a range counts its own cards", () => {
    let state = enterCard(createPlayAlongState(), cards, 0, 0, 0);
    state = play(state, cards, CMAJ7, 100).state;
    state = enterCard(state, cards, 1, 0, 2000);
    state = play(state, cards, DM7, 2100).state;
    state = pausePlayAlong(state);
    expect(state.results.get(0)).toBe("hit");
    expect(state.results.get(1)).toBeUndefined();
    expect(achievement(state, cards, { first: 1, last: 2 })).toEqual({ hit: 0, total: 2 });
    expect(resetPlayAlong().results.size).toBe(0);
  });

  it("moves this loop's results to the previous loop, cleared as each card is entered again (I3-8)", () => {
    let state = enterCard(createPlayAlongState(), cards, 0, 0, 0);
    state = play(state, cards, CMAJ7, 100).state;
    state = enterCard(state, cards, 1, 0, 2000);
    state = enterCard(state, cards, 0, 1, 8000);
    expect(state.previous.get(0)).toBeUndefined();
    expect(state.previous.get(1)).toBe("miss");
    expect(state.results.size).toBe(0);
    state = enterCard(state, cards, 1, 1, 10000);
    expect(state.previous.get(1)).toBeUndefined();
  });

  it("leaves an unusable card out of the count", () => {
    expect(achievement(createPlayAlongState(), [card("C", [48, 52, 55], 0), { startBeat: 4, durationBeats: 4 }])).toEqual({ hit: 0, total: 1 });
  });
});
