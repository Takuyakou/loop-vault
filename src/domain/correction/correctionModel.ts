import { noteNameFromPitchClass } from "../chords";
import { chordPitchClasses } from "../chordVoicing";
import { beatsPerBar } from "../midi/timing";
import { segmentSections } from "../midi/sections";
import type { MidiSongData, TimedNote, Voice, VoiceRole } from "../midi/types";
import type { ChordSymbol, MidiProgressionAnalysis } from "../types";
import type { ReviewThresholds } from "./reviewThresholds";
import { detectedName, nameAfterRemoving } from "./nameCandidates";

/**
 * CorrectionModel (spec v2.3 §8): the working data of the correction workspace,
 * built from an analysis without changing it (P10.0-02) and edited by the pure
 * functions in edits.ts / cardEdits.ts (P10.0-03/04). Inputs are never mutated;
 * every edit returns a new model and refreshModel() recomputes what depends on
 * the notes (review reasons, suggestions, automatic names).
 */

export type RoleHint = "harmony" | "bass" | "melody" | "percussion" | "ornament";

export interface CorrectionNote {
  id: string;
  provenance: "SOURCE" | "MANUAL_ADDED";
  sourceNoteId: string | null;
  cardId: string;
  pitch: number;
  /** Only on a source note whose pitch was changed: the pitch before the change. */
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
  /**
   * Where the name came from (P10.1 §11): automatic, chosen from the candidates,
   * or typed. Workspace-only; saving treats chosen and typed alike (a person's name).
   */
  nameSource: NameSource;
  /** The used notes do not read as a chord after an edit: the name stayed (P10.1 §11.2). */
  nameUnreadable?: boolean;
  /** A typed name keeps; what the notes read as is offered instead (P10.1 §11.2). */
  suggestedName?: ChordSymbol;
  alternatives: ChordSymbol[];
  /** The fullTimeline item this card came from (the first one for merged cards). */
  timelineIndex: number;
  reviewReasons: ReviewReason[];
  /** 「このままでよい」: no review marks for the rest of this import. */
  reviewed: boolean;
  /** Re-attacks kept when cards are merged (×n). Never saved. */
  attacks: number;
  /** A note of this card was changed by a person (its notes, not the analysis voicing, will be saved). */
  edited: boolean;
  /** 「2音以上にしてください」 when an edited card plays fewer than two pitches. */
  noteWarning?: string;
}

export type NameSource = "auto" | "chosen" | "typed";

export interface CorrectionSegment {
  id: string;
  startBar: number;
  endBar: number;
  label: string;
  /** How many segments have the same chords (2 or more); set on every one of them. */
  repeatCount?: number;
  source: "segmentSections" | "fallback-8bar";
}

export type SongSuggestion =
  | { kind: "melody-voice"; voiceLabel: string; cardCount: number; noteIds: string[] }
  | { kind: "same-notes-run"; count: number; cardIds: string[] };

/** A source note in beats; kept so notes can be re-cut when card boundaries move. */
export interface SourceNoteRef {
  id: string;
  pitch: number;
  start: number;
  end: number;
  voiceId?: string;
  roleHint?: RoleHint;
}

export interface CorrectionContext {
  thresholds: ReviewThresholds;
  meter: number;
  sourceNotes: readonly SourceNoteRef[];
  melodyVoiceIds: readonly string[];
  melodyVoiceLabel: string;
  percussionPitches: readonly number[];
  /** Source notes per pitch (for the percussion text). */
  pitchCounts: Readonly<Record<number, number>>;
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
  context: CorrectionContext;
  /** Counter for ids of added notes and new cards. */
  seq: number;
  /** P10.1 §12: the tempo a person set in the workspace (undefined = the MIDI's). */
  tempo?: number;
}

export interface CorrectionModelInput {
  result: Pick<MidiProgressionAnalysis, "fullTimeline" | "bpm" | "timeSignature" | "totalBars">;
  sourceData: MidiSongData;
  sourceVoices: readonly Voice[];
  roleOverrides?: Readonly<Record<string, VoiceRole>>;
}

export const EPSILON = 1e-6;
export const MAX_CARD_PITCHES = 10;
export const TOO_FEW_NOTES = "2音以上にしてください";

export function noteLabel(pitch: number): string {
  return `${noteNameFromPitchClass(pitch)}${Math.floor(pitch / 12) - 1}`;
}

