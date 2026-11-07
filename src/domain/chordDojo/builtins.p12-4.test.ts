import { describe, expect, it } from "vitest";
import reference from "./builtins.p12-4.reference.json";
import expectedNotes from "./builtins.p12-4.expected.json";
import { BUILTINS, BUILTIN_GROUPS, DEFS, buildBuiltin, builtinDisplayName } from "./builtins";
import { JAZZ_DEFS } from "./builtins.p12-4";
import { judgeChord } from "./judging";
import { planToday } from "./planner";
import { CURRICULUM, QUALITIES, EXTRA_QUALITIES, pc } from "./recipes";
import { emptyStore, storeSchema } from "./store";

/**
 * P12.4-02: the jazz and composing progressions. The reference (`builtins.p12-4.reference.json`) is the original
 * proposal: each bar, and the chords it should make in C. It is verification only; nothing in the app shows it.
 */
type Reference = Record<string, { bars: string[][]; exampleInC: string[][]; mode: "major" | "minor" }>;
const REFERENCE = reference as Reference;
const NEW_IDS = JAZZ_DEFS.map((def) => def.id);
/** Kana, kanji, letters, digits and the few marks a chord word needs. */
const TITLE_CHARS = new RegExp("^[\u3000-\u30ff\u4e00-\u9fff\u30fc\u30fbA-Za-z0-9 +#()\u266d\u266f\uff08\uff09-]+$");
const ORIGINAL_25 = ["ii-v-i-major", "ii-v-i-minor", "i-vi7-ii-v", "i-v-vi-iv", "iv-iii-ii-i", "iv-iii7-vi", "backdoor", "imaj9-ivmaj9", "ouudou", "komuro", "marusa", "canon", "sdm", "circle", "iii-vi-ii-v-i", "tritone", "passing-dim", "sus4", "ii-v-i-ext", "bvi-bvii-i", "dorian", "lofi-minor", "aeolian", "minor-cadence", "andalusian"];

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const notePc = (name: string) => (NOTE_PC[name[0]!]! + (name[1] === "b" ? -1 : name[1] === "#" ? 1 : 0) + 12) % 12;
const QUALITY_OF: Record<string, { quality: string; tensions: string[] }> = {
  "": { quality: "maj", tensions: [] }, m: { quality: "min", tensions: [] }, maj7: { quality: "maj7", tensions: [] }, m7: { quality: "min7", tensions: [] },
  "7": { quality: "dom7", tensions: [] }, m7b5: { quality: "min7b5", tensions: [] }, "7alt": { quality: "dom7", tensions: ["b9"] }, "m(maj7)": { quality: "minMaj7", tensions: [] },
  "+": { quality: "aug", tensions: [] }, "6": { quality: "six", tensions: [] }, m6: { quality: "min6", tensions: [] }, dim7: { quality: "dim7", tensions: [] },
  "7sus": { quality: "dom7sus4", tensions: [] }, maj9: { quality: "maj9", tensions: [] },
};
function expectedChord(token: string) {
  const match = /^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/.exec(token)!;
  const kind = QUALITY_OF[match[2]!]!;
  return { root: notePc(match[1]!), quality: kind.quality, tensions: kind.tensions, bass: match[3] ? notePc(match[3]) : undefined };
}

