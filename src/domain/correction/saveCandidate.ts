import { parseChordLabel } from "../chords";
import { summaryFromEvents } from "../midi/candidateBlock";
import { createCandidateFromTimelineRange, timelineRangeIssues } from "../midi/manualRange";
import { occurrenceToCandidate } from "../midi/occurrence";
import { createEditableProgression } from "../progressionEditing/editableProgression";
import type { EditableProgression } from "../progressionEditing/types";
import type { ChordSymbol, ChordTimelineItem, ChordVoicingMemory, ProgressionBlockCandidate, VoicingSnapshot } from "../types";
import { MAX_VOICING_NOTES, normalizedChordKey, normalizeMidiNotes, resolveTimelineItemVoicing, VOICING_EXTRACTOR_VERSION } from "../voicing";
import { EPSILON, notesByCard, type CorrectionCard, type CorrectionModel, type CorrectionNote } from "./correctionModel";

/**
 * What the workspace saves (spec v2.4 §10.2), as the candidate the existing save
 * path takes. Vault v2 only: ChordTimelineItem, voicingMemory.sourceVoicing,
 * practiceVoicingOverride and playbackChoice. Pure; inputs are never changed.
 *
 * | card                                   | written                                                    |
 * | span and notes as analysed             | the analysis item and voicingMemory as they were           |
 * | notes as source, span changed          | sourceVoicing from the used notes (SOURCE)                 |
 * | only excluded notes (edited)           | sourceVoicing from the used notes (SOURCE), no override    |
 * | added or moved notes (edited)          | sourceVoicing = used source notes at their first pitch,    |
 * |                                        | practiceVoicingOverride = the notes now (CUSTOM, p10 mark) |
 *
 * Every snapshot is re-labelled for the name being saved (capturedForChordKey/Label).
 */

/** The mark Phase 11 reads to tell corrected voicings from extracted ones. */
export const CORRECTION_EXTRACTOR_VERSION = "p10-correction:v1";

export interface SaveRange {
  /** 1-based, inclusive whole bars. */
  startBar: number;
  endBar: number;
}

export interface SaveProblem {
  cardId: string;
  text: string;
}

export type SaveCandidateResult =
  | { ok: true; candidate: ProgressionBlockCandidate; original: ProgressionBlockCandidate; editable: EditableProgression; userEdited: boolean; cardIds: string[]; /** P10.1 §12.4: the tempo a person set. */ bpm?: number }
  | { ok: false; problems: SaveProblem[] };

type CardItem = { item: ChordTimelineItem; problem?: undefined } | { item?: undefined; problem: string };

const usedPitches = (notes: readonly CorrectionNote[]) => normalizeMidiNotes(notes.filter((note) => note.used).map((note) => note.pitch));

function snapshot(notes: readonly number[], chord: ChordSymbol, fields: Pick<VoicingSnapshot, "source" | "extractorVersion">): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: fields.source,
    representation: "simultaneous-voicing",
    midiNotes: [...notes],
    bassNote: notes[0]!,
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
    userVerified: true,
    ...(fields.extractorVersion ? { extractorVersion: fields.extractorVersion } : {}),
  };
}

function relabel(memory: ChordVoicingMemory | undefined, chord: ChordSymbol): ChordVoicingMemory | undefined {
  if (!memory) return undefined;
  const mark = (entry: VoicingSnapshot | undefined) => entry && { ...entry, capturedForChordKey: normalizedChordKey(chord), capturedForChordLabel: chord.label };
  const sourceVoicing = mark(memory.sourceVoicing);
  const practiceVoicingOverride = mark(memory.practiceVoicingOverride);
  return {
    ...memory,
    ...(sourceVoicing ? { sourceVoicing } : {}),
    ...(practiceVoicingOverride ? { practiceVoicingOverride } : {}),
  };
}

/** 「3小節の C」 */
export function cardPlace(card: Pick<CorrectionCard, "bar" | "name">): string {
  return `${card.bar}小節の ${card.name.label}`;
}

/**
 * The timeline item one card saves as. The workspace's 「B カードの音」 plays this
 * same item through resolveTimelineItemVoicing, so audition and saved playback agree.
 */
