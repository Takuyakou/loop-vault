import { describe, expect, it } from "vitest";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { createVaultStore } from "../store/vaultStore";
import { JsonVaultRepository } from "./repository";
import { buildProgressionVoicingPracticeHandoffFromVault, resolveProgressionPracticeVoicings } from "./progressionVoicingPractice";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextSaveData } from "./extendedTextSave";
import { extendedTextSyntheticChart } from "./__fixtures__/extendedTextSyntheticChart";

describe("P8.8.1 authored full-chart acceptance", () => {
  it.each([70, 150, 200])("keeps the full %i-bar chart through parser, Vault v2 and practice", async barCount => {
    const { source, expectedSlots } = extendedTextSyntheticChart(barCount);
    const parsed = parseExtendedTextProgression(source, { beat: "4/4", bpm: 120 });
    expect(parsed.state, JSON.stringify(parsed.diagnostics)).toBe("VALID");
    expect(parsed.diagnostics.filter(d => d.severity === "ERROR")).toHaveLength(0);
    expect(parsed.source).toBe(source);
    expect(parsed.bars).toHaveLength(barCount);
    expect(parsed.slots).toHaveLength(expectedSlots);
    const authoredAttacks = parsed.slots.filter(slot => slot.kind === "attack" || slot.kind === "reattack").length;
    expect(parsed.harmonicSpans.flatMap(span => span.attacks)).toHaveLength(authoredAttacks);
    expect(parsed.sections).toHaveLength(4);
    expect(parsed.harmonicSpans.some(span => span.semanticAlterations?.includes("b5"))).toBe(true);
    expect(parsed.slots.some(slot => slot.kind === "rest")).toBe(true);
    expect(parsed.slots.some(slot => slot.kind === "hold")).toBe(true);
    expect(parsed.slots.some(slot => slot.kind === "reattack")).toBe(true);
    const storage = new BrowserMemoryVaultStorage();
    const repository = new JsonVaultRepository(storage, { now: () => new Date("2026-09-26T00:00:00Z") });
    let sequence = 0;
    const store = createVaultStore({
      repository,
      now: () => new Date("2026-09-26T00:00:00Z"),
      idFactory: () => "00000000-0000-4000-8000-" + String(++sequence).padStart(12, "0"),
    });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromTextProgression(extendedTextSaveData(parsed));
    expect(ideaId).toBeDefined();
    await store.getState().flush();
    const loaded = await new JsonVaultRepository(storage, { now: () => new Date("2026-09-26T00:00:00Z") }).load();
    expect(loaded.quarantine).toEqual([]);
    expect(loaded.vault.fileVersion).toBe(2);
    const idea = loaded.vault.ideas.find(value => value.id === ideaId);
    const block = idea?.progressionBlocks?.[0];
    expect(block?.textSource?.rawText).toBe(source);
    expect(block?.textSource?.slots).toHaveLength(expectedSlots);
    expect(block?.textSource?.harmonicSpans).toHaveLength(parsed.harmonicSpans.length);
    expect(block?.textSource?.harmonicSpans.flatMap(span => span.attacks)).toHaveLength(authoredAttacks);
    expect(block?.chords).toHaveLength(parsed.harmonicSpans.length);
    const handoff = buildProgressionVoicingPracticeHandoffFromVault([idea!], {
      ideaId: idea!.id, blockId: block!.id,
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.handoff.snapshots["basic-full"]?.lengthBeats).toBe(barCount * 4);
    expect(handoff.handoff.snapshots["basic-full"]?.events).toHaveLength(parsed.harmonicSpans.length);
    expect(handoff.handoff.snapshots["basic-full"]?.events.flatMap(event => event.attackBeats ?? []))
      .toHaveLength(authoredAttacks);
    expect(block?.chords.every(event => event.voicingMemory?.sourceVoicing === undefined)).toBe(true);
    expect(handoff.handoff.snapshots["source-midi"]?.events.every(event => event.voicing === undefined)).toBe(true);
  });

  it("keeps a short Extended Text Vault save Teacher-playable without fabricating Source MIDI", async () => {
    const parsed = parseExtendedTextProgression("| Cmaj7 Dm7 |", { beat: "4/4", bpm: 120 });
    expect(parsed.canConvert).toBe(true);
    const storage = new BrowserMemoryVaultStorage();
    const repository = new JsonVaultRepository(storage, { now: () => new Date("2026-09-26T00:00:00Z") });
    let sequence = 0;
    const store = createVaultStore({
      repository,
      now: () => new Date("2026-09-26T00:00:00Z"),
      idFactory: () => "00000000-0000-4000-8000-" + String(++sequence).padStart(12, "0"),
    });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromTextProgression(extendedTextSaveData(parsed));
    expect(ideaId).toBeDefined();
    await store.getState().flush();
    const loaded = await new JsonVaultRepository(storage, { now: () => new Date("2026-09-26T00:00:00Z") }).load();
    const idea = loaded.vault.ideas.find(value => value.id === ideaId)!;
    const block = idea.progressionBlocks![0]!;
    expect(block.chords).toHaveLength(2);
    expect(block.chords.every(event => event.voicingMemory?.practiceVoicingOverride?.extractorVersion === "text-style-v1:generated-close")).toBe(true);
    const handoff = buildProgressionVoicingPracticeHandoffFromVault([idea], {
      ideaId: idea.id, blockId: block.id,
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.handoff.snapshots["source-midi"]?.events.every(event => event.voicing === undefined)).toBe(true);
    expect(resolveProgressionPracticeVoicings(handoff.handoff.snapshots["basic-full"]!, {
      lessonStudyCategory: "teacher",
    }).events.every(event => event.status === "SUPPORTED")).toBe(true);
  });
});
