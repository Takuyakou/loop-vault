import type { SongIdea, Status } from "./types";

const allStatuses: Status[] = [
  "idea",
  "loop",
  "arrange",
  "mix",
  "done",
  "hold",
  "abandoned",
];

export interface MonthDoneCount {
  year: number;
  month: number;
  label: string;
  doneCount: number;
}

export interface MonthlyStats {
  year: number;
  month: number;
  doneCount: number;
  goal: number;
  remainingDays: number;
  pipelineCounts: Record<Status, number>;
  trailingMonths: MonthDoneCount[];
}

export function monthlyStats(
  ideas: SongIdea[],
  now: Date,
  goal: number,
): MonthlyStats {
  const normalizedGoal = Math.max(1, Math.trunc(goal));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trailingMonths = buildTrailingMonths(monthStart);
  const trailingCounts = new Map(
    trailingMonths.map((month) => [monthKey(month.year, month.month), 0]),
  );

  for (const idea of ideas) {
    const firstDone = firstDoneAt(idea);
    if (!firstDone) {
      continue;
    }

    const key = monthKey(firstDone.getFullYear(), firstDone.getMonth() + 1);
    if (trailingCounts.has(key)) {
      trailingCounts.set(key, (trailingCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    doneCount: ideas.filter((idea) =>
      isSameLocalMonth(parseDate(idea.completedAt), now),
    ).length,
    goal: normalizedGoal,
    remainingDays: daysInMonth(now) - now.getDate(),
    pipelineCounts: countStatuses(ideas),
    trailingMonths: trailingMonths.map((month) => ({
      ...month,
      doneCount: trailingCounts.get(monthKey(month.year, month.month)) ?? 0,
    })),
  };
}

function countStatuses(ideas: SongIdea[]): Record<Status, number> {
  const counts = Object.fromEntries(
    allStatuses.map((status) => [status, 0]),
  ) as Record<Status, number>;

  for (const idea of ideas) {
    counts[idea.status] += 1;
  }

  return counts;
}

function buildTrailingMonths(currentMonthStart: Date): MonthDoneCount[] {
  const months: MonthDoneCount[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - offset,
      1,
    );
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    months.push({
      year,
      month,
      label: `${year}-${month.toString().padStart(2, "0")}`,
      doneCount: 0,
    });
  }

  return months;
}

function firstDoneAt(idea: SongIdea): Date | undefined {
  const historyDoneDates = idea.statusHistory
    .filter((entry) => entry.status === "done")
    .map((entry) => new Date(entry.at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return historyDoneDates[0] ?? parseDate(idea.completedAt);
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isSameLocalMonth(date: Date | undefined, now: Date): boolean {
  if (!date) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKey(year: number, month: number): string {
  return `${year}-${month.toString().padStart(2, "0")}`;
}
