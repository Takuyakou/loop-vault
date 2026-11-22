import { describe, expect, it } from "vitest";
import { LV4_CONNECTION_SAME_DAY, LV4_DELAY, LV4_DEMO, LV4_ITEMS, LV4_SAME_DAY, LV4_SLASH_SAME_DAY, lv4ItemById } from "./lv4";
import { judgeAdvancedChord, judgeProgression, judgeSingleChord } from "./judge";

describe("P23-54 Lv4: slash chords and connections", () => {
  it("keeps 20 same-day and 10 delayed questions under the P23-45 ids", () => {
    expect(LV4_SAME_DAY).toHaveLength(20);
    expect(LV4_DELAY).toHaveLength(10);
    expect(LV4_ITEMS).toHaveLength(30);
    expect(new Set(LV4_ITEMS.map((item) => item.id)).size).toBe(30);
    expect(LV4_SAME_DAY[0]!.id).toBe("lv4-sd-C-a");
    expect(LV4_DELAY[9]!.id).toBe("lv4-dl-Bbm7-b");
  });

  it("asks 12 slash chords and 8 connections on the same day, and opens each set with five slash chords", () => {
    expect(LV4_SLASH_SAME_DAY).toBe(12);
    expect(LV4_CONNECTION_SAME_DAY).toBe(8);
    for (const set of [LV4_SAME_DAY, LV4_DELAY]) {
      expect(set.slice(0, 5).every((item) => item.chords.length === 1 && item.chords[0]!.bassPitchClass !== undefined)).toBe(true);
    }
    expect(LV4_SAME_DAY.map((item) => item.label)).toEqual([
      "C/E", "G/B", "Am7/G", "D/F#", "F/G",
      "C → C/E → F", "Fmaj7/A", "Am7 → Am7/G → Fmaj7", "G7/F", "Cmaj7 → Am7",
      "Cm/E♭", "C → G/B → Am7", "E7/G#", "F → F/G → C", "B♭/D",
      "Fmaj7 → E7/G# → Am", "Dm7/C", "E♭ → B♭/D → Cm7", "Em/G", "F → Fm/A♭ → C/G",
    ]);
    expect(LV4_DELAY.map((item) => item.label)).toEqual([
      "A/C#", "E/G#", "B♭/F", "Gm7/F", "A♭/C",
      "A♭ → A♭/C → D♭", "E♭/F", "D → A/C# → Bm7", "B7/D#", "E♭maj7 → D7/F# → Gm",
    ]);
  });

  it("explains how a connection moves; a slash question needs no extra line", () => {
    expect(lv4ItemById("lv4-sd-C-a")!.detail).toBeUndefined();
    expect(lv4ItemById("lv4-sd-Cmaj7-a")!.label).toBe("E7/G#");
    expect(LV4_ITEMS.filter((item) => item.chords.length > 1).every((item) => (item.detail ?? "").length > 0)).toBe(true);
  });

  it("judges the bass of a slash chord and leaves the upper notes free", () => {
    const item = lv4ItemById("lv4-sd-C-a")!; // C/E
    expect(judgeSingleChord(item, item.chords[0]!.referenceNotes).ok).toBe(true);
    expect(judgeSingleChord(item, [40, 52, 55, 60]).ok).toBe(true); // E bass, E/G/C above
    expect(judgeSingleChord(item, [40, 55, 60, 64, 72]).ok).toBe(true); // a wider placement
    expect(judgeSingleChord(item, [40, 52, 55]).ok).toBe(false); // missing C
    expect(judgeSingleChord(item, [36, 52, 55, 60]).ok).toBe(false); // C bass instead of E
  });

  it("accepts an on-chord bass that is not a chord tone, and nothing else foreign", () => {
    const item = lv4ItemById("lv4-sd-Fmaj7-a")!; // F/G
    expect(item.label).toBe("F/G");
    expect(judgeSingleChord(item, [43, 60, 65, 69]).ok).toBe(true);
    expect(judgeSingleChord(item, [41, 60, 65, 69]).ok).toBe(false); // F bass: not F/G
    expect(judgeSingleChord(item, [43, 60, 65, 69, 71]).ok).toBe(false); // B is foreign
  });

  it("judges every chord of a connection in order", () => {
    const item = lv4ItemById("lv4-sd-Fmaj7-b")!; // C → C/E → F
    expect(item.label).toBe("C → C/E → F");
    expect(judgeProgression(item, item.chords.map((chord) => chord.referenceNotes)).ok).toBe(true);
    expect(judgeProgression(item, [[48, 60, 64, 67], [48, 60, 64, 67], [53, 60, 65, 69]]).ok).toBe(false); // C/E played with C in the bass
    expect(judgeProgression(item, [[48, 60, 64, 67], [52, 60, 67], [53, 60, 65, 69]]).ok).toBe(true);
  });

  it("plays each connection's example near the chord before (the C stays, the bass walks)", () => {
    const item = lv4ItemById("lv4-sd-Fmaj7-b")!;
    expect(item.chords.map((chord) => chord.referenceNotes)).toEqual([[48, 60, 64, 67], [52, 60, 67], [53, 60, 65, 69]]);
    for (const chord of LV4_ITEMS.flatMap((entry) => entry.chords)) {
      expect(judgeAdvancedChord(chord, chord.referenceNotes).ok, chord.label).toBe(true);
    }
  });

  it("keeps the examples out of the official sets", () => {
    expect(LV4_DEMO.map((item) => item.label)).toEqual(["Cm", "Cm", "C/E", "C → C/E → F"]);
    expect(LV4_DEMO.every((item) => item.setId === "demo")).toBe(true);
    expect(LV4_DEMO[1]!.chords[0]!.referenceNotes).not.toEqual(LV4_DEMO[0]!.chords[0]!.referenceNotes);
    expect(LV4_ITEMS.some((item) => item.id.startsWith("lv4-demo"))).toBe(false);
  });
});
