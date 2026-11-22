/**
 * P23-08 §2: the last 7 days (oldest first, today last) of each practice. Chord Dojo and Bass Practice come from the
 * existing practice records (`collectPracticeRecords`), the Voicing Loop from the practice opens (§1). The Home's
 * `activity` (the 5-day dots) is not touched. (P23-61 §7 removed `useTodayPractised`, which fed the side menu's dot.)
 */
import type { PracticeRecord } from "./practiceActivity";
import { practicedDays, type PracticeOpen } from "./practiceOpens";import { localDateKey } from "./todayLoop";

export type PracticeWeekKind = "voicing-loop" | "chord-dojo" | "bass-practice";
export type PracticeWeek = Record<PracticeWeekKind, boolean[]>;

export function practiceWeek(records: readonly Pick<PracticeRecord, "kind" | "date">[], opens: readonly PracticeOpen[], now: Date): PracticeWeek {
  const days = [6, 5, 4, 3, 2, 1, 0].map((offset) => localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)));
  const week = (practised: ReadonlySet<string>) => days.map((day) => practised.has(day));
  const recordDays = (kind: PracticeRecord["kind"]) => new Set(records.filter((record) => record.kind === kind).map((record) => record.date));
  return {
    "voicing-loop": week(practicedDays(opens, "voicing-loop", now)),
    "chord-dojo": week(recordDays("chord-dojo")),
    "bass-practice": week(recordDays("bass-practice")),
  };
}
