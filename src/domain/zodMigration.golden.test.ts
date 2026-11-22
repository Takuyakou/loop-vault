import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goldenCases } from "./__golden__/cases";
import { goldenEntries } from "./__golden__/entries";

/**
 * DEP-01 §2-3: the saved data must read exactly as it did with zod 3.
 *
 * `__golden__/zod3/` holds, for every zod entry point, the parsed value (or the refusal, and the quarantine list) that
 * the release with zod 3 produced for the same inputs. This test replays the inputs on the current zod and requires
 * a deep match. Error messages and issue codes are deliberately not recorded: zod 3 and 4 word them differently and
 * the app neither shows nor branches on them.
 */
const readRecorded = (entry: string) => JSON.parse(
  readFileSync(new URL(`./__golden__/zod3/${entry}.json`, import.meta.url), "utf8"),
) as { case: string; outcome: unknown }[];

const entries = [...new Set(goldenCases.map((item) => item.entry))].sort();

describe("DEP-01: the saved data reads the same as with zod 3", () => {
  it.each(entries)("%s", (entry) => {
    const recorded = readRecorded(entry);
    const cases = goldenCases.filter((item) => item.entry === entry);
    expect(recorded.map((item) => item.case)).toEqual(cases.map((item) => item.case));
    cases.forEach((item, index) => {
      expect(goldenEntries[entry]!(item.input), `${entry} / ${item.case}`).toEqual(recorded[index]!.outcome);
    });
  });
});
