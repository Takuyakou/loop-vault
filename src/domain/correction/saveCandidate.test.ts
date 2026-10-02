import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { parseChordLabel } from "../chords";
import { createEmptyVault, type VaultBackup, type VaultLoadResult, type VaultRepository } from "../repository";
import { vaultFileSchema } from "../schema";
import type { ChordTimelineItem, VaultFile } from "../types";
import { normalizedChordKey, resolveTimelineItemVoicing, VOICING_EXTRACTOR_VERSION } from "../voicing";
import { createVaultStore } from "../../store/vaultStore";
import { chooseName, mergeWithNext, splitCard } from "./cardEdits";
import { buildCorrectionModel, type CorrectionModel } from "./correctionModel";
import { addNote, deleteNotes, movePitch, setTempo } from "./edits";
import { reviewThresholds } from "./reviewThresholds";
import { buildSaveCandidate, cardAuditionNotes, CORRECTION_EXTRACTOR_VERSION } from "./saveCandidate";
import { songPlaybackNotes } from "./songPlayback";

const inputs = new Map<string, ReturnType<typeof analyzeScenario>>();
function input(id: string) {
  if (!inputs.has(id)) inputs.set(id, analyzeScenario(p10Scenario(id)));
  return inputs.get(id)!;
}
const fresh = (id: string): CorrectionModel => buildCorrectionModel(input(id), reviewThresholds);
const timelineOf = (id: string): ChordTimelineItem[] => input(id).result.fullTimeline;
const notesOf = (model: CorrectionModel, cardId: string) => model.notes.filter((note) => note.cardId === cardId);
const usedOf = (model: CorrectionModel, cardId: string) => notesOf(model, cardId).filter((note) => note.used);
function saved(model: CorrectionModel, id: string, range = { startBar: 1, endBar: 8 }) {
  const result = buildSaveCandidate(model, range, timelineOf(id));
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.text).join(", "));
  return result;
}
const chord = (label: string) => parseChordLabel(label)!;

