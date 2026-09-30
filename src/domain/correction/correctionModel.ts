import { noteNameFromPitchClass } from "../chords";
import { chordPitchClasses } from "../chordVoicing";
import { beatsPerBar } from "../midi/timing";
import { segmentSections } from "../midi/sections";
import type { MidiSongData, TimedNote, Voice, VoiceRole } from "../midi/types";
import type { ChordSymbol, ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import type { ReviewThresholds } from "./reviewThresholds";
import { nameAfterRemoving } from "./nameCandidates";

/**
 * P10.0-02 CorrectionModel (spec v2.2 §8): the working data of the correction
 * workspace, built from an analysis without changing it. Display only for now;
 * editing arrives in P10.0-03. Pure: no React, inputs are never mutated.
 */

export type RoleHint = "harmony" | "bass" | "melody" | "percussion" | "ornament";

export interface CorrectionNote {
  id: string;
  provenance: "SOURCE" | "MANUAL_ADDED";
  sourceNoteId: string | null;
  cardId: string;
  pitch: number;
  originalPitch?: number;
  /** Beats from the song start, clipped to the card. */
  start: number;
  duration: number;
  /** The source note began before this card (it is held over from the previous one). */
  continuesFromBefore: boolean;
  used: boolean;
  roleHint?: RoleHint;
  voiceId?: string;
}

export type ReviewKind = "melody" | "percussion" | "same-chord-split";

export interface ReviewReason {
  kind: ReviewKind;
  noteIds: string[];
  text: string;
}

export interface CorrectionCard {
  id: string;
  start: number;
  duration: number;
  bar: number;
  beat: number;
  name: ChordSymbol;
  nameSource: "auto";
  alternatives: ChordSymbol[];
  timelineIndex: number;
  reviewReasons: ReviewReason[];
  reviewed: boolean;
  attacks: number;
}

export interface CorrectionSegment {
  id: string;
  startBar: number;
  endBar: number;
  label: string;
  /** 2 for the second time the same chords appear, 3 for the third …; undefined the first time. */
  repeatGroup?: number;
  source: "segmentSections" | "fallback-8bar";
}

export interface SongSuggestion {
  kind: "melody-voice";
  voiceLabel: string;
  cardCount: number;
  noteIds: string[];
}

export interface CorrectionModel {
  cards: CorrectionCard[];
  notes: CorrectionNote[];
  segments: CorrectionSegment[];
  suggestions: SongSuggestion[];
  pitchRange: { low: number; high: number };
  totalBeats: number;
  bpm: number | undefined;
  timeSignature: string | undefined;
  thresholdsVersion: string;
}

export interface CorrectionModelInput {
  result: Pick<MidiProgressionAnalysis, "fullTimeline" | "bpm" | "timeSignature" | "totalBars">;
  sourceData: MidiSongData;
  sourceVoices: readonly Voice[];
  roleOverrides?: Readonly<Record<string, VoiceRole>>;
}

const EPSILON = 1e-6;

export function noteLabel(pitch: number): string {
  return `${noteNameFromPitchClass(pitch)}${Math.floor(pitch / 12) - 1}`;
}

export function buildCorrectionModel(input: CorrectionModelInput, thresholds: ReviewThresholds): CorrectionModel {
  const { result, sourceData } = input;
  const meter = beatsPerBar(result.timeSignature);
  const tpb = sourceData.ticksPerBeat;
  const voiceById = new Map(input.sourceVoices.map((voice) => [voiceKey(voice.trackIndex, voice.channel), voice]));
  const roleOf = (voice: Voice | undefined): VoiceRole | undefined => voice
    ? input.roleOverrides?.[voice.id] ?? voice.inferredRole
    : undefined;

  // Source notes (GM drums on channel 10 are never analyzed, so they are left out).
  const seen = new Map<string, number>();
  const sourceNotes = sourceData.notes
    .filter((note) => note.channel !== 9)
    .map((note) => {
      const base = `${note.trackIndex}:${note.channel ?? "-"}:${note.startTick}:${note.pitch}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return {
        note,
        sourceNoteId: count === 1 ? base : `${base}#${count}`,
        start: note.startTick / tpb,
        end: (note.startTick + note.durationTick) / tpb,
        voice: voiceById.get(voiceKey(note.trackIndex, note.channel)),
      };
    });

  const percussionPitches = percussionSuspectPitches(sourceNotes, thresholds);

  const cards: CorrectionCard[] = result.fullTimeline.map((item, index) => {
    const start = (item.bar - 1) * meter + item.beat - 1;
    return {
      id: `card-${index}`,
      start,
      duration: item.durationBeats,
      bar: item.bar,
      beat: item.beat,
      name: item.chord,
      nameSource: "auto",
      alternatives: item.alternatives.map((alternative) => alternative.chord),
      timelineIndex: index,
      reviewReasons: [],
      reviewed: false,
      attacks: 1,
    };
  });

  const notes: CorrectionNote[] = [];
  const notesByCard = new Map<string, CorrectionNote[]>();
  cards.forEach((card, index) => {
    const end = card.start + card.duration;
    const used = new Set(result.fullTimeline[index]!.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    const fragments = sourceNotes
      .filter((source) => source.start < end - EPSILON && source.end > card.start + EPSILON)
      .map((source): CorrectionNote => {
        const start = Math.max(source.start, card.start);
        const role = roleOf(source.voice);
        return {
          id: `${source.sourceNoteId}@${card.id}`,
          provenance: "SOURCE",
          sourceNoteId: source.sourceNoteId,
          cardId: card.id,
          pitch: source.note.pitch,
          start,
          duration: Math.min(source.end, end) - start,
          continuesFromBefore: source.start < card.start - thresholds.melody.continuedToleranceBeats,
          used: used.has(source.note.pitch),
          roleHint: percussionPitches.has(source.note.pitch) ? "percussion" : roleHintOf(role),
          ...(source.voice ? { voiceId: source.voice.id } : {}),
        };
      });
    notesByCard.set(card.id, fragments);
    notes.push(...fragments);
  });

  const melodyVoices = input.sourceVoices.filter((voice) => thresholds.melody.melodyRoles.includes(roleOf(voice) ?? ""));
  const melodyVoiceIds = new Set(melodyVoices.map((voice) => voice.id));
  const suggestionNotes = notes.filter((note) => note.used && note.voiceId !== undefined && melodyVoiceIds.has(note.voiceId));
  const suggestions: SongSuggestion[] = suggestionNotes.length ? [{
    kind: "melody-voice",
    voiceLabel: melodyVoices.map((voice) => voice.trackName?.trim() || `トラック${voice.trackIndex + 1}`).join("・"),
    cardCount: new Set(suggestionNotes.map((note) => note.cardId)).size,
    noteIds: suggestionNotes.map((note) => note.id),
  }] : [];

  // Review reasons (spec 6.3). With a song-wide melody suggestion, the melody-role
  // reason is left to the suggestion; the held-over top note still flags its card.
  const melodyRule = suggestions.length ? "continued-top" : thresholds.melody.rule;
  cards.forEach((card, index) => {
    const here = notesByCard.get(card.id)!;
    const melody = melodyReason(card, here, melodyRule, thresholds, melodyVoiceIds);
    if (melody) card.reviewReasons.push(melody);
    const drums = here.filter((note) => note.used && percussionPitches.has(note.pitch));
    if (drums.length) {
      const pitch = drums[0]!.pitch;
      const count = sourceNotes.filter((source) => source.note.pitch === pitch).length;
      card.reviewReasons.push({
        kind: "percussion",
        noteIds: drums.map((note) => note.id),
        text: `${noteLabel(pitch)} の短い音が拍ごとに繰り返しています（曲全体で${count}個）。ドラムの可能性があります。`,
      });
    }
    const next = cards[index + 1];
    if (next && sameShape(here, notesByCard.get(next.id)!)) {
      card.reviewReasons.push({
        kind: "same-chord-split",
        noteIds: here.filter((note) => note.used).map((note) => note.id),
        text: "次のカードと同じ和音です。打ち直しで分かれた可能性があります。",
      });
    }
  });

  const totalBars = Math.max(1, result.totalBars, ...cards.map((card) => Math.ceil((card.start + card.duration) / meter - EPSILON)));
  return {
    cards,
    notes,
    segments: buildSegments(sourceData, result.fullTimeline, cards, totalBars, meter),
    suggestions,
    pitchRange: pitchRangeOf(notes),
    totalBeats: totalBars * meter,
    bpm: result.bpm,
    timeSignature: result.timeSignature,
    thresholdsVersion: `v${thresholds.schemaVersion}`,
  };
}

/** Pitches whose short, on-grid notes repeat often enough to look like a drum part. */
export function percussionSuspectPitches(
  notes: readonly { note: Pick<TimedNote, "pitch">; start: number; end: number }[],
  thresholds: ReviewThresholds,
): Set<number> {
  const { shortMaxBeats, gridBeats, gridToleranceBeats, minRepeatsInSong } = thresholds.percussion;
  const onGrid = (beat: number) => Math.abs(beat / gridBeats - Math.round(beat / gridBeats)) * gridBeats <= gridToleranceBeats;
  const counts = new Map<number, number>();
  for (const { note, start, end } of notes) {
    if (end - start <= shortMaxBeats + EPSILON && onGrid(start)) counts.set(note.pitch, (counts.get(note.pitch) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= minRepeatsInSong).map(([pitch]) => pitch));
}

function melodyReason(
  card: CorrectionCard,
  here: readonly CorrectionNote[],
  rule: ReviewThresholds["melody"]["rule"],
  thresholds: ReviewThresholds,
  melodyVoiceIds: ReadonlySet<string>,
): ReviewReason | undefined {
  if (!here.length) return undefined;
  const top = Math.max(...here.map((note) => note.pitch));
  const tones = new Set(chordPitchClasses(card.name));
  const continued = (note: CorrectionNote) => note.pitch === top && note.continuesFromBefore;
  const melody = (note: CorrectionNote) => note.voiceId !== undefined && melodyVoiceIds.has(note.voiceId);
  const nonChordMelody = (note: CorrectionNote) => melody(note)
    && (!thresholds.melody.requireNonChordToneForRoleMatch || !tones.has(note.pitch % 12));
  const test = (note: CorrectionNote): "continued" | "melody" | undefined => {
    if (rule !== "melody-role" && rule !== "melody-role-nonchord" && continued(note)) return "continued";
    if (rule === "melody-role" || rule === "either") return melody(note) ? "melody" : undefined;
    if (rule === "melody-role-nonchord" || rule === "continued-top-or-melody-nonchord") return nonChordMelody(note) ? "melody" : undefined;
    return undefined;
  };
  const used = here.filter((note) => note.used);
  const hit = used.map((note) => ({ note, why: test(note) })).find((entry) => entry.why);
  if (!hit) return undefined;
  const label = noteLabel(hit.note.pitch);
  const after = nameAfterRemoving(used, hit.note.pitch);
  const tail = after ? `外すと ${after} になります。` : "";
  const text = hit.why === "continued"
    ? `上の ${label} は前の区間から続く高い音です。メロディの可能性があります。${tail}`
    : `${label} はメロディの Voice の音で、名前の構成音にはありません。メロディの可能性があります。${tail}`;
  return { kind: "melody", noteIds: used.filter((note) => note.pitch === hit.note.pitch).map((note) => note.id), text };
}

function sameShape(left: readonly CorrectionNote[], right: readonly CorrectionNote[]): boolean {
  const shape = (notes: readonly CorrectionNote[]) => {
    const pitches = notes.filter((note) => note.used).map((note) => note.pitch);
    return pitches.length ? `${[...new Set(pitches.map((pitch) => pitch % 12))].sort((a, b) => a - b).join(",")}/${Math.min(...pitches)}` : "";
  };
  const a = shape(left);
  return a !== "" && a === shape(right);
}

function buildSegments(
  sourceData: MidiSongData,
  timeline: readonly ChordTimelineItem[],
  cards: readonly CorrectionCard[],
  totalBars: number,
  meter: number,
): CorrectionSegment[] {
  const sections = segmentSections(sourceData, timeline);
  const ranges = sections.length >= 2
    ? sections.map((section, index) => ({ startBar: section.startBar, endBar: section.endBar, label: `区切り${index + 1}`, source: "segmentSections" as const }))
    : Array.from({ length: Math.ceil(totalBars / 8) }, (_, index) => {
        const startBar = index * 8 + 1;
        const endBar = Math.min(startBar + 7, totalBars);
        return { startBar, endBar, label: `${startBar}〜${endBar}小節`, source: "fallback-8bar" as const };
      });
  const seen = new Map<string, number>();
  return ranges.map((range, index) => {
    const from = (range.startBar - 1) * meter;
    const to = range.endBar * meter;
    const content = cards.filter((card) => card.start >= from - EPSILON && card.start < to - EPSILON)
      .map((card) => `${card.start - from}:${card.name.label}`).join("|");
    const times = content ? (seen.get(content) ?? 0) + 1 : 1;
    if (content) seen.set(content, times);
    return { id: `segment-${index}`, ...range, ...(times > 1 ? { repeatGroup: times } : {}) };
  });
}

function pitchRangeOf(notes: readonly CorrectionNote[]): { low: number; high: number } {
  if (!notes.length) return { low: 48, high: 72 };
  let low = Math.min(...notes.map((note) => note.pitch)) - 2;
  let high = Math.max(...notes.map((note) => note.pitch)) + 2;
  const missing = 24 - (high - low);
  if (missing > 0) {
    low -= Math.floor(missing / 2);
    high += Math.ceil(missing / 2);
  }
  return { low: Math.max(0, low), high: Math.min(127, high) };
}

function roleHintOf(role: VoiceRole | undefined): RoleHint | undefined {
  if (role === "bass" || role === "melody" || role === "percussion") return role;
  if (role === "harmony" || role === "pad") return "harmony";
  return undefined;
}

function voiceKey(trackIndex: number, channel: number | undefined): string {
  return `${trackIndex}:${channel ?? "-"}`;
}
