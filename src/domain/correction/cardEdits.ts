import type { ChordSymbol } from "../types";
import {
  cutFragments,
  EPSILON,
  notesByCard,
  refreshModel,
  sameNotesRuns,
  usedShape,
  type CorrectionCard,
  type CorrectionModel,
  type CorrectionNote,
  type NameSource,
} from "./correctionModel";
import type { EditKind, EditResult } from "./edits";

/**
 * Card edits of the correction workspace (spec v2.3 §7.1, §8.3, §12): merge, split,
 * boundary moves, names and 「このままでよい」. Pure, and all in the one history.
 * Re-cut note pieces keep the state (used, pitch) of the piece they came from;
 * pieces of one source note with the same state become one again.
 */

export const MIN_CARD_BEATS = 0.25;

const unchanged = (model: CorrectionModel, message?: string): EditResult => ({ model, changed: false, label: "", ...(message ? { message } : {}) });

/** `renames`: the cards' notes or spans changed, so names follow the notes (P10.1 §11.2). */
function done(model: CorrectionModel, cards: CorrectionCard[], notes: CorrectionNote[], touched: Iterable<string>, label: string, kind: EditKind, seq = model.seq, renames = false): EditResult {
  return { model: refreshModel({ ...model, cards, notes, seq }, new Set(touched), renames), changed: true, label, kind };
}

/** 「5.3」, with quarter beats as 「5.3¼」. */
export function positionLabel(beat: number, meter: number): string {
  const { bar, beat: inBar } = barBeat(beat, meter);
  const whole = Math.floor(inBar + EPSILON);
  const quarter = Math.round((inBar - whole) * 4);
  return `${bar}.${whole}${["", "¼", "½", "¾"][quarter] ?? ""}`;
}

function barBeat(start: number, meter: number): { bar: number; beat: number } {
  const bar = Math.floor(start / meter + EPSILON) + 1;
  return { bar, beat: start - (bar - 1) * meter + 1 };
}

function placed(card: CorrectionCard, start: number, end: number, meter: number): CorrectionCard {
  return { ...card, start, duration: end - start, ...barBeat(start, meter) };
}

type PieceState = Pick<CorrectionNote, "used" | "pitch" | "originalPitch">;
const sameState = (a: PieceState, b: PieceState) => a.used === b.used && a.pitch === b.pitch && a.originalPitch === b.originalPitch;

/** Source-note fragments of the new cards, cut from the old fragments of the replaced cards. */
function recut(model: CorrectionModel, oldCardIds: ReadonlySet<string>, newCards: readonly CorrectionCard[]): CorrectionNote[] {
  const old = new Map<string, CorrectionNote[]>();
  for (const note of model.notes) {
    if (note.provenance !== "SOURCE" || !oldCardIds.has(note.cardId)) continue;
    const list = old.get(note.sourceNoteId!) ?? [];
    list.push(note);
    old.set(note.sourceNoteId!, list);
  }
  return newCards.flatMap((card) => cutFragments(card, model.context).flatMap((base) => {
    const end = base.start + base.duration;
    const pieces: { start: number; end: number; state: PieceState }[] = [];
    let at = base.start;
    const from = (old.get(base.sourceNoteId!) ?? [])
      .filter((note) => note.start < end - EPSILON && note.start + note.duration > base.start + EPSILON)
      .sort((a, b) => a.start - b.start);
    const push = (start: number, stop: number, state: PieceState) => {
      if (stop - start <= EPSILON) return;
      const last = pieces[pieces.length - 1];
      if (last && Math.abs(last.end - start) < EPSILON && sameState(last.state, state)) last.end = stop;
      else pieces.push({ start, end: stop, state });
    };
    for (const note of from) {
      const start = Math.max(note.start, base.start);
      push(at, start, base); // a part no old card covered: unused, as cut
      push(start, Math.min(note.start + note.duration, end), note);
      at = Math.max(at, note.start + note.duration);
    }
    push(at, end, base);
    return pieces.map((piece, index): CorrectionNote => {
      const { originalPitch: _drop, ...rest } = base;
      return {
        ...rest,
        id: index === 0 ? base.id : `${base.id}~${index}`,
        start: piece.start,
        duration: piece.end - piece.start,
        used: piece.state.used,
        pitch: piece.state.pitch,
        ...(piece.state.originalPitch !== undefined ? { originalPitch: piece.state.originalPitch } : {}),
      };
    });
  }));
}

