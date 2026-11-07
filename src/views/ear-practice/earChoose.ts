import { BUILTINS, builtinDisplayName } from "../../domain/chordDojo/builtins";
import {
  RECENT_QUESTIONS, bankCounts, buildBuiltinQuestion, buildCollectionQuestion, builtinIds, pickBankQuestion,
  randomTonic, scanCollection, type CollectionScan, type CollectionSegment, type EarKind, type EarLevel, type EarQuestion,
} from "../../domain/earPractice";
import type { SongIdea } from "../../domain/types";
import type { EarSettings } from "./earSettings";

export interface Recent {
  ids: string[];
  tonic?: number;
}

const pick = <T,>(items: readonly T[], random: () => number) => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** The standard progressions that can be asked at a level and length, by id. */
export function builtinChoices(level: EarLevel, length: number): Array<{ id: string; name: string }> {
  return builtinIds()
    .filter((id) => {
      const question = buildBuiltinQuestion(id, 0, { length });
      return question !== undefined && question.length === length && question.level === level;
    })
    .map((id) => ({ id, name: builtinDisplayName(BUILTINS.find((entry) => entry.id === id)!) }));
}

export interface CollectionChoice {
  blockId: string;
  name: string;
  segments: CollectionSegment[];
}

/** The saved progressions that have a stretch of this length at this level. */
export function collectionChoices(scan: CollectionScan, level: EarLevel, length: number): CollectionChoice[] {
  const byBlock = new Map<string, CollectionChoice>();
  for (const segment of scan.segments) {
    if (segment.length !== length) continue;
    if (buildCollectionQuestion(segment).level !== level) continue;
    const entry = byBlock.get(segment.blockId) ?? { blockId: segment.blockId, name: segment.displayName, segments: [] };
    entry.segments.push(segment);
    byBlock.set(segment.blockId, entry);
  }
  return [...byBlock.values()];
}

export interface Availability {
  bank: { total: number; extra: number };
  builtin: number;
  collection: number;
  /** Saved progressions whose meter is not asked (shown on the choosing screen with the reason). */
  collectionUnusableMeter: number;
}

export function availability(settings: EarSettings, scan: CollectionScan): Availability {
  return {
    bank: bankCounts({ includeExtra: settings.includeExtra, level: settings.level, length: settings.length }),
    builtin: builtinChoices(settings.level, settings.length).length,
    collection: collectionChoices(scan, settings.level, settings.length).length,
    collectionUnusableMeter: scan.unusable.meter,
  };
}

/** One question from the choices, or the reason there is none (in words, for the screen). */
export function makeQuestion(
  settings: EarSettings,
  scan: CollectionScan,
  recent: Recent,
  random: () => number = Math.random,
  /** Practise a weak point: bank questions with many chords of this kind. */
  kind?: EarKind,
): { question?: EarQuestion; reason?: string } {
  const fixed = typeof settings.tonic === "number" ? settings.tonic : undefined;
  if (settings.source === "bank") {
    const question = pickBankQuestion({
      level: settings.level, length: settings.length, includeExtra: settings.includeExtra,
      tonic: fixed ?? "random", recentIds: recent.ids, ...(recent.tonic === undefined ? {} : { previousTonic: recent.tonic }),
      random, bpm: settings.bpm, ...(kind ? { kind } : {}),
    });
    return question ? { question } : { reason: kind ? `このレベル・長さには、「${kind}」のコードを含む進行がありません` : "このレベルの進行はありません" };
  }
  if (settings.source === "builtin") {
    const choices = builtinChoices(settings.level, settings.length);
    const wanted = settings.builtinId === "any" ? undefined : choices.find((choice) => choice.id === settings.builtinId);
    const fresh = choices.filter((choice) => !recent.ids.slice(-RECENT_QUESTIONS).includes(`builtin:${choice.id}`));
    const chosen = wanted ?? (choices.length ? pick(fresh.length ? fresh : choices, random) : undefined);
    if (!chosen) return { reason: "このレベルの進行はありません" };
    const key = settings.tonic === "random" ? randomTonic(random, recent.tonic) : fixed ?? 0;
    const question = buildBuiltinQuestion(chosen.id, key, { length: settings.length, bpm: settings.bpm });
    return question ? { question } : { reason: "このレベルの進行はありません" };
  }
  const choices = collectionChoices(scan, settings.level, settings.length);
  const wanted = settings.collectionBlockId === "any" ? undefined : choices.find((choice) => choice.blockId === settings.collectionBlockId);
  const pool = (wanted ? [wanted] : choices).flatMap((choice) => choice.segments);
  if (!pool.length) return { reason: "このレベルの進行はありません" };
  const fresh = pool.filter((segment) => !recent.ids.slice(-RECENT_QUESTIONS).includes(segment.id));
  const segment = pick(fresh.length ? fresh : pool, random);
  const tonic = settings.tonic === "random" ? randomTonic(random, recent.tonic) : fixed;
  return { question: buildCollectionQuestion(segment, { ...(tonic === undefined ? {} : { tonic }), bpm: settings.bpm }) };
}

export const scanFor = (ideas: readonly SongIdea[]): CollectionScan => scanCollection(ideas);
