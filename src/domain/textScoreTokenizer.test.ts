import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTextProgression } from "./textProgression";
import { parseChordLabel, labelFromSymbol } from "./chords";
import { chordPitchClasses, voiceChordForPreview } from "./chordVoicing";
import { chordToneDescriptors } from "./voicingPractice/tonePolicy";
import { chordSymbolSchema } from "./schema";
import { buildProgressionVoicingPracticeSnapshot, resolveProgressionPracticeVoicings } from "./progressionVoicingPractice";
import { createEmptyVault, JsonVaultRepository } from "./repository";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { createTextProgressionDraft, textProgressionDraftSavePayload } from "./textProgressionDraft";
import { createVaultStore } from "../store/vaultStore";

const fixture = (name: string) => readFileSync(new URL("../../docs/phase5.31/fixtures/" + name, import.meta.url), "utf8");

describe("P5.31 bounded score intake", () => {
  it("parses compact and expanded 16-bar scores to identical 34 attacks, slash identities and altered fifths", () => {
    const compact = parseTextProgression(fixture("rechord-user-example.txt"));
    const expanded = parseTextProgression(fixture("rechord-user-example-expanded.txt"));
    const timeline = (result: typeof compact) => result.events.map(event =>
      [event.canonical, event.bar, event.startBeat, event.durationBeats]);
    expect(compact.canConvert).toBe(true);
    expect(expanded.canConvert).toBe(true);
    expect(compact.bars).toBe(16);
    expect(compact.events).toHaveLength(34);
    expect(timeline(compact)).toEqual(timeline(expanded));
    expect(compact.events.filter(event => event.bar === 4).map(event => event.durationBeats)).toEqual([1,1,1,1]);
    expect(compact.events.filter(event => event.chord.bass === 0)).toHaveLength(2);
    expect(compact.events.filter(event => event.chord.tensions.includes("#5"))).toHaveLength(3);
  });

  it("keeps legacy simple bars while accepting root/type whitespace and standalone compact bars", () => {
    expect(parseTextProgression("Dm7 G7 Cmaj9 Am7").events.map(event => event.durationBeats)).toEqual([4,4,4,4]);
    expect(parseTextProgression("A m7 G 7 F M7 C add9").events.map(event => event.canonical))
      .toEqual(["Am7","G7","Fmaj7","Cadd9"]);
    for (const [input, expected] of [
      ["C9B7(#9,#5)", ["C9", "B7(#9,#5)"]],
      ["Am9Am9/C", ["Am9", "Am9/C"]],
      ["C/EAm7", ["C/E", "Am7"]],
      ["C#D", ["C#", "D"]],
    ] as const) {
      const result = parseTextProgression(input);
      expect(result.canConvert, input).toBe(true);
      expect(result.events.map(event => event.canonical)).toEqual(expected);
      expect(result.events.map(event => event.durationBeats)).toEqual([2,2]);
    }
  });

  it("preserves line boundaries, framed legacy multiline bars and comment source offsets", () => {
    const input = "# memo | not score\nC|G\n# next\nA m7|E m7";
    const result = parseTextProgression(input);
    expect(result.canConvert).toBe(true);
    expect(result.events.map(event => [event.canonical,event.bar,event.durationBeats]))
      .toEqual([["C",1,4],["G",2,4],["Am7",3,4],["Em7",4,4]]);
    for (const event of result.events) expect(input.slice(event.range.start,event.range.end)).toBe(event.raw);
    expect(parseTextProgression("| C\n D |").events.map(event => event.durationBeats)).toEqual([2,2]);
    expect(parseTextProgression("C|G\n|").canConvert).toBe(false);
    expect(parseTextProgression("# memo\n  # more").diagnostics[0]?.code).toBe("empty-input");
  });

  it("rejects non-equivalent complete compact parses and repairs them with explicit lowercase or spaces", () => {
    const result = parseTextProgression("| CADD9(#9, #5) |");
    expect(result.canConvert).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ambiguous-compact-progression", bar: 1 }),
    ]));
    expect(parseTextProgression("| Cadd9(#9, #5) |").canConvert).toBe(true);
    expect(parseTextProgression("| C A D D9(#9,#5) |").events).toHaveLength(4);
    // Existing explicitly whitespace-tokenized grammar has first priority.
    expect(parseTextProgression("| CADD9 |").events[0]?.canonical).toBe("Cadd9");
  });

  it("fails closed for incomplete tokens and malformed protected punctuation deterministically at capacity", () => {
    for (const input of ["C#5","C9B7(#9,#5)garbage","C/E/Am7","C7(#9G)","C7((#9))","C7(#9","C||G","CDE|"]) {
      expect(parseTextProgression(input).canConvert, input).toBe(false);
    }
    for (const input of ["C".repeat(8192), "(" + "C".repeat(8190) + ")", "| " + "C#".repeat(2000) + "X |"]) {
      const first = parseTextProgression(input);
      expect(first.canConvert).toBe(false);
      expect(parseTextProgression(input)).toEqual(first);
      expect(first.tokens.length).toBeLessThanOrEqual(128);
    }
  });

  it("keeps #5 distinct from b13 in schema, generated preview and degree descriptions", () => {
    const chord = parseChordLabel("B7(#9,#5)")!;
    expect(chordSymbolSchema.parse(chord)).toEqual(chord);
    expect(parseChordLabel(labelFromSymbol(chord))).toEqual(chord);
    expect(chordPitchClasses(chord).sort((a,b)=>a-b)).toEqual([2,3,7,9,11]);
    expect(chordToneDescriptors(chord).map(tone=>tone.label)).toEqual(["R","3","#5","b7","#9"]);
    expect(new Set(voiceChordForPreview(chord).notes.map(note=>note%12))).toEqual(new Set([2,3,7,9,11]));
    expect(chordPitchClasses(parseChordLabel("B7(#9,b13)")!)).toContain(6);
    expect(parseChordLabel("C#5")).toBeNull();
  });

  it("round-trips exact altered identity through normal Text save, Vault reload and Basic Full", async () => {
    const repository = new JsonVaultRepository(new BrowserMemoryVaultStorage());
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const result = parseTextProgression("| B7(#9,#5) |");
    const draft = createTextProgressionDraft({ result, now: "2026-09-14T00:00:00.000Z" });
    const payload = textProgressionDraftSavePayload(draft, { title: "Synthetic altered chord", nextAction: "", userVerified: true, bpm: 100 });
    const savedId = store.getState().createIdeaFromTextProgression(payload);
    expect(savedId).toBeTruthy();
    // Persist the normally-created state via the real JSON adapter.
    await repository.save({ ...createEmptyVault(), ideas: store.getState().ideas });
    const loaded = await repository.load();
    expect(loaded.quarantine).toEqual([]);
    const block = loaded.vault.ideas[0]!.progressionBlocks![0]!;
    const snapshot = buildProgressionVoicingPracticeSnapshot({ block, selection: "basic-full",
      sourceReference: { ideaId: loaded.vault.ideas[0]!.id, blockId: block.id } });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error("expected valid snapshot");
    const resolved = resolveProgressionPracticeVoicings(snapshot.snapshot);
    expect(resolved.events[0]?.status).toBe("SUPPORTED");
    expect(new Set(resolved.events[0]?.voicing?.midiNotes.map(note => note % 12))).toEqual(new Set([2,3,7,9,11]));
    expect(snapshot.snapshot.events[0]!.chord.tensions).toEqual(["#9","#5"]);
  });
});
