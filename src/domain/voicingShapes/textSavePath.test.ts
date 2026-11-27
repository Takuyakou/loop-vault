/**
 * P25-03 K9-4: every static choice of the P26 table goes through the text intake's own path — the shape
 * snapshot, the save data, the Vault save boundary, a reload — and opens with exactly the same notes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createVaultStore } from "../../store/vaultStore";
import type { VaultStorage } from "../repository";
import { JazzVaultRepository } from "../../storage/jazzVaultStorage";
import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "../extendedTextProgression";
import { extendedTextSaveData } from "../extendedTextSave";
import { createTextHandSnapshot, createTextShapeSnapshot } from "../textCardSound";
import { buildProgressionVoicingPracticeSnapshot } from "../progressionVoicingPractice/snapshot";
import { resolveProgressionPracticeVoicings } from "../progressionVoicingPractice/voicingResolution";
import { textPreviewNotes } from "../textVoicingAvailability";
import type { ChordSymbol, VoicingSnapshot } from "../types";
import { buildShapeVoicing, placementNotes, type VoicingShapeId, type VoicingShapeOptions } from ".";

interface GoldenCase {
  root: number; label: string; quality: string; tensions: string[]; altered: boolean; bass: number | null;
  shape: VoicingShapeId; tension: boolean; spread: boolean; used: string;
  forms: { form: "A" | "B" | null; left: number[]; right: number[] }[];
}
const golden = JSON.parse(readFileSync(resolve(process.cwd(), "docs/contracts/voicing-shapes-p26/golden.json"), "utf8")) as { cases: GoldenCase[] };

function goldenChord(entry: GoldenCase): ChordSymbol {
  return {
    root: entry.root, quality: entry.quality as ChordSymbol["quality"], tensions: [...entry.tensions] as ChordSymbol["tensions"], label: entry.label,
    ...(entry.altered ? { altered: true as const } : {}),
    ...(entry.bass === null ? {} : { bass: entry.bass }),
  };
}

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const at = "2026-11-24T00:00:00.000Z";

class MemoryStorage implements VaultStorage {
  readonly files = new Map<string, string>();
  async ensureDir(_path: string) {}
  async exists(path: string) { return this.files.has(path); }
  async readText(path: string) { const value = this.files.get(path); if (value === undefined) throw new Error("missing"); return value; }
  async writeText(path: string, value: string) { this.files.set(path, value); }
  async rename(from: string, to: string) { this.files.set(to, await this.readText(from)); this.files.delete(from); }
  async copyFile(from: string, to: string) { this.files.set(to, await this.readText(from)); }
  async removeFile(path: string) { this.files.delete(path); }
  async listFiles(path: string) { return [...this.files.keys()].filter(key => key.startsWith(path + "/")).map(key => key.slice(path.length + 1)); }
}

/** The text a person types for the case's chord (the table's C label moved to the case's root and bass). */
function typedLabel(entry: GoldenCase): string {
  const slash = /\/[A-G][b#♭♯]?$/.exec(entry.label);
  const head = slash ? entry.label.slice(0, slash.index) : entry.label;
  // Typed with the ASCII signs a person types (`#` / `b`), as the text intake's own tests do.
  return `${NAMES[entry.root]}${head.slice(1).replace(/♯/g, "#").replace(/♭/g, "b")}${slash ? `/${NAMES[entry.bass!]}` : ""}`;
}

interface Sample { readonly id: string; readonly label: string; readonly snapshot: VoicingSnapshot; readonly notes: readonly number[] }

describe("P25-03 K9-4: the table's static choices through the text save path", () => {
  it("keeps every note of all 4,320 cases (both ② orders) through save and reload", async () => {
    const samples: Sample[] = [];
    const problems: string[] = [];
    // The text reader reads `m7(11)` as min11 (the table's m11 case), so the table's min7 + 11 chord is never
    // made by text intake; those 12 roots × 8 options stay outside this path (the golden test covers them).
    const notTyped = golden.cases.filter((entry) => entry.label === "Cm7(11)");
    expect(notTyped).toHaveLength(96);
    for (const entry of golden.cases) {
      if (entry.label === "Cm7(11)") continue;
      const label = typedLabel(entry);
      const parsed = parseExtendedTextChordLabel(label);
      const expected = goldenChord(entry);
      if (!parsed || parsed.root !== expected.root || parsed.quality !== expected.quality
        || JSON.stringify([...parsed.tensions].sort()) !== JSON.stringify([...expected.tensions].sort())
        || (parsed.altered === true) !== (expected.altered === true) || (parsed.bass ?? null) !== (expected.bass ?? null)) {
        problems.push(`unreadable ${label} ${JSON.stringify(parsed)}`);
        continue;
      }
      for (const form of entry.forms) {
        const options: VoicingShapeOptions = { shape: entry.shape, tension: entry.tension, spread: entry.spread, rootlessOrder: form.form ?? "auto" };
        const notes = placementNotes({ left: form.left, right: form.right });
        const snapshot = createTextShapeSnapshot(parsed, options);
        const id = `${label}:${entry.shape}${entry.tension ? "+t" : ""}${entry.spread ? "+s" : ""}:${form.form ?? "-"}`;
        if (!snapshot) { problems.push(`no snapshot ${id}`); continue; }
        if (JSON.stringify(snapshot.midiNotes) !== JSON.stringify(notes)) { problems.push(`snapshot ${id}`); continue; }
        // A one-order ② chord keeps its placeable order; a single form is the static choice (K3).
        if (buildShapeVoicing(parsed, options).forms.length === 0) { problems.push(`no forms ${id}`); continue; }
        samples.push({ id, label, snapshot, notes });
      }
    }
    expect(problems).toEqual([]);
    expect(samples.length).toBe(golden.cases.filter((entry) => entry.label !== "Cm7(11)").reduce((n, entry) => n + entry.forms.length, 0));

    const lost: string[] = [];
    for (let start = 0; start < samples.length; start += 32) {
      const chunk = samples.slice(start, start + 32);
      const parsed = parseExtendedTextProgression(`| ${chunk.map((sample) => sample.label).join(" | ")} |`, { beat: "4/4", bpm: 100, key: "C major", confirmed: true });
      expect(parsed.canConvert).toBe(true);
      const byAttackBeat = new Map(chunk.map((sample, index) => [index * 4, sample.snapshot] as const));
      const saved = extendedTextSaveData(parsed, { byAttackBeat });
      const storage = new MemoryStorage();
      const repository = new JazzVaultRepository(storage, { now: () => new Date(at) });
      let sequence = 0;
      const store = createVaultStore({ repository, now: () => new Date(at),
        idFactory: () => `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` });
      await store.getState().initialize();
      expect(store.getState().createIdeaFromTextProgression({ ...saved, nextAction: "", userEdited: false, userVerified: true })).toBeDefined();
      await store.getState().flush();
      const loaded = await new JazzVaultRepository(storage).load();
      expect(loaded.quarantine).toHaveLength(0);
      const chords = loaded.vault.ideas[0]!.progressionBlocks![0]!.chords;
      expect(chords).toHaveLength(chunk.length);
      chunk.forEach((sample, index) => {
        const item = chords[index]!;
        const kept = item.voicingMemory?.practiceVoicingOverride;
        if (!kept || kept.extractorVersion !== sample.snapshot.extractorVersion
          || JSON.stringify(kept.midiNotes) !== JSON.stringify(sample.notes)
          || JSON.stringify(textPreviewNotes(item.chord, item.voicingMemory)) !== JSON.stringify(sample.notes)) lost.push(sample.id);
      });
    }
    expect(lost).toEqual([]);
  }, 120_000);
});

describe("P25-03 C11: the card's own notes open the same in Voicing Loop", () => {
  it("plays a shape snapshot and hand-edited notes exactly as saved", async () => {
    const em = parseExtendedTextChordLabel("Em7")!;
    const a7 = parseExtendedTextChordLabel("A7")!;
    const shape = createTextShapeSnapshot(em, { shape: "rootless", tension: false, spread: false, rootlessOrder: "A" })!;
    const hand = createTextHandSnapshot(a7, [45, 61, 67, 76])!;
    const parsed = parseExtendedTextProgression("| Em7 | A7 |", { beat: "4/4", bpm: 100, key: "C major", confirmed: true });
    const saved = extendedTextSaveData(parsed, { byAttackBeat: new Map([[0, shape], [4, hand]]) });
    const storage = new MemoryStorage();
    const repository = new JazzVaultRepository(storage, { now: () => new Date(at) });
    let sequence = 0;
    const store = createVaultStore({ repository, now: () => new Date(at),
      idFactory: () => `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` });
    await store.getState().initialize();
    expect(store.getState().createIdeaFromTextProgression({ ...saved, nextAction: "", userEdited: false, userVerified: true })).toBeDefined();
    await store.getState().flush();
    const idea = (await new JazzVaultRepository(storage).load()).vault.ideas[0]!;
    const block = idea.progressionBlocks![0]!;
    expect(block.chords.map((item) => item.voicingMemory?.practiceVoicingOverride?.extractorVersion)).toEqual([shape.extractorVersion, "text-hand-v1"]);
    const built = buildProgressionVoicingPracticeSnapshot({ sourceReference: { ideaId: idea.id, blockId: block.id }, block, selection: "saved" });
    if (!built.ok) throw new Error("expected a Voicing Loop snapshot");
    const plan = resolveProgressionPracticeVoicings(built.snapshot);
    expect(plan.events.map((event) => event.status === "SUPPORTED" ? [...event.voicing.midiNotes] : event.status))
      .toEqual([[...shape.midiNotes], [45, 61, 67, 76]]);
  });
});
