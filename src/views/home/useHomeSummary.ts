import { useMidiBassActivity } from "../../features/bass-practice/midi/useActivity";
import { dojoRecentStore } from "../chord-dojo/dojoRecent";
import { readLastVoicingPractice } from "../../voicingPractice/lastPractice";
import type { MidiBassAttempt } from "../../features/bass-practice/midi/model";
import {useEffect} from "react";
import {useStore} from "zustand";
import {dojoStore} from "../../domain/chordDojo/runtime";
import type {DojoStore} from "../../domain/chordDojo/store";
import { useMemo } from "react";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";
import type { PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import { progressionName, progressionTouchedAt } from "../vault/progressionFacts";
import { vaultKey } from "../../domain/chordDojo/collect";
import { collectPracticeRecords, summarizePracticeActivity, latestBassPractice, type BassPracticeMode, type PracticeActivity, type PracticeKind } from "./practiceActivity";
import type { TodayLoopCandidate } from "./todayLoop";
import { dojoRecentLabels, dojoRecentSubtitle, dojoRecentTitle, type DojoRecentEntry, type DojoRecentLabels } from "../chord-dojo/dojoRecent";
import type { LastVoicingPractice } from "../../voicingPractice/lastPractice";
import { loadPracticeOpens, topOpenedProgressions, type PracticeOpen } from "./practiceOpens";
import { practiceWeek, type PracticeWeek } from "./practiceWeek";

export interface HomeProgression {
  id: string;
  idea: SongIdea;
  block: SavedProgressionBlock;
  touchedAt: number;
}

/** P22-03 §1: the Home's 「続きから」 — the most recent of the three practices, else the old behaviour. */
export type HomeContinue =
  | { readonly kind: "voicing-loop"; readonly at: number; readonly entry: HomeProgression }
  | { readonly kind: "chord-dojo"; readonly at: number; readonly recent: DojoRecentEntry; readonly labels: DojoRecentLabels; readonly title: string; readonly subtitle: string }
  | { readonly kind: "bass-practice"; readonly at: number; readonly mode: BassPracticeMode }
  /** Before P22-03 (and when nothing was practised): the last edited progression, or the old practice records. */
  | { readonly kind: "edit"; readonly at: number; readonly entry: HomeProgression; readonly via: PracticeKind | "edit" };

/** The device-local reads the Home needs: the Voicing Loop's last practice and the Chord Dojo's recent practices. */
export interface HomeExtraInputs {
  readonly voicingLast?: LastVoicingPractice;
  readonly dojoRecent?: readonly DojoRecentEntry[];
  /** P23-08 §1: the practice opens this PC kept. */
  readonly practiceOpens?: readonly PracticeOpen[];
}

export interface HomeSummary {
  progressions: HomeProgression[];
  loopCandidates: TodayLoopCandidate[];
  continueFrom?: HomeContinue;
  recent: HomeProgression[];
  activity: PracticeActivity;
  /** The Voicing Loop's last practice (P22-03): the Home's practice row shows 「前回 …」 from it. */
  lastVoicingPractice?: LastVoicingPractice;
  /** P23-08 §3: the (at most 3) progressions opened most for practice this week, only those still in the Vault. */
  topOpened: { progression: HomeProgression; count: number }[];
  /** P23-08 §2: the last 7 days of each practice, oldest first. */
  practiceWeek: PracticeWeek;
  /** P23-09 P2: the newest dated record of each counted practice (for 「前回 …」). */
  lastPractised: Partial<Record<PracticeKind, number>>;
}

export const HOME_RECENT_LIMIT = 4;

/** Pure Home aggregation; the view only renders what this returns. */
export function deriveHomeSummary(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
  now: Date,
  dojo?: DojoStore,
  midiAttempts: readonly MidiBassAttempt[] = [],
  extra: HomeExtraInputs = {},
): HomeSummary {
  const progressions = ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({
    id: `${idea.id}:${block.id}`,
    idea,
    block,
    touchedAt: progressionTouchedAt(idea, block),
  })));
  const byTouch = [...progressions].sort((left, right) => right.touchedAt - left.touchedAt
    || Date.parse(right.block.capturedAt) - Date.parse(left.block.capturedAt));
  const activity = summarizePracticeActivity(ideas, practiceFile, now, dojo, midiAttempts);

  // P22-03 §1: the newest of the three practices, each only while its own destination can still open.
  const candidates: HomeContinue[] = [];
  if (extra.voicingLast) {
    const entry = progressions.find((item) => item.idea.id === extra.voicingLast!.reference.ideaId
      && item.block.id === extra.voicingLast!.reference.blockId);
    const at = Date.parse(extra.voicingLast.at);
    if (entry && Number.isFinite(at)) candidates.push({ kind: "voicing-loop", at, entry });
  }
  const recentDojo = extra.dojoRecent?.[0];
  if (recentDojo) {
    const labels = dojoRecentLabels(recentDojo, {
      // The same keys the Chord Dojo uses for a saved progression (its `collection.progressions`).
      progressions: progressions.map((entry) => ({ key: vaultKey(entry.block), name: progressionName(entry.idea, entry.block) })),
      voicingSymbol: (id) => dojo?.voicings[id]?.occurrences.slice(-1)[0]?.harmony.symbol,
    });
    const at = Date.parse(recentDojo.at);
    if (labels.exists && Number.isFinite(at)) {
      candidates.push({
        kind: "chord-dojo", at, recent: recentDojo, labels,
        title: dojoRecentTitle(labels), subtitle: dojoRecentSubtitle(labels, recentDojo.at, now.getTime()),
      });
    }
  }
  const bass = latestBassPractice(practiceFile, midiAttempts);
  if (bass) {
    const at = Date.parse(bass.at);
    if (Number.isFinite(at)) candidates.push({ kind: "bass-practice", at, mode: bass.mode });
  }
  const practised = candidates.length
    ? candidates.reduce((newest, candidate) => (candidate.at > newest.at ? candidate : newest))
    : undefined;

  // The old behaviour, kept for the days nothing new was practised.
  const legacyEntry = activity.latest
    ? progressions.find((entry) => entry.idea.id === activity.latest!.reference.ideaId && entry.block.id === activity.latest!.reference.blockId)
    : undefined;
  const legacy: HomeContinue | undefined = legacyEntry
    ? { kind: "edit", entry: legacyEntry, via: activity.latest!.kind, at: Date.parse(activity.latest!.at) }
    : byTouch[0] ? { kind: "edit", entry: byTouch[0], via: "edit", at: byTouch[0].touchedAt } : undefined;
  const continueFrom = practised ?? legacy;
  const opens = extra.practiceOpens ?? [];
  const progressionOf = (ideaId: string, blockId: string) => progressions.find((item) => item.idea.id === ideaId && item.block.id === blockId);
  const records = collectPracticeRecords(ideas, practiceFile, dojo, midiAttempts).records;
  const lastPractised: Partial<Record<PracticeKind, number>> = {};
  for (const record of records) lastPractised[record.kind] = Math.max(lastPractised[record.kind] ?? 0, Date.parse(record.at));
  const topOpened = topOpenedProgressions(opens, now, (ideaId, blockId) => Boolean(progressionOf(ideaId, blockId)))
    .map((entry) => ({ progression: progressionOf(entry.ideaId, entry.blockId)!, count: entry.count }));
  return {
    progressions,
    loopCandidates: progressions.map((entry) => ({ id: entry.id, pinned: Boolean(entry.block.pinned) })),
    continueFrom,
    recent: byTouch.slice(0, HOME_RECENT_LIMIT),
    activity,
    ...(extra.voicingLast ? { lastVoicingPractice: extra.voicingLast } : {}),
    topOpened,
    practiceWeek: practiceWeek(records, opens, now),
    lastPractised,
  };
}