export function buildCorrectionModel(input: CorrectionModelInput, thresholds: ReviewThresholds): CorrectionModel {
  const { result, sourceData } = input;
  const meter = beatsPerBar(result.timeSignature);
  const tpb = sourceData.ticksPerBeat;
  const voiceByKey = new Map(input.sourceVoices.map((voice) => [voiceKey(voice.trackIndex, voice.channel), voice]));
  const roleOf = (voice: Voice | undefined): VoiceRole | undefined => voice
    ? input.roleOverrides?.[voice.id] ?? voice.inferredRole
    : undefined;

  // Source notes (GM drums on channel 10 are never analyzed, so they are left out).
  const seen = new Map<string, number>();
  const raw = sourceData.notes
    .filter((note) => note.channel !== 9)
    .map((note) => {
      const base = `${note.trackIndex}:${note.channel ?? "-"}:${note.startTick}:${note.pitch}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return {
        note,
        id: count === 1 ? base : `${base}#${count}`,
        start: note.startTick / tpb,
        end: (note.startTick + note.durationTick) / tpb,
        voice: voiceByKey.get(voiceKey(note.trackIndex, note.channel)),
      };
    });
  const percussion = percussionSuspectPitches(raw, thresholds);
  const sourceNotes: SourceNoteRef[] = raw.map((source) => {
    const hint = percussion.has(source.note.pitch) ? "percussion" : roleHintOf(roleOf(source.voice));
    return {
      id: source.id,
      pitch: source.note.pitch,
      start: source.start,
      end: source.end,
      ...(source.voice ? { voiceId: source.voice.id } : {}),
      ...(hint ? { roleHint: hint } : {}),
    };
  });
  const pitchCounts: Record<number, number> = {};
  for (const source of sourceNotes) pitchCounts[source.pitch] = (pitchCounts[source.pitch] ?? 0) + 1;
  const melodyVoices = input.sourceVoices.filter((voice) => thresholds.melody.melodyRoles.includes(roleOf(voice) ?? ""));
  const context: CorrectionContext = {
    thresholds,
    meter,
    sourceNotes,
    melodyVoiceIds: melodyVoices.map((voice) => voice.id),
    melodyVoiceLabel: melodyVoices.map((voice) => voice.trackName?.trim() || `トラック${voice.trackIndex + 1}`).join("・"),
    percussionPitches: [...percussion],
    pitchCounts,
  };

  const cards: CorrectionCard[] = result.fullTimeline.map((item, index) => ({
    id: `card-${index}`,
    start: (item.bar - 1) * meter + item.beat - 1,
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
    edited: false,
  }));

  const notes: CorrectionNote[] = cards.flatMap((card, index) => {
    const used = new Set(result.fullTimeline[index]!.voicingMemory?.sourceVoicing?.midiNotes ?? []);
    return cutFragments(card, context).map((note) => ({ ...note, used: used.has(note.pitch) }));
  });

  const totalBars = Math.max(1, result.totalBars, ...cards.map((card) => Math.ceil((card.start + card.duration) / meter - EPSILON)));
  const model = refreshModel({
    cards,
    notes,
    segments: [],
    suggestions: [],
    pitchRange: pitchRangeOf(notes),
    totalBeats: totalBars * meter,
    bpm: result.bpm,
    timeSignature: result.timeSignature,
    thresholdsVersion: `v${thresholds.schemaVersion}`,
    context,
    seq: 0,
  }, "all", false);
  return { ...model, segments: buildSegments(sourceData, result.fullTimeline, model.cards, totalBars, meter) };
}

/**
 * The source-note fragments of one card's span, all unused. Card edits pass the
 * previous fragments so a re-cut piece keeps the state of the piece it came from.
 */
export function cutFragments(card: Pick<CorrectionCard, "id" | "start" | "duration">, context: CorrectionContext): CorrectionNote[] {
  const end = card.start + card.duration;
  return context.sourceNotes
    .filter((source) => source.start < end - EPSILON && source.end > card.start + EPSILON)
    .map((source): CorrectionNote => {
      const start = Math.max(source.start, card.start);
      return {
        id: `${source.id}@${card.id}`,
        provenance: "SOURCE",
        sourceNoteId: source.id,
        cardId: card.id,
        pitch: source.pitch,
        start,
        duration: Math.min(source.end, end) - start,
        continuesFromBefore: source.start < card.start - context.thresholds.melody.continuedToleranceBeats,
        used: false,
        ...(source.roleHint ? { roleHint: source.roleHint } : {}),
        ...(source.voiceId ? { voiceId: source.voiceId } : {}),
      };
    });
}

