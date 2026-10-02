import {
  MAX_CARD_PITCHES,
  noteLabel,
  notesByCard,
  refreshModel,
  usedPitchCount,
  type CorrectionModel,
  type CorrectionNote,
} from "./correctionModel";

/**
 * Note edits of the correction workspace (spec v2.3 §7.2, §8.3). Pure: each takes
 * a model and returns a new one plus a short label for the history ("G4 を足した").
 * The source MIDI is never touched; an added note is MANUAL_ADDED, and a source
 * note whose pitch moves keeps its first pitch in originalPitch.
 */

/** What kind of operation an edit was, for the local metrics (spec v2.5 §13). */
export type EditKind = "exclude" | "restore" | "add" | "delete" | "pitch" | "merge" | "merge-all" | "split" | "boundary" | "name" | "reviewed" | "tempo" | "segment";

export interface EditResult {
  model: CorrectionModel;
  changed: boolean;
  kind?: EditKind;
  /** For the history and the status line: 「D5 を外した」「3音を外した」. */
  label: string;
  /** A notice for the person (the 10-note limit, …). */
  message?: string;
}

export const TEN_NOTE_LIMIT = "このカードで鳴らせるのは10音までです";

export const unchanged = (model: CorrectionModel, message?: string): EditResult => ({ model, changed: false, label: "", ...(message ? { message } : {}) });

function finish(model: CorrectionModel, notes: CorrectionNote[], touched: ReadonlySet<string>, label: string, extra: Partial<Pick<CorrectionModel, "seq">> = {}, message?: string): EditResult {
  const cards = model.cards.map((card) => touched.has(card.id) && !card.edited ? { ...card, edited: true } : card);
  return {
    model: refreshModel({ ...model, ...extra, cards, notes }, touched, true),
    changed: true,
    label,
    ...(message ? { message } : {}),
  };
}

function describe(notes: readonly CorrectionNote[], verb: string): string {
  const pitches = [...new Set(notes.map((note) => note.pitch))];
  return pitches.length === 1 ? `${noteLabel(pitches[0]!)} を${verb}` : `${notes.length}音を${verb}`;
}

/** Right click / Delete: a source note stops being used, an added note is removed. */
export function deleteNotes(model: CorrectionModel, ids: Iterable<string>): EditResult {
  const wanted = new Set(ids);
  const hit = model.notes.filter((note) => wanted.has(note.id) && (note.provenance === "MANUAL_ADDED" || note.used));
  if (!hit.length) return unchanged(model);
  const touched = new Set(hit.map((note) => note.cardId));
  const notes = model.notes
    .filter((note) => !(wanted.has(note.id) && note.provenance === "MANUAL_ADDED"))
    .map((note) => wanted.has(note.id) && note.used ? { ...note, used: false } : note);
  const added = hit.filter((note) => note.provenance === "MANUAL_ADDED");
  const label = added.length === hit.length ? describe(hit, "消した") : describe(hit, "外した");
  return { ...finish(model, notes, touched, label), kind: added.length === hit.length ? "delete" : "exclude" };
}

/**
 * Left click on an unused note / R: use it again. A card that would play more than
 * ten pitches is skipped; the message says so (and how many cards, for a bulk restore).
 */
export function restoreNotes(model: CorrectionModel, ids: Iterable<string>): EditResult {
  const wanted = new Set(ids);
  const candidates = model.notes.filter((note) => wanted.has(note.id) && !note.used);
  if (!candidates.length) return unchanged(model);
  const byCard = notesByCard(model.notes);
  const allowed = new Set<string>();
  const skippedCards = new Set<string>();
  for (const [cardId, notes] of byCard) {
    const mine = candidates.filter((note) => note.cardId === cardId);
    if (!mine.length) continue;
    const after = new Set([...notes.filter((note) => note.used).map((note) => note.pitch), ...mine.map((note) => note.pitch)]);
    if (after.size > MAX_CARD_PITCHES) skippedCards.add(cardId);
    else for (const note of mine) allowed.add(note.id);
  }
  const message = skippedCards.size === 0 ? undefined
    : skippedCards.size === 1 && allowed.size === 0 ? TEN_NOTE_LIMIT
      : `${skippedCards.size}枚のカードは10音を超えるので戻していません（${TEN_NOTE_LIMIT}）`;
  if (!allowed.size) return unchanged(model, message);
  const notes = model.notes.map((note) => allowed.has(note.id) ? { ...note, used: true } : note);
  const restored = candidates.filter((note) => allowed.has(note.id));
  return { ...finish(model, notes, new Set(restored.map((note) => note.cardId)), describe(restored, "戻した"), {}, message), kind: "restore" };
}

