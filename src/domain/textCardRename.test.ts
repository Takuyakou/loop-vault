import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "./extendedTextProgression";
import { renameForNotes } from "./textCardRename";

const em7 = parseExtendedTextChordLabel("Em7")!;
// Em7 ① シェル: E2 D3 / G3 B3 (written here as the design's example, E G B D).
const shell = [40, 50, 55, 59];
// Em7 ② ルートレス: G B D F♯.
const rootless = [55, 59, 62, 66];
const without = (notes: readonly number[], pc: number) => notes.filter((note) => note % 12 !== pc);

describe("P25-04 C7: the six fixed examples (names written here, not taken from the detector)", () => {
  it("1: removing B keeps Em7", () => expect(renameForNotes(em7, shell, without(shell, 11))).toEqual({ kind: "keep" }));
  it("1: removing E keeps Em7", () => expect(renameForNotes(em7, shell, without(shell, 4))).toEqual({ kind: "keep" }));
  it("2: removing D renames to Em", () => {
    expect(renameForNotes(em7, shell, without(shell, 2))).toMatchObject({ kind: "rename", label: "Em" });
  });
  it("2: adding F♯ renames to Em9", () => {
    expect(renameForNotes(em7, shell, [...shell, 66])).toMatchObject({ kind: "rename", label: "Em9" });
  });
  it("1: ② without B keeps Em7 (F♯ was already sounding)", () => {
    expect(renameForNotes(em7, rootless, without(rootless, 11))).toEqual({ kind: "keep" });
  });
  it("3: two notes cannot be read and keep Em7", () => {
    expect(renameForNotes(em7, shell, [40, 50])).toEqual({ kind: "unread" });
  });
});
