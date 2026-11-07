import { describe, expect, it } from "vitest";
import { createVaultStore } from "../store/vaultStore";
import type { VaultStorage } from "./repository";
import { JazzVaultRepository } from "../storage/jazzVaultStorage";
import { parseTextProgression } from "./textProgression";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextSaveData } from "./extendedTextSave";
import { createTextProgressionDraft, textProgressionDraftSavePayload } from "./textProgressionDraft";
import { standardTextPlaybackNotes } from "./standardTextPlayback";
import { extendedTextPlaybackNotes } from "./extendedTextPlayback";
import { textVoicingAvailability } from "./textVoicingAvailability";
import { collectVault, syncVault } from "./chordDojo/collect";
import { emptyStore } from "./chordDojo/store";
import { targetFor } from "./chordDojo/session";
import { judgeChord } from "./chordDojo/judging";
import { buildProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice/snapshot";
import { resolveProgressionPracticeVoicings } from "./progressionVoicingPractice/voicingResolution";
import { selectVaultChordContextSections } from "../features/bass-practice/domain/chordContextSnapshot";
import { createVaultBasslineExercise } from "../features/bass-practice/domain/vaultBassline";
import { voiceChordContext } from "../features/bass-practice/application/chordContextPlayback";
import type { SavedProgressionBlock, SongIdea } from "./types";

const at = "2026-10-11T00:00:00.000Z";
// Written independent MIDI sets; none are obtained from a product validator/generator.
const expected = [
  [48, 63, 67, 71], [43, 63, 65, 70, 71], [43, 62, 63, 65, 68, 70, 71],
  [43, 62, 63, 65, 68, 71], [43, 60, 63, 71], [47, 63, 65, 67, 70],
];
const input = "| Cm(maj7) | G7alt | G7(b9,#9,b13) | G7(b9,b13) | Cm(maj7)/G | G7alt/B |";
class MemoryStorage implements VaultStorage {
  readonly files = new Map<string, string>();
  async ensureDir(_path: string) {}
  async exists(path: string) { return this.files.has(path); }
  async readText(path: string) { const value = this.files.get(path); if (value === undefined) throw new Error("Missing synthetic data"); return value; }
  async writeText(path: string, value: string) { this.files.set(path, value); }
  async rename(from: string, to: string) { this.files.set(to, await this.readText(from)); this.files.delete(from); }
  async copyFile(from: string, to: string) { this.files.set(to, await this.readText(from)); }
  async removeFile(path: string) { this.files.delete(path); }
  async listFiles(path: string) { return [...this.files.keys()].filter(key => key.startsWith(path + "/")).map(key => key.slice(path.length + 1)); }
}

function payload(dialect: "standard" | "extended", text = input) {
  if (dialect === "extended") {
    const parsed = parseExtendedTextProgression(text, { beat: "4/4", bpm: 100, key: "C minor", confirmed: true });
    const saved = extendedTextSaveData(parsed);
    return { saved: { ...saved, nextAction: "", userEdited: false, userVerified: true },
      playback: extendedTextPlaybackNotes(parsed), parsedChords: parsed.harmonicSpans.map(span => span.chord) };
  }
  const parsed = parseTextProgression(text, { confirmedKey: "C minor" });
  const draft = createTextProgressionDraft({ result: parsed, now: at, draftId: "synthetic-jazz" });
  return { saved: textProgressionDraftSavePayload(draft, {
    title: "合成ジャズ", nextAction: "", userVerified: true, bpm: 100, confirmedKey: "C minor",
  }), playback: standardTextPlaybackNotes(parsed), parsedChords: parsed.events.map(event => event.chord) };
}

async function persist(saved: ReturnType<typeof payload>["saved"]) {
  const storage = new MemoryStorage();
  const repository = new JazzVaultRepository(storage, { now: () => new Date(at) });
  let sequence = 0;
  const store = createVaultStore({ repository, now: () => new Date(at),
    idFactory: () => `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` });
  await store.getState().initialize();
  expect(store.getState().createIdeaFromTextProgression(saved)).toBeDefined();
  await store.getState().flush();
  const loaded = await new JazzVaultRepository(storage).load();
  expect(loaded.quarantine).toHaveLength(0);
  await repository.exportTo("synthetic-export.json");
  const exported = JSON.parse(storage.files.get("synthetic-export.json")!);
  expect(exported.fileVersion).toBe(3);
  const importedStorage = new MemoryStorage();
  importedStorage.files.set("synthetic-export.json", storage.files.get("synthetic-export.json")!);
  const importedRepository = new JazzVaultRepository(importedStorage);
  await importedRepository.importFrom("synthetic-export.json", { mode: "replace" });
  const imported = await importedRepository.load();
  expect(imported.quarantine).toHaveLength(0);
  expect(imported.vault.ideas).toEqual(loaded.vault.ideas);
  return imported.vault.ideas[0]!;
}

function verifyDojo(idea: SongIdea, block: SavedProgressionBlock) {
  const collection = collectVault([idea], at);
  const dojo = syncVault(emptyStore(new Date(at)), collection, at);
  const keys = Object.keys(collection.voicings);
  expect(keys).toHaveLength(6);
  expect(Object.values(collection.voicings).every(voice => voice.occurrences.every(occurrence => occurrence.source === "saved"))).toBe(true);
  for (const [index, notes] of expected.entries()) {
    const key = "notes:" + notes.join(",");
    const task = { kind: "voicing" as const, key, review: false, roots: [0], seconds: 40 };
    dojo.today = { date: "2026-10-11", tasks: [task], cursor: { taskIndex: 0, keyIndex: 0, chordIndex: 0,
      stage: "recall", answerSeen: false, hints: [], tempoResults: [] }, finished: false, added: [], matched: 0 };
    const target = targetFor(dojo, task, collection.progressions).target;
    expect(target.judge).toBe("exact");
    expect(target.notes).toEqual(notes);
    expect(target.chord).toEqual(block.chords[index]!.chord);
    expect(judgeChord(target, notes).ok).toBe(true);
    expect(judgeChord(target, notes.map(note => note + 12)).ok).toBe(false);
  }
  const progression = collection.progressions[0]!;
  const task = { kind: "progression" as const, key: progression.key, review: false, roots: [0], seconds: 120 };
  dojo.today = { date: "2026-10-11", tasks: [task], cursor: { taskIndex: 0, keyIndex: 0, chordIndex: 1,
    stage: "recall", answerSeen: false, hints: [], tempoResults: [] }, finished: false, added: [], matched: 0 };
  const target = targetFor(dojo, task, collection.progressions).target;
  expect(target.judge).toBe("exact");
  expect(judgeChord(target, expected[1]!).ok).toBe(true);
  expect(judgeChord(target, [43, 59, 62, 65]).ok).toBe(false);
}

describe("TXT-JAZZ real save/reload/export/import to registered Dojo", () => {
  it.each(["standard", "extended"] as const)("preserves full %s text workflow and exact registered pitches", async dialect => {
    const data = payload(dialect);
    expect(data.saved.chords.map(event => event.voicingMemory?.practiceVoicingOverride?.midiNotes)).toEqual(expected);
    expect(expected.map((_, index) => data.playback.filter(note => note.startBeat === index * 4).map(note => note.pitch))).toEqual(expected);
    const idea = await persist(data.saved);
    const block = idea.progressionBlocks![0]!;
    expect(block.chords.map(event => event.chord)).toEqual(data.parsedChords);
    expect(block.chords.map(event => event.voicingMemory?.practiceVoicingOverride?.midiNotes)).toEqual(expected);
    expect(block.chords[1]!.chord).toMatchObject({ quality: "dom7", altered: true, tensions: [], label: "G7alt" });
    expect(block.chords[2]!.chord.altered).toBeUndefined();
    for (const event of block.chords) expect(event.voicingMemory?.practiceVoicingOverride).toMatchObject({
      source: "manual", extractorVersion: "text-style-v1:generated-close", capturedForChordLabel: event.chord.label,
    });
    expect(block.chords.every(event => event.voicingMemory?.sourceVoicing === undefined)).toBe(true);
    verifyDojo(idea, block);
  });

  it.each(["standard", "extended"] as const)("saves impossible %s harmony without audio or registered replacement", async dialect => {
    const data = payload(dialect, "| G7alt/D |");
    expect(data.playback).toEqual([]);
    expect(data.saved.chords[0]!.voicingMemory?.practiceVoicingOverride).toBeUndefined();
    expect(textVoicingAvailability(data.parsedChords.map(chord => ({ chord })))).toEqual({
      registered: 0, total: 1, unavailable: ["G7alt/D"],
    });
    const idea = await persist(data.saved);
    expect(idea.progressionBlocks![0]!.chords[0]!.chord).toMatchObject({ altered: true, bass: 2, label: "G7alt/D" });
    const collected = collectVault([idea], at);
    expect(collected.voicings).toEqual({});
    expect(collected.progressions[0]!.chords[0]!.notes).toEqual([]);
  });

  it("rejects parser errors before saving either dialect, including partially valid input", () => {
    expect(() => payload("standard", "| Cm(maj7) | Unknown |")).toThrow();
    expect(() => payload("extended", "| Cm(maj7) | Unknown |")).toThrow();
  });

  it("preserves snapshots/identity while denying unsupported generation and Context entry", async () => {
    const idea = await persist(payload("standard").saved);
    const block = idea.progressionBlocks![0]!;
    expect(selectVaultChordContextSections(block).ok).toBe(false);
    expect(createVaultBasslineExercise(block, "synthetic", 1).ok).toBe(false);
    expect(voiceChordContext(block.chords[1]!.chord).ok).toBe(false);
    for (const selection of ["saved", "basic-full", "basic-shell", "full-shell", "rootless-shell", "left-hand"] as const) {
      const built = buildProgressionVoicingPracticeSnapshot({ sourceReference: { ideaId: idea.id, blockId: block.id }, block, selection });
      expect(built.ok).toBe(true);
      if (!built.ok) throw new Error("Expected synthetic snapshot");
      expect(built.snapshot.events[1]!.chord).toMatchObject({ altered: true, label: "G7alt" });
      const plan = resolveProgressionPracticeVoicings(built.snapshot);
      expect(plan.events[1]!.status).toBe(selection === "saved" ? "SUPPORTED" : "UNSUPPORTED_RULE");
      for (const study of ["teacher", "core"] as const) for (const color of [false, true]) for (const open of [false, true]) {
        const studyPlan = resolveProgressionPracticeVoicings(built.snapshot, {
          lessonStudyCategory: study, lessonColorEnabled: color, lessonOpenEnabled: open, detailedFallbackStudy: "teacher",
        });
        expect(studyPlan.events[1]!.status).toBe(selection === "saved" ? "SUPPORTED" : "UNSUPPORTED_RULE");
      }
    }
  });
});
