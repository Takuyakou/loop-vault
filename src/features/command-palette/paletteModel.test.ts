import { describe, expect, it, vi } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { ChordQuality, SavedProgressionBlock } from "../../domain/types";
import { buildVaultRows } from "../../views/vault/vaultLibrary";
import {
  PALETTE_PROGRESSION_LIMIT,
  flattenPalette,
  movePaletteIndex,
  normalizePaletteQuery,
  searchPaletteSections,
  type PaletteCommand,
} from "./paletteModel";

const pc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chord(label: string, bar: number) {
  const quality: ChordQuality = label.includes("maj7") ? "maj7" : label.includes("m7") ? "min7" : label.endsWith("7") ? "dom7" : label.endsWith("m") ? "min" : "maj";
  return { bar, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: { root: pc[label[0]], quality, tensions: [], label } };
}
function block(id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return { id, summaryText: labels.join(" "), chords: labels.map((label, index) => chord(label, index + 1)), tags: [], capturedAt: "2026-09-01T00:00:00.000Z", analyzerVersion: "t", ...extra };
}

const ideas = [
  makeIdea({
    id: "night",
    title: "夜のループ",
    progressionBlocks: [block("night-1", ["Dm7", "G7", "Cmaj7", "A7"], { detectedKey: "C", capturedAt: "2026-09-10T00:00:00.000Z" })],
  }),
  makeIdea({
    id: "sharp",
    title: "F# の曲",
    progressionBlocks: [block("sharp-1", ["F#m7", "Bm7", "E7", "Amaj7", "F#m7", "Bm7", "E7", "Amaj7"], { detectedKey: "F#", capturedAt: "2026-09-11T00:00:00.000Z" })],
  }),
  ...Array.from({ length: 8 }, (_, index) => makeIdea({
    id: `t${index}`,
    title: `test ${index}`,
    progressionBlocks: [block(`t${index}-1`, ["C", "F"], { detectedKey: "C", capturedAt: `2026-09-${String(12 + index).padStart(2, "0")}T00:00:00.000Z` })],
  })),
];
const rows = buildVaultRows(ideas);

const importRun = vi.fn();
const commands: PaletteCommand[] = [
  { id: "home", group: "screen", title: "ホーム", keywords: "home", frequent: true, run: vi.fn() },
  { id: "settings", group: "screen", title: "設定", keywords: "settings せってい", run: vi.fn() },
  { id: "import-midi", group: "action", title: "MIDI を取り込む", keywords: "midi import 取り込み", frequent: true, run: importRun },
  { id: "vault-search", group: "action", title: "Vault で探す", keywords: "検索 search", run: vi.fn() },
];

const sectionsFor = (query: string) => searchPaletteSections(query, rows, commands);

