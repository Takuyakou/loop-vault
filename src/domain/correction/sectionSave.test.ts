import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { createEmptyVault, type VaultBackup, type VaultLoadResult, type VaultRepository } from "../repository";
import { vaultFileSchema } from "../schema";
import type { VaultFile } from "../types";
import { resolveTimelineItemVoicing } from "../voicing";
import { createVaultStore } from "../../store/vaultStore";
import { buildCorrectionModel, type CorrectionModel, type CorrectionSegment } from "./correctionModel";
import { parseChordLabel } from "../chords";
import { chooseName } from "./cardEdits";
import { deleteNotes } from "./edits";
import { reviewThresholds } from "./reviewThresholds";
import { buildSaveCandidate, cardAuditionNotes } from "./saveCandidate";
import { sectionSaveRows, wholeSongRange } from "./sectionSave";

/** P10.2 addendum 2: save the whole song when no range is chosen; save by section. */

const plain = analyzeScenario(p10Scenario("plain-8"));
const long = analyzeScenario(p10Scenario("long-64"));
const model = (input = plain): CorrectionModel => buildCorrectionModel(input, reviewThresholds);
const segment = (id: string, startBar: number, endBar: number): CorrectionSegment => ({ id, startBar, endBar, label: `区切り${id}`, source: "segmentSections" });

describe("the whole song (addendum 2 §1)", () => {
  it("runs from the first card's bar to the last card's bar, rests before and after left out", () => {
    expect(wholeSongRange(model())).toEqual({ startBar: 1, endBar: 8 });
    const base = model();
    const inner = { ...base, cards: base.cards.slice(1, -1) }; // the first and the last bar are rests now
    expect(wholeSongRange(inner)).toEqual({ startBar: 2, endBar: 7 });
    expect(wholeSongRange({ ...base, cards: [] })).toBeUndefined();
  });
});

describe("rows for saving by section (addendum 2 §2.2)", () => {
  // plain-8 is C Am F G7 twice: 1–4 and 5–8 hold the same chords; 3–4 is part of the first.
  const segmented = () => ({ ...model(), segments: [segment("1", 1, 4), segment("2", 5, 8), segment("3", 3, 4)] });

  it("folds a segment with the same chords into the first one, which says so", () => {
    const rows = sectionSaveRows(segmented(), plain.result.fullTimeline, new Set());
    expect(rows.map((row) => row.segment.label)).toEqual(["区切り1", "区切り3"]);
    expect(rows[0]).toMatchObject({ range: { startBar: 1, endBar: 4 }, names: ["C", "Am", "F", "G7"], sameAs: ["区切り2"], saved: false });
    expect(rows.every((row) => row.result.ok)).toBe(true);
  });

  it("marks a saved range, and a segment that cannot be saved with why", () => {
    const base = segmented();
    const card = base.cards[6]!; // F in bar 7, inside 区切り2 only
    const used = base.notes.filter((note) => note.cardId === card.id && note.used);
    // One note left (it cannot be saved) and a typed name (区切り2 is no longer the same as 区切り1).
    const broken = chooseName(deleteNotes(base, used.slice(1).map((note) => note.id)).model, card.id, parseChordLabel("Dm")!, "typed").model;
    const rows = sectionSaveRows(broken, plain.result.fullTimeline, new Set(["1-4"]));
    expect(rows.map((row) => row.segment.label)).toEqual(["区切り1", "区切り2", "区切り3"]);
    expect(rows[0]!.saved).toBe(true);
    expect(rows[1]!.result.ok).toBe(false);
    expect(!rows[1]!.result.ok && rows[1]!.result.problems[0]!.cardId).toBe(card.id);
  });
});

class FakeRepository implements VaultRepository {
  saved: VaultFile[] = [];
  async load(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async save(vault: VaultFile): Promise<void> { this.saved.push(vault); }
  async listBackups(): Promise<VaultBackup[]> { return []; }
  async restore(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
}

describe("saving the whole song and by section through the store (addendum 2 §4, data retention)", () => {
  it("a 64-bar song saves as one progression and reads back the same, every chord playing its B notes", async () => {
    const workspace = model(long);
    const range = wholeSongRange(workspace)!;
    const result = buildSaveCandidate(workspace, range, long.result.fullTimeline);
    if (!result.ok) throw new Error(result.problems.map((problem) => problem.text).join());
    expect(result.candidate.chords).toHaveLength(workspace.cards.length);

    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const id = store.getState().createIdeaFromDraft({
      title: "曲全体",
      status: "idea",
      chordMemo: result.candidate.summaryText,
      progressionBlock: result.candidate,
      progressionAnalysis: long.result,
      progressionMetadata: { userEdited: result.userEdited, userVerified: false },
    });
    expect(id).toBeTruthy();
    await store.getState().flush();
    const written = repository.saved[repository.saved.length - 1]!;
    const before = store.getState().ideas.find((idea) => idea.id === id)!.progressionBlocks![0]!;
    const after = vaultFileSchema.parse(JSON.parse(JSON.stringify(written))).ideas.find((idea) => idea.id === id)!.progressionBlocks![0]!;
    expect(after.chords).toEqual(before.chords);
    expect({ startBar: after.startBar, endBar: after.endBar }).toEqual({ startBar: range.startBar, endBar: range.endBar });
    expect(after.chords).toHaveLength(workspace.cards.length);
    const cards = result.cardIds.map((cardId) => workspace.cards.find((card) => card.id === cardId)!);
    after.chords.forEach((item, index) => expect(resolveTimelineItemVoicing(item).midiNotes).toEqual(cardAuditionNotes(workspace, cards[index]!, long.result.fullTimeline)));
  });

  it("sections go into one idea as several progressions and read back the same", async () => {
    const workspace = model(long);
    const rows = sectionSaveRows(workspace, long.result.fullTimeline, new Set()).filter((row) => row.result.ok);
    expect(rows.length).toBeGreaterThan(1);
    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const ready = rows.map((row) => { if (!row.result.ok) throw new Error("save"); return row.result; });
    const id = store.getState().createIdeaFromDraft({
      title: "区切りごと",
      status: "idea",
      chordMemo: ready[0]!.candidate.summaryText,
      progressionBlock: ready[0]!.candidate,
      progressionAnalysis: long.result,
      progressionMetadata: { userEdited: ready[0]!.userEdited, userVerified: false },
    })!;
    for (const next of ready.slice(1)) {
      expect(store.getState().appendBlockToIdea(id, next.candidate, long.result, { userEdited: next.userEdited, userVerified: false })).toBeTruthy();
    }
    await store.getState().flush();
    const written = repository.saved[repository.saved.length - 1]!;
    const before = store.getState().ideas.find((idea) => idea.id === id)!.progressionBlocks!;
    const after = vaultFileSchema.parse(JSON.parse(JSON.stringify(written))).ideas.find((idea) => idea.id === id)!.progressionBlocks!;
    expect(after).toHaveLength(ready.length);
    expect(after.map((block) => block.chords)).toEqual(before.map((block) => block.chords));
    expect(after.map((block) => [block.startBar, block.endBar])).toEqual(rows.map((row) => [row.range.startBar, row.range.endBar]));
  });
});
