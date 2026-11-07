import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { buildCorrectionModel } from "../correction/correctionModel";
import { restoreNotes, aboveLineIds, deleteNotes } from "../correction/edits";
import { reviewThresholds } from "../correction/reviewThresholds";
import { buildSaveCandidate } from "../correction/saveCandidate";
import { wholeSongRange } from "../correction/sectionSave";
import { buildSessionAnalysisRequest, createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import { normalizeNotes } from "../midi/normalize";
import type { MidiSongData, TimedNote } from "../midi/types";
import { annotateVoiceRolesV2 } from "../midi/voiceRoleV2";
import { buildVoices } from "../midi/voices";
import { createEmptyVault, type VaultBackup, type VaultLoadResult, type VaultRepository } from "../repository";
import type { VaultFile } from "../types";
import { createVaultStore } from "../../store/vaultStore";
import { deriveSplitSession } from "./splitSession";

/**
 * P15-02 investigation (案4, items 2-4): can the notes handed over as `exclude` come back, for display,
 * in the correction workspace, using only code outside `src/domain/midi/**`?
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
    const c = CHORDS[bar % 4]!;
    for (const p of [...c.lh, ...c.rh]) add(p, bar * 4, 4, 70);
    c.mixed.forEach((p, i) => add(p, bar * 4 + i, 1, 100 + i));
  }
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

async function analyse(base: AnalysisSession, upper: "melody-weak" | "exclude") {
  const derived = deriveSplitSession(base, { [base.voices[0]!.id]: { melodyFrom: 81 } }).session;
  const target: AnalysisSession = {
    ...derived,
    voices: derived.voices.map((voice) => voice.id.endsWith("~upper")
      ? { ...voice, assignedRole: upper, included: upper !== "exclude" }
      : voice),
  };
  const request = buildSessionAnalysisRequest(target);
  const store = createVaultStore({ repository: new FakeRepository() });
  await store.getState().initialize();
  store.getState().analyzeMidiBytes(request.bytes, request.options);
  const state = store.getState().analysis;
  if (state.status !== "done") throw new Error("analysis failed");
  return { state, request, derived };
}

describe("案4 items 2-4", () => {
  it("the excluded notes come back in the workspace as unused melody notes; the names are untouched", async () => {
    const base = session();
    const { state, request, derived } = await analyse(base, "exclude");
    const result = state.result!;
    const sourceData = state.sourceData!;
    const sourceVoices = state.sourceVoices!;
    // What the analysis (and the store's sourceData) got has no note of the upper part.
    expect(Math.max(...sourceData.notes.map((note) => note.pitch))).toBeLessThan(81);
    expect(request.options.preparedData!.tracks).toHaveLength(1);

    // Put the notes back for display only: one more track, role melody.
    const excluded = derived.notes.filter((note) => note.voiceId.endsWith("~upper"));
    const ppq = sourceData.ticksPerBeat;
    const trackIndex = sourceData.tracks.length;
    const added: TimedNote[] = excluded.map((note) => ({
      pitch: note.pitch,
      startTick: Math.round(note.startBeat * ppq),
      durationTick: Math.max(1, Math.round(note.durationBeats * ppq)),
      velocity: note.velocity,
      trackIndex,
      channel: 0,
    }));
    const augmented: MidiSongData = {
      ...sourceData,
      notes: [...sourceData.notes, ...added].sort((a, b) => a.startTick - b.startTick || a.trackIndex - b.trackIndex || a.pitch - b.pitch),
      tracks: [...sourceData.tracks, { index: trackIndex, name: "", channel: 0, roleOverride: "melody" }],
    };
    const melodyId = `${trackIndex}:0`;
    const roleOverrides = { ...(request.options.analysisInput?.roleOverrides ?? {}), [melodyId]: "melody" as const };
    const voices = annotateVoiceRolesV2(buildVoices(augmented), normalizeNotes(augmented), roleOverrides)
      .map((voice) => voice.id === melodyId ? { ...voice, trackName: "Piano（線より上）" } : voice);

    const before = buildCorrectionModel({ result, sourceData, sourceVoices }, reviewThresholds);
    const after = buildCorrectionModel({ result, sourceData: augmented, sourceVoices: voices, roleOverrides }, reviewThresholds);

    expect(after.cards.map((card) => card.name.label)).toEqual(before.cards.map((card) => card.name.label));
    // The song sections (computed from the source notes) are the same with the notes put back.
    expect(after.segments.map((segment) => [segment.startBar, segment.endBar]))
      .toEqual(before.segments.map((segment) => [segment.startBar, segment.endBar]));
    expect(after.pitchRange.high).toBeGreaterThan(before.pitchRange.high);
    expect(voices.find((voice) => voice.id === "0:0")!.inferredRole)
      .toBe(sourceVoices.find((voice) => voice.id === "0:0")!.inferredRole);
    const melodyNotes = after.notes.filter((note) => note.voiceId === melodyId);
    expect(melodyNotes.length).toBeGreaterThan(0);
    expect(melodyNotes.every((note) => note.used === false)).toBe(true);
    expect(after.notes.filter((note) => note.voiceId !== melodyId).map((note) => note.used))
      .toEqual(before.notes.map((note) => note.used));
    expect(after.context.melodyVoiceIds).toEqual([melodyId]);
    expect(after.context.melodyVoiceLabel).toBe("Piano（線より上）");
    console.log("PROBE names:", after.cards.map((card) => card.name.label).join(" "),
      "| melody notes shown:", melodyNotes.length, "| suggestions:", JSON.stringify(after.suggestions.map((s) => s.kind)));

    // Using a restored melody note: the workspace's own naming follows the notes (not a re-analysis).
    const card = after.cards[1]!;
    const ids = melodyNotes.filter((note) => note.cardId === card.id).map((note) => note.id);
    const restored = restoreNotes(after, ids);
    const renamed = restored.model.cards.find((entry) => entry.id === card.id)!;
    const others = restored.model.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.name.label);
    const othersBefore = after.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.name.label);
    console.log("PROBE restore melody notes of card 2:", card.name.label, "->", renamed.name.label, `(${renamed.nameSource})`,
      "| other cards unchanged:", JSON.stringify(others) === JSON.stringify(othersBefore));

    // The workspace has its own melody line; it works on used notes, so on the unused restored ones it does nothing.
    expect(aboveLineIds(after, 81)).toEqual([]);
    expect(deleteNotes(after, melodyNotes.map((note) => note.id)).changed).toBe(false);

    // What is saved: the voicing of the chords holds no melody note.
    const range = wholeSongRange(after)!;
    const saved = buildSaveCandidate(after, range, result.fullTimeline);
    if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.text).join());
    const pitches = saved.candidate.chords.flatMap((chord) => chord.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    expect(pitches.length).toBeGreaterThan(0);
    expect(Math.max(...pitches)).toBeLessThan(81);
    console.log("PROBE saved voicing max pitch (exclude):", Math.max(...pitches), "of", pitches.length, "notes");
  });

  it("with melody-weak (the line as it is today) the voicing the analysis attaches, for comparison", async () => {
    const { state } = await analyse(session(), "melody-weak");
    const pitches = state.result!.fullTimeline.flatMap((item) => item.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    console.log("PROBE melody-weak: voicing max pitch =", Math.max(...pitches), "of", pitches.length, "notes; notes >= 81:", pitches.filter((p) => p >= 81).length);
    expect(pitches.length).toBeGreaterThan(0);
  });
});
