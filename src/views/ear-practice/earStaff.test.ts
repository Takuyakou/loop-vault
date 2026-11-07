import { describe, expect, it } from "vitest";
import { chordFromDegreeToken } from "../../domain/earPractice/spelling";
import { voiceForEar } from "../../domain/earPractice/voicing";
import { chordSnapshot } from "./earStaff";

/** The notes on the practice staff (the answer and the sounded chord) are spelled from the chord's degrees for mMaj7 and 7alt. */
const written = (token: string, tonic: number, mode: "major" | "minor" = "major") => {
  const symbol = chordFromDegreeToken(token, tonic, mode);
  const snapshot = chordSnapshot("t", symbol, voiceForEar(symbol), tonic, mode)!;
  return snapshot.notes.map((note) => `${note.spelling.step}${note.spelling.alter}`).sort();
};

describe("練習中の楽譜(earStaff)でも、mMaj7 と 7alt は度数で綴る", () => {
  it("GmMaj7 は G B♭ D F♯", () => expect(written("ImMaj7", 7, "minor")).toEqual(["B-1", "D0", "F1", "G0"]));
  it("G7alt は G B F A♭ E♭", () => expect(written("I7alt", 7)).toEqual(["A-1", "B0", "E-1", "F0", "G0"]));
  it("A♭7alt は A♭ C G♭ B𝄫 F♭(B は −2)", () => expect(written("I7alt", 8)).toEqual(["A-1", "B-2", "C0", "F-1", "G-1"]));
  it("B7alt は B D♯ A C G", () => expect(written("I7alt", 11)).toEqual(["A0", "B0", "C0", "D1", "G0"]));
  it("ほかのコードの綴りは今までどおり(B♭7 の A♭)", () => expect(written("I7", 10)).toContain("A-1"));
});
