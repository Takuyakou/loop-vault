import { describe, expect, it } from "vitest";
import {
  createEmptyVault,
  type VaultBackup,
  type VaultLoadResult,
  type VaultRepository,
} from "./repository";
import type { VaultFile } from "./types";
import { asExtendedTextResult, parseUnifiedText } from "./textUnified";
import { extendedTextSaveData } from "./extendedTextSave";
import { createVaultStore } from "../store/vaultStore";
import { normalizedChordKey } from "./voicing";
import { textPreviewNotes } from "./textVoicingAvailability";

class MemoryRepository implements VaultRepository {
  vault: VaultFile = createEmptyVault();
  async load(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async save(vault: VaultFile): Promise<void> {
    this.vault = vault;
  }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
  async listBackups(): Promise<VaultBackup[]> {
    return [];
  }
  async restore(): Promise<VaultLoadResult> {
    return { vault: this.vault, quarantine: [], created: false };
  }
}

const CHART = ["# メモ", "歌詞の行", "| Ｃmaj7 | Dm7 |", "[サビ]", "| G7 | Cmaj7 |"].join("\n");

describe("P24-05 05-a saving through the one grammar", () => {
  it("keeps the typed text and the cards' voicings, and never reads the lyrics", () => {
    const unified = parseUnifiedText(CHART, { beat: "4/4" });
    expect(unified.canConvert).toBe(true);
    expect(unified.spans).toHaveLength(4);
    const data = extendedTextSaveData(asExtendedTextResult(unified));
    expect(data.textSource.rawText).toBe(CHART);
    expect(data.chords).toHaveLength(4);
    expect(data.chords.every((card) => card.voicingMemory?.practiceVoicingOverride?.midiNotes.length)).toBeTruthy();
  });

  it("saves and reloads a chart the old standard grammar could not read", async () => {
    const repository = new MemoryRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const unified = parseUnifiedText(CHART, { beat: "4/4" });
    const data = extendedTextSaveData(asExtendedTextResult(unified));
    const ideaId = store.getState().createIdeaFromTextProgression({
      title: "歌詞つき",
      chords: data.chords,
      summaryText: data.summaryText,
      scoreLengthBeats: data.scoreLengthBeats,
      beatsPerBar: data.beatsPerBar,
      textSource: data.textSource,
    });
    expect(ideaId).toBeDefined();
    const block = store.getState().ideas.find((idea) => idea.id === ideaId)!.progressionBlocks![0]!;
    expect(block.textSource?.rawText).toBe(CHART);
    expect(block.chords).toHaveLength(4);

    const reloaded = createVaultStore({ repository });
    await store.getState().flush();
    await reloaded.getState().initialize();
    const saved = reloaded.getState().ideas.find((idea) => idea.id === ideaId);
    expect(saved?.progressionBlocks?.[0]?.chords).toHaveLength(4);
  });

  it("P24-06: keeps the keys played for a card through save and reload", async () => {
    const repository = new MemoryRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const unified = parseUnifiedText(CHART, { beat: "4/4" });
    const cardChord = unified.spans[0]!.chord;
    const played = {
      schemaVersion: 1 as const,
      source: "live-played" as const,
      representation: "simultaneous-voicing" as const,
      midiNotes: [48, 52, 55, 59],
      bassNote: 48,
      capturedForChordKey: normalizedChordKey(cardChord),
      capturedForChordLabel: cardChord.label,
      confidence: 1,
      userVerified: true,
    };
    const voicingBySpanStart = new Map([[unified.spans[0]!.sourceSpan.start, played]]);
    const data = extendedTextSaveData(asExtendedTextResult(unified), { bySpanStart: voicingBySpanStart });
    expect(data.chords[0]?.voicingMemory?.practiceVoicingOverride?.midiNotes).toEqual([48, 52, 55, 59]);
    const ideaId = store.getState().createIdeaFromTextProgression({
      title: "鍵盤で弾いた進行",
      chords: data.chords,
      summaryText: data.summaryText,
      scoreLengthBeats: data.scoreLengthBeats,
      beatsPerBar: data.beatsPerBar,
      textSource: data.textSource,
    });
    await store.getState().flush();
    const reloaded = createVaultStore({ repository });
    await reloaded.getState().initialize();
    const block = reloaded.getState().ideas.find((idea) => idea.id === ideaId)!.progressionBlocks![0]!;
    expect(block.chords[0]?.voicingMemory?.practiceVoicingOverride?.midiNotes).toEqual([48, 52, 55, 59]);
    // What playback resolves from the reloaded card is the very sound that was played.
    expect([...textPreviewNotes(block.chords[0]!.chord, block.chords[0]!.voicingMemory)]).toEqual([48, 52, 55, 59]);
    // The rest of the cards keep the generated voicing they had.
    expect(block.chords[1]?.voicingMemory?.practiceVoicingOverride?.source).not.toBe("live-played");
  });

  it("stops at the input budget the extended grammar had", () => {
    const allowed = parseUnifiedText("C ".repeat(32_768), { beat: "4/4" });
    expect(allowed.diagnostics.some((entry) => entry.code === "input-too-long")).toBe(false);
    const tooLong = parseUnifiedText("C".repeat(65_537), { beat: "4/4" });
    expect(tooLong.canConvert).toBe(false);
    expect(tooLong.diagnostics.some((entry) => entry.code === "input-too-long")).toBe(true);
  });
});
