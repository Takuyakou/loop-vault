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
import { resolveTimelineItemVoicing } from "../voicing/resolveVoicing";
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
  return { block, handoff: handoff.handoff };
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
    expect(saved.handoff.snapshots.saved?.events.every(event => event.voicing?.kind === "saved")).toBe(true);
    expect(saved.handoff.snapshots.custom?.events.every(event => event.voicing === undefined)).toBe(true);
  });
});
