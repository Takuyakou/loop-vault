import { savedDuplicatesSource, sourceCoverage } from "../../voicingPractice/sourcePreference";
import { describe, expect, it } from "vitest";
import { BrowserMemoryVaultStorage } from "../../storage/browserMemoryVaultStorage";
import { createVaultStore } from "../../store/vaultStore";
import { JsonVaultRepository } from "../repository";
import { parseTextProgression } from "../textProgression";
import { createTextProgressionDraft, textProgressionDraftSavePayload, textProgressionEventKey } from "../textProgressionDraft";
import { createTextProgressionStyleSnapshot } from "../textProgressionVoicing";
import { standardTextPlaybackNotes } from "../standardTextPlayback";
import { parseExtendedTextProgression } from "../extendedTextProgression";
import { extendedTextSaveData } from "../extendedTextSave";
import { voiceTextChordForAudition } from "../textChordTones";
import { parseChordLabel } from "../chords";
import { buildProgressionMidi } from "../midiExport";
import { isTextProgressionStyleSnapshot } from "../textProgressionVoicing";
import { transposeProgressionVoicingPracticeSnapshot } from "./transposition";
import { cardAuditionResolution } from "../../voicingPractice/cardAudition";
import { createTimelineVoicingPlaybackPlan, resolveTimelineVoicings, resolveTimelineItemVoicing } from "../voicing/resolveVoicing";
import { buildProgressionVoicingPracticeHandoffFromVault } from "./handoff";
import { buildProgressionVoicingPracticeSnapshot } from "./snapshot";
import { resolveProgressionPracticeVoicings } from "./voicingResolution";

import type { TextProgressionIdeaDraft } from "../../store/vaultStore";

