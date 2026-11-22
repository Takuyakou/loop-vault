import { readFileSync } from "node:fs";
import { parseChordLabel } from "../../src/domain/chords";
import { eRankerCostModel } from "../../src/domain/eRankerFingering";
import { p21ERankerCostModel } from "../../src/domain/p21SingleNoteFingering";
import { dojoFingerings, type FingeringChord } from "../../src/views/chord-dojo/fingering";

type Contract = { builtins: Record<string, { keys: { chords: { label: string; notes: number[]; beats: number }[] }[] }> };
const contract = JSON.parse(readFileSync("docs/phase12.3/contracts/P12.3-builtins-expected.json", "utf8")) as Contract;
const inputs: FingeringChord[][][] = Object.values(contract.builtins).flatMap((builtin) => builtin.keys.map((key) => key.chords.map((chord) => ({
  chord: parseChordLabel(chord.label.replace(/♭/g, "b").replace(/♯/g, "#"))!, notes: [...chord.notes], beats: chord.beats,
}))));
const measure = (model: "before" | "after") => {
  const costModel = model === "before" ? eRankerCostModel() : p21ERankerCostModel();
  const runs: number[] = [];
  let slowest = 0;
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    for (const chords of inputs) {
      const call = performance.now();
      dojoFingerings(chords, { costModel });
      slowest = Math.max(slowest, performance.now() - call);
    }
    runs.push(performance.now() - start);
  }
  const sorted = [...runs].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, slowest, runs };
};
console.log(JSON.stringify({ calls: inputs.length, before: measure("before"), after: measure("after") }, null, 2));
