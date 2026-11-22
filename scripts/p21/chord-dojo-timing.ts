import { eRankerCostModel } from "../../src/domain/eRankerFingering";
import { p21ERankerCostModel } from "../../src/domain/p21SingleNoteFingering";
import { dojoFingerings, type FingeringChord } from "../../src/views/chord-dojo/fingering";
import { parseChordLabel } from "../../src/domain/chords";
import { p12ThemeIdeas } from "../../src/testing/p12ThemeFixture";
import { emptyStore } from "../../src/domain/chordDojo/store";
import { collectVault, syncVault } from "../../src/domain/chordDojo/collect";
import { planToday } from "../../src/domain/chordDojo/planner";
import { freezeLessonDisplay } from "../../src/views/chord-dojo/lessonFingering";

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const measure = (run: () => void, count = 9) => {
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) { const start = performance.now(); run(); values.push(performance.now() - start); }
  return median(values);
};
const chord = (label: string, notes: readonly number[], beats = 1): FingeringChord => ({ chord: parseChordLabel(label)!, notes: [...notes], beats });
const single = [chord("C", [36]), chord("D", [38]), chord("E", [40]), chord("F", [41])];
const multi = Array.from({ length: 8 }, (_, i) => chord(["C", "D", "E", "F"][i % 4]!, [48, 52, 55, 59], 2));
const single56 = Array.from({ length: 14 }, () => single).flat();
const mixed56 = Array.from({ length: 14 }, (_, i) => i % 3 === 0 ? multi[i % 8]! : single[i % 4]!).flat();
const now = new Date("2026-10-05T00:00:00Z");
const ideas = p12ThemeIdeas();
const collection = collectVault(ideas, now.toISOString());
const store = syncVault(emptyStore(now), collection, now.toISOString());
const lesson = planToday(store, collection.progressions, now).lesson!;

const result = {
  fourSingle: { before: measure(() => void dojoFingerings(single, { costModel: eRankerCostModel() })), after: measure(() => void dojoFingerings(single, { costModel: p21ERankerCostModel() })) },
  eightMulti: { before: measure(() => void dojoFingerings(multi, { costModel: eRankerCostModel() })), after: measure(() => void dojoFingerings(multi, { costModel: p21ERankerCostModel() })) },
  fiftySixSingle: { before: measure(() => void dojoFingerings(single56, { costModel: eRankerCostModel() })), after: measure(() => void dojoFingerings(single56, { costModel: p21ERankerCostModel() })) },
  fiftySixMixed: { before: measure(() => void dojoFingerings(mixed56, { costModel: eRankerCostModel() })), after: measure(() => void dojoFingerings(mixed56, { costModel: p21ERankerCostModel() })) },
  freezeLesson: { before: measure(() => void freezeLessonDisplay(lesson, now.toISOString(), { costModel: eRankerCostModel() })), after: measure(() => void freezeLessonDisplay(lesson, now.toISOString(), { costModel: p21ERankerCostModel() })) },
};
console.log(JSON.stringify(result, null, 2));
