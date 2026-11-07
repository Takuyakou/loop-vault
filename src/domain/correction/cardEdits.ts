import type { ChordSymbol } from "../types";
import {
  barRangeLabel,
  cutFragments,
  EPSILON,
  notesByCard,
  refreshModel,
  removedBarsOf,
  sameNotesRuns,
  usedShape,
  type CorrectionCard,
  type CorrectionModel,
  type CorrectionNote,
  type NameSource,
} from "./correctionModel";
import { normalizeRemoved, screenToSource, shiftSegments } from "./barMap";
import type { EditKind, EditResult } from "./edits";

/**
 * Card edits of the correction workspace (spec v2.3 §7.1, §8.3, §12): merge, split,
 * boundary moves, names and 「このままでよい」. Pure, and all in the one history.
 * Re-cut note pieces keep the state (used, pitch) of the piece they came from;
 * pieces of one source note with the same state become one again.
 */

export const MIN_CARD_BEATS = 0.25;

const unchanged = (model: CorrectionModel, message?: string): EditResult => ({ model, changed: false, label: "", ...(message ? { message } : {}) });

/**
 * `renames`: `true` when the cards' notes changed, so names follow the notes (P10.1 §11.2);
 * `"suggest"` when only their spans changed (boundary, merge, split): the names stay and the
 * reading of the notes is offered as a suggestion (P5.26.1).
 */
function done(model: CorrectionModel, cards: CorrectionCard[], notes: CorrectionNote[], touched: Iterable<string>, label: string, kind: EditKind, seq = model.seq, renames: boolean | "suggest" = false): EditResult {
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
  if (model.context.savedProgression) return newCards.flatMap(card => {
    const owner = model.cards.find(c => c.id === card.id) ?? model.cards.find(c => c.timelineIndex === card.timelineIndex);
    return model.notes.filter(n => n.provenance === "SOURCE" && n.cardId === owner?.id).map(n => ({ ...n, id: `${n.sourceNoteId}@${card.id}`, cardId: card.id, start: card.start, duration: card.duration }));
  });
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
    nameSource: typed ? "typed" : first.nameSource,
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
  return done(model, cards, notes, merged.map((card) => card.id), label, kind, model.seq, "suggest");
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
  if (model.context.savedProgression ? (mid - card.start < 1 - EPSILON || end - mid < 1 - EPSILON) : (mid - card.start <= 1 + EPSILON || end - mid <= 1 + EPSILON)) return unchanged(model, "1拍以下になるので分けません");
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
  return done(model, cards, notes, [first.id, second.id], `${positionLabel(card.start, meter)} を分けた`, "split", seq, "suggest");
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
  const minimum = model.context.savedProgression ? 1 : MIN_CARD_BEATS;
  if (Math.abs(beat - right.start) < EPSILON || beat - left.start < minimum - EPSILON || end - beat < minimum - EPSILON) return unchanged(model);
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
  return done(model, cards, notes, ids, `境目を ${positionLabel(beat, meter)} へ`, "boundary", model.seq, "suggest");
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

export type DeleteCardMode = "extend-previous" | "extend-next";

/**
 * P17-01 §1: delete one card in the MIDI capture. The remaining card (previous or next;
 * the first/last card falls back to the other side) takes the deleted card's span. The
 * deleted card's source notes stay on the remaining card as unused notes (a pitch fixed
 * by a person keeps that pitch); its added notes go; the remaining card's name and
 * attacks stay, and a changed reading is only offered (`suggest`, P5.26.1). The
 * progression page keeps its own four-mode delete (progressionWorkspace.ts).
 */
export function deleteCard(model: CorrectionModel, cardId: string, mode: DeleteCardMode): EditResult {
  const index = model.cards.findIndex((card) => card.id === cardId);
  const card = model.cards[index];
  if (!card) return unchanged(model);
  if (model.cards.length <= 1) return unchanged(model, "最後の1枚は消せません");
  let keepIndex = mode === "extend-previous" ? index - 1 : index + 1;
  if (keepIndex < 0) keepIndex = index + 1;
  if (keepIndex >= model.cards.length) keepIndex = index - 1;
  const keep = model.cards[keepIndex]!;
  const nextKeep = placed(keep, Math.min(card.start, keep.start), Math.max(card.start + card.duration, keep.start + keep.duration), model.context.meter);
  const deletedStart = card.start;
  const deletedEnd = card.start + card.duration;
  const replaced = new Set([card.id, keep.id]);
  const keepManual = model.notes.filter((note) => note.provenance === "MANUAL_ADDED" && note.cardId === keep.id);
  const source: CorrectionNote[] = [];
  for (const note of recut(model, replaced, [nextKeep])) {
    const start = note.start;
    const end = note.start + note.duration;
    const cuts = [start, end];
    if (deletedStart > start + EPSILON && deletedStart < end - EPSILON) cuts.push(deletedStart);
    if (deletedEnd > start + EPSILON && deletedEnd < end - EPSILON) cuts.push(deletedEnd);
    cuts.sort((a, b) => a - b);
    for (let part = 0; part < cuts.length - 1; part += 1) {
      const from = cuts[part]!;
      const to = cuts[part + 1]!;
      if (to - from <= EPSILON) continue;
      const insideDeleted = from >= deletedStart - EPSILON && to <= deletedEnd + EPSILON;
      source.push({ ...note, id: part === 0 ? note.id : `${note.id}~d${part}`, start: from, duration: to - from, ...(insideDeleted ? { used: false } : {}) });
    }
  }
  const cards = model.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.id === keep.id ? nextKeep : entry);
  const notes = [
    ...model.notes.filter((note) => !replaced.has(note.cardId)),
    ...source,
    ...manualOnto(keepManual, nextKeep, () => ""),
  ];
  const position = positionLabel(card.start, model.context.meter);
  const result = done(model, cards, notes, [keep.id], `${position} のカードを消した`, "delete", model.seq, "suggest");
  return { ...result, message: `${position} のカードを消しました(音は使っていない音として残しています。Ctrl+Z で戻せます)` };
}