describe("P12.4-02 the new progressions are what the proposal says", () => {
  it("has the 18 imported progressions and no others (one proposal item was the same as an existing one)", () => {
    expect(NEW_IDS).toHaveLength(18);
    expect(new Set(NEW_IDS)).toEqual(new Set(Object.keys(REFERENCE)));
    expect(NEW_IDS).not.toContain("jd-minor-four");
  });

  it("each is 1, 2, 4, 8 or 12 bars and at most 48 chords", () => {
    for (const id of NEW_IDS) {
      const bars = REFERENCE[id]!.bars.length;
      expect([1, 2, 4, 8, 12], id).toContain(bars);
      const built = buildBuiltin(id, 0);
      expect(built.chords.length, id).toBeLessThanOrEqual(48);
      expect(built.chords.reduce((n, c) => n + c.beats, 0), `${id} beats`).toBe(bars * 4);
    }
  });

  it("makes the chords of the proposal in C (the chord, its tension and its bass), in the proposal's order and length", () => {
    for (const id of NEW_IDS) {
      const wanted = REFERENCE[id]!.exampleInC.flat().map(expectedChord);
      const built = buildBuiltin(id, 0).chords;
      expect(built.length, id).toBe(wanted.length);
      built.forEach((c, i) => {
        const w = wanted[i]!;
        expect(c.chord.root, `${id} #${i} root`).toBe(w.root);
        expect(c.chord.quality, `${id} #${i} quality`).toBe(w.quality);
        expect([...c.chord.tensions], `${id} #${i} tensions`).toEqual(w.tensions);
        expect(c.chord.bass === undefined ? undefined : pc(c.chord.bass), `${id} #${i} bass`).toBe(w.bass === w.root ? undefined : w.bass);
      });
      const beatsPerBar = REFERENCE[id]!.bars.flatMap((bar) => bar.map(() => 4 / bar.length));
      expect(built.map((c) => c.beats), `${id} beats`).toEqual(beatsPerBar);
    }
  });

  it("sounds in all twelve keys: no chord is silent, and the keyboard answer shown is accepted", () => {
    for (const id of NEW_IDS) {
      for (let key = 0; key < 12; key += 1) {
        const built = buildBuiltin(id, key);
        for (const c of built.chords) {
          expect(c.notes.length, `${id} k${key} ${c.chord.label}`).toBeGreaterThanOrEqual(3);
          expect(c.notes.every((n) => n >= 0 && n <= 127)).toBe(true);
          expect(judgeChord({ notes: c.notes, chord: c.chord, judge: built.judge }, c.notes).ok, `${id} k${key} ${c.chord.label}`).toBe(true);
        }
      }
    }
  });
});

describe("P12.4-02 the answers are pinned (the E2E reads the same file)", () => {
  it("every chord name, note and length of the 18 progressions in 12 keys is what was written down", () => {
    const expected = expectedNotes as Record<string, { key: number; label: string[]; notes: number[][]; beats: number[] }[]>;
    expect(Object.keys(expected).sort()).toEqual([...NEW_IDS].sort());
    for (const id of NEW_IDS) {
      expect(expected[id]).toHaveLength(12);
      for (const entry of expected[id]!) {
        const built = buildBuiltin(id, entry.key).chords;
        expect(built.map((c) => c.chord.label), `${id} k${entry.key}`).toEqual(entry.label);
        expect(built.map((c) => c.notes), `${id} k${entry.key}`).toEqual(entry.notes);
        expect(built.map((c) => c.beats), `${id} k${entry.key}`).toEqual(entry.beats);
      }
    }
  });
});

describe("P12.4-02 what was there stays", () => {
  it("the 25 ids and their order are unchanged, and the new ones come after", () => {
    expect(BUILTINS.slice(0, 25).map((b) => b.id)).toEqual(DEFS.slice(0, 25).map((d) => d.id));
    expect([...BUILTINS.slice(0, 25).map((b) => b.id)].sort()).toEqual([...ORIGINAL_25].sort());
    expect(BUILTINS.slice(25).map((b) => b.id)).toEqual(NEW_IDS);
  });

  it("the shape curriculum asks for nothing new: the added chord kinds are not in it", () => {
    expect(QUALITIES).toHaveLength(14);
    for (const extra of EXTRA_QUALITIES) {
      expect((QUALITIES as readonly string[]).includes(extra)).toBe(false);
      expect(CURRICULUM.some((entry) => (entry.quality as string) === extra)).toBe(false);
    }
  });

  it("an existing record still loads with the new progressions present", () => {
    const store = emptyStore(new Date("2026-10-11T00:00:00.000Z"));
    store.progressions["builtin:ii-v-i-major:1"] = { state: "passed", recent: [], keys: { "0": { bestSec: 3, lastSec: 4, lastAt: "2026-10-01T00:00:00.000Z" } } } as never;
    expect(() => storeSchema.parse(JSON.parse(JSON.stringify(store)))).not.toThrow();
  });

  it("the new progressions are not candidates of today's automatic plan", () => {
    expect(BUILTINS.filter((b) => !b.todayPool).map((b) => b.id)).toEqual(NEW_IDS);
    const store = emptyStore(new Date("2026-10-11T00:00:00.000Z"));
    for (const day of [11, 12, 13, 14, 15]) {
      const plan = planToday(store, [], new Date(`2026-10-${day}T09:00:00.000Z`), { forceNew: true });
      for (const task of plan.tasks) expect(NEW_IDS.some((id) => task.key.includes(id))).toBe(false);
    }
  });
});

