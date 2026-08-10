import { describe, expect, it } from "vitest";
import { parseChordLabel } from "./chords";
import {
  createTextProgressionStyleSnapshot,
  isTextProgressionStyleSnapshot,
  textProgressionStyleFromSnapshot,
  textProgressionVoicingNotes,
} from "./textProgressionVoicing";

describe("textProgressionVoicing", () => {
  it("generates deterministic selectable voicings that differ from the close default", () => {
    const chord = parseChordLabel("Cmaj7")!;
    const close = textProgressionVoicingNotes(chord, "generated-close");
    const shell = textProgressionVoicingNotes(chord, "shell-17");
    const open = textProgressionVoicingNotes(chord, "open-17");
    const rootless = textProgressionVoicingNotes(chord, "rootless-ab");

    expect(close).toBeDefined();
    expect(shell).toBeDefined();
    expect(open).toBeDefined();
    expect(rootless).toBeDefined();
    expect(new Set([close!.join(","), shell!.join(","), open!.join(","), rootless!.join(",")]).size)
      .toBeGreaterThan(1);
    expect(textProgressionVoicingNotes(chord, "shell-17")).toEqual(shell);
  });

  it("returns unavailable instead of silently falling back for an unsupported rootless triad", () => {
    expect(textProgressionVoicingNotes(parseChordLabel("C")!, "rootless-ab")).toBeUndefined();
  });

  it("recognizes only exact verified text-style snapshots", () => {
    const chord = parseChordLabel("Dm7")!;
    const snapshot = createTextProgressionStyleSnapshot(chord, "open-17")!;

    expect(snapshot).toMatchObject({
      source: "manual",
      representation: "simultaneous-voicing",
      userVerified: true,
      extractorVersion: "text-style-v1:open-17",
    });
    expect(textProgressionStyleFromSnapshot(snapshot, chord)).toBe("open-17");
    expect(isTextProgressionStyleSnapshot(snapshot, chord)).toBe(true);
    expect(isTextProgressionStyleSnapshot({
      ...snapshot,
      midiNotes: [...snapshot.midiNotes.slice(0, -1), snapshot.midiNotes[snapshot.midiNotes.length - 1]! + 1],
    }, chord)).toBe(false);
    expect(isTextProgressionStyleSnapshot({ ...snapshot, extractorVersion: "unknown" }, chord))
      .toBe(false);
    expect(isTextProgressionStyleSnapshot({
      ...snapshot,
      sourcePath: "private-source.mid",
    } as typeof snapshot, chord)).toBe(false);
    expect(isTextProgressionStyleSnapshot({ ...snapshot, bassNote: snapshot.midiNotes[1] }, chord))
      .toBe(false);
  });
});