/** A note the source MIDI does not have, across the whole card. Not added when the card already uses the pitch. */
export function addNote(model: CorrectionModel, cardId: string, pitch: number): EditResult {
  const card = model.cards.find((entry) => entry.id === cardId);
  if (!card || pitch < 0 || pitch > 127) return unchanged(model);
  const mine = model.notes.filter((note) => note.cardId === cardId);
  if (mine.some((note) => note.used && note.pitch === pitch)) return unchanged(model, `${noteLabel(pitch)} はもう使っています`);
  if (usedPitchCount(mine) >= MAX_CARD_PITCHES) return unchanged(model, TEN_NOTE_LIMIT);
  const seq = model.seq + 1;
  const note: CorrectionNote = {
    id: `manual-${seq}`,
    provenance: "MANUAL_ADDED",
    sourceNoteId: null,
    cardId,
    pitch,
    start: card.start,
    duration: card.duration,
    continuesFromBefore: false,
    used: true,
  };
  return { ...finish(model, [...model.notes, note], new Set([cardId]), `${noteLabel(pitch)} を足した`, { seq }), kind: "add" };
}

/**
 * Up/down drag, ↑↓ (1) and Ctrl+↑↓ (12). A source note keeps its first pitch in
 * originalPitch, dropped again when it returns there. Nothing moves when any note would leave 0–127.
 */
export function movePitch(model: CorrectionModel, ids: Iterable<string>, semitones: number): EditResult {
  const wanted = new Set(ids);
  const hit = model.notes.filter((note) => wanted.has(note.id));
  if (!hit.length || semitones === 0 || hit.some((note) => note.pitch + semitones < 0 || note.pitch + semitones > 127)) return unchanged(model);
  const notes = model.notes.map((note) => {
    if (!wanted.has(note.id)) return note;
    const pitch = note.pitch + semitones;
    if (note.provenance === "MANUAL_ADDED") return { ...note, pitch };
    const original = note.originalPitch ?? note.pitch;
    const { originalPitch: _old, ...rest } = note;
    return pitch === original ? { ...rest, pitch } : { ...rest, pitch, originalPitch: original };
  });
  const label = hit.length === 1
    ? `${noteLabel(hit[0]!.pitch)} → ${noteLabel(hit[0]!.pitch + semitones)}`
    : `${hit.length}音の高さを直した`;
  return { ...finish(model, notes, new Set(hit.map((note) => note.cardId)), label), kind: "pitch" };
}

// ---- selections (they select; a person decides what to do with them) -------------------

/** Short notes of the same pitch across the song (the percussion helper); long notes never. */
export function sameShortPitchIds(model: CorrectionModel, noteId: string): string[] {
  const note = model.notes.find((entry) => entry.id === noteId);
  const limit = model.context.thresholds.percussion.shortMaxBeats + 1e-6;
  if (!note || note.duration > limit) return [];
  return model.notes.filter((entry) => entry.pitch === note.pitch && entry.duration <= limit).map((entry) => entry.id);
}

/** Used notes above the melody line, across the song. */
export function aboveLineIds(model: CorrectionModel, linePitch: number): string[] {
  return model.notes.filter((note) => note.used && note.pitch > linePitch).map((note) => note.id);
}

export function pitchIds(model: CorrectionModel, pitch: number): string[] {
  return model.notes.filter((note) => note.pitch === pitch).map((note) => note.id);
}

export function cardNoteIds(model: CorrectionModel, cardId: string): string[] {
  return model.notes.filter((note) => note.cardId === cardId).map((note) => note.id);
}

/** Chord-register octave for 「＋ 音を足す」: G3 (55) to F#4 (66). */
export function chordRegisterPitch(pitchClass: number): number {
  return 55 + ((pitchClass - 7 + 12) % 12);
}

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 240;
/** What the player uses when a song has no tempo (previewChordTimeline's default). */
export const PLAYER_DEFAULT_BPM = 96;

/** The tempo the workspace plays and saves at (P10.1 §12). */
export function effectiveTempo(model: Pick<CorrectionModel, "tempo" | "bpm">): number {
  return model.tempo ?? (model.bpm ? Math.round(model.bpm) : PLAYER_DEFAULT_BPM);
}

/** P10.1 §12.3: a whole-number tempo, 40–240, as one undoable edit (「テンポを 120 → 100」). */
export function setTempo(model: CorrectionModel, bpm: number): EditResult {
  const before = effectiveTempo(model);
  if (!Number.isInteger(bpm) || bpm < TEMPO_MIN || bpm > TEMPO_MAX || bpm === before) return unchanged(model);
  const sourceBpm = model.bpm ? Math.round(model.bpm) : undefined;
  const { tempo: _old, ...rest } = model;
  return {
    model: bpm === sourceBpm ? rest : { ...rest, tempo: bpm },
    changed: true,
    label: `テンポを ${before} → ${bpm}`,
    kind: "tempo",
  };
}