export function notesByCard(notes: readonly CorrectionNote[]): Map<string, CorrectionNote[]> {
  const map = new Map<string, CorrectionNote[]>();
  for (const note of notes) {
    const list = map.get(note.cardId);
    if (list) list.push(note);
    else map.set(note.cardId, [note]);
  }
  return map;
}

export function usedPitchCount(notes: readonly CorrectionNote[]): number {
  return new Set(notes.filter((note) => note.used).map((note) => note.pitch)).size;
}

/**
 * P10.1 §11.2: after an edit that changed a card's notes or span. Automatic and chosen
 * names follow the notes (a chosen one turns automatic); a typed name stays and the
 * notes' reading is offered. When the notes read as no chord, the name stays, marked.
 */
function renamedFromNotes(card: CorrectionCard, here: readonly CorrectionNote[]): CorrectionCard {
  const detected = detectedName(here);
  const { nameUnreadable: _unreadable, suggestedName: _suggested, ...rest } = card;
  if (card.nameSource === "typed") {
    return detected && detected.label !== card.name.label ? { ...rest, suggestedName: detected } : rest;
  }
  return detected ? { ...rest, name: detected, nameSource: "auto" } : { ...rest, nameSource: "auto", nameUnreadable: true };
}

/**
 * Recomputes everything that depends on the notes: the song-wide suggestions, the
 * review reasons of the touched cards (and their neighbours; all cards when the
 * melody suggestion appears or goes), the too-few-notes warning, and, when asked,
 * the automatic names of the touched cards. A person's name is never replaced.
 */
export function refreshModel(model: CorrectionModel, touched: ReadonlySet<string> | "all", updateNames: boolean): CorrectionModel {
  const { context } = model;
  const byCard = notesByCard(model.notes);
  const melodyIds = new Set(context.melodyVoiceIds);
  const melodyNotes = model.notes.filter((note) => note.used && note.voiceId !== undefined && melodyIds.has(note.voiceId));
  const melodySuggestion: SongSuggestion | undefined = melodyNotes.length ? {
    kind: "melody-voice",
    voiceLabel: context.melodyVoiceLabel,
    cardCount: new Set(melodyNotes.map((note) => note.cardId)).size,
    noteIds: melodyNotes.map((note) => note.id),
  } : undefined;
  const hadMelody = model.suggestions.some((suggestion) => suggestion.kind === "melody-voice");
  const all = touched === "all" || hadMelody !== Boolean(melodySuggestion);

  const touchedSet = touched === "all" ? undefined : touched;
  const recompute = new Set<string>();
  model.cards.forEach((card, index) => {
    if (all || !touchedSet || touchedSet.has(card.id) || touchedSet.has(model.cards[index + 1]?.id ?? "")) recompute.add(card.id);
  });
  const nameTouched = touchedSet ?? new Set(model.cards.map((card) => card.id));
  const melodyRule = melodySuggestion ? "continued-top" : context.thresholds.melody.rule;

  const cards = model.cards.map((card, index) => {
    if (!recompute.has(card.id)) return card;
    const here = byCard.get(card.id) ?? [];
    const next = updateNames && nameTouched.has(card.id) ? renamedFromNotes(card, here) : card;
    const reasons = card.reviewed ? [] : reviewReasonsFor(next, here, byCard.get(model.cards[index + 1]?.id ?? "") ?? [], melodyRule, context, melodyIds);
    const warning = card.edited && usedPitchCount(here) < 2 ? TOO_FEW_NOTES : undefined;
    const { noteWarning: _dropped, ...rest } = next;
    return { ...rest, reviewReasons: reasons, ...(warning ? { noteWarning: warning } : {}) };
  });
  // Spec 6.5 (2): only once an edit has made neighbours sound the same.
  const runs = sameNotesRuns(cards, byCard);
  const edited = new Set(cards.filter((card) => card.edited).map((card) => card.id));
  const suggestions: SongSuggestion[] = [
    ...(melodySuggestion ? [melodySuggestion] : []),
    ...(runs.some((group) => group.some((id) => edited.has(id))) ? [{ kind: "same-notes-run" as const, count: runs.length, cardIds: runs.flat() }] : []),
  ];
  return { ...model, cards, suggestions };
}

