// 今日の練習 (P8.9-04): read-only view over the practice records that already exist.
// No new storage and no new fields. Records without a date are not counted.
import type { PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import type { SongIdea } from "../../domain/types";
import { localDateKey } from "./todayLoop";

export type PracticeKind = "chord-dojo" | "bass-practice";

export interface PracticeRecord {
  kind: PracticeKind;
  at: string;
  date: string;
  reference?: { ideaId: string; blockId: string };
}

export interface PracticeDay {
  date: string;
  practiced: boolean;
  today: boolean;
}

export interface PracticeActivity {
  today: Record<PracticeKind, number>;
  todayTotal: number;
  /** Consecutive days with at least one record, ending today (or yesterday while today is still open). */
  streakDays: number;
  /** The last five days, oldest first. */
  recentDays: PracticeDay[];
  /** Newest record that points at a progression still in the Vault. */
  latest?: PracticeRecord & { reference: { ideaId: string; blockId: string } };
  undatedCount: number;
}

export function collectPracticeRecords(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
): { records: PracticeRecord[]; undatedCount: number } {
  const records: PracticeRecord[] = [];
  let undatedCount = 0;
  const push = (kind: PracticeKind, at: string | undefined, reference?: PracticeRecord["reference"]) => {
    const time = at ? new Date(at) : undefined;
    if (!at || !time || Number.isNaN(time.getTime())) {
      undatedCount += 1;
      return;
    }
    records.push({ kind, at, date: localDateKey(time), ...(reference ? { reference } : {}) });
  };

  // Chord Dojo keeps one progress entry per progression; only its latest date survives.
  for (const idea of ideas) {
    for (const block of idea.progressionBlocks ?? []) {
      const progress = block.practice;
      if (!progress) continue;
      push("chord-dojo", progress.lastPracticedAt ?? progress.provisional?.clearedAt ?? progress.transposition?.updatedAt,
        { ideaId: idea.id, blockId: block.id });
    }
  }

  if (practiceFile) {
    practiceFile.attempts.filter((attempt) => attempt.rating).forEach((attempt) => {
      if (attempt.completedAt) push("bass-practice", attempt.completedAt);
      else undatedCount += 1;
    });
    practiceFile.rhythmAttempts.forEach((attempt) => push("bass-practice", attempt.completedAt));
    practiceFile.chordContextHistory.forEach((entry) => push("bass-practice", entry.completedAt, entry.source.reference));
    practiceFile.rootMotionHistory.forEach((entry) => push("bass-practice", entry.completedAt));
    practiceFile.sourceBasslineHistory.forEach((entry) => push("bass-practice", entry.completedAt, entry.source.reference));
  }
  return { records, undatedCount };
}

export function summarizePracticeActivity(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
  now: Date,
): PracticeActivity {
  const { records, undatedCount } = collectPracticeRecords(ideas, practiceFile);
  const today = localDateKey(now);
  const days = new Set(records.map((record) => record.date));
  const dayAt = (offset: number) => localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
  let streakDays = 0;
  for (let offset = days.has(today) ? 0 : 1; days.has(dayAt(offset)); offset += 1) streakDays += 1;

  const blocks = new Set(ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => `${idea.id}:${block.id}`)));
  const latest = records
    .filter((record): record is NonNullable<PracticeActivity["latest"]> =>
      Boolean(record.reference && blocks.has(`${record.reference.ideaId}:${record.reference.blockId}`)))
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0];

  const todayRecords = records.filter((record) => record.date === today);
  const count = (kind: PracticeKind) => todayRecords.filter((record) => record.kind === kind).length;
  return {
    today: { "chord-dojo": count("chord-dojo"), "bass-practice": count("bass-practice") },
    todayTotal: todayRecords.length,
    streakDays,
    recentDays: [4, 3, 2, 1, 0].map((offset) => ({ date: dayAt(offset), practiced: days.has(dayAt(offset)), today: offset === 0 })),
    latest,
    undatedCount,
  };
}
