import { describe, expect, it } from "vitest";
import { createSourceBasslineHistoryEntry } from "../../domain";
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

  it("round-trips History v1 requested windows and every partial actual length without notes", () => {
    const current = createEmptyPracticeFile(NOW);
    const entries = ([1, 2, 3, 4, 5, 6, 7, 8] as const).map((actualBars) => createSourceBasslineHistoryEntry({
      id: `p525-history-${actualBars}`,
      completedAt: NOW.toISOString(),
      reference: { ideaId: "idea", blockId: "block" },
      snapshotSignature: "a".repeat(64),
      requestedBars: actualBars === 1 ? 1 : actualBars === 2 ? 2 : actualBars <= 4 ? 4 : 8,
      startBar: 1,
      endBar: actualBars,
      actualBars,
      level: 3,
      croppedSourceNoteCount: actualBars,
      projectedNoteCount: actualBars,
      omittedSimultaneousNoteCount: 0,
      boundaryClippedNoteCount: 0,
      overlapClippedNoteCount: 0,
      pitchReplacementCount: 0,
      capturedHarmonyComparison: "comparison-unavailable",
    }));
    const parsed = validatePracticeFile({ ...current, sourceBasslineHistory: entries });
    expect(parsed.sourceBasslineHistory.map(({ version, window }) => ({ version, requested: window.requestedBars, actual: window.actualBars })))
      .toEqual(entries.map(({ version, window }) => ({ version, requested: window.requestedBars, actual: window.actualBars })));
    expect(JSON.stringify(parsed.sourceBasslineHistory)).not.toMatch(/"notes"\s*:/i);
  });

  it("rejects misaligned or range-inconsistent Source Bassline History windows", () => {
    const current = createEmptyPracticeFile(NOW);
    const valid = createSourceBasslineHistoryEntry({
      id: "p525-history-semantic",
      completedAt: NOW.toISOString(),
      reference: { ideaId: "idea", blockId: "block" },
      snapshotSignature: "a".repeat(64),
      requestedBars: 4,
      startBar: 5,
      endBar: 7,
      actualBars: 3,
      level: 3,
      croppedSourceNoteCount: 3,
      projectedNoteCount: 3,
      omittedSimultaneousNoteCount: 0,
      boundaryClippedNoteCount: 0,
      overlapClippedNoteCount: 0,
      pitchReplacementCount: 0,
      capturedHarmonyComparison: "comparison-unavailable",
    });
    expect(validatePracticeFile({ ...current, sourceBasslineHistory: [valid] }).sourceBasslineHistory).toEqual([valid]);
    expect(() => validatePracticeFile({ ...current, sourceBasslineHistory: [{ ...valid, window: { ...valid.window, startBar: 2, endBar: 4 } }] }))
      .toThrow(/inconsistent/i);
    expect(() => validatePracticeFile({ ...current, sourceBasslineHistory: [{ ...valid, window: { ...valid.window, endBar: 8 } }] }))
      .toThrow(/inconsistent/i);
  });
});
