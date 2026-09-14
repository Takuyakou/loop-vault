import { describe, expect, it } from "vitest";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { createVaultStore } from "../store/vaultStore";
import { parseChordLabel } from "./chords";
import { JsonVaultRepository } from "./repository";
import { makeIdea } from "./testFactory";
import { parseTextProgression } from "./textProgression";
import { createTextProgressionDraft, textProgressionDraftSavePayload } from "./textProgressionDraft";
import { normalizedChordKey } from "./voicing";
import {
  buildProgressionVoicingPracticeHandoffFromVault,
  buildProgressionVoicingPracticeSnapshot,
  buildVoicingLoopVaultCandidates,
  resolveProgressionPracticeVoicings,
} from "./progressionVoicingPractice";
import type { ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from "./types";

const NOW = new Date("2026-09-14T00:00:00.000Z");

function payloadFor(input: string) {
  const parsed = parseTextProgression(input);
  expect(parsed.canConvert, JSON.stringify(parsed.diagnostics)).toBe(true);
  const draft = createTextProgressionDraft({ result: parsed, now: NOW.toISOString(), draftId: "control-roundtrip" });
  return textProgressionDraftSavePayload(draft, {
    title: "Synthetic control sequence", nextAction: "", userVerified: true, bpm: 108, confirmedKey: "C major",
  });
}

async function roundtrip(input: string) {
  const storage = new BrowserMemoryVaultStorage();
  const repository = new JsonVaultRepository(storage, { now: () => NOW });
  let id = 0;
  const store = createVaultStore({ repository, now: () => NOW,
    idFactory: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` });
  await store.getState().initialize();
  const payload = payloadFor(input);
  const ideaId = store.getState().createIdeaFromTextProgression(payload);
  expect(ideaId).toBeDefined();
  await store.getState().flush();
  const loaded = await new JsonVaultRepository(storage, { now: () => NOW }).load();
  expect(loaded.quarantine).toEqual([]);
  expect(loaded.vault.fileVersion).toBe(2);
  const idea = loaded.vault.ideas.find(value => value.id === ideaId)!;
  expect(idea).toBeDefined();
  const block = idea.progressionBlocks![0]!;
  const result = buildProgressionVoicingPracticeHandoffFromVault([idea], { ideaId: idea.id, blockId: block.id });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return { payload, block, idea, handoff: result.handoff };
}

describe("P5.31 control timing across public save and practice boundaries", () => {
  it("preserves explicit same-root slash through Text, public save, JSON and practice", async () => {
    const { block, handoff, idea } = await roundtrip("| Am9/A | Am11/B |");
    expect(block.chords.map(event => [event.chord.label, event.chord.bass])).toEqual([["Am9/A", 9], ["Am11/B", 11]]);
    expect(handoff.snapshots["left-hand"]!.events[0]!.chord.label).toBe("Am9/A");
    expect(buildVoicingLoopVaultCandidates([idea], "Untitled")[0]!.chordLabels).toEqual(["Am9/A", "Am11/B"]);
    const plan = resolveProgressionPracticeVoicings(handoff.snapshots["left-hand"]!);
    expect(plan.events.every(event => event.status === "SUPPORTED")).toBe(true);
  });

  it("preserves repeat attacks, silence and cross-bar hold through Draft, JSON reload and all six modes", async () => {
    const { payload, block, idea, handoff } = await roundtrip("| E7%_Am7 | =G |");
    const expected = [[0, 1], [1, 1], [3, 3], [6, 2]];
    const savedTiming = (events: readonly ChordTimelineItem[]) => events.map(event => [
      (event.bar - 1) * 4 + event.beat - 1, event.durationBeats,
    ]);
    expect(savedTiming(payload.chords)).toEqual(expected);
    expect(savedTiming(block.chords)).toEqual(expected);
    expect(block.lengthBars).toBe(2);
    expect(block.chords.map(event => event.chord.label)).toEqual(["E7", "E7", "Am7", "G"]);
    expect(Object.keys(handoff.snapshots)).toHaveLength(6);
    for (const snapshot of Object.values(handoff.snapshots)) {
      expect(snapshot.lengthBeats).toBe(8);
      expect(snapshot.bpm).toBe(108);
      expect(snapshot.key).toBe("C major");
      expect(snapshot.events.map(event => [event.startBeat, event.durationBeats])).toEqual(expected);
      expect(snapshot.events).toHaveLength(4);
    }
    expect(buildVoicingLoopVaultCandidates([idea], "Untitled")).toMatchObject([{
      title: "Synthetic control sequence", chordLabels: ["E7", "E7", "Am7", "G"], bpm: 108,
    }]);
  });

  it.each([
    ["| _ Cmaj7 | _ |", [[2, 2]], 8],
    ["| Cmaj7 | _ |", [[0, 4]], 8],
    ["| _ | _ |", [], 8],
    ["| Cmaj7 | = G7 |", [[0, 6], [6, 2]], 8],
  ] as const)("retains score extent for %s without phantom sounding events", async (input, timing, length) => {
    const { block, handoff } = await roundtrip(input);
    expect(block.lengthBars).toBe(length / 4);
    expect(block.chords).toHaveLength(timing.length);
    const snapshot = handoff.snapshots["basic-full"]!;
    expect(snapshot.lengthBeats).toBe(length);
    expect(snapshot.events.map(event => [event.startBeat, event.durationBeats])).toEqual(timing);
    expect(resolveProgressionPracticeVoicings(snapshot).events).toHaveLength(timing.length);
  });

  it("normalizes a legacy absolute MIDI range without collapsing a leading rest", () => {
    const block = midiBlock([timeline("Cmaj7", 74, 2), timeline("G7", 78, 2)]);
    block.sourceStartBeat = 72;
    block.sourceEndBeat = 80;
    block.startBar = 19;
    block.endBar = 20;
    block.lengthBars = 2;
    const result = buildProgressionVoicingPracticeSnapshot({ block, selection: "basic-full", sourceReference: { ideaId: "idea", blockId: block.id } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.snapshot.lengthBeats).toBe(8);
    expect(result.snapshot.events.map(event => [event.startBeat, event.durationBeats])).toEqual([[2, 2], [6, 2]]);
    expect(block.chords.map(event => event.bar)).toEqual([19, 20]);
  });

  it("rejects inconsistent saved bounds rather than truncating a sounding event", () => {
    const block = midiBlock([timeline("Cmaj7", 0, 6)]);
    block.sourceStartBeat = 0;
    block.sourceEndBeat = 4;
    const result = buildProgressionVoicingPracticeSnapshot({ block, selection: "basic-full", sourceReference: { ideaId: "idea", blockId: block.id } });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-timing" } });
  });

  it("keeps exact Source and Custom event associations across silence without fallback", () => {
    const first = timeline("Cmaj7", 0, 1);
    const second = timeline("G7", 3, 1);
    first.voicingMemory = { sourceVoicing: exact(first, [48, 52, 59], "midi-extracted"), practiceVoicingOverride: exact(first, [60, 64, 71], "live-played") };
    second.voicingMemory = { sourceVoicing: exact(second, [43, 53, 59], "midi-extracted") };
    const block = midiBlock([first, second]);
    block.sourceStartBeat = 0;
    block.sourceEndBeat = 4;
    const idea = makeIdea({ progressionBlocks: [block] });
    const result = buildProgressionVoicingPracticeHandoffFromVault([idea], { ideaId: idea.id, blockId: block.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    const source = result.handoff.snapshots["source-midi"]!;
    const custom = result.handoff.snapshots.custom!;
    expect(source.events.map(event => event.startBeat)).toEqual([0, 3]);
    expect(source.events.map(event => event.voicing?.midiNotes)).toEqual([[48, 52, 59], [43, 53, 59]]);
    expect(custom.events.map(event => event.voicing?.midiNotes)).toEqual([[60, 64, 71], undefined]);
    expect(resolveProgressionPracticeVoicings(custom).events.map(event => event.status)).toEqual(["SUPPORTED", "UNAVAILABLE"]);
    first.voicingMemory.sourceVoicing!.midiNotes[0] = 1;
    expect(source.events[0]!.voicing!.midiNotes).toEqual([48, 52, 59]);
  });
});

function timeline(label: string, start: number, durationBeats: number): ChordTimelineItem {
  return { bar: Math.floor(start / 4) + 1, beat: start % 4 + 1, durationBeats,
    chord: parseChordLabel(label)!, confidence: 1, alternatives: [], warnings: [] };
}

function midiBlock(chords: ChordTimelineItem[]): SavedProgressionBlock {
  return { id: "22222222-2222-4222-8222-222222222222", summaryText: "Synthetic", chords,
    startBar: 1, endBar: 1, lengthBars: 1, bpm: 108, timeSignature: "4/4",
    tags: [], capturedAt: NOW.toISOString(), analyzerVersion: "synthetic-midi" };
}

function exact(event: ChordTimelineItem, midiNotes: number[], source: VoicingSnapshot["source"]): VoicingSnapshot {
  return { schemaVersion: 1, source, representation: "simultaneous-voicing", midiNotes,
    bassNote: midiNotes[0], capturedForChordKey: normalizedChordKey(event.chord), confidence: 0.99, userVerified: true };
}