export function useHomeSummary(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
  now: Date,
): HomeSummary {
  const midiAttempts = useMidiBassActivity();
  const dojo=useStore(dojoStore,s=>s.file);
  const dojoRecent=useStore(dojoRecentStore,state=>state.entries);
  useEffect(()=>{void dojoStore.getState().initialize();},[]);
  useEffect(()=>{dojoRecentStore.getState().reload();},[now]);
  const voicingLast=useMemo(()=>readLastVoicingPractice(),[now]);
  const practiceOpens=useMemo(()=>loadPracticeOpens(),[now]);
  return useMemo(
    () => deriveHomeSummary(ideas, practiceFile, now, dojo, midiAttempts, { voicingLast, dojoRecent, practiceOpens }),
    [ideas, now, practiceFile, dojo, midiAttempts, voicingLast, dojoRecent, practiceOpens],
  );
}

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

/** Header date, e.g. 9月28日（月）. */
export function formatHomeDate(now: Date): string {
  return `${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;
}

/** 今日 22:40 / 昨日 22:40 / 9/26 */
export function formatWhen(at: number, now: Date, withTime = true): string {
  const date = new Date(at);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (days === 0) return withTime ? `今日 ${time}` : "今日";
  if (days === 1) return withTime ? `昨日 ${time}` : "昨日";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
