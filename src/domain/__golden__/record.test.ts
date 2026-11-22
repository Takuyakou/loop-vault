import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { goldenCases } from "./cases";
import { goldenEntries } from "./entries";

const directory = fileURLToPath(new URL("./zod3/", import.meta.url));

/**
 * Records the golden set. Run it with `RECORD_GOLDEN=1 npx vitest run src/domain/__golden__/record.test.ts`.
 * The files under `zod3/` are the answers of the release that still used zod 3; the comparison test
 * (`src/domain/zodMigration.golden.test.ts`) holds every later release to them.
 */
describe("golden recorder", () => {
  it("records the outcomes when asked", () => {
    if (process.env.RECORD_GOLDEN !== "1") return;
    mkdirSync(directory, { recursive: true });
    const entries = [...new Set(goldenCases.map((item) => item.entry))].sort();
    for (const entry of entries) {
      const cases = goldenCases.filter((item) => item.entry === entry);
      const recorded = cases.map((item) => ({ case: item.case, outcome: goldenEntries[entry]!(item.input) }));
      writeFileSync(`${directory}${entry}.json`, `${JSON.stringify(recorded, null, 2)}\n`);
      console.log(`${entry}: ${recorded.map((item) => `${item.case}=${(item.outcome as { ok: boolean }).ok ? "ok" : "rejected"}`).join(" ")}`);
    }
  });
});