describe("save candidate from the workspace (P10.0-06)", () => {
  it("keeps the analysis item and voicing of a card nobody touched", () => {
    const model = fresh("plain-8");
    const { candidate } = saved(model, "plain-8");
    expect(candidate.chords).toHaveLength(8);
    const analysed = timelineOf("plain-8")[0]!;
    expect(candidate.chords[0]).toMatchObject({ bar: 1, beat: 1, durationBeats: analysed.durationBeats, chord: analysed.chord });
    expect(candidate.chords[0]!.voicingMemory).toEqual(analysed.voicingMemory);
  });

  it("writes the used source notes as sourceVoicing when only the span changed (split, merge)", () => {
    let model = splitCard(fresh("plain-8"), "card-0").model;
    model = mergeWithNext(model, "card-2").model;
    const { candidate } = saved(model, "plain-8");
    expect(candidate.chords).toHaveLength(8);
    const half = candidate.chords[1]!;
    expect(half).toMatchObject({ bar: 1, beat: 3, durationBeats: 2 });
    expect(half.voicingMemory).toEqual({
      sourceVoicing: expect.objectContaining({
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        userVerified: true,
        midiNotes: [...new Set(usedOf(model, model.cards[1]!.id).map((note) => note.pitch))].sort((a, b) => a - b),
        capturedForChordKey: normalizedChordKey(half.chord),
        extractorVersion: timelineOf("plain-8")[0]!.voicingMemory?.sourceVoicing?.extractorVersion ?? VOICING_EXTRACTOR_VERSION,
      }),
      playbackChoice: "SOURCE",
    });
    const merged = candidate.chords.find((item) => item.bar === 3)!;
    expect(merged.durationBeats).toBe(8);
    expect(merged.voicingMemory?.playbackChoice).toBe("SOURCE");
  });

  it("only excluded notes: sourceVoicing of what is left, no override", () => {
    const model0 = fresh("plain-8");
    const top = usedOf(model0, "card-1").sort((a, b) => b.pitch - a.pitch)[0]!;
    const model = deleteNotes(model0, [top.id]).model;
    const item = saved(model, "plain-8").candidate.chords[1]!;
    expect(item.voicingMemory?.practiceVoicingOverride).toBeUndefined();
    expect(item.voicingMemory?.playbackChoice).toBe("SOURCE");
    expect(item.voicingMemory?.sourceVoicing?.midiNotes).not.toContain(top.pitch);
  });

  it("added or moved notes: source at the first pitch, override now, CUSTOM with the p10 mark", () => {
    let model = fresh("plain-8");
    const moved = usedOf(model, "card-0").sort((a, b) => b.pitch - a.pitch)[0]!;
    model = movePitch(model, [moved.id], 2).model;
    model = addNote(model, "card-0", 71).model;
    const item = saved(model, "plain-8").candidate.chords[0]!;
    const memory = item.voicingMemory!;
    expect(memory.playbackChoice).toBe("CUSTOM");
    expect(memory.sourceVoicing!.midiNotes).toContain(moved.pitch);
    expect(memory.sourceVoicing!.midiNotes).not.toContain(71);
    expect(memory.practiceVoicingOverride).toMatchObject({
      source: "manual",
      userVerified: true,
      extractorVersion: CORRECTION_EXTRACTOR_VERSION,
      capturedForChordKey: normalizedChordKey(item.chord),
      capturedForChordLabel: item.chord.label,
    });
    expect(memory.practiceVoicingOverride!.midiNotes).toContain(moved.pitch + 2);
    expect(memory.practiceVoicingOverride!.midiNotes).toContain(71);
    expect(memory.practiceVoicingOverride!.midiNotes).not.toContain(moved.pitch);
  });

  it("re-labels every snapshot for a renamed card and records the person's name as a correction", () => {
    let model = addNote(fresh("plain-8"), "card-0", 71).model; // C + B → auto name updates
    const auto = model.cards[0]!.name;
    model = chooseName(model, "card-1", chord("Am7")).model; // Am → Am7, by hand
    const result = saved(model, "plain-8");
    const [first, second] = result.candidate.chords;
    expect(first!.chord.label).toBe(auto.label);
    expect(first!.voicingMemory!.practiceVoicingOverride!.capturedForChordKey).toBe(normalizedChordKey(first!.chord));
    expect(second!.chord.label).toBe("Am7");
    expect(second!.voicingMemory!.sourceVoicing!.capturedForChordKey).toBe(normalizedChordKey(second!.chord));
    expect(second!.voicingMemory!.sourceVoicing!.capturedForChordLabel).toBe("Am7");
    // Only the person's name is a correction; the automatic update is not.
    expect(result.editable.slots[0]!.edited).toBe(false);
    const fromAlternatives = timelineOf("plain-8")[1]!.alternatives.some((entry) => entry.chord.label === "Am7");
    expect(result.editable.slots[1]).toMatchObject({ edited: true, editSource: fromAlternatives ? "alternative" : "manual-label" });
    expect(result.original.chords[1]!.chord.label).toBe(timelineOf("plain-8")[1]!.chord.label);
    expect(result.userEdited).toBe(true);
  });

  it("refuses with the place: an unreadable name, one note or none", () => {
    const named = chooseName(fresh("plain-8"), "card-2", { ...chord("F"), label: "F??" }).model;
    expect(buildSaveCandidate(named, { startBar: 1, endBar: 8 }, timelineOf("plain-8"))).toEqual({ ok: false, problems: [{ cardId: "card-2", text: expect.stringMatching(/^読めない名前があります：3小節の F\?\?$/) }] });
    const model = fresh("plain-8");
    const thin = deleteNotes(model, usedOf(model, "card-2").slice(1).map((note) => note.id)).model;
    const result = buildSaveCandidate(thin, { startBar: 1, endBar: 8 }, timelineOf("plain-8"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]!.text).toMatch(/^2音以上にしてください：3小節の /);
    // Outside the range it does not matter.
    expect(buildSaveCandidate(thin, { startBar: 4, endBar: 8 }, timelineOf("plain-8")).ok).toBe(true);
  });

  it("refuses a card whose new span plays fewer than two notes (P10.0-07)", () => {
    // A card the analysis found no voicing for has no used notes; splitting it changes its span.
    const model0 = fresh("plain-8");
    const silent = { ...model0, notes: model0.notes.map((note) => note.cardId === "card-2" ? { ...note, used: false } : note) };
    const model = splitCard(silent, "card-2").model;
    const result = buildSaveCandidate(model, { startBar: 1, endBar: 8 }, timelineOf("plain-8"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]).toEqual({ cardId: "card-2", text: `区間を変えたので、このカードの音が2音未満です：3小節の ${model.cards.find((card) => card.id === "card-2")!.name.label}` });
    // Untouched, the same card saves as analysed (nothing re-extracted, nothing refused).
    expect(buildSaveCandidate(silent, { startBar: 1, endBar: 8 }, timelineOf("plain-8")).ok).toBe(true);
  });

  it("saves ten notes, and a range from the middle keeps the song's bar numbers like the current path", () => {
    let model = fresh("plain-8");
    for (let pitch = 72; usedOf(model, "card-4").length < 10; pitch += 1) model = addNote(model, "card-4", pitch).model;
    const { candidate } = saved(model, "plain-8", { startBar: 5, endBar: 8 });
    expect(candidate).toMatchObject({ startBar: 5, endBar: 8, lengthBars: 4 });
    expect(candidate.chords[0]).toMatchObject({ bar: 5, beat: 1 });
    expect(candidate.events![0]!.relativeStartBeat).toBe(0);
    expect(candidate.chords[0]!.voicingMemory!.practiceVoicingOverride!.midiNotes).toHaveLength(10);
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

describe("saved workspace progressions (P10.0-06 round trip and playback)", () => {
  it("survive save and reload unchanged, and play the workspace's B notes number for number", async () => {
    let model = fresh("melody-track-8");
    const melody = model.suggestions.find((entry) => entry.kind === "melody-voice");
    if (melody?.kind === "melody-voice") model = deleteNotes(model, melody.noteIds).model;
    model = addNote(model, model.cards[0]!.id, 71).model;
    const low = usedOf(model, model.cards[2]!.id).sort((a, b) => a.pitch - b.pitch)[0]!;
    model = movePitch(model, [low.id], 12).model;
    model = chooseName(model, model.cards[3]!.id, chord("Fmaj7")).model;
    model = splitCard(model, model.cards[4]!.id).model;
    const range = { startBar: 1, endBar: 8 };
    const result = buildSaveCandidate(model, range, timelineOf("melody-track-8"));
    if (!result.ok) throw new Error(result.problems.map((problem) => problem.text).join());

    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const id = store.getState().createIdeaFromDraft({
      title: "合成の保存",
      status: "idea",
      chordMemo: result.candidate.summaryText,
      progressionBlock: result.candidate,
      progressionAnalysis: input("melody-track-8").result,
      progressionMetadata: { userEdited: result.userEdited, userVerified: false },
    });
    await store.getState().flush();
    const before = store.getState().ideas.find((idea) => idea.id === id)!.progressionBlocks![0]!;
    const written = repository.saved[repository.saved.length - 1]!;
    expect(written.fileVersion).toBe(2);
    const after = vaultFileSchema.parse(JSON.parse(JSON.stringify(written))).ideas.find((idea) => idea.id === id)!.progressionBlocks![0]!;
    // What was written reads back the same (chords with their voicings, range, marks).
    expect(after.chords).toEqual(before.chords);
    expect({ startBar: after.startBar, endBar: after.endBar, summaryText: after.summaryText }).toEqual({ startBar: before.startBar, endBar: before.endBar, summaryText: before.summaryText });
    expect(vaultFileSchema.parse(JSON.parse(JSON.stringify(written)))).toEqual(vaultFileSchema.parse(JSON.parse(JSON.stringify(vaultFileSchema.parse(JSON.parse(JSON.stringify(written)))))));
    expect(after.chords.some((item) => item.voicingMemory?.practiceVoicingOverride?.extractorVersion === CORRECTION_EXTRACTOR_VERSION)).toBe(true);

    // Every saved card plays what the workspace's 「B カードの音」 played.
    const cards = result.cardIds.map((cardId) => model.cards.find((card) => card.id === cardId)!);
    expect(after.chords).toHaveLength(cards.length);
    after.chords.forEach((item, index) => {
      expect(resolveTimelineItemVoicing(item).midiNotes, `${cards[index]!.bar}.${cards[index]!.beat} ${item.chord.label}`)
        .toEqual(cardAuditionNotes(model, cards[index]!, timelineOf("melody-track-8")));
    });
    // P10.2 §2: the workspace's song playback plays the same notes as the saved progression.
    const song = songPlaybackNotes(model, timelineOf("melody-track-8"), 0, 120);
    after.chords.forEach((item, index) => {
      const sounding = song.filter((note) => note.startBeat === cards[index]!.start).map((note) => note.pitch);
      expect(sounding.sort((x, y) => x - y)).toEqual([...resolveTimelineItemVoicing(item).midiNotes].sort((x, y) => x - y));
    });
    // The renamed card plays its corrected notes, not a generated voicing.
    const renamed = after.chords.find((item) => item.chord.label === "Fmaj7")!;
    expect(resolveTimelineItemVoicing(renamed).origin).not.toBe("generated");
  });
});

describe("the workspace tempo through the store (P10.1 §12.4)", () => {
  it("saves a tempo a person set (also for a MIDI without one), and reloads it; leaves it out otherwise", async () => {
    const { withTempo } = await import("../../views/capture/useCaptureSave");
    const base = input("plain-8").result;
    const noTempo = { ...base, tempoDiagnostics: { ...base.tempoDiagnostics, provenance: "SMF_DEFAULT" } } as typeof base;
    const model = setTempo(buildCorrectionModel({ ...input("plain-8"), result: noTempo }, reviewThresholds), 100).model;
    const result = buildSaveCandidate(model, { startBar: 1, endBar: 4 }, timelineOf("plain-8"));
    if (!result.ok) throw new Error("save");
    expect(result.bpm).toBe(100);

    const save = async (analysis: typeof noTempo, bpm: number | undefined) => {
      const repository = new FakeRepository();
      const store = createVaultStore({ repository });
      await store.getState().initialize();
      const id = store.getState().createIdeaFromDraft({
        title: "テンポ",
        status: "idea",
        ...(bpm !== undefined ? { bpm } : {}),
        progressionBlock: result.candidate,
        progressionAnalysis: withTempo(analysis, bpm),
        progressionMetadata: { userEdited: true, userVerified: false },
      });
      await store.getState().flush();
      const written = repository.saved[repository.saved.length - 1]!;
      return vaultFileSchema.parse(JSON.parse(JSON.stringify(written))).ideas.find((idea) => idea.id === id)!;
    };
    const changed = await save(noTempo, 100);
    expect(changed.bpm).toBe(100);
    expect(changed.progressionBlocks![0]!.bpm).toBe(100);
    const untouched = await save(noTempo, undefined);
    expect(untouched.bpm).toBeUndefined();
    expect(untouched.progressionBlocks![0]!.bpm).toBeUndefined();
  });
});
