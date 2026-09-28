import { describe, expect, it } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { ChordQuality, SavedProgressionBlock } from "../../domain/types";
import {
  buildVaultRows,
  emptyVaultFilters,
  ideasWithoutProgressions,
  parseDegreeQuery,
  queryVault,
  type VaultFilters,
} from "./vaultLibrary";

const pc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chord(label: string, bar: number) {
  const quality: ChordQuality = label.includes("maj7") ? "maj7" : label.includes("m7") ? "min7" : label.endsWith("7") ? "dom7" : label.endsWith("m") ? "min" : "maj";
  return { bar, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: { root: pc[label[0]], quality, tensions: [], label } };
}
function block(id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return { id, summaryText: labels.join(" "), chords: labels.map((label, index) => chord(label, index + 1)), tags: [], capturedAt: "2026-09-01T00:00:00.000Z", analyzerVersion: "t", ...extra };
}

const ideas = [
  makeIdea({ id: "a", title: "Two Five", progressionBlocks: [block("251", ["Dm7", "Dm7", "G7", "Cmaj7"], { detectedKey: "C", pinned: true, lengthBars: 4, tags: ["intro"], capturedAt: "2026-09-03T00:00:00.000Z" })] }),
  makeIdea({ id: "b", title: "Axis", progressionBlocks: [block("axis", ["C", "G", "Am", "F", "C", "G", "F", "C", "G"], { detectedKey: "C", lengthBars: 9, textSource: {} as SavedProgressionBlock["textSource"], practice: { schemaVersion: 1, progressionFingerprint: "x", lastPracticedAt: "2026-09-20T00:00:00.000Z" } })] }),
  makeIdea({ id: "c", title: "No key", progressionBlocks: [block("nokey", ["Dm7", "G7", "Cmaj7"], { origin: "live-midi", lengthBars: 8, tags: ["intro"], capturedAt: "2026-09-02T00:00:00.000Z" })] }),
  makeIdea({ id: "d", title: "Memo only", progressionBlocks: [] }),
];
const rows = buildVaultRows(ideas);
const ids = (filters: VaultFilters, query = "", sort: "newest" | "name" | "length" | "practiced" = "newest") =>
  queryVault(rows, filters, query, sort).rows.map(({ row }) => row.block.id);

describe("Vault library", () => {
  it("lists progressions only and keeps Ideas without one aside", () => {
    expect(rows.map((row) => row.block.id)).toEqual(["251", "axis", "nokey"]);
    expect(ideasWithoutProgressions(ideas).map((idea) => idea.id)).toEqual(["d"]);
  });

  it("parses degree flows", () => {
    expect(parseDegreeQuery("2-5-1")).toEqual([{ degree: 2, accidental: 0 }, { degree: 5, accidental: 0 }, { degree: 1, accidental: 0 }]);
    expect(parseDegreeQuery("251")).toHaveLength(3);
    expect(parseDegreeQuery("b7 → 1")).toEqual([{ degree: 7, accidental: -1 }, { degree: 1, accidental: 0 }]);
    expect(parseDegreeQuery("ii-V-I")).toHaveLength(3);
    expect(parseDegreeQuery("Dm7")).toBeUndefined();
    expect(parseDegreeQuery("5")).toBeUndefined();
  });

  it("finds a degree flow from the progression's key, merging repeated chords, and skips keyless progressions", () => {
    const result = queryVault(rows, emptyVaultFilters, "2-5-1", "newest");
    expect(result.rows.map(({ row }) => row.block.id)).toEqual(["251"]);
    expect(result.rows[0].match).toEqual({ kind: "degree", start: 0, end: 3 });
    expect(ids(emptyVaultFilters, "6-4-1")).toEqual(["axis"]);
    // P8.9-09: repeats in the query merge like repeats in the progression.
    expect(ids(emptyVaultFilters, "2-2-5-1")).toEqual(["251"]);
  });

  it("finds chord names by prefix and in sequence", () => {
    expect(ids(emptyVaultFilters, "Dm7")).toEqual(["251", "nokey"]);
    expect(ids(emptyVaultFilters, "dm")).toEqual(["251", "nokey"]);
    expect(ids(emptyVaultFilters, "m7")).toEqual(["251", "nokey"]);
    expect(ids(emptyVaultFilters, "G7 Cmaj")).toEqual(["251", "nokey"]);
    expect(ids(emptyVaultFilters, "Am F")).toEqual(["axis"]);
    expect(ids(emptyVaultFilters, "maj7 Dm")).toEqual([]);
  });

  it("still finds names, files and tags as text", () => {
    expect(ids(emptyVaultFilters, "axis")).toEqual(["axis"]);
    expect(ids(emptyVaultFilters, "intro")).toEqual(["251", "nokey"]);
  });

  it("ORs values inside a facet and ANDs facets", () => {
    expect(ids({ ...emptyVaultFilters, sources: ["text", "live-midi"] })).toEqual(["nokey", "axis"]);
    expect(ids({ ...emptyVaultFilters, sources: ["text", "live-midi"], lengths: ["5to8"] })).toEqual(["nokey"]);
    expect(ids({ ...emptyVaultFilters, favorite: true })).toEqual(["251"]);
    expect(ids({ ...emptyVaultFilters, keys: ["C"], tags: ["intro"] })).toEqual(["251"]);
  });

  it("counts each facet without its own selection", () => {
    const { counts } = queryVault(rows, { ...emptyVaultFilters, sources: ["midi"] }, "", "newest");
    expect(counts.sources.get("midi")).toBe(1);
    expect(counts.sources.get("text")).toBe(1);
    expect(counts.sources.get("live-midi")).toBe(1);
    expect(counts.keys.get("C")).toBe(1);
    expect(counts.lengths.get("le4")).toBe(1);
    expect(counts.lengths.get("9to16")).toBeUndefined();
    expect(counts.favorite).toBe(1);
  });

  it("sorts newest, by name, by length and by recent practice", () => {
    expect(ids(emptyVaultFilters, "", "newest")).toEqual(["251", "nokey", "axis"]);
    expect(ids(emptyVaultFilters, "", "name")).toEqual(["axis", "nokey", "251"]);
    expect(ids(emptyVaultFilters, "", "length")).toEqual(["251", "nokey", "axis"]);
    expect(ids(emptyVaultFilters, "", "practiced")).toEqual(["axis", "251", "nokey"]);
  });
});
