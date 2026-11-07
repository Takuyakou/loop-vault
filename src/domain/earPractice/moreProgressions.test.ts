import { describe, expect, it } from "vitest";
import { CORE_BANK, EXTRA_BANK } from "./bank";
import { earJudge } from "./judge";
import { earChordLevel } from "./levels";
import { earKeyName, type EarMode } from "./keys";
import { chordFromDegreeToken } from "./spelling";
import { voiceForEar } from "./voicing";

/** The notations (token and mode) the 53 added progressions use for the first time. */
const NEW_NOTATIONS: Array<[string, EarMode]> = [
  ["IIdim/IV", "minor"], ["IVm/bVI", "minor"], ["Vm/bVII", "minor"], ["bVII/bVI", "minor"], ["Im11", "minor"],
  ["bII7(#11)", "minor"], ["bVI7(#11)", "minor"], ["bIII7(#11)", "major"], ["IVmMaj7", "major"],
];

describe("P16-05: 足した53個で初めて使う書き方", () => {
  const before = new Set([...CORE_BANK, ...EXTRA_BANK.slice(0, 304)].flatMap((entry) => entry.bars.flat().map((token) => `${token}|${entry.mode}`)));
  const added = EXTRA_BANK.slice(304);
  const used = new Set(added.flatMap((entry) => entry.bars.flat().map((token) => `${token}|${entry.mode}`)));

  it("足した53個は 405〜457、今までに無い書き方はちょうどこの9つ", () => {
    expect(added).toHaveLength(53);
    expect(added.map((entry) => entry.id).every((id) => /^X[1-5]-(4|8|16)-\d{3}$/.test(id))).toBe(true);
    const fresh = [...used].filter((key) => !before.has(key)).sort();
    expect(fresh).toEqual(NEW_NOTATIONS.map(([token, mode]) => `${token}|${mode}`).sort());
  });

  for (const [token, mode] of NEW_NOTATIONS) {
    it(`${token}(${mode === "minor" ? "マイナー" : "メジャー"}): 12のキーで、名前が読め、鳴らす音が判定に通り、レベルと鳴らす音の範囲が合う`, () => {
      for (let tonic = 0; tonic < 12; tonic += 1) {
        const symbol = chordFromDegreeToken(token, tonic, mode);
        const notes = voiceForEar(symbol);
        const where = `${token} in ${earKeyName(tonic, mode)} = ${symbol.label} [${notes}]`;
        const judge = symbol.altered ? "pitchset" : "core";
        expect(earJudge({ symbol, judge, notes }, notes).ok, where).toBe(true);
        // the bass is the lowest note, C2…B2, and the next note is at least an octave above
        expect(notes[0]! >= 36 && notes[0]! <= 47, where).toBe(true);
        expect(notes[1]! - notes[0]! >= 12, where).toBe(true);
        expect(earChordLevel(symbol, { tonic, mode }), where).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it("C / Am と、綴りの崩れやすい F♯m・D♭ の例(報告の表の元)", () => {
    const rows = NEW_NOTATIONS.map(([token, mode]) => {
      const keys = mode === "minor" ? [9, 6] : [0, 1];
      return `${token} (${mode}): ${keys.map((tonic) => {
        const symbol = chordFromDegreeToken(token, tonic, mode);
        const notes = voiceForEar(symbol);
        return `${earKeyName(tonic, mode)} ${symbol.label} [${notes.join(" ")}]`;
      }).join(" / ")}`;
    });
    console.log(`P1605-ROWS\n${rows.join("\n")}`);
    expect(rows).toHaveLength(9);
  });
});