describe("P12.4-02 the chord kinds that were added", () => {
  const first = (id: string, i: number) => buildBuiltin(id, 0).chords[i]!;

  it("+ is C E G♯, 6 is C E G A, m(maj7) is C E♭ G B (the answer plays exactly those pitch classes)", () => {
    const pcs = (id: string, i: number) => new Set(first(id, i).notes.map(pc));
    expect(pcs("jd-major-line-cliche", 1)).toEqual(new Set([0, 4, 8]));
    expect(pcs("jd-major-line-cliche", 2)).toEqual(new Set([0, 4, 7, 9]));
    expect(pcs("jd-minor-line-cliche", 1)).toEqual(new Set([0, 3, 7, 11]));
  });

  it("7alt is written 7(♭9): the ♭9 is in the answer and in the name", () => {
    const g7 = first("jb-minor-251", 1);
    expect(g7.chord.label).toBe("G7(♭9)");
    expect(g7.notes.map(pc)).toContain(8);
  });

  it("a slash chord needs its bass: Cmaj7/B is right with B at the bottom and wrong with C at the bottom", () => {
    const slash = first("jd-descending-bass", 1);
    expect(slash.chord.label).toBe("Cmaj7/B");
    expect(judgeChord({ notes: slash.notes, chord: slash.chord, judge: "core" }, slash.notes).ok).toBe(true);
    const wrongBass = [slash.notes[0]! + 1, ...slash.notes.slice(1)]; // C at the bottom instead of B
    expect(judgeChord({ notes: slash.notes, chord: slash.chord, judge: "core" }, wrongBass).ok).toBe(false);
  });

  it("a bass that is not in the chord is part of the answer, not an extra note (D over C)", () => {
    const lydian = first("md-lydian-vamp", 1);
    expect(lydian.chord.label).toBe("D/C");
    expect(judgeChord({ notes: lydian.notes, chord: lydian.chord, judge: "core" }, lydian.notes).ok).toBe(true);
    // the bass is required: the plain triad without C is wrong
    const withoutBass = lydian.notes.slice(1);
    expect(judgeChord({ notes: lydian.notes, chord: lydian.chord, judge: "core" }, withoutBass).ok).toBe(false);
  });
});

describe("P12.4-02 the list", () => {
  it("adds four groups after the five, and every new progression is in exactly one", () => {
    const added = BUILTIN_GROUPS.slice(5);
    expect(added.map((g) => g.name)).toEqual(["ジャズ基礎", "ジャズの仕掛け", "ジャズ・フォーム", "ネオソウル・ボサ・モーダル"]);
    expect(added.flatMap((g) => g.ids).sort()).toEqual([...NEW_IDS].sort());
    expect(added.map((g) => g.ids.length)).toEqual([3, 6, 3, 6]);
  });

  it("the jazz forms are practised in six keys, everything else in twelve", () => {
    const sixKeys = BUILTINS.filter((b) => b.practiceKeys === "jazz6").map((b) => b.id).sort();
    expect(sixKeys).toEqual(["jf-jazz-blues", "jf-minor-blues", "jf-rhythm-a"]);
  });

  it("names are plain harmonic words: a short title and a one-line use, no marks of a song or an artist", () => {
    for (const def of JAZZ_DEFS) {
      const title = builtinDisplayName({ title: def.title, name: def.name });
      expect(title.length, def.id).toBeLessThanOrEqual(24);
      expect(title, def.id).toMatch(TITLE_CHARS);
      expect((def.usage ?? "").length, def.id).toBeGreaterThan(0);
      expect((def.usage ?? "").length, def.id).toBeLessThanOrEqual(60);
      expect(def.id, def.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("7alt is said to be played as 7(♭9) in the use line of every progression that has it", () => {
    for (const def of JAZZ_DEFS) {
      if (def.tensions?.some((t) => t?.includes("b9"))) expect(def.usage, def.id).toContain("7alt は 7(b9) で代用");
    }
  });
});
