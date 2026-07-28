// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const fsSpies = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 16 },
  exists: vi.fn(),
  mkdir: fsSpies.mkdir,
  remove: vi.fn(),
  writeTextFile: fsSpies.writeTextFile,
}));

import { appendAnalysisFeedback } from "./analysisFeedbackStorage";

describe("analysis feedback storage", () => {
  beforeEach(() => {
    localStorage.clear();
    fsSpies.mkdir.mockReset().mockResolvedValue(undefined);
    fsSpies.writeTextFile.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("appends one JSONL record when a progression is saved without edits", async () => {
    const event = {
      schemaVersion: 1 as const,
      eventType: "progression-save" as const,
      sourceFingerprint: "fnv1a32-deadbeef",
      analyzerVersion: "phase5-accuracy-first-v1",
      occurredAt: "2026-07-28T00:00:00.000Z",
      range: { startBeat: 0, endBeat: 4 },
      savedEventCount: 1,
      userEdited: false,
      userVerified: true,
      decisions: [{
        startBeat: 0,
        endBeat: 4,
        detected: "Cmaj7",
        saved: "Cmaj7",
        outcome: "rank1" as const,
      }],
    };

    await appendAnalysisFeedback([event]);

    expect(fsSpies.mkdir).toHaveBeenCalledWith(
      "loopvault",
      expect.objectContaining({ recursive: true }),
    );
    expect(fsSpies.writeTextFile).toHaveBeenCalledWith(
      "loopvault/analysis-feedback.jsonl",
      `${JSON.stringify(event)}\n`,
      expect.objectContaining({ append: true }),
    );
  });
});
