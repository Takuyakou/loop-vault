import { describe, expect, it } from "vitest";
import { buildVaultPickerCandidateViews } from "../features/bass-practice/application/vaultPickerCandidates";
import {
  buildVaultChordContextSnapshot,
  selectVaultChordContextSections,
} from "../features/bass-practice/domain/chordContextSnapshot";
import { STANDARD_BASS_TUNINGS } from "../features/bass-practice/domain/constants";
import { createVaultRootMotionExercise } from "../features/bass-practice/domain/rootMotionVault";
import { createVaultStore } from "../store/vaultStore";
import { filterAndSortProgressions } from "./progressionFilters";
import {
  JsonVaultRepository,
  type VaultStorage,
} from "./repository";
import {
  evaluateTextProgressionCapabilities,
  parseTextProgression,
  textProgressionCapability,
  type TextProgressionParseResult,
} from "./textProgression";
import {
  createTextProgressionDraft,
  textProgressionDraftSavePayload,
} from "./textProgressionDraft";
import type { SavedProgressionBlock, SongIdea } from "./types";

const NOW = new Date("2026-08-10T00:00:00.000Z");
const IDEA_ID = "11111111-1111-4111-8111-111111111111";
const BLOCK_ID = "22222222-2222-4222-8222-222222222222";

class MemoryVaultStorage implements VaultStorage {
  private readonly files = new Map<string, string>();

  async ensureDir(_path: string): Promise<void> {}

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`Missing in-memory file: ${path}`);
    return value;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  async rename(from: string, to: string): Promise<void> {
    const value = await this.readText(from);
    this.files.set(to, value);
    this.files.delete(from);
  }

  async copyFile(from: string, to: string): Promise<void> {
    this.files.set(to, await this.readText(from));
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async listFiles(path: string): Promise<string[]> {
    const prefix = `${path.replace(/\/+$/, "")}/`;
    return [...this.files.keys()]
      .filter((candidate) => candidate.startsWith(prefix))
      .map((candidate) => candidate.slice(prefix.length));
  }
}

function parsed(input: string, confirmedKey?: string): TextProgressionParseResult {
  const result = parseTextProgression(input, { confirmedKey });
  if (!result.canConvert) throw new Error(`Expected valid text progression: ${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`);
  return result;
}

function savePayload(result: TextProgressionParseResult, options: {
  readonly title: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}) {
  const draft = createTextProgressionDraft({
    result,
    now: NOW.toISOString(),
    draftId: "text-progression-downstream-draft",
  });
  return textProgressionDraftSavePayload(draft, {
    title: options.title,
    nextAction: "",
    userVerified: true,
    ...(options.bpm === undefined ? {} : { bpm: options.bpm }),
    ...(options.confirmedKey === undefined ? {} : { confirmedKey: options.confirmedKey }),
  });
}

async function saveThenReload(payload: ReturnType<typeof savePayload>): Promise<{
  readonly idea: SongIdea;
  readonly block: SavedProgressionBlock;
}> {
  const storage = new MemoryVaultStorage();
  const repository = new JsonVaultRepository(storage, { now: () => NOW });
  const ids = [
    IDEA_ID,
    BLOCK_ID,
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ];
  const store = createVaultStore({
    repository,
    idFactory: () => {
      const id = ids.shift();
      if (!id) throw new Error("Unexpected extra ID allocation.");
      return id;
    },
    now: () => NOW,
  });
  await store.getState().initialize();
  expect(store.getState().createIdeaFromTextProgression(payload)).toBe(IDEA_ID);
  await store.getState().flush();

  const reloaded = createVaultStore({
    repository: new JsonVaultRepository(storage, { now: () => NOW }),
    now: () => NOW,
  });
  await reloaded.getState().initialize();
  const idea = reloaded.getState().ideas.find((candidate) => candidate.id === IDEA_ID);
  const block = idea?.progressionBlocks?.find((candidate) => candidate.id === BLOCK_ID);
  if (!idea || !block) throw new Error("Text progression was not available after Vault reload.");
  return { idea, block };
}

const sortByCapture = { field: "capturedAt", direction: "desc" } as const;
const noFilters = {
  pinnedOnly: false,
  keys: [],
  lengths: [],
  sources: [],
  tags: [],
};

