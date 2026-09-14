import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseChordLabel } from "./chords";
import { parseTextProgression } from "./textProgression";
import { createTextProgressionDraft, textProgressionDraftSavePayload } from "./textProgressionDraft";
import { createEmptyVault, JsonVaultRepository } from "./repository";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { createVaultStore } from "../store/vaultStore";
import { makeIdea } from "./testFactory";
import { buildProgressionVoicingPracticeSnapshot, buildProgressionPracticeClockSchedule, resolveProgressionPracticeVoicings } from "./progressionVoicingPractice";
import type { ChordTimelineItem, SavedProgressionBlock } from "./types";

const fixture = (name: string) => readFileSync(new URL("../../docs/phase5.31/fixtures/" + name, import.meta.url), "utf8");
const event = (label: string, start: number, durationBeats: number): ChordTimelineItem => ({
  bar: Math.floor(start / 4) + 1, beat: start % 4 + 1, durationBeats,
  chord: parseChordLabel(label)!, confidence: 0, alternatives: [], warnings: [],
});
const block = (chords: ChordTimelineItem[]): SavedProgressionBlock => ({
  id: "22222222-2222-4222-8222-222222222222", summaryText: "Synthetic timing audit",
  chords, startBar: 1, endBar: 2, lengthBars: 2, bpm: 100, timeSignature: "4/4",
  tags: [], capturedAt: "2026-09-14T00:00:00.000Z", analyzerVersion: "text-progression-v1",
});
const snapshot = (value: SavedProgressionBlock, selection: "basic-full" | "left-hand" = "basic-full") =>
  buildProgressionVoicingPracticeSnapshot({ block: value, selection, sourceReference: { ideaId: "audit", blockId: value.id } });

describe("P5.31 baseline advanced by explicitly accepted stage behavior", () => {
  it("accepts compact notation and explicitly timed controls", () => {
    expect(parseTextProgression(fixture("rechord-user-example.txt")).canConvert).toBe(true);
    expect(parseTextProgression(fixture("rechord-control-example.txt")).canConvert).toBe(true);
    const bars = fixture("rechord-user-example-expanded.txt").trim().split(/\r?\n/).flatMap(
      line => line.split("|").map(value => value.trim()).filter(Boolean),
    );
    expect(bars).toHaveLength(16);
    expect(bars.map(bar => bar.split(/\s+/).length)).toEqual([2,2,2,4,2,2,2,2,2,2,2,2,2,2,2,2]);
    expect(bars.flatMap(bar => bar.split(/\s+/))).toHaveLength(34);
    expect(parseTextProgression("| " + bars.join(" | ") + " |").canConvert).toBe(true);
  });

  it("locks the alias matrix including alteration loss rather than mistaking parser success for fidelity", () => {
    const labels = ["BbM7","CM7","Cmaj7","C△7","CΔ7","Cm7","Caug","Csus2","Csus4","Cadd9","Cadd11","Cdim","Co7","C7(b9)","C7(#9,#5)","C7(b9,#11,b13)","Comit3","Am9/C","Dm7/G","C#5"];
    const actual = labels.map(label => [label, parseChordLabel(label)]);
    expect(actual.map(([, parsed]) => parsed === null)).toEqual([
      false,false,false,false,false,false,false,false,false,false,true,false,false,false,false,false,true,false,false,true,
    ]);
    expect(parseChordLabel("Am11/B")).toMatchObject({ root: 9, quality: "min11", bass: 11 });
    expect(parseChordLabel("Am9/C")).toMatchObject({ root: 9, quality: "min9", bass: 0 });
    expect(parseChordLabel("C#5")).toBeNull();
    expect(parseChordLabel("C7(#9,#5)")).toMatchObject({ quality: "dom7", tensions: ["#9", "#5"] });
  });

  it("preserves gaps, cross-bar holds, leading/trailing rests and all-rest length in existing Vault v2 JSON", async () => {
    const examples = [
      [event("E7",0,1), event("E7",1,1), event("Am7",3,3), event("G",6,2)],
      [event("Cmaj7",2,2)],
      [],
      [event("Cmaj7",0,6), event("G7",6,2)],
    ];
    for (const chords of examples) {
      const repository = new JsonVaultRepository(new BrowserMemoryVaultStorage());
      const saved = block(chords);
      await repository.save({ ...createEmptyVault(), ideas: [makeIdea({ progressionBlocks: [saved] })] });
      const reloaded = await repository.load();
      expect(reloaded.quarantine).toEqual([]);
      expect(reloaded.vault.fileVersion).toBe(2);
      expect(reloaded.vault.ideas[0]!.progressionBlocks![0]).toMatchObject(saved);
    }
  });

  it("accepts explicit score extent while preserving legacy unbounded save and snapshot validation", async () => {
    const store = createVaultStore({ repository: new JsonVaultRepository(new BrowserMemoryVaultStorage()) });
    await store.getState().initialize();
    const draft = createTextProgressionDraft({ result: parseTextProgression("| Cmaj7 | G7 |"), now: "2026-09-14T00:00:00.000Z" });
    const payload = textProgressionDraftSavePayload(draft, { title: "Audit", nextAction: "", userVerified: true });
    for (const chords of [
      [event("Cmaj7",0,2),event("G7",4,4)],
      [event("Cmaj7",0,6),event("G7",6,2)],
    ]) {
      expect(store.getState().createIdeaFromTextProgression({ ...payload, chords })).toEqual(expect.any(String));
      expect(store.getState().createIdeaFromTextProgression({ ...payload, scoreLengthBeats: undefined, chords })).toBeUndefined();
    }
    expect(snapshot(block([event("Cmaj7",0,2),event("G7",4,4)]))).toMatchObject({ ok: false, error: { code: "invalid-timing" } });
    const leadingRest = snapshot(block([event("Cmaj7",2,2)]));
    expect(leadingRest.ok && leadingRest.snapshot.events[0]!.startBeat).toBe(0);
    expect(leadingRest.ok && leadingRest.snapshot.lengthBeats).toBe(2);
    expect(snapshot(block([]))).toMatchObject({ ok: false, error: { code: "empty-progression" } });
  });

  it("keeps repeated attacks separate and a merged cross-bar hold as one schedule boundary", () => {
    const repeat = snapshot(block([event("Cmaj7",0,4),event("Cmaj7",4,4)]));
    const hold = snapshot(block([event("Cmaj7",0,6),event("G7",6,2)]));
    expect(repeat.ok).toBe(true);
    expect(hold.ok).toBe(true);
    if (!repeat.ok || !hold.ok) return;
    expect(buildProgressionPracticeClockSchedule(repeat.snapshot,0).eventStarts).toEqual([0,4]);
    expect(buildProgressionPracticeClockSchedule(hold.snapshot,0).eventStarts).toEqual([0,6]);
    expect(hold.snapshot.events[0]!.durationBeats).toBe(6);
  });

  it("accepts Left-hand slash shapes only after the approved product rule", () => {
    for (const label of ["Am11/B","Am9/C","Am11","Am9"]) {
      const value = snapshot(block([event(label,0,8)]), "left-hand");
      expect(value.ok).toBe(true);
      if (!value.ok) return;
      expect(resolveProgressionPracticeVoicings(value.snapshot).events[0]!.status)
        .toBe("SUPPORTED");
    }
  });
});
