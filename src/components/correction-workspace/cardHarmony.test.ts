import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import type { ChordSymbol } from "../../domain/types";
import { cardHarmony } from "./cardHarmony";

const card = (id: string, start: number, label: string) => ({ id, start, name: parseChordLabel(label)! });

const read = (cards: ReturnType<typeof card>[], key: string | undefined) =>
  [...cardHarmony(cards, key).entries()].map(([id, value]) => `${id}:${value.degree}:${value.role}`);

describe("the degree and the role of the cards (P23-14)", () => {
  it("A1 reads a Ⅱ–Ⅴ–Ⅰ in C major", () => {
    expect(read([card("a", 0, "Dm7"), card("b", 4, "G7"), card("c", 8, "Cmaj7")], "C major"))
      .toEqual(["a:Ⅱm7:SD", "b:Ⅴ7:D", "c:Ⅰmaj7:T"]);
  });

  it("A2 reads the cards in the order they sound, not the order they are listed", () => {
    expect(read([card("c", 8, "Cmaj7"), card("a", 0, "Dm7"), card("b", 4, "G7")], "C major"))
      .toEqual(["a:Ⅱm7:SD", "b:Ⅴ7:D", "c:Ⅰmaj7:T"]);
  });

  it("A3 draws nothing without a key or with one it cannot read", () => {
    const cards = [card("a", 0, "Dm7"), card("b", 4, "G7")];
    expect(cardHarmony(cards, undefined).size).toBe(0);
    expect(cardHarmony(cards, "H major").size).toBe(0);
  });

  it("A4 reads a Ⅰ–Ⅳ–Ⅴ–Ⅰ in A minor", () => {
    expect(read([card("a", 0, "Am7"), card("b", 4, "Dm7"), card("c", 8, "E7"), card("d", 12, "Am7")], "A minor"))
      .toEqual(["a:Ⅰm7:T", "b:Ⅳm7:SD", "c:Ⅴ7:D", "d:Ⅰm7:T"]);
  });

  it("A5 reads a Ⅱ–Ⅴ–Ⅰ in E flat major", () => {
    expect(read([card("a", 0, "Fm7"), card("b", 4, "Bb7"), card("c", 8, "Ebmaj7")], "Eb major"))
      .toEqual(["a:Ⅱm7:SD", "b:Ⅴ7:D", "c:Ⅰmaj7:T"]);
  });

  it("A6 reads a Ⅳ–Ⅴ–Ⅲ–Ⅵ in C major", () => {
    expect(read([card("a", 0, "Fmaj7"), card("b", 4, "G7"), card("c", 8, "Em7"), card("d", 12, "Am7")], "C major"))
      .toEqual(["a:Ⅳmaj7:SD", "b:Ⅴ7:D", "c:Ⅲm7:T", "d:Ⅵm7:T"]);
  });

  it("A7 reads a flat Ⅶ as a secondary dominant", () => {
    expect(read([card("a", 0, "Bb7"), card("b", 4, "C")], "C major"))
      .toEqual(["a:♭Ⅶ7:SDm", "b:Ⅰ:T"]);
  });

  it("A8 reads a key written without the word major", () => {
    expect(read([card("a", 0, "G7"), card("b", 4, "Cmaj7")], "C"))
      .toEqual(["a:Ⅴ7:D", "b:Ⅰmaj7:T"]);
  });

  it("A9 keeps the degree of a chord whose role cannot be read", () => {
    const power = { id: "a", start: 0, name: { root: 0, quality: "power", tensions: [], label: "C5" } as ChordSymbol };
    expect(read([power, card("b", 4, "G7")], "C major"))
      .toEqual(["a:Ⅰ:", "b:Ⅴ7:D"]);
  });
});