async function saveAndReload(data: TextProgressionIdeaDraft) {
  const storage = new BrowserMemoryVaultStorage();
  const repository = new JsonVaultRepository(storage, { now: () => new Date("2026-09-01T00:00:00Z") });
  let id = 0;
  const store = createVaultStore({ repository, now: () => new Date("2026-09-01T00:00:00Z"),
    idFactory: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` });
  await store.getState().initialize();
  const ideaId = store.getState().createIdeaFromTextProgression(data);
  expect(ideaId).toBeDefined();
  await store.getState().flush();
  const loaded = await repository.load();
  expect(loaded.quarantine).toEqual([]);
  expect(loaded.vault.fileVersion).toBe(2);
  const idea = loaded.vault.ideas.find(item => item.id === ideaId)!;
  const block = idea.progressionBlocks![0]!;
  const handoff = buildProgressionVoicingPracticeHandoffFromVault([idea], { ideaId: idea.id, blockId: block.id });
  expect(handoff.ok).toBe(true);
  if (!handoff.ok) throw new Error(handoff.error.code);
  return { block, idea, repository, vault: loaded.vault, handoff: handoff.handoff };
}

describe("P11-02 saved Text preview contract", () => {
  it("keeps Standard selected style and default preview exact after Vault v2 reload", async () => {
    const parsed = parseTextProgression("| Cmaj7 Dm7 |", {});
    expect(parsed.canConvert).toBe(true);
    const first = parsed.events[0]!;
    const style = createTextProgressionStyleSnapshot(first.chord, "open-17")!;
    const overrides = new Map([[textProgressionEventKey(first), { practiceVoicingOverride: style }]]);
    const preview = standardTextPlaybackNotes(parsed, overrides);
    const draft = createTextProgressionDraft({ result: parsed, voicingOverrides: overrides });
    const saved = await saveAndReload(textProgressionDraftSavePayload(draft, {
      title: "Standard", nextAction: "Practice", userVerified: true, bpm: 120,
    }));
    const exact = saved.block.chords.map(item => item.voicingMemory?.practiceVoicingOverride?.midiNotes);
    expect(exact).toEqual([style.midiNotes, voiceTextChordForAudition(parsed.events[1]!.chord)]);
    expect(preview.map(note => note.pitch)).toEqual(exact.flat());
    expect(saved.block.chords.map(item => resolveTimelineItemVoicing(item, true).midiNotes)).toEqual(exact);
    expect(saved.handoff.initialSelection).toBe("saved");
    expect(savedDuplicatesSource(saved.handoff.snapshots)).toBe(false);
    expect(sourceCoverage(saved.handoff.snapshots, "source-midi")).toEqual({ available: 0, total: 2 });
    expect(sourceCoverage(saved.handoff.snapshots, "saved")).toEqual({ available: 2, total: 2 });
    const plan = resolveProgressionPracticeVoicings(saved.handoff.snapshots.saved!);
    expect(plan.events.map(event => event.status === "SUPPORTED" ? event.voicing.midiNotes : [])).toEqual(exact);
    expect(saved.handoff.snapshots.custom?.events.every(event => event.voicing === undefined)).toBe(true);
    expect(saved.handoff.snapshots["source-midi"]?.events.every(event => event.voicing === undefined)).toBe(true);
    const generatedIntent = { ...saved.block, chords: saved.block.chords.map((item, index) =>
      index === 0 ? { ...item, voicingMemory: { ...item.voicingMemory, playbackChoice: "GENERATED" as const } } : item) };
    const absent = buildProgressionVoicingPracticeSnapshot({ block: generatedIntent, selection: "saved",
      sourceReference: { ideaId: "idea", blockId: generatedIntent.id } });
    expect(absent.ok && absent.snapshot.events[0]?.voicing).toBeUndefined();
  });

  it("keeps Extended preview sound as explicit saved notes without Source MIDI provenance", async () => {
    const parsed = parseExtendedTextProgression("| Cmaj7 Dm7 |", { beat: "4/4", bpm: 120 });
    expect(parsed.canConvert).toBe(true);
    const saved = await saveAndReload(extendedTextSaveData(parsed));
    expect(saved.block.chords.map(item => item.voicingMemory?.practiceVoicingOverride?.midiNotes))
      .toEqual(parsed.harmonicSpans.map(span => voiceTextChordForAudition(span.chord)));
    expect(saved.block.chords.every(item => item.voicingMemory?.sourceVoicing === undefined)).toBe(true);
    expect(savedDuplicatesSource(saved.handoff.snapshots)).toBe(false);
    expect(sourceCoverage(saved.handoff.snapshots, "source-midi")).toEqual({ available: 0, total: 2 });
    expect(sourceCoverage(saved.handoff.snapshots, "saved")).toEqual({ available: 2, total: 2 });
    expect(saved.handoff.snapshots.saved?.events.every(event => event.voicing?.kind === "saved")).toBe(true);
    expect(saved.handoff.snapshots.custom?.events.every(event => event.voicing === undefined)).toBe(true);
  });
  it.each(["manual", "live-played"] as const)("preserves renamed %s notes after v2 reload across card/capture/whole/practice/export", async source => {
    const parsed = parseExtendedTextProgression("| Cmaj7 Dm7 |", { beat: "4/4", bpm: 120 });
    const initial = await saveAndReload(extendedTextSaveData(parsed));
    const first = initial.block.chords[0]!;
    const human = { ...first.voicingMemory!.practiceVoicingOverride!, source, midiNotes: [43, 59, 64, 72], bassNote: 43,
      extractorVersion: "p10-correction:v1" };
    first.chord = parseChordLabel("G7")!;
    first.voicingMemory = { practiceVoicingOverride: human, playbackChoice: "CUSTOM" };
    await initial.repository.save(initial.vault);
    const loaded = await initial.repository.load();
    expect(loaded.quarantine).toEqual([]);
    const idea = loaded.vault.ideas[0]!; const block = idea.progressionBlocks![0]!;
    const renamed = block.chords[0]!;
    expect(renamed.voicingMemory).toEqual(first.voicingMemory);
    expect(resolveTimelineItemVoicing(renamed).midiNotes).toEqual(human.midiNotes);
    const capture = createTimelineVoicingPlaybackPlan(block.chords);
    expect(capture.explicitMidiNotesByEventId[capture.timeline[0]!.eventId!]).toEqual(human.midiNotes);
    const whole = resolveTimelineVoicings([{ ...renamed, eventId: "renamed" }]);
    expect(whole.renamed).toEqual(human.midiNotes);
    expect(buildProgressionMidi(block).events[0]?.midiNotes).toEqual(human.midiNotes);
    const handoff = buildProgressionVoicingPracticeHandoffFromVault([idea], { ideaId: idea.id, blockId: block.id });
    if (!handoff.ok) throw new Error(handoff.error.code);
    const saved = handoff.handoff.snapshots.saved!; const custom = handoff.handoff.snapshots.custom!;
    expect(saved.events[0]?.voicing?.midiNotes).toEqual(human.midiNotes);
    expect(custom.events[0]?.voicing?.midiNotes).toEqual(human.midiNotes);
    const savedPlan = resolveProgressionPracticeVoicings(saved);
    const customPlan = resolveProgressionPracticeVoicings(custom);
    expect(cardAuditionResolution(saved.events[0], 0, { saved: savedPlan, custom: customPlan })?.voicing?.midiNotes).toEqual(human.midiNotes);
    const moved = transposeProgressionVoicingPracticeSnapshot({ ...saved, key: "C major" }, 2);
    expect(moved.ok && moved.snapshot.events[0]?.voicing?.midiNotes).toEqual(human.midiNotes.map(note => note + 2));
    expect(saved.events[0]?.voicing?.midiNotes).toEqual(human.midiNotes);
  });

  it("keeps renamed Text provenance separate from Custom and honors GENERATED intent", async () => {
    const parsed = parseExtendedTextProgression("| Cmaj7 Dm7 |", { beat: "4/4", bpm: 120 });
    const initial = await saveAndReload(extendedTextSaveData(parsed));
    const first = initial.block.chords[0]!; const notes = first.voicingMemory!.practiceVoicingOverride!.midiNotes;
    first.chord = parseChordLabel("G7")!;
    expect(isTextProgressionStyleSnapshot(first.voicingMemory!.practiceVoicingOverride, first.chord)).toBe(true);
    expect(resolveTimelineItemVoicing(first).midiNotes).toEqual(notes);
    const result = buildProgressionVoicingPracticeSnapshot({ block: initial.block, selection: "custom", sourceReference: { ideaId: initial.idea.id, blockId: initial.block.id } });
    expect(result.ok && result.snapshot.events[0]?.voicing).toBeUndefined();
    first.voicingMemory!.playbackChoice = "GENERATED";
    expect(resolveTimelineItemVoicing(first).origin).toBe("generated");
  });

});
