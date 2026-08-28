import { describe, expect, it } from "vitest";
import {
  createEmptyPracticeFile,
  JsonPracticeRepository,
  validatePracticeFile,
} from "./practiceRepository";
import { MemoryPracticeStorage } from "./practiceStorage";

const NOW = new Date("2026-08-29T00:00:00.000Z");

describe("P5.25 Source Bassline window preference", () => {
  it("defaults an absent field to two in memory without rewriting stored bytes", async () => {
    const storage = new MemoryPracticeStorage();
    const current = createEmptyPracticeFile(NOW);
    const { sourceBasslineWindowBars: _omitted, ...legacySettings } = current.settings;
    const stored = { ...current, revision: 1, settings: legacySettings };
    storage.committed = `${JSON.stringify(stored)}\n`;

    const loaded = await new JsonPracticeRepository(storage, () => NOW).load();

    expect(loaded.file.settings.sourceBasslineWindowBars).toBe(2);
    expect(storage.committed).toBe(`${JSON.stringify(stored)}\n`);
    expect(loaded.file.fileVersion).toBe(2);
  });

  it("preserves every canonical 1/2/4/8 value", () => {
    const current = createEmptyPracticeFile(NOW);
    for (const sourceBasslineWindowBars of [1, 2, 4, 8] as const) {
      const parsed = validatePracticeFile({
        ...current,
        settings: { ...current.settings, sourceBasslineWindowBars },
      });
      expect(parsed.settings.sourceBasslineWindowBars).toBe(sourceBasslineWindowBars);
      expect(parsed.fileVersion).toBe(2);
    }
  });

  it("rejects non-canonical values under the strict parser", () => {
    const current = createEmptyPracticeFile(NOW);
    for (const sourceBasslineWindowBars of [0, 3, 5, 7, 9, "2"] as const) {
      expect(() => validatePracticeFile({
        ...current,
        settings: { ...current.settings, sourceBasslineWindowBars },
      } as never)).toThrow(/strict schema/i);
    }
  });
});
