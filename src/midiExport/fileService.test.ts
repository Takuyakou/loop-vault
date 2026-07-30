import { describe, expect, it, vi } from "vitest";
import { buildProgressionMidi } from "../domain/midiExport";
import { makeChordSymbol } from "../domain/chords";
import type { SavedProgressionBlock } from "../domain/types";
import {
  DEFAULT_PROGRESSION_MIDI_FILE_NAME,
  ensureMidiExtension,
  prepareProgressionDragFile,
  sanitizeProgressionMidiFileName,
  saveProgressionMidi,
  type MidiExportFileDependencies,
} from "./fileService";

describe("Progression MIDI file service", () => {
  it("treats save dialog cancellation as a normal result", async () => {
    const dependencies = dependenciesWith(null);
    const result = await saveProgressionMidi(exportResult(), dependencies);

    expect(result).toEqual({ status: "cancelled" });
    expect(dependencies.invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["C:\\Music\\clip", "C:\\Music\\clip.mid"],
    ["C:\\Music\\clip.mid", "C:\\Music\\clip.mid"],
    ["C:\\Music\\clip.MIDI", "C:\\Music\\clip.MIDI"],
  ])("normalizes save extension for %s", async (selected, expected) => {
    const dependencies = dependenciesWith(selected);
    vi.mocked(dependencies.invoke).mockResolvedValue({ bytesLength: 4 });
    const midi = exportResult();

    const result = await saveProgressionMidi(midi, dependencies);

    expect(result).toEqual({ status: "saved", bytesLength: 4 });
    expect(dependencies.invoke).toHaveBeenCalledWith("save_progression_midi", {
      filePath: expected,
      bytes: Array.from(midi.bytes),
    });
  });

  it("passes the exact common exporter bytes to both save and temp preparation", async () => {
    const midi = exportResult();
    const saveDependencies = dependenciesWith("C:\\Music\\clip.mid");
    vi.mocked(saveDependencies.invoke).mockResolvedValue({ bytesLength: midi.bytes.length });
    const prepareInvoke = vi.fn().mockResolvedValue({
      dragToken: "drag-token",
      fileName: DEFAULT_PROGRESSION_MIDI_FILE_NAME,
      tempPath: "C:\\Cache\\hash.mid",
      bytesLength: midi.bytes.length,
      preparedAt: 1,
      expiresAt: 2,
      contentHash: "hash",
      reused: false,
    });

    await saveProgressionMidi(midi, saveDependencies);
    await prepareProgressionDragFile(midi, { invoke: prepareInvoke });

    const saveBytes = vi.mocked(saveDependencies.invoke).mock.calls[0]?.[1]?.bytes;
    const dragBytes = prepareInvoke.mock.calls[0]?.[1]?.bytes;
    expect(saveBytes).toEqual(Array.from(midi.bytes));
    expect(dragBytes).toEqual(saveBytes);
  });

  it("sanitizes Windows file names without leaking arbitrary source text", () => {
    expect(sanitizeProgressionMidiFileName("CON")).toBe("loop-vault-progression.mid");
    expect(sanitizeProgressionMidiFileName("my: progression?  ")).toBe("my-progression.mid");
    expect(sanitizeProgressionMidiFileName("a".repeat(150))).toHaveLength(100);
    expect(ensureMidiExtension("clip.midi")).toBe("clip.midi");
  });

  it("does not mutate the saved progression when native writing fails", async () => {
    const block = savedBlock();
    const before = structuredClone(block);
    const dependencies = dependenciesWith("C:\\Music\\clip.mid");
    vi.mocked(dependencies.invoke).mockRejectedValue(new Error("write failed"));

    await expect(saveProgressionMidi(buildProgressionMidi(block), dependencies))
      .rejects.toThrow("write failed");
    expect(block).toEqual(before);
  });
});

function dependenciesWith(selectedPath: string | null): MidiExportFileDependencies {
  return {
    showSaveDialog: vi.fn().mockResolvedValue(selectedPath),
    invoke: vi.fn(),
  };
}

function exportResult() {
  return buildProgressionMidi(savedBlock());
}

function savedBlock(): SavedProgressionBlock {
  return {
    id: "block",
    summaryText: "Private title",
    chords: [{
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(0, "maj7"),
      confidence: 1,
      alternatives: [],
      warnings: [],
    }],
    bpm: 120,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-30T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