describe("Text Progression downstream persistence", () => {
  it("round-trips an eligible text progression into Vault search, Chord Context, and an eight-root Root Motion path", async () => {
    const result = parsed("| Cmaj7 Cmaj7 | Cmaj7 Cmaj7 | Cmaj7 Cmaj7 | Cmaj7 Cmaj7 |", "C major");
    const capabilities = evaluateTextProgressionCapabilities({ result, bpm: 104, rootMotionNoteCount: 8 });
    expect(textProgressionCapability(capabilities, "vault-save")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-dojo")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "bass-practice")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-context")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "root-motion")).toMatchObject({ status: "supported" });

    const { idea, block } = await saveThenReload(savePayload(result, {
      title: "Reloadable text progression",
      bpm: 104,
      confirmedKey: "C major",
    }));

    expect(block).toMatchObject({
      detectedKey: "C major",
      bpm: 104,
      timeSignature: "4/4",
      analyzerVersion: "text-progression-v1",
    });
    expect(block.chords).toHaveLength(8);
    expect(block.chords.every((chord) => chord.confidence === 0 && chord.alternatives.length === 0)).toBe(true);
    for (const field of ["sourceAssetId", "sourceFileName", "sourceFingerprint", "sourceAnalyzerVersion", "sourceWeightsVersion", "origin", "progressionAnalysis"]) {
      expect(block).not.toHaveProperty(field);
    }

    expect(filterAndSortProgressions([idea], { ...noFilters, query: "Cmaj7" }, sortByCapture)).toHaveLength(1);
    expect(filterAndSortProgressions([idea], { ...noFilters, query: "I I I" }, sortByCapture)).toHaveLength(1);

    const pickerCandidates = buildVaultPickerCandidateViews([idea], "Untitled progression");
    const pickerCandidate = pickerCandidates.find((candidate) => candidate.safeSnapshot.section.id === "bars:1-4");
    expect(pickerCandidate?.displayTitle).toBe("Reloadable text progression");
    expect(JSON.stringify(pickerCandidate?.safeSnapshot)).not.toMatch(/title|sourceAsset|sourceFile|analyzer|confidence/i);

    const snapshotResult = buildVaultChordContextSnapshot({
      sourceReference: { ideaId: idea.id, blockId: block.id },
      block,
      sectionId: "bars:1-4",
    });
    if (!snapshotResult.ok) throw new Error(snapshotResult.error.message);
    expect(snapshotResult.snapshot.section.chords).toHaveLength(8);
    expect(snapshotResult.snapshot.source).toMatchObject({ kind: "vault", reference: { ideaId: idea.id, blockId: block.id } });

    const exercise = createVaultRootMotionExercise({
      snapshot: snapshotResult.snapshot,
      level: 4,
      noteCount: 8,
      tuning: STANDARD_BASS_TUNINGS[5],
      stringCount: 5,
      fretRange: { min: 0, max: 12 },
      pitchSpan: { minMidi: 23, maxMidi: 55 },
      handedness: "right",
    });
    expect(exercise.ok).toBe(true);
    if (!exercise.ok) throw new Error(exercise.error.message);
    expect(exercise.exercise.source).toMatchObject({ kind: "vault-root-path", rootPathPolicyVersion: "v1" });
    expect(exercise.exercise.targetEvents).toHaveLength(8);
    expect(exercise.exercise.generatorSnapshot.noteCount).toBe(8);
  });

  it("keeps a valid but practice-ineligible text progression saved and searchable without fabricating a Chord Context source", async () => {
    const result = parsed("| Cmaj7 |");
    const capabilities = evaluateTextProgressionCapabilities({ result });
    expect(textProgressionCapability(capabilities, "vault-save")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-dojo")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "bass-practice")).toMatchObject({ status: "unsupported" });
    expect(textProgressionCapability(capabilities, "chord-context")).toMatchObject({ status: "unsupported" });
    expect(textProgressionCapability(capabilities, "root-motion")).toMatchObject({ status: "unsupported" });

    const { idea, block } = await saveThenReload(savePayload(result, { title: "Saved without practice metadata" }));
    expect(block).not.toHaveProperty("detectedKey");
    expect(block).not.toHaveProperty("bpm");
    expect(filterAndSortProgressions([idea], { ...noFilters, query: "Cmaj7" }, sortByCapture)).toHaveLength(1);
    expect(selectVaultChordContextSections(block)).toMatchObject({
      ok: false,
      error: { code: "unsupported-source" },
    });
    expect(buildVaultPickerCandidateViews([idea], "Untitled progression")).toEqual([]);
  });
});