/**
 * P17-02: 「小節を消して詰める」 — remove whole bars and close the gap (MIDI capture
 * only; the progression page keeps its own four-mode card delete). Cards before the
 * cut stay; cards after it move left; a card that overlaps the cut keeps the parts
 * outside it, and a card shorter than ¼ beat is absorbed by its neighbour. The
 * source notes and the analysis never change: `context.removedBars` records the
 * source spans, and the cuts compose (each new span is mapped to the source time
 * before it is added). The last bar cannot be removed.
 */
export function cutBars(model: CorrectionModel, startBar: number, endBar: number = startBar): EditResult {
  const meter = model.context.meter;
  const totalBars = Math.max(1, Math.round(model.totalBeats / meter));
  if (!Number.isInteger(startBar) || !Number.isInteger(endBar) || startBar < 1 || endBar < startBar || endBar > totalBars) {
    return unchanged(model, "その小節はありません");
  }
  if (endBar >= totalBars) return unchanged(model, "最後の1小節は消せません");
  const from = (startBar - 1) * meter;
  const to = endBar * meter;
  const length = to - from;
  const oldById = new Map(model.cards.map((card) => [card.id, card]));
  let entries: { card: CorrectionCard; owners: string[] }[] = [];
  for (const card of model.cards) {
    const start = card.start;
    const end = start + card.duration;
    if (end <= from + EPSILON) {
      entries.push({ card, owners: [card.id] });
      continue;
    }
    if (start >= to - EPSILON) {
      entries.push({ card: placed(card, start - length, end - length, meter), owners: [card.id] });
      continue;
    }
    // Overlaps the cut: keep the left and/or right part; the gap closes between them.
    const nextStart = start < from - EPSILON ? start : from;
    const nextEnd = end > to + EPSILON ? end - length : from;
    if (nextEnd - nextStart <= EPSILON) continue;
    entries.push({ card: placed(card, nextStart, nextEnd, meter), owners: [card.id] });
  }

  // A piece shorter than ¼ beat is absorbed by the neighbour on its left (or right).
  for (let guard = 0; guard < 4; guard += 1) {
    const at = entries.findIndex((entry) => entry.card.duration < MIN_CARD_BEATS - EPSILON);
    if (at < 0) break;
    const sliver = entries[at]!;
    const left = at > 0 ? entries[at - 1] : undefined;
    const right = at + 1 < entries.length ? entries[at + 1] : undefined;
    const target = left ?? right;
    if (!target) break;
    const merged = placed(
      target.card,
      Math.min(target.card.start, sliver.card.start),
      Math.max(target.card.start + target.card.duration, sliver.card.start + sliver.card.duration),
      meter,
    );
    const entry = { card: merged, owners: [...target.owners, ...sliver.owners] };
    const atTarget = left ? at - 1 : at + 1;
    entries = entries.filter((_, index) => index !== at && index !== atTarget);
    entries.splice(Math.min(at, atTarget), 0, entry);
  }

  const cards = entries.map((entry) => entry.card);
  const replaced = new Set(entries.flatMap((entry) => entry.owners));
  for (const entry of entries) {
    const before = oldById.get(entry.card.id);
    if (before && Math.abs(before.start - entry.card.start) < EPSILON && Math.abs(before.duration - entry.card.duration) < EPSILON) {
      for (const id of entry.owners) replaced.delete(id);
    }
  }
  for (const card of model.cards) {
    if (!entries.some((entry) => entry.owners.includes(card.id))) replaced.add(card.id);
  }

  const oldRemoved = removedBarsOf(model);
  const nextRemoved = normalizeRemoved([...oldRemoved, ...screenToSource(from, to, oldRemoved)]);
  const nextContext = { ...model.context, removedBars: nextRemoved };
  // Old fragments moved onto the new screen time, so re-cutting keeps each piece's state.
  const shifted = shiftSourceNotesForCut(model.notes, from, to, length);
  const recutModel: CorrectionModel = { ...model, notes: shifted, context: nextContext };
  const recutNotes = recut(recutModel, replaced, cards.filter((card) => replaced.has(card.id)));
  const keptNotes = model.notes.filter((note) => note.provenance === "SOURCE" && !replaced.has(note.cardId));
  const manualByCard = notesByCard(model.notes.filter((note) => note.provenance === "MANUAL_ADDED"));
  const manual = entries.flatMap((entry) => manualOnto(
    entry.owners.flatMap((id) => manualByCard.get(id) ?? []),
    entry.card,
    () => "",
  ));

  const next = refreshModel({
    ...model,
    cards,
    notes: [...keptNotes, ...recutNotes, ...manual],
    segments: shiftSegments(model.segments, startBar, endBar),
    totalBeats: model.totalBeats - length,
    context: nextContext,
  }, new Set(cards.map((card) => card.id)), "suggest");
  const label = `${barRangeLabel(startBar, endBar)}を消して詰めた`;
  return { model: next, changed: true, kind: "bar-cut", label, message: `${label}（Ctrl+Z で戻せます）` };
}

/** Old source fragments in the new screen time (after the gap closes). */
function shiftSourceNotesForCut(
  notes: readonly CorrectionNote[],
  from: number,
  to: number,
  length: number,
): CorrectionNote[] {
  const out: CorrectionNote[] = [];
  for (const note of notes) {
    if (note.provenance !== "SOURCE") continue;
    const start = note.start;
    const end = start + note.duration;
    if (end <= from + EPSILON) {
      out.push(note);
      continue;
    }
    if (start >= to - EPSILON) {
      out.push({ ...note, start: start - length });
      continue;
    }
    if (start < from - EPSILON) out.push({ ...note, duration: from - start });
    if (end > to + EPSILON) out.push({ ...note, id: `${note.id}~cut`, start: from, duration: end - to });
  }
  return out;
}
