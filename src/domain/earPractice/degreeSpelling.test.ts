import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { targetSnapshot, writtenMidi, type WrittenPitch } from "../chordDojo/targetSnapshot";
import { degreeSpelledPitch } from "./degreeSpelling";
import { keySpelling } from "./keys";
import { chordFromDegreeToken } from "./spelling";
import { voiceForEar } from "./voicing";

const name = (pitch: WrittenPitch) => `${pitch.step}${pitch.alter <= -2 ? "𝄫" : pitch.alter === -1 ? "♭" : pitch.alter === 1 ? "♯" : pitch.alter >= 2 ? "𝄪" : ""}`;
/** The names of the notes of a chord at a given pitch class order from the root (lowest first). */
const spelled = (label: string, notes: number[]) => {
  const symbol = parseTextChordLabel(label)!;
  return [...new Set(notes)].sort((a, b) => a - b).map((midi) => name(degreeSpelledPitch(symbol, midi)!));
};

describe("mMaj7 と 7alt を度数で綴る(spellMidi は変えない)", () => {
  it("GmMaj7 → G B♭ D F♯", () => {
    expect(spelled("GmMaj7", [43, 46, 50, 54])).toEqual(["G", "B♭", "D", "F♯"]);
  });
  it("G7alt → G B F A♭ E♭", () => {
    expect(spelled("G7alt", [43, 47, 53, 56, 63]).sort()).toEqual(["A♭", "B", "E♭", "F", "G"]);
  });
  it("A♭7alt → A♭ C G♭ B𝄫 F♭(♭9 は B𝄫、♭13 は F♭)", () => {
    expect(spelled("Ab7alt", [44, 48, 54, 57, 64]).sort()).toEqual(["A♭", "B𝄫", "C", "F♭", "G♭"].sort());
  });
  it("B7alt → B D♯ A C G", () => {
    expect(spelled("B7alt", [47, 51, 57, 60, 67]).sort()).toEqual(["A", "B", "C", "D♯", "G"]);
  });
  it("7alt の ♯9・♯11 も度数で綴る(3半音=♯9 は A♯、6半音=♯11 は C♯)", () => {
    const symbol = parseTextChordLabel("G7alt")!;
    expect(name(degreeSpelledPitch(symbol, 46 + 12)!)).toBe("A♯");
    expect(name(degreeSpelledPitch(symbol, 49 + 12)!)).toBe("C♯");
  });
  it("ほかのコードには手を出さない / スラッシュのベースは spellMidi に任せる", () => {
    expect(degreeSpelledPitch(parseTextChordLabel("G7")!, 43)).toBeUndefined();
    expect(degreeSpelledPitch(parseTextChordLabel("Cmaj7")!, 48)).toBeUndefined();
    const slash = chordFromDegreeToken("ImMaj7/IV", 0, "major");
    expect(slash.bass).toBe(5);
    expect(degreeSpelledPitch(slash, 41)).toBeUndefined();
    expect(degreeSpelledPitch(slash, 48)).toBeDefined();
  });

  for (const [tonic, mode] of [[0, "major"], [1, "major"], [2, "major"], [3, "major"], [4, "major"], [5, "major"], [6, "major"], [7, "major"], [8, "major"], [9, "major"], [10, "major"], [11, "major"],
    [0, "minor"], [3, "minor"], [4, "minor"], [6, "minor"], [9, "minor"], [11, "minor"]] as const) {
    for (const token of ["ImMaj7", "I7alt", "bIImMaj7", "V7alt", "bVI7alt"]) {
      it(`12のキー × ${token}(${tonic}・${mode}): 綴った音の高さが鳴らす音と一致し、度数ごとに文字が違う`, () => {
        const symbol = chordFromDegreeToken(token, tonic, mode);
        const notes = voiceForEar(symbol);
        const pitches = notes.map((midi) => degreeSpelledPitch(symbol, midi));
        pitches.forEach((pitch, i) => {
          expect(pitch, `${symbol.label} note ${notes[i]}`).toBeDefined();
          expect(writtenMidi(pitch!), `${symbol.label} ${name(pitch!)}`).toBe(notes[i]);
          expect(Math.abs(pitch!.alter)).toBeLessThanOrEqual(2);
        });
        // one letter for each degree: no two different pitch classes share a letter
        const byLetter = new Map<string, Set<number>>();
        pitches.forEach((pitch, i) => byLetter.set(pitch!.step, (byLetter.get(pitch!.step) ?? new Set()).add(((notes[i]! % 12) + 12) % 12)));
        for (const [letter, classes] of byLetter) expect(classes.size, `${symbol.label} ${letter}`).toBe(1);
        // the key's habit is not what decides it
        expect(["flat", "sharp"]).toContain(keySpelling(tonic, mode));
        // the snapshot used for the staff has the same spelling as the degrees
        const snapshot = targetSnapshot("t", symbol, notes, { hands: { left: [], right: notes } }, "b");
        expect(snapshot.notes.length).toBe(notes.length);
      });
    }
  }
});
