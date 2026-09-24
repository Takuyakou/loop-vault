/**
 * P7.0-01 evaluation only. Chord identity is held at independent Gold in every
 * arm; this isolates source-voicing extraction under boundary and role oracles.
 * Output is aggregate-only and existing holdout splits are deliberately blocked.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Midi } from "@tonejs/midi";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";
import type { MidiSongData, TimedNote, VoiceRole } from "../../src/domain/midi/types";
import { parseChordLabel } from "../../src/domain/chords";
import { extractVoicing } from "../../src/domain/voicing/extractVoicing";
import type { ChordTimelineItem } from "../../src/domain/types";
import type { HarmonySupportManifest } from "../phase442/harmonySupportCorpus";

type Condition = "product-boundary_product-role" | "gold-boundary_product-role"
  | "product-boundary_gold-role" | "gold-boundary_gold-role";
const conditions: readonly Condition[] = [
  "product-boundary_product-role",
  "gold-boundary_product-role",
  "product-boundary_gold-role",
  "gold-boundary_gold-role",
];
type GoldRole = "harmony" | "bass" | "pad" | "melody" | "voice" | "percussion" | "mixed";
interface GoldNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  role: GoldRole;
  trackId: string;
}
interface GoldTrack {
  trackId: string;
  midiTrackName: string;
  channel: number;
  goldRole: string;
}
interface GoldEvent {
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  goldVoicingMidi: number[];
}
interface Case {
  bytes: Uint8Array;
  tracks: GoldTrack[];
  notes: GoldNote[];
  events: GoldEvent[];
}
interface Accumulator {
  events: number;
  exact: number;
  truePositive: number;
  predicted: number;
  target: number;
  missing: number;
  extra: number;
  melodyLeak: number;
  melodyAsTension: number;
  boundaryTruePositive: number;
  productBoundaryCount: number;
  goldBoundaryCount: number;
  roleMelodyTruePositive: number;
  roleMelodyPredicted: number;
  roleMelodyGold: number;
  harmonyAsMelody: number;
  boundaryMissing: number;
}
const blank = (): Accumulator => ({
  events: 0, exact: 0, truePositive: 0, predicted: 0, target: 0,
  missing: 0, extra: 0, melodyLeak: 0, melodyAsTension: 0,
  boundaryTruePositive: 0, productBoundaryCount: 0, goldBoundaryCount: 0, roleMelodyTruePositive: 0,
  roleMelodyPredicted: 0, roleMelodyGold: 0, harmonyAsMelody: 0,
  boundaryMissing: 0,
});
const args = process.argv;
function arg(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const split = arg("--split") ?? "dev";
if (split !== "dev" && split !== "validation") {
  throw new Error("P7.0-01 allows dev or validation only; existing holdout is reserved.");
}
const corpusPath = arg("--corpus");
if (!corpusPath) throw new Error("--corpus is required.");
const manifest = JSON.parse(await readFile(resolve(corpusPath, "manifest.json"), "utf8")) as HarmonySupportManifest;
const mixedFiles = manifest.files.filter((file) => file.split === split);
if (mixedFiles.length === 0) throw new Error("No files in requested split.");
const groups = {
  "chord-only-synthetic": Object.fromEntries(conditions.map((condition) => [condition, blank()])) as Record<Condition, Accumulator>,
  "melody-containing-gold": Object.fromEntries(conditions.map((condition) => [condition, blank()])) as Record<Condition, Accumulator>,
};
for (const fixture of cleanCases()) evaluateCase(fixture, groups["chord-only-synthetic"]);
for (const file of mixedFiles) {
  const bytes = new Uint8Array(await readFile(resolve(corpusPath, file.path)));
  if (bytes.length !== file.byteLength
    || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new Error("Selected-split corpus integrity failed.");
  }
  evaluateCase({ bytes, tracks: file.tracks, notes: file.notes as GoldNote[], events: file.events }, groups["melody-containing-gold"]);
}
const output = Object.fromEntries(Object.entries(groups).map(([group, byCondition]) => [
  group,
  Object.fromEntries(conditions.map((condition) => [condition, summarize(byCondition[condition])])),
]));
process.stdout.write(JSON.stringify({ schemaVersion: 1, phase: "P7.0-01", split, output }, null, 2) + "\n");

function evaluateCase(fixture: Case, output: Record<Condition, Accumulator>): void {
  const data = parseMidi(fixture.bytes);
  const truth = matchGoldNotes(data, fixture.tracks, fixture.notes);
  const analysis = analyzeMidi(fixture.bytes);
  const meter = beatsPerBar(data.timeSignature);
  const boundary = boundaryCounts(analysis.fullTimeline, fixture.events, meter, data.ticksPerBeat);
  const rawVoices = buildVoices(data);
  const normalized = normalizeNotes(data);
  const productVoices = annotateVoiceRolesV2(rawVoices, normalized);
  const overrides = Object.fromEntries(rawVoices.flatMap((voice) => {
    const track = fixture.tracks.find((candidate) =>
      candidate.midiTrackName === voice.trackName && candidate.channel === voice.channel);
    return track ? [[voice.id, mapRole(track.goldRole)]] : [];
  }));
  const goldVoices = annotateVoiceRolesV2(rawVoices, normalized, overrides);
  const productByVoice = new Map(productVoices.map((voice) => [voice.id, voice.inferredRole]));
  const matched = data.notes.map((note, index) => ({ note, role: truth[index]!.role }));
  const goldRoleNotes = matched.filter(({ role }) => role !== "melody" && role !== "voice" && role !== "percussion").map(({ note }) => note);
  const roleCounts = { tp: 0, predicted: 0, gold: 0, harmonyAsMelody: 0 };
  for (const { note, role } of matched) {
    const product = productByVoice.get(`${note.trackIndex}:${note.channel}`) ?? "mixed";
    const isGoldMelody = role === "melody" || role === "voice";
    const isProductMelody = product === "melody";
    if (isGoldMelody) roleCounts.gold++;
    if (isProductMelody) roleCounts.predicted++;
    if (isGoldMelody && isProductMelody) roleCounts.tp++;
    if (!isGoldMelody && isProductMelody && role !== "percussion") roleCounts.harmonyAsMelody++;
  }
  for (const condition of conditions) {
    const accumulator = output[condition];
    accumulator.roleMelodyTruePositive += roleCounts.tp;
    accumulator.roleMelodyPredicted += roleCounts.predicted;
    accumulator.roleMelodyGold += roleCounts.gold;
    accumulator.harmonyAsMelody += roleCounts.harmonyAsMelody;
    accumulator.boundaryTruePositive += boundary.truePositive;
    accumulator.productBoundaryCount += boundary.product;
    accumulator.goldBoundaryCount += boundary.gold;
  }
  for (const event of fixture.events) {
    const chord = parseChordLabel(event.chordSymbol);
    if (!chord) throw new Error("Gold chord is not representable by current parser.");
    const goldSet = new Set(event.goldVoicingMidi);
    const melodySet = new Set(matched.filter(({ note, role }) =>
      (role === "melody" || role === "voice") && overlaps(note, data.ticksPerBeat, event)
    ).map(({ note }) => note.pitch).filter((pitch) => !goldSet.has(pitch)));
    const productItem = maxOverlapItem(analysis.fullTimeline, event, meter);
    const tensionPcs = new Set(productItem?.chord.tensions.map((tension) =>
      (productItem.chord.root + tensionOffset(tension)) % 12) ?? []);
    const targetPcs = new Set([...goldSet].map((pitch) => pitch % 12));
    const melodyAsTension = [...melodySet].filter((pitch) =>
      !targetPcs.has(pitch % 12) && tensionPcs.has(pitch % 12)).length;
    for (const condition of conditions) {
      const accumulator = output[condition];
      accumulator.melodyAsTension += melodyAsTension;
      const productBoundary = condition.startsWith("product-boundary");
      const productRole = condition.endsWith("product-role");
      const segment = productBoundary
        ? maxOverlapSegment(analysis.fullTimeline, event, meter)
        : { startBeat: event.startBeat, endBeat: event.endBeat };
      accumulator.events++;
      const target = goldSet.size;
      accumulator.target += target;
      if (!segment) {
        accumulator.boundaryMissing++;
        accumulator.missing += target;
        continue;
      }
      const extraction = extractVoicing({
        chord,
        segment,
        notes: productRole ? data.notes : goldRoleNotes,
        ticksPerBeat: data.ticksPerBeat,
        voices: productRole ? productVoices : goldVoices,
      });
      const predicted = new Set(extraction.snapshot?.midiNotes ?? []);
      const tp = [...predicted].filter((pitch) => goldSet.has(pitch)).length;
      accumulator.predicted += predicted.size;
      accumulator.truePositive += tp;
      accumulator.missing += target - tp;
      accumulator.extra += predicted.size - tp;
      accumulator.melodyLeak += [...predicted].filter((pitch) => melodySet.has(pitch)).length;
      if (predicted.size === target && tp === target) accumulator.exact++;
    }
  }
}
/** Match each Gold role to a parsed source note. Duration is deliberately excluded
 * because exact duration-key matching did not cover every parsed note;
 * onset/pitch/track/channel remain one-to-one and conflicting-role duplicates
 * are audited before using the corpus. */
