// Jazz Progressions: every card is read by the app's own chord-name reader and passes the app's own judge.
// Stage 00: copy next to jazzProgressions.json (src/domain/chordDojo/), run with vitest, then remove (do not commit).
// Stage 02: keep it as a real test.
import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { judgeChord } from "./judging";
import data from "./jazzProgressions.json";

type Card = { label: string; parseLabel: string; display: string; expectedPitches: number[] };
const cards = (data as { progressions: { id: string; events: Card[] }[] }).progressions.flatMap((p) =>
  p.events.map((e, i) => ({ where: `${p.id} #${i + 1} ${e.display}`, ...e })),
);

describe("Jazz Progressions — app reader and judge", () => {
  it("has 56 cards", () => expect(cards.length).toBe(56));
  it.each(cards)("$where", (c) => {
    const chord = parseTextChordLabel(c.parseLabel);
    expect(chord, `${c.parseLabel} is not read`).toBeTruthy();
    for (const judge of ["core", "shape"] as const) {
      const verdict = judgeChord({ notes: c.expectedPitches, chord, judge, bass: "self" } as never, c.expectedPitches);
      expect(verdict.ok, `${judge}: ${(verdict as { message?: string }).message ?? ""}`).toBe(true);
    }
  });
});
