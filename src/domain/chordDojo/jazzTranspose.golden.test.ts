// Jazz-05 Stage 02: the app's 12-key transposition matches the reference table, and every transposed card passes the app's judge.
// Put this next to jazzProgressions.ts, with data/jazz-transpose.expected.json copied there as jazzTranspose.expected.json.
// `transposeJazzProgression(id, itemTonic)` is the name proposed in Stage 02 §3 (itemTonic = the tonic chosen for the item's MAIN progression).
// Rename here if Stage 00 chose another; adjust the field names in `Got` to the app's card shape, but keep every assertion.
import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { judgeChord } from "./judging";
import { transposeJazzProgression } from "./jazzProgressions";
import expected from "./jazzTranspose.expected.json";

type Want = {
  display: string; parseLabel: string; degree: string; keyContext: string;
  expectedPitches: number[]; expectedNames: string[]; left: number[]; right: number[];
  fingers: Record<string, string>; carried: number[]; struck: number[];
};
type Row = { item: string; itemKey: string; itemTonic: number; id: string; key: string; tonic: number; shift: number; original: boolean; cards: Want[] };
type Got = {
  key: string; tonic: number;
  cards: { display: string; degree: string; keyContext: string; chord: unknown; expected: number[]; left: number[]; right: number[];
    carried: number[]; struck: number[]; names: ReadonlyMap<number, string>; labels: ReadonlyMap<number, string> }[];
};
const rows = (expected as unknown as { progressions: Row[] }).progressions;
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
const shown = (n: string) => n.replace("bb", "𝄫").replace("b", "♭").replace("#", "♯").replace("x", "𝄪");

describe("Jazz Progressions — 12 keys", () => {
  it("has 21 progressions × 12 keys and 672 cards, and no item without a common octave", () => {
    expect(rows.length).toBe(252);
    expect(rows.reduce((n, r) => n + r.cards.length, 0)).toBe(672);
    expect((expected as unknown as { unsolved: unknown[] }).unsolved).toEqual([]);
  });

  it.each(rows)("$id with the item in $itemKey matches the reference", (r) => {
    const p = transposeJazzProgression(r.id, r.itemTonic) as unknown as Got;
    expect(p.key).toBe(r.key);
    expect(p.tonic).toBe(r.tonic);
    expect(p.cards.length).toBe(r.cards.length);
    r.cards.forEach((want, i) => {
      const got = p.cards[i]!;
      expect(got.display).toBe(want.display);
      expect(got.degree).toBe(want.degree);
      expect(got.keyContext).toBe(want.keyContext);
      expect(got.chord).toEqual(parseTextChordLabel(want.parseLabel)); // the chord the app judges with is the reference's parseLabel
      expect(sorted(got.expected)).toEqual(sorted(want.expectedPitches));
      expect(sorted(got.left)).toEqual(want.left);
      expect(sorted(got.right)).toEqual(want.right);
      expect(sorted(got.carried)).toEqual(want.carried);
      expect(sorted(got.struck)).toEqual(want.struck);
      want.expectedNames.forEach((n, j) => expect(got.names.get(want.expectedPitches[j]!)).toBe(shown(n)));
      Object.entries(want.fingers).forEach(([pitch, label]) => expect(got.labels.get(Number(pitch))).toBe(label));
    });
  });

  it("variants of one item played in one key give the same notes for the same chord", () => {
    const byItemKey = new Map<string, Row[]>();
    for (const r of rows) byItemKey.set(`${r.item}|${r.itemTonic}`, [...(byItemKey.get(`${r.item}|${r.itemTonic}`) ?? []), r]);
    for (const group of byItemKey.values()) {
      expect(new Set(group.map((r) => r.shift)).size).toBe(1); // one octave for the whole item
      const seen = new Map<string, string>();
      for (const r of group) for (const c of r.cards) {
        // the same chord in the same place of the same key is one voicing in the data, so it must sound the same in every variant
        const k = `${c.display}|${c.degree}|${c.keyContext}`, v = sorted(c.expectedPitches).join(",");
        if (seen.has(k)) expect(v, `${r.id} ${r.itemKey} ${c.display}`).toBe(seen.get(k));
        seen.set(k, v);
      }
    }
  });

  it.each(rows.flatMap((r) => r.cards.map((c, i) => ({ where: `${r.id} (${r.itemKey}) #${i + 1} ${c.display}`, ...c }))))("$where passes the judge", (c) => {
    const chord = parseTextChordLabel(c.parseLabel);
    expect(chord, `${c.parseLabel} is not read`).toBeTruthy();
    for (const judge of ["core", "shape"] as const) {
      const v = judgeChord({ notes: c.expectedPitches, chord, judge, bass: "self" } as never, c.expectedPitches);
      expect(v.ok, `${judge}: ${(v as { message?: string }).message ?? ""}`).toBe(true);
    }
  });
});