/** Added notes moved onto a new owner, spanning it; one per pitch. */
function manualOnto(notes: readonly CorrectionNote[], card: CorrectionCard, nextId: () => string, keepIds = true): CorrectionNote[] {
  const out: CorrectionNote[] = [];
  for (const note of notes) {
    if (out.some((entry) => entry.pitch === note.pitch)) continue;
    out.push({ ...note, id: keepIds ? note.id : nextId(), cardId: card.id, start: card.start, duration: card.duration });
  }
  return out;
}

function mergedCard(group: readonly CorrectionCard[]): CorrectionCard {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  // A typed name survives the merge (P10.1 §11.2); otherwise the notes decide (refreshModel).
  const typed = group.find((card) => card.nameSource === "typed");
  return {
    ...first,
    duration: last.start + last.duration - first.start,
    name: (typed ?? first).name,
    nameSource: typed ? "typed" : "auto",
    attacks: group.reduce((sum, card) => sum + card.attacks, 0),
    reviewed: group.every((card) => card.reviewed),
    edited: group.some((card) => card.edited),
  };
}

function mergeGroups(model: CorrectionModel, groups: readonly (readonly string[])[], label: string, kind: EditKind): EditResult {
  const replaced = new Set(groups.flat());
  const firstOf = new Map(groups.map((group) => [group[0]!, group]));
  const byId = new Map(model.cards.map((card) => [card.id, card]));
  const merged: CorrectionCard[] = [];
  const cards = model.cards.flatMap((card) => {
    const group = firstOf.get(card.id);
    if (group) {
      const next = mergedCard(group.map((id) => byId.get(id)!));
      merged.push(next);
      return [next];
    }
    return replaced.has(card.id) ? [] : [card];
  });
  const manual = notesByCard(model.notes.filter((note) => note.provenance === "MANUAL_ADDED" && replaced.has(note.cardId)));
  const notes = [
    ...model.notes.filter((note) => !replaced.has(note.cardId)),
    ...recut(model, replaced, merged),
    ...merged.flatMap((card) => manualOnto(firstOf.get(card.id)!.flatMap((id) => manual.get(id) ?? []), card, () => "")),
  ];
  return done(model, cards, notes, merged.map((card) => card.id), label, kind, model.seq, true);
}

/** M / 「つなぐ」: this card and the next become one; attacks add up (×n). */
export function mergeWithNext(model: CorrectionModel, cardId: string): EditResult {
  const index = model.cards.findIndex((card) => card.id === cardId);
  const next = model.cards[index + 1];
  if (index < 0 || !next) return unchanged(model);
  const card = model.cards[index]!;
  return mergeGroups(model, [[card.id, next.id]], `${positionLabel(card.start, model.context.meter)} と次をつないだ`, "merge");
}

/** Groups Shift+M would merge: neighbours with exactly the same used notes. */
export function sameNotesGroups(model: CorrectionModel): string[][] {
  return sameNotesRuns(model.cards, notesByCard(model.notes));
}

/** Shift+M after the confirmation: every run at once, one history entry. */
export function mergeSameNotes(model: CorrectionModel): EditResult {
  const groups = sameNotesGroups(model);
  if (!groups.length) return unchanged(model, "同じ音が続く所はありません");
  return mergeGroups(model, groups, `同じ音が続く${groups.length}か所をつないだ`, "merge-all");
}

/** S: halves on a beat; not when either half would be one beat or less. */
export function splitCard(model: CorrectionModel, cardId: string): EditResult {
  const index = model.cards.findIndex((card) => card.id === cardId);
  const card = model.cards[index];
  if (!card) return unchanged(model);
  const end = card.start + card.duration;
  const mid = Math.round(card.start + card.duration / 2);
  if (mid - card.start <= 1 + EPSILON || end - mid <= 1 + EPSILON) return unchanged(model, "1拍以下になるので分けません");
  const { meter } = model.context;
  let seq = model.seq + 1;
  const first = { ...placed(card, card.start, mid, meter), attacks: Math.ceil(card.attacks / 2) };
  const second = { ...placed(card, mid, end, meter), id: `card-n${seq}`, attacks: Math.max(1, Math.floor(card.attacks / 2)) };
  const manual = model.notes.filter((note) => note.provenance === "MANUAL_ADDED" && note.cardId === card.id);
  const notes = [
    ...model.notes.filter((note) => note.cardId !== card.id),
    ...recut(model, new Set([card.id]), [first, second]),
    ...manualOnto(manual, first, () => ""),
    ...manualOnto(manual, second, () => `manual-${(seq += 1)}`, false),
  ];
  const cards = [...model.cards.slice(0, index), first, second, ...model.cards.slice(index + 1)];
  return done(model, cards, notes, [first.id, second.id], `${positionLabel(card.start, meter)} を分けた`, "split", seq, true);
}