/**
 * Runs of neighbouring cards whose used notes (pitch classes + lowest pitch) are
 * exactly the same (spec 7.1 Shift+M). Same name with different notes is not a run.
 */
export function sameNotesRuns(cards: readonly CorrectionCard[], byCard: ReadonlyMap<string, readonly CorrectionNote[]>): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  let shape = "";
  for (const card of cards) {
    const next = usedShape(byCard.get(card.id) ?? []);
    if (next !== "" && next === shape) run.push(card.id);
    else {
      if (run.length > 1) runs.push(run);
      run = [card.id];
    }
    shape = next;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function reviewReasonsFor(
  card: CorrectionCard,
  here: readonly CorrectionNote[],
  next: readonly CorrectionNote[],
  melodyRule: ReviewThresholds["melody"]["rule"],
  context: CorrectionContext,
  melodyVoiceIds: ReadonlySet<string>,
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const melody = melodyReason(card, here, melodyRule, context.thresholds, melodyVoiceIds);
  if (melody) reasons.push(melody);
  const drums = here.filter((note) => note.used && context.percussionPitches.includes(note.pitch));
  if (drums.length) {
    const pitch = drums[0]!.pitch;
    reasons.push({
      kind: "percussion",
      noteIds: drums.map((note) => note.id),
      text: `${noteLabel(pitch)} の短い音が拍ごとに繰り返しています（曲全体で${context.pitchCounts[pitch] ?? 0}個）。ドラムの可能性があります。`,
    });
  }
  if (next.length && sameShape(here, next)) {
    reasons.push({
      kind: "same-chord-split",
      noteIds: here.filter((note) => note.used).map((note) => note.id),
      text: "次のカードと同じ和音です。打ち直しで分かれた可能性があります。",
    });
  }
  return reasons;
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

/** Pitch classes + lowest pitch of the used notes; "" when nothing is used. */
export function usedShape(notes: readonly CorrectionNote[]): string {
  const pitches = notes.filter((note) => note.used).map((note) => note.pitch);
  return pitches.length ? `${[...new Set(pitches.map((pitch) => pitch % 12))].sort((a, b) => a - b).join(",")}/${Math.min(...pitches)}` : "";
}

function sameShape(left: readonly CorrectionNote[], right: readonly CorrectionNote[]): boolean {
  const a = usedShape(left);
  return a !== "" && a === usedShape(right);
}

function buildSegments(
  sourceData: MidiSongData,
  timeline: Parameters<typeof segmentSections>[1],
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
        return { startBar, endBar, label: barRangeLabel(startBar, endBar), source: "fallback-8bar" as const };
      });
  return withRepeatCounts(ranges.map((range, index) => ({ id: `segment-${index}`, ...range })), cards, meter);
}

/** What makes two segments "the same chords": each card's offset in the segment and its name ("" = no cards). */
export function segmentContent(range: { startBar: number; endBar: number }, cards: readonly CorrectionCard[], meter: number): string {
  const from = (range.startBar - 1) * meter;
  const to = range.endBar * meter;
  return cards.filter((card) => card.start >= from - EPSILON && card.start < to - EPSILON)
    .map((card) => `${card.start - from}:${card.name.label}`).join("|");
}

/** 「n回出てくる」: segments with the same chords at the same places (P10.2 §11 recounts after an edge moves). */
export function withRepeatCounts(segments: readonly Omit<CorrectionSegment, "repeatCount">[], cards: readonly CorrectionCard[], meter: number): CorrectionSegment[] {
  const contents = segments.map((range) => segmentContent(range, cards, meter));
  const counts = new Map<string, number>();
  for (const content of contents) if (content) counts.set(content, (counts.get(content) ?? 0) + 1);
  return segments.map((segment, index) => {
    const { repeatCount: _old, ...rest } = segment as CorrectionSegment;
    const count = counts.get(contents[index]!) ?? 1;
    return { ...rest, ...(count > 1 ? { repeatCount: count } : {}) };
  });
}

/** 「1〜8小節」, or 「9小節」 for a one-bar range (spec v2.3 4.3). */
export function barRangeLabel(startBar: number, endBar: number): string {
  return startBar === endBar ? `${startBar}小節` : `${startBar}〜${endBar}小節`;
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
