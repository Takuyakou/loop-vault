import type { MidiBassAttempt } from "../midi/model";
import type { PracticeFileV2 } from "../infra/repository/practiceRepository";
import type { BassHomeMode, BassHomeModeInfo, BassHomeWeekDay } from "../ui/BassPracticeHome";

/**
 * P23-25 P2/P5: the numbers the Bass Practice home shows, read from the records that already exist.
 * Nothing is stored here: the file, the MIDI attempts and the clock go in, worded labels come out.
 */
export interface BassHomeSource {
  readonly file: PracticeFileV2 | undefined;
  readonly midiAttempts: readonly MidiBassAttempt[];
  /** The moment "today" is measured from (the tests pin it). */
  readonly now?: Date;
}

export interface BassHomeData {
  readonly info: Partial<Record<BassHomeMode, BassHomeModeInfo>>;
  /** The practice done last, and when (「きのう 21:40」), when there is a record. */
  readonly resume?: { readonly mode: BassHomeMode; readonly whenLabel: string };
  /** Seven days, oldest first, today last. */
  readonly week: readonly BassHomeWeekDay[];
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** The ISO stamps a record keeps its time in: `completedAt`, else `startedAt`, else `at`. */
function stampOf(record: unknown): Date | undefined {
  if (!record || typeof record !== "object") return undefined;
  const fields = record as Record<string, unknown>;
  const raw = fields["completedAt"] ?? fields["startedAt"] ?? fields["at"];
  if (typeof raw !== "string") return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const stampsOf = (records: readonly unknown[] | undefined): Date[] =>
  (records ?? []).flatMap((record) => {
    const date = stampOf(record);
    return date ? [date] : [];
  });

const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

function daysAgoLabel(from: Date, now: Date): string {
  const days = daysBetween(from, now);
  if (days <= 0) return "今日";
  if (days === 1) return "きのう";
  return `${days} 日前`;
}

function clockLabel(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function whenLabel(at: Date, now: Date): string {
  const days = daysBetween(at, now);
  if (days <= 0) return `今日 ${clockLabel(at)}`;
  if (days === 1) return `きのう ${clockLabel(at)}`;
  return `${at.getMonth() + 1}/${at.getDate()} ${clockLabel(at)}`;
}

/**
 * Every finished practice, by mode, oldest first. P23-25 P5: the same records the Home already reads
 * (`src/views/home/practiceActivity.ts`) — a merely started session is not a practice and carries no stamp.
 */
function stampsByMode(source: BassHomeSource): Map<BassHomeMode, Date[]> {
  const file = source.file;
  const byMode = new Map<BassHomeMode, Date[]>();
  const add = (mode: BassHomeMode, dates: Date[]) => {
    if (dates.length === 0) return;
    byMode.set(mode, [...(byMode.get(mode) ?? []), ...dates]);
  };
  add("degree", stampsOf((file?.attempts ?? []).filter((attempt) => attempt.rating)));
  add("rhythm", stampsOf(file?.rhythmAttempts));
  add("bassline", stampsOf([...(file?.chordContextHistory ?? []), ...(file?.sourceBasslineHistory ?? [])]));
  add("root-motion", stampsOf(file?.rootMotionHistory));
  add("midi", stampsOf(source.midiAttempts));
  for (const dates of byMode.values()) dates.sort((left, right) => left.getTime() - right.getTime());
  return byMode;
}

export function bassHomeData(source: BassHomeSource): BassHomeData {
  const now = source.now ?? new Date();
  const today = startOfDay(now);
  const byMode = stampsByMode(source);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });

  const info: Partial<Record<BassHomeMode, BassHomeModeInfo>> = {};
  for (const [mode, dates] of byMode) {
    const week = days.map((day) => dates.some((at) => dayKey(at) === dayKey(day)));
    const last = dates[dates.length - 1];
    info[mode] = { week, ...(last ? { lastLabel: daysAgoLabel(last, now) } : {}) };
  }

  const week: BassHomeWeekDay[] = days.map((day, index) => {
    const count = [...byMode.values()]
      .flat()
      .filter((at) => dayKey(at) === dayKey(day)).length;
    return { label: index === days.length - 1 ? "今日" : WEEKDAYS[day.getDay()]!, count };
  });

  let newest: { mode: BassHomeMode; at: Date } | undefined;
  for (const [mode, dates] of byMode) {
    const last = dates[dates.length - 1];
    if (last && (!newest || last.getTime() > newest.at.getTime())) newest = { mode, at: last };
  }

  return {
    info,
    ...(newest ? { resume: { mode: newest.mode, whenLabel: whenLabel(newest.at, now) } } : {}),
    week,
  };
}