/**
 * The handle between a card and the next one, moved to `beat` (the caller snaps to 1
 * or ¼ beat). Neither card may become shorter than ¼ beat.
 */
export function moveBoundary(model: CorrectionModel, leftCardId: string, beat: number): EditResult {
  const index = model.cards.findIndex((card) => card.id === leftCardId);
  const left = model.cards[index];
  const right = model.cards[index + 1];
  if (!left || !right) return unchanged(model);
  const end = right.start + right.duration;
  if (Math.abs(beat - right.start) < EPSILON || beat - left.start < MIN_CARD_BEATS - EPSILON || end - beat < MIN_CARD_BEATS - EPSILON) return unchanged(model);
  const { meter } = model.context;
  const nextLeft = placed(left, left.start, beat, meter);
  const nextRight = placed(right, beat, end, meter);
  const ids = new Set([left.id, right.id]);
  const manual = notesByCard(model.notes.filter((note) => note.provenance === "MANUAL_ADDED" && ids.has(note.cardId)));
  const notes = [
    ...model.notes.filter((note) => !ids.has(note.cardId)),
    ...recut(model, ids, [nextLeft, nextRight]),
    ...manualOnto(manual.get(left.id) ?? [], nextLeft, () => ""),
    ...manualOnto(manual.get(right.id) ?? [], nextRight, () => ""),
  ];
  const cards = model.cards.map((card) => card.id === left.id ? nextLeft : card.id === right.id ? nextRight : card);
  return done(model, cards, notes, ids, `境目を ${positionLabel(beat, meter)} へ`, "boundary", model.seq, true);
}

/**
 * Candidates and 1–4 (`chosen`), F2 typing (`typed`), back to the analysis (`auto`): the name
 * only; the notes stay. P10.1 §11.2: a chosen name follows later note edits, a typed one stays.
 */
export function chooseName(model: CorrectionModel, cardIds: string | readonly string[], name: ChordSymbol, source: NameSource = "chosen"): EditResult {
  const ids = new Set(typeof cardIds === "string" ? [cardIds] : cardIds);
  const hit = model.cards.filter((card) => ids.has(card.id) && (card.name.label !== name.label || card.nameSource !== source));
  if (!hit.length) return unchanged(model);
  const cards = model.cards.map((card) => {
    if (!hit.includes(card)) return card;
    const { nameUnreadable: _unreadable, suggestedName: _suggested, ...rest } = card;
    return { ...rest, name, nameSource: source };
  });
  const label = hit.length === 1 ? `名前を ${name.label} に` : `${hit.length}か所の名前を ${name.label} に`;
  return done(model, cards, model.notes, hit.map((card) => card.id), label, "name");
}

/**
 * Spec §12 「同じ直しを他にも反映」: other cards that play the same notes (pitch
 * classes + lowest pitch) and still have the name this card had before.
 */
export function sameFixTargets(model: CorrectionModel, cardId: string, previousLabel: string): string[] {
  const byCard = notesByCard(model.notes);
  const shape = usedShape(byCard.get(cardId) ?? []);
  if (!shape) return [];
  return model.cards
    .filter((card) => card.id !== cardId && card.name.label === previousLabel && usedShape(byCard.get(card.id) ?? []) === shape)
    .map((card) => card.id);
}

/** Y: no review marks on this card for the rest of this import. */
export function markReviewed(model: CorrectionModel, cardId: string): EditResult {
  const card = model.cards.find((entry) => entry.id === cardId);
  if (!card || card.reviewed) return unchanged(model);
  const cards = model.cards.map((entry) => entry === card ? { ...entry, reviewed: true } : entry);
  return done(model, cards, model.notes, [cardId], `${positionLabel(card.start, model.context.meter)} をこのままでよいに`, "reviewed");
}