function matchGoldNotes(data: MidiSongData, tracks: GoldTrack[], gold: GoldNote[]): Array<{ role: GoldRole }> {
  const expected = new Map<string, GoldRole[]>();
  for (const note of gold) {
    const track = tracks.find((candidate) => candidate.trackId === note.trackId);
    const parsedTrack = data.tracks.find((candidate) =>
      candidate.name === track?.midiTrackName && candidate.channel === track.channel);
    if (!parsedTrack) throw new Error("Gold track cannot be mapped to parsed MIDI.");
    const key = noteKey(parsedTrack.index, track!.channel, note.midi,
      Math.round(note.startBeat * data.ticksPerBeat));
    expected.set(key, [...(expected.get(key) ?? []), note.role]);
  }
  const mapped = data.notes.map((note) => {
    const key = noteKey(note.trackIndex, note.channel ?? -1, note.pitch, note.startTick);
    const roles = expected.get(key);
    const role = roles?.shift();
    if (!role) throw new Error("Gold note cannot be mapped to parsed MIDI.");
    return { role };
  });
  if ([...expected.values()].some((roles) => roles.length > 0)) {
    throw new Error("Gold note count does not match parsed MIDI.");
  }
  return mapped;
}
function noteKey(track: number, channel: number, pitch: number, start: number): string {
  return `${track}:${channel}:${pitch}:${start}`;
}
function mapRole(role: string): VoiceRole {
  if (role === "voice") return "melody";
  if (role === "bass" || role === "pad" || role === "melody" || role === "percussion" || role === "mixed") return role;
  return "harmony";
}
function overlaps(note: TimedNote, ppq: number, event: GoldEvent): boolean {
  return (note.startTick + note.durationTick) / ppq > event.startBeat && note.startTick / ppq < event.endBeat;
}
function maxOverlapItem(timeline: readonly ChordTimelineItem[], event: GoldEvent, meter: number): ChordTimelineItem | undefined {
  let best: ChordTimelineItem | undefined;
  let bestOverlap = 0;
  for (const item of timeline) {
    const start = (item.bar - 1) * meter + item.beat - 1;
    const overlap = Math.max(0, Math.min(start + item.durationBeats, event.endBeat) - Math.max(start, event.startBeat));
    if (overlap > bestOverlap) { best = item; bestOverlap = overlap; }
  }
  return best;
}
function maxOverlapSegment(timeline: readonly ChordTimelineItem[], event: GoldEvent, meter: number) {
  let best: { startBeat: number; endBeat: number; overlap: number } | undefined;
  for (const item of timeline) {
    const startBeat = (item.bar - 1) * meter + item.beat - 1;
    const endBeat = startBeat + item.durationBeats;
    const overlap = Math.max(0, Math.min(endBeat, event.endBeat) - Math.max(startBeat, event.startBeat));
    if (overlap > (best?.overlap ?? 0)) best = { startBeat, endBeat, overlap };
  }
  return best ? { startBeat: best.startBeat, endBeat: best.endBeat } : undefined;
}
/** Boundary tolerance is one source tick, fixed before comparing conditions. */
function boundaryCounts(timeline: readonly ChordTimelineItem[], events: readonly GoldEvent[], meter: number, ppq: number) {
  const product = timeline.slice(1).map((item) => (item.bar - 1) * meter + item.beat - 1);
  const gold = events.slice(1).map((event) => event.startBeat);
  const used = new Set<number>();
  let truePositive = 0;
  for (const start of gold) {
    const index = product.findIndex((value, candidate) => !used.has(candidate) && Math.abs(value - start) <= 1 / ppq);
    if (index >= 0) { used.add(index); truePositive++; }
  }
  return { truePositive, product: product.length, gold: gold.length };
}
function tensionOffset(tension: string): number {
  const offsets: Record<string, number> = { "#5": 8, "9": 14, b9: 13, "#9": 15, "11": 17, "#11": 18, "13": 21, b13: 20 };
  return offsets[tension] ?? 0;
}
function summarize(row: Accumulator) {
  const precision = row.predicted === 0 ? 0 : row.truePositive / row.predicted;
  const recall = row.target === 0 ? 0 : row.truePositive / row.target;
  const rolePrecision = row.roleMelodyPredicted === 0 ? null : row.roleMelodyTruePositive / row.roleMelodyPredicted;
  const roleRecall = row.roleMelodyGold === 0 ? null : row.roleMelodyTruePositive / row.roleMelodyGold;
  return {
    events: row.events,
    exactRate: rounded(row.exact / row.events),
    notePrecision: rounded(precision),
    noteRecall: rounded(recall),
    noteF1: rounded(precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall)),
    missingNotes: row.missing,
    extraNotes: row.extra,
    melodyLeak: row.melodyLeak,
    melodyAsTension: row.melodyAsTension,
    boundaryPrecision: row.productBoundaryCount === 0 ? null : rounded(row.boundaryTruePositive / row.productBoundaryCount),
    boundaryRecall: row.goldBoundaryCount === 0 ? null : rounded(row.boundaryTruePositive / row.goldBoundaryCount),
    roleMelodyPrecision: rolePrecision === null ? null : rounded(rolePrecision),
    roleMelodyRecall: roleRecall === null ? null : rounded(roleRecall),
    harmonyAsMelody: row.harmonyAsMelody,
    productBoundaryNoOverlap: row.boundaryMissing,
  };
}
function rounded(value: number): number { return Number(value.toFixed(6)); }
/** Small public-safe chord-only control; no private MIDI bytes are stored. */
function cleanCases(): Case[] {
  const chords = [
    { startBeat: 0, endBeat: 2, chordSymbol: "Cmaj7", notes: [48, 55, 59, 64] },
    { startBeat: 2, endBeat: 3, chordSymbol: "Dm7", notes: [50, 57, 60, 65] },
    { startBeat: 3, endBeat: 4, chordSymbol: "G7", notes: [43, 53, 59, 62] },
    { startBeat: 4, endBeat: 8, chordSymbol: "Cmaj7", notes: [48, 55, 59, 64] },
  ];
  return [0, 2, 5, 7].map((transpose) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
    const track = midi.addTrack();
    track.name = "Synthetic harmony";
    const notes: GoldNote[] = [];
    const events: GoldEvent[] = [];
    for (const chord of chords) {
      const pitches = chord.notes.map((pitch) => pitch + transpose);
      for (const pitch of pitches) {
        track.addNote({ midi: pitch, ticks: chord.startBeat * 480, durationTicks: (chord.endBeat - chord.startBeat) * 480, velocity: 0.8 });
        notes.push({ midi: pitch, startBeat: chord.startBeat, durationBeats: chord.endBeat - chord.startBeat, role: "harmony", trackId: "synthetic-harmony" });
      }
      const label = transpose === 0 ? chord.chordSymbol
        : ["C", "D", "F", "G"].includes(chord.chordSymbol[0])
          ? transposeLabel(chord.chordSymbol, transpose)
          : chord.chordSymbol;
      events.push({ startBeat: chord.startBeat, endBeat: chord.endBeat, chordSymbol: label, goldVoicingMidi: pitches });
    }
    return {
      bytes: new Uint8Array(midi.toArray()),
      tracks: [{ trackId: "synthetic-harmony", midiTrackName: "Synthetic harmony", channel: 0, goldRole: "harmony" }],
      notes,
      events,
    };
  });
}
function transposeLabel(label: string, semitones: number): string {
  const names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const root = label[0]!;
  const pc = { C: 0, D: 2, F: 5, G: 7 }[root as "C" | "D" | "F" | "G"];
  return names[(pc + semitones) % 12] + label.slice(1);
}