export function cardTimelineItem(model: CorrectionModel, card: CorrectionCard, timeline: readonly ChordTimelineItem[], notes?: readonly CorrectionNote[]): CardItem {
  const base = timeline[card.timelineIndex];
  if (!base) return { problem: `元の解析が見つかりません：${cardPlace(card)}` };
  const parsed = parseChordLabel(card.name.label);
  if (!parsed) return { problem: `読めない名前があります：${cardPlace(card)}` };
  const chord = parsed.label === base.chord.label ? base.chord : card.name.label === parsed.label ? card.name : parsed;
  const mine = notes ?? model.notes.filter((note) => note.cardId === card.id);
  const meter = model.context.meter;
  const baseStart = (base.bar - 1) * meter + base.beat - 1;
  const sameSpan = Math.abs(baseStart - card.start) < EPSILON && Math.abs(base.durationBeats - card.duration) < EPSILON;
  const { voicingMemory: baseMemory, ...rest } = base;
  const item = (memory: ChordVoicingMemory | undefined): ChordTimelineItem => ({
    ...rest,
    bar: card.bar,
    beat: card.beat,
    durationBeats: card.duration,
    chord,
    ...(memory ? { voicingMemory: memory } : {}),
  });

  if (!card.edited && sameSpan) return { item: item(relabel(baseMemory, chord)) };

  const now = usedPitches(mine);
  if (now.length > MAX_VOICING_NOTES) return { problem: `10音までにしてください：${cardPlace(card)}` };
  const extractorVersion = baseMemory?.sourceVoicing?.extractorVersion ?? VOICING_EXTRACTOR_VERSION;
  const changedNotes = mine.some((note) => note.used && (note.provenance === "MANUAL_ADDED" || note.originalPitch !== undefined));
  if (card.edited && now.length < 2) return { problem: `2音以上にしてください：${cardPlace(card)}` };
  // P10.0-07: never let the store re-extract a re-spanned card; what was heard (B) is what is saved.
  if (!card.edited && now.length < 2) return { problem: `区間を変えたので、このカードの音が2音未満です：${cardPlace(card)}` };

  if (!changedNotes) {
    return { item: item({ sourceVoicing: snapshot(now, chord, { source: "midi-extracted", extractorVersion }), playbackChoice: "SOURCE" }) };
  }
  const source = normalizeMidiNotes(mine.filter((note) => note.used && note.provenance === "SOURCE").map((note) => note.originalPitch ?? note.pitch));
  return {
    item: item({
      ...(source.length >= 2 ? { sourceVoicing: snapshot(source, chord, { source: "midi-extracted", extractorVersion }) } : {}),
      practiceVoicingOverride: snapshot(now, chord, { source: "manual", extractorVersion: CORRECTION_EXTRACTOR_VERSION }),
      playbackChoice: "CUSTOM",
    }),
  };
}

/** 「B カードの音」: the saved item through the same resolver the progression page uses. */
export function cardAuditionNotes(model: CorrectionModel, card: CorrectionCard, timeline: readonly ChordTimelineItem[]): number[] {
  const result = cardTimelineItem(model, card, timeline);
  return result.item ? resolveTimelineItemVoicing(result.item).midiNotes : usedPitches(model.notes.filter((note) => note.cardId === card.id));
}

/** Cards that overlap the range, in order. */
export function cardsInRange(model: CorrectionModel, range: SaveRange): CorrectionCard[] {
  const from = (range.startBar - 1) * model.context.meter;
  const to = range.endBar * model.context.meter;
  return model.cards.filter((card) => card.start < to - EPSILON && card.start + card.duration > from + EPSILON);
}

/**
 * The candidate for a bar range, plus the analysis-named twin the correction
 * records compare against (same spans, analysis names), one slot per card.
 */
export function buildSaveCandidate(model: CorrectionModel, range: SaveRange, timeline: readonly ChordTimelineItem[]): SaveCandidateResult {
  const cards = cardsInRange(model, range);
  if (!cards.length) return { ok: false, problems: [{ cardId: "", text: "範囲にカードがありません" }] };
  const byCard = notesByCard(model.notes);
  const problems: SaveProblem[] = [];
  const items: ChordTimelineItem[] = [];
  const originals: ChordTimelineItem[] = [];
  for (const card of cards) {
    const result = cardTimelineItem(model, card, timeline, byCard.get(card.id) ?? []);
    if (result.problem !== undefined) { problems.push({ cardId: card.id, text: result.problem }); continue; }
    items.push(result.item);
    const { voicingMemory: _drop, ...analysed } = timeline[card.timelineIndex]!;
    originals.push({ ...analysed, bar: card.bar, beat: card.beat, durationBeats: card.duration });
  }
  if (problems.length) return { ok: false, problems };

  const meter = model.context.meter;
  const bounds = { startBar: range.startBar, startBeat: 1, endBar: range.endBar, endBeat: meter, beatsPerBar: meter };
  if (timelineRangeIssues({ ...bounds, timeline: items }).length) return { ok: false, problems: [{ cardId: cards[0]!.id, text: "この範囲は保存できません" }] };
  const toCandidate = (timelineItems: ChordTimelineItem[]) => {
    const occurrence = createCandidateFromTimelineRange({ ...bounds, timeline: timelineItems });
    return occurrenceToCandidate(
      occurrence,
      summaryFromEvents(occurrence.events, occurrence.lengthBars, meter),
      [...new Set(occurrence.events.map((event) => event.chord.label))],
    );
  };
  const candidate = toCandidate(items);
  const original = toCandidate(originals);

  // One slot per saved chord: a person's name counts as a correction, an automatic one does not.
  const editable = createEditableProgression(original, meter);
  editable.slots = editable.slots.map((slot, index) => {
    const card = cards.find((entry) => entry.bar === slot.position.bar && Math.abs(entry.beat - slot.position.beat) < EPSILON) ?? cards[index]!;
    const saved = candidate.chords[index]?.chord ?? slot.currentChord;
    if (card.nameSource === "auto" || saved.label === slot.originalChord.label) return { ...slot, currentChord: saved };
    const fromAlternatives = slot.alternatives.some((alternative) => alternative.chord.label === saved.label);
    return { ...slot, currentChord: saved, edited: true, editSource: fromAlternatives ? "alternative" : "manual-label" };
  });
  const userEdited = model.tempo !== undefined || cards.some((card) => card.edited || card.nameSource !== "auto" || card.attacks > 1)
    || cards.some((card) => {
      const base = timeline[card.timelineIndex]!;
      return Math.abs((base.bar - 1) * meter + base.beat - 1 - card.start) > EPSILON || Math.abs(base.durationBeats - card.duration) > EPSILON;
    });
  return { ok: true, candidate, original, editable, userEdited, cardIds: cards.map((card) => card.id), ...(model.tempo !== undefined ? { bpm: model.tempo } : {}) };
}
