/** P7.0-03 evaluation only: independent Gold -> extraction -> Vault -> playback. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import { parseChordLabel } from "../../src/domain/chords";
import { JsonVaultRepository, createEmptyVault, type VaultStorage } from "../../src/domain/repository";
import { attachSourceVoicings } from "../../src/domain/voicing/sourceVoicing";
import { normalizedChordKey } from "../../src/domain/voicing/normalizeVoicing";
import { createTimelineVoicingPlaybackPlan, resolveTimelineItemVoicing } from "../../src/domain/voicing/resolveVoicing";
import { buildProgressionVoicingPracticeSnapshot } from "../../src/domain/progressionVoicingPractice/snapshot";
import type { ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from "../../src/domain/types";
import { makeIdea } from "../../src/domain/testFactory";
import { encodeTemporalGoldMidi, temporalGoldCases } from "./temporalGold";
import type { HarmonySupportManifest } from "../phase442/harmonySupportCorpus";

export type Checkpoint = "extraction" | "representation" | "persistence" | "cardPlayback" | "capturePlayback" | "wholePlayback";
export type Arm = "product-extractor" | "copy-oracle";
export interface GoldEvent { startBeat: number; endBeat: number; chordSymbol: string; goldVoicingMidi: number[] }
export interface GoldFile { bytes: Uint8Array; events: GoldEvent[]; category: string }
export interface CheckpointAggregate { events: number; exact: number; truePositive: number; predicted: number; gold: number; missing: number; extra: number; unavailable: number; durationBeats: number; exactDurationBeats: number }
export type Tier1Aggregate = Record<Arm, Record<Checkpoint, CheckpointAggregate>>;
const checkpoints: readonly Checkpoint[] = ["extraction", "representation", "persistence", "cardPlayback", "capturePlayback", "wholePlayback"];
const arms: readonly Arm[] = ["product-extractor", "copy-oracle"];
const blank = (): CheckpointAggregate => ({ events: 0, exact: 0, truePositive: 0, predicted: 0, gold: 0, missing: 0, extra: 0, unavailable: 0, durationBeats: 0, exactDurationBeats: 0 });
const aggregate = (): Tier1Aggregate => Object.fromEntries(arms.map((arm) => [arm, Object.fromEntries(checkpoints.map((name) => [name, blank()]))])) as Tier1Aggregate;
const normalized = (notes: readonly number[] | undefined): number[] | undefined => notes === undefined ? undefined : [...new Set(notes)].sort((a, b) => a - b);
function tally(target: CheckpointAggregate, truth: readonly number[], candidate: readonly number[] | undefined, durationBeats: number): void {
  const gold = new Set(truth), predicted = new Set(candidate ?? []);
  const tp = [...predicted].filter((pitch) => gold.has(pitch)).length;
  target.events++; target.durationBeats += durationBeats; target.gold += gold.size; target.predicted += predicted.size; target.truePositive += tp;
  target.missing += gold.size - tp; target.extra += predicted.size - tp;
  if (candidate === undefined) target.unavailable++;
  if (candidate !== undefined && gold.size === predicted.size && tp === gold.size) { target.exact++; target.exactDurationBeats += durationBeats; }
}
class MemoryStorage implements VaultStorage {
  files = new Map<string, string>();
  async ensureDir(): Promise<void> { /* in-memory */ }
  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async readText(path: string): Promise<string> { const value=this.files.get(path); if (value===undefined) throw new Error("Missing research Vault record."); return value; }
  async writeText(path: string, contents: string): Promise<void> { this.files.set(path, contents); }
  async rename(from: string, to: string): Promise<void> { const value=await this.readText(from); this.files.set(to,value); this.files.delete(from); }
  async copyFile(from: string, to: string): Promise<void> { this.files.set(to,await this.readText(from)); }
  async removeFile(path: string): Promise<void> { this.files.delete(path); }
  async listFiles(path: string): Promise<string[]> { return [...this.files.keys()].filter((key)=>key.startsWith(path+"/")).map((key)=>key.slice(path.length+1)); }
}
function item(event: GoldEvent): ChordTimelineItem {
  const chord=parseChordLabel(event.chordSymbol);
  if (!chord) throw new Error("Versioned Gold chord cannot be parsed by the current product.");
  return { bar:Math.floor(event.startBeat/4)+1, beat:event.startBeat%4+1, durationBeats:event.endBeat-event.startBeat,
    chord, confidence:1, alternatives:[], warnings:[] };
}
function copySnapshot(event: GoldEvent, timelineItem: ChordTimelineItem): VoicingSnapshot {
  const notes=normalized(event.goldVoicingMidi)!;
  return {schemaVersion:1, source:"midi-extracted", representation:"simultaneous-voicing", midiNotes:notes,
    bassNote:notes[0], capturedForChordKey:normalizedChordKey(timelineItem.chord),
    capturedForChordLabel:timelineItem.chord.label, confidence:1, userVerified:true,
    extractorVersion:"p7-copy-oracle-v1"};
}
async function vaultRoundtrip(chords: ChordTimelineItem[]): Promise<SavedProgressionBlock> {
  const block: SavedProgressionBlock={id:"22222222-2222-4222-8222-222222222222", summaryText:"Phase 7 evaluation", chords,
    bpm:120,timeSignature:"4/4",tags:[],capturedAt:"2026-01-01T00:00:00.000Z",analyzerVersion:"p7-evaluation"};
  const vault=createEmptyVault();
  vault.ideas=[makeIdea({title:"Phase 7 evaluation",progressionBlocks:[block]})];
  const repo=new JsonVaultRepository(new MemoryStorage(),{now:()=>new Date("2026-01-01T00:00:00.000Z")});
  await repo.save(vault);
  const loaded=await repo.load();
  if (loaded.quarantine.length || loaded.created) throw new Error("Vault roundtrip quarantined the evaluation record.");
  const saved=loaded.vault.ideas[0]?.progressionBlocks?.[0];
  if (!saved) throw new Error("Vault roundtrip lost the evaluation block.");
  return saved;
}
function captureNotes(items: ChordTimelineItem[]): Array<number[] | undefined> {
  const plan=createTimelineVoicingPlaybackPlan(items,"p7-capture");
  return plan.timeline.map((entry)=>normalized(plan.explicitMidiNotesByEventId[entry.eventId!] ?? resolveTimelineItemVoicing(entry).midiNotes));
}
function wholeNotes(block: SavedProgressionBlock): Array<number[] | undefined> {
  const result=buildProgressionVoicingPracticeSnapshot({
    sourceReference:{ideaId:"11111111-1111-4111-8111-111111111111",blockId:block.id},block,selection:"source-midi",
  });
  if (!result.ok) return block.chords.map(()=>undefined);
  return result.snapshot.events.map((event)=>normalized(event.voicing?.midiNotes));
}
export async function evaluateGoldFile(file: GoldFile, totals: Tier1Aggregate): Promise<void> {
  const analysis=analyzeMidi(file.bytes,{enablePresentationGrouping:false});
  const sourceData=parseMidi(file.bytes);
  const voices=annotateVoiceRolesV2(buildVoices(sourceData),normalizeNotes(sourceData));
  const baseline=file.events.map(item);
  for (const arm of arms) {
    const representation=arm==="copy-oracle"
      ? baseline.map((entry,index)=>({...entry,voicingMemory:{sourceVoicing:copySnapshot(file.events[index]!,entry)}}))
      : attachSourceVoicings(baseline,{analysis,sourceData,sourceVoices:voices},new Map());
    const stored=await vaultRoundtrip(representation);
    const captures=captureNotes(representation);
    const whole=wholeNotes(stored);
    for (const [index,event] of file.events.entries()) {
      const steps: Record<Checkpoint, number[] | undefined>={
        extraction: normalized(representation[index]?.voicingMemory?.sourceVoicing?.midiNotes),
        representation: normalized(representation[index]?.voicingMemory?.sourceVoicing?.midiNotes),
        persistence: normalized(stored.chords[index]?.voicingMemory?.sourceVoicing?.midiNotes),
        cardPlayback: normalized(stored.chords[index] ? resolveTimelineItemVoicing(stored.chords[index]!).midiNotes : undefined),
        capturePlayback: captures[index], wholePlayback: whole[index],
      };
      for (const checkpoint of checkpoints) tally(totals[arm][checkpoint],event.goldVoicingMidi,steps[checkpoint],event.endBeat-event.startBeat);
    }
  }
}
export function syntheticFiles(): GoldFile[] {
  return temporalGoldCases.map((entry)=>({bytes:encodeTemporalGoldMidi(entry),category:entry.category,
    events:entry.voicingSpans.map((span)=>({startBeat:span.startBeat,endBeat:span.endBeat,
      chordSymbol:entry.harmonicSpans.find((harmonic)=>harmonic.startBeat<=span.startBeat && harmonic.endBeat>span.startBeat)?.identity ?? "",
      goldVoicingMidi:[...span.targetMidi]}))}));
}
export async function harmonyFiles(corpusDir: string, split: "dev" | "validation"): Promise<GoldFile[]> {
  const manifest=JSON.parse(await readFile(resolve(corpusDir,"manifest.json"),"utf8")) as HarmonySupportManifest;
  const selected=manifest.files.filter((file)=>file.split===split);
  if (!selected.length) throw new Error("No files in selected Gold split.");
  const files: GoldFile[]=[];
  for(const file of selected){
    const bytes=new Uint8Array(await readFile(resolve(corpusDir,file.path)));
    if(bytes.length!==file.byteLength || createHash("sha256").update(bytes).digest("hex")!==file.sha256) throw new Error("Gold manifest/source integrity mismatch.");
    files.push({bytes,category:"harmony-support-"+file.variant,
      events:file.events.map((event)=>({startBeat:event.startBeat,endBeat:event.endBeat,chordSymbol:event.chordSymbol,goldVoicingMidi:[...event.goldVoicingMidi]}))});
  }
  return files;
}
export async function evaluateGroups(groups: {name:string;files:GoldFile[]}[]) {
  const result:Record<string,{files:number;events:number;checkpoints:Tier1Aggregate}>={};
  for(const group of groups){const totals=aggregate();for(const file of group.files) await evaluateGoldFile(file,totals);
    result[group.name]={files:group.files.length,events:group.files.reduce((n,f)=>n+f.events.length,0),checkpoints:totals};}
  return {version:"p7-tier1-checkpoints-v1",result};
}
