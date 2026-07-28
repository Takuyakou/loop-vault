// @vitest-environment jsdom

import { Midi } from "@tonejs/midi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProgressionSaveFeedbackEvent,
  readAnalysisFeedbackJsonl,
  type PersistedAnalysisFeedbackEvent,
} from "../domain/midi/analysisFeedback";
import { analyzeMidi } from "../domain/midi/analysis";

const fsSpies = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 16 },
  exists: fsSpies.exists,
  mkdir: fsSpies.mkdir,
  readTextFile: fsSpies.readTextFile,
  remove: fsSpies.remove,
  writeTextFile: fsSpies.writeTextFile,
}));

import {
  appendAnalysisFeedback,
  deleteAnalysisFeedback,
  exportAnalysisFeedback,
  setAnalysisFeedbackEnabled,
} from "./analysisFeedbackStorage";

describe("analysis feedback storage integration", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(fsSpies).forEach((spy) => spy.mockReset());
    fsSpies.exists.mockResolvedValue(false);
    fsSpies.mkdir.mockResolvedValue(undefined);
    fsSpies.readTextFile.mockResolvedValue("");
    fsSpies.remove.mockResolvedValue(undefined);
    fsSpies.writeTextFile.mockResolvedValue(undefined);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("imports fixture MIDI, builds a privacy-safe save record, validates, exports and clears it", async () => {
    const analysis = analyzeMidi(fixtureMidiBytes(), {
      mode: "phase4-v1",
      fileName: "private-song-name.mid",
    });
    const candidate = analysis.blockCandidates[0]!;
    const event = buildProgressionSaveFeedbackEvent(
      candidate,
      candidate,
      analysis,
      candidate.chords.map(() => undefined),
      {
        occurredAt: "2026-07-29T00:00:00.000Z",
        userEdited: false,
        userVerified: true,
      },
    )!;

    await appendAnalysisFeedback([event]);
    const written = fsSpies.writeTextFile.mock.calls[0]?.[1] as string;
    const parsed = readAnalysisFeedbackJsonl(written);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.progressionSaveEvents).toHaveLength(1);
    expect(parsed.progressionSaveEvents[0]).toMatchObject({
      eventType: "progression-save",
      savedEventCount: candidate.chords.length,
      userEdited: false,
      userVerified: true,
    });
    for (const privateValue of [
      "private-song-name.mid",
      "C:\\",
      "D:\\",
      "Idea title",
      "memo",
    ]) {
      expect(written).not.toContain(privateValue);
    }

    fsSpies.exists.mockResolvedValue(true);
    fsSpies.readTextFile.mockResolvedValue(written);
    await expect(exportAnalysisFeedback("C:/exports/feedback.jsonl")).resolves.toBe(1);
    expect(fsSpies.writeTextFile).toHaveBeenLastCalledWith(
      "C:/exports/feedback.jsonl",
      expect.stringContaining('"eventType":"progression-save"'),
    );

    await deleteAnalysisFeedback();
    expect(fsSpies.remove).toHaveBeenCalledWith(
      "loopvault/analysis-feedback.jsonl",
      expect.objectContaining({ baseDir: 16 }),
    );
  });

  it("honors opt-out before touching the filesystem", async () => {
    setAnalysisFeedbackEnabled(false);
    await appendAnalysisFeedback([validEvent()]);
    expect(fsSpies.mkdir).not.toHaveBeenCalled();
    expect(fsSpies.writeTextFile).not.toHaveBeenCalled();
  });

  it("rejects an invalid runtime payload before appending", async () => {
    const invalid = {
      ...validEvent(),
      sourceFingerprint: "absolute/path/private.mid",
    } as PersistedAnalysisFeedbackEvent;
    await expect(appendAnalysisFeedback([invalid]))
      .rejects.toThrow("schema validation failed");
    expect(fsSpies.writeTextFile).not.toHaveBeenCalled();
  });
});

function validEvent(): PersistedAnalysisFeedbackEvent {
  return {
    schemaVersion: 1,
    eventType: "progression-save",
    sourceFingerprint: "fnv1a32-deadbeef",
    analyzerVersion: "phase5-accuracy-first-v1",
    occurredAt: "2026-07-29T00:00:00.000Z",
    range: { startBeat: 0, endBeat: 4 },
    savedEventCount: 1,
    userEdited: false,
    userVerified: true,
    decisions: [{
      startBeat: 0,
      endBeat: 4,
      detected: "Cmaj7",
      saved: "Cmaj7",
      outcome: "rank1",
    }],
  };
}

function fixtureMidiBytes(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]
    .forEach((chord, index) => chord.forEach((pitch) => {
      track.addNote({
        midi: pitch,
        time: index * 2,
        duration: 1.9,
        velocity: 0.8,
      });
    }));
  return new Uint8Array(midi.toArray());
}