describe("the search palette's model", () => {
  it("M1 normalizes full-width letters, ♯ ♭ and the ends", () => {
    expect(normalizePaletteQuery("  Ｄｍ７　Ｇ７ ")).toBe("Dm7 G7");
    expect(normalizePaletteQuery("F♯m7♭5")).toBe("F#m7b5");
    expect(normalizePaletteQuery("Ⅱ-Ⅴ-Ⅰ")).toBe("II-V-I");
  });

  it("M2 lists the frequent commands, in the order given, while nothing is typed", () => {
    for (const query of ["", "   "]) {
      const sections = sectionsFor(query);
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe("frequent");
      expect(sections[0].label).toBe("よく使う操作");
      expect(sections[0].items.map((item) => item.title)).toEqual(["ホーム", "MIDI を取り込む"]);
      expect(sections[0].items.every((item) => item.kind === "command")).toBe(true);
    }
  });

  it("M3 lists nothing while nothing is typed and no command is frequent", () => {
    expect(searchPaletteSections("", rows, commands.filter((command) => !command.frequent))).toEqual([]);
  });

  it("M4 finds a progression by its name, with its chords, its bars and its ids", () => {
    const sections = sectionsFor("夜");
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("progression");
    expect(sections[0].items).toHaveLength(1);
    const item = sections[0].items[0];
    expect(item.kind).toBe("progression");
    if (item.kind !== "progression") return;
    expect(item.title).toBe("夜のループ");
    expect(item.chords).toBe("Dm7  G7  Cmaj7  A7");
    expect(item.detail).toBe("4小節");
    expect(item.ideaId).toBe("night");
    expect(item.blockId).toBe("night-1");
    expect(item.id).toBe("progression:night:night-1");
  });

  it("M5 finds the progression even when the chords are typed full-width", () => {
    const items = flattenPalette(sectionsFor("ｄｍ７"));
    expect(items.map((item) => item.title)).toContain("夜のループ");
  });

  it("M6 finds a ♯ progression with ♯ and shows the sharp in the chords", () => {
    const items = flattenPalette(sectionsFor("F♯"));
    expect(items.map((item) => item.title)).toContain("F# の曲");
    const item = items.find((entry) => entry.title === "F# の曲");
    expect(item?.kind).toBe("progression");
    if (item?.kind !== "progression") return;
    expect(item.chords).toBe("F♯m7  Bm7  E7  Amaj7  F♯m7  Bm7 …");
  });

  it("M7 lists at most six progressions, newest first", () => {
    const sections = sectionsFor("test");
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(PALETTE_PROGRESSION_LIMIT);
    expect(sections[0].items.map((item) => item.title)).toEqual(["test 7", "test 6", "test 5", "test 4", "test 3", "test 2"]);
  });

  it("M8 finds the progression whose degrees match, and not the one in another key", () => {
    const titles = flattenPalette(sectionsFor("2-5-1")).map((item) => item.title);
    expect(titles).toContain("夜のループ");
    expect(titles).not.toContain("F# の曲");
  });

  it("M9 finds commands by their title, by their keywords in any case, and puts actions in their own section", () => {
    expect(flattenPalette(sectionsFor("ホーム")).map((item) => item.title)).toEqual(["ホーム"]);
    expect(flattenPalette(sectionsFor("HOME")).map((item) => item.title)).toEqual(["ホーム"]);
    const actionSections = sectionsFor("MIDI");
    expect(actionSections.map((section) => section.id)).toEqual(["action"]);
    expect(actionSections[0].items.map((item) => item.title)).toEqual(["MIDI を取り込む"]);
  });

  it("M10 keeps the section order and leaves out what did not match", () => {
    const sections = sectionsFor("test");
    expect(sections.map((section) => section.id)).toEqual(["progression"]);
    const both = sectionsFor("C");
    expect(both.length).toBeGreaterThan(0);
    const order = both.map((section) => section.id);
    const expected = (["progression", "screen", "action"] as const).filter((id) => order.includes(id));
    expect(order).toEqual(expected);
    expect(searchPaletteSections("zzz", rows, commands)).toEqual([]);
  });

  it("M11 flattens every section in the order it is listed", () => {
    const sections = [...sectionsFor(""), ...sectionsFor("test")];
    expect(sections).toHaveLength(2);
    expect(flattenPalette(sections)).toEqual([...sections[0].items, ...sections[1].items]);
  });

  it("M12 moves through the items and wraps at the ends", () => {
    expect(movePaletteIndex(-1, 1, 3)).toBe(0);
    expect(movePaletteIndex(-1, -1, 3)).toBe(2);
    expect(movePaletteIndex(2, 1, 3)).toBe(0);
    expect(movePaletteIndex(0, -1, 3)).toBe(2);
    expect(movePaletteIndex(1, 1, 3)).toBe(2);
    expect(movePaletteIndex(0, 1, 0)).toBe(-1);
    expect(movePaletteIndex(-1, -1, 0)).toBe(-1);
  });

  it("M13 runs the command's own action once when its item is run", () => {
    expect(importRun).not.toHaveBeenCalled();
    const item = flattenPalette(sectionsFor("MIDI")).find((entry) => entry.kind === "command");
    expect(item?.kind).toBe("command");
    if (item?.kind !== "command") return;
    item.run();
    expect(importRun).toHaveBeenCalledTimes(1);
  });
});
