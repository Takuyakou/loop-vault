import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { buildCorrectionModel, type CorrectionModel } from "../correction/correctionModel";
import { restoreNotes } from "../correction/edits";
import { reviewThresholds } from "../correction/reviewThresholds";
import { buildSaveCandidate } from "../correction/saveCandidate";
import { wholeSongRange } from "../correction/sectionSave";
import { buildSessionAnalysisRequest, createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import { createEmptyVault, type VaultBackup, type VaultLoadResult, type VaultRepository } from "../repository";
import { vaultFileSchema } from "../schema";
import type { VaultFile } from "../types";
import { createVaultStore } from "../../store/vaultStore";
import { restoreExcludedNotes } from "./restoreExcluded";
import { buildSplitAnalysisRequest, restorePartNames, type PartSplits } from "./splitSession";

/**
 * P15-02 E: the whole way, on a synthetic song whose melody sits well above the chords:
 * draw a line → analyse → the workspace shows the notes above the line, unused → use one →
 * the card's name changes → save → read the vault again. The original session never changes.
 */
class FakeRepository implements VaultRepository {
  saved: VaultFile[] = [];
  async load(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async save(vault: VaultFile): Promise<void> { this.saved.push(vault); }
  async listBackups(): Promise<VaultBackup[]> { return []; }
  async restore(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
}

const LINE = 81;
const CHORDS = [
  { lh: [48, 55], rh: [64, 71], mixed: [88, 86, 91, 89] },
  { lh: [45, 52], rh: [60, 67], mixed: [84, 83, 88, 86] },
  { lh: [50, 57], rh: [65, 72], mixed: [89, 88, 93, 91] },
  { lh: [43, 50], rh: [59, 65], mixed: [83, 81, 86, 84] },
];

function session(): AnalysisSession {
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 8; bar += 1) {
    const chord = CHORDS[bar % 4]!;
    for (const pitch of [...chord.lh, ...chord.rh]) add(pitch, bar * 4, 4, 70);
    chord.mixed.forEach((pitch, index) => add(pitch, bar * 4 + index, 1, 100 + index));
  }
  ev.push({ at: 0, e: { deltaTime: 0, type: "controller", channel: 0, controllerType: 64, value: 127 } });
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const bytes = Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
  return createAnalysisSession([{ sourceId: "s", displayName: "m.mid", bytes }]).session!;
}

async function analyse(base: AnalysisSession, splits: PartSplits) {
  const built = buildSplitAnalysisRequest(base, splits);
  const repository = new FakeRepository();
  const store = createVaultStore({ repository });
  await store.getState().initialize();
  store.getState().analyzeMidiBytes(built.request.bytes, built.request.options);
  const state = store.getState().analysis;
  if (state.status !== "done" || !state.result || !state.sourceData || !state.sourceVoices) throw new Error("analysis failed");
  return { built, store, repository, result: state.result, sourceData: state.sourceData, sourceVoices: state.sourceVoices };
}

function workspaceModel(base: AnalysisSession, ran: Awaited<ReturnType<typeof analyse>>): CorrectionModel {
  const nameOf = () => "Piano";
  const restored = restoreExcludedNotes({
    sourceData: ran.sourceData,
    ...(ran.built.request.options.analysisInput ? { roleOverrides: ran.built.request.options.analysisInput.roleOverrides } : {}),
    excluded: ran.built.excluded,
    nameOf,
    channelOf: () => base.voices[0]!.channel,
  });
  const named = restorePartNames(ran.sourceVoices, ran.built.map, nameOf);
  const voices = restored.sourceVoices.map((voice) => named.find((entry) => entry.id === voice.id) ?? voice);
  return buildCorrectionModel({
    result: ran.result,
    sourceData: restored.sourceData,
    sourceVoices: voices,
    roleOverrides: restored.roleOverrides,
  }, reviewThresholds);
}

async function saveAndReread(ran: Awaited<ReturnType<typeof analyse>>, model: CorrectionModel) {
  const saved = buildSaveCandidate(model, wholeSongRange(model)!, ran.result.fullTimeline);
  if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.text).join());
  const ideaId = ran.store.getState().createIdeaFromDraft({
    title: "線で分けた曲", status: "idea", chordMemo: saved.candidate.summaryText,
    progressionBlock: saved.candidate, progressionAnalysis: ran.result,
    progressionMetadata: { userEdited: saved.userEdited, userVerified: false },
  })!;
  await ran.store.getState().flush();
  const reread = vaultFileSchema.parse(JSON.parse(JSON.stringify(ran.repository.saved[ran.repository.saved.length - 1]!)));
  const block = reread.ideas.find((entry) => entry.id === ideaId)!.progressionBlocks![0]!;
  return { block, cardIds: saved.cardIds };
}

const comparable = (result: { analyzedAt?: string }) => ({ ...result, analyzedAt: "" });

describe("線で分ける: the whole way (P15-02 E)", () => {
  it("line → analyse → unused melody in the workspace → use one note → name changes → save → read again", async () => {
    const base = session();
    const baseBefore = JSON.stringify({ voices: base.voices, notes: base.notes, controlChanges: base.controlChanges });
    const splits: PartSplits = { [base.voices[0]!.id]: { melodyFrom: LINE } };
    const ran = await analyse(base, splits);

    // the analysis never had the notes above the line
    expect(Math.max(...ran.sourceData.notes.map((note) => note.pitch))).toBeLessThan(LINE);

    // the workspace shows them, unused, as melody
    const model = workspaceModel(base, ran);
    const melody = model.notes.filter((note) => note.pitch >= LINE);
    expect(melody.length).toBeGreaterThan(0);
    expect(melody.every((note) => note.used === false)).toBe(true);
    expect(model.cards.map((card) => card.name.label)).toEqual(ran.result.fullTimeline.map((item) => item.chord.label));

    // what is saved at first has no note above the line
    const first = await saveAndReread(ran, model);
    const firstPitches = first.block.chords.flatMap((chord) => chord.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    expect(firstPitches.length).toBeGreaterThan(0);
    expect(Math.max(...firstPitches)).toBeLessThan(LINE);

    // one note above the line is used: only that card's name follows
    const card = model.cards[1]!;
    const note = model.notes.find((entry) => entry.cardId === card.id && entry.pitch === 86)!;
    const edited = restoreNotes(model, [note.id]).model;
    const renamed = edited.cards.find((entry) => entry.id === card.id)!;
    expect(renamed.name.label).not.toBe(card.name.label);
    expect(edited.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.name.label))
      .toEqual(model.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.name.label));

    // …and only that note reaches the saved voicing, for that card
    const second = await saveAndReread(ran, edited);
    const byCard = second.block.chords.map((chord) => chord.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    const above = byCard.map((pitches) => pitches.filter((pitch) => pitch >= LINE));
    expect(above.flat()).toEqual([86]);
    expect(above.findIndex((pitches) => pitches.length > 0)).toBe(second.cardIds.indexOf(card.id));

    // the original session was never changed
    expect(JSON.stringify({ voices: base.voices, notes: base.notes, controlChanges: base.controlChanges })).toBe(baseBefore);
  });

  it("taking the line off and analysing again gives exactly the result from before the line", async () => {
    const base = session();
    const before = await analyse(base, {});
    const withLine = await analyse(base, { [base.voices[0]!.id]: { melodyFrom: LINE } });
    const after = await analyse(base, {});

    expect(withLine.result.fullTimeline.map((item) => item.chord.label))
      .not.toEqual(before.result.fullTimeline.map((item) => item.chord.label));
    expect(comparable(after.result)).toEqual(comparable(before.result));
    expect(after.built.request).toEqual(buildSessionAnalysisRequest(base));
  });
});
