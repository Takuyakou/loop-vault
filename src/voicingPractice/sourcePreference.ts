import type { ProgressionVoicingPracticeSnapshots, ProgressionVoicingSelection } from "../domain/progressionVoicingPractice/types";
import type { RecentProgressionStorage } from "./recentProgressions";

export const VOICING_SOURCE_PREFERENCE_KEY = "loop-vault:voicing-loop-source:v1";
const selections: readonly ProgressionVoicingSelection[] = ["saved", "source-midi", "custom", "basic-full", "basic-shell", "rootless-shell", "full-shell", "left-hand"];

export function sourceCoverage(snapshots: ProgressionVoicingPracticeSnapshots | undefined, selection: "saved" | "source-midi" | "custom") {
  const events = snapshots?.[selection]?.events ?? [];
  const total = Object.values(snapshots ?? {}).find(Boolean)?.events.length ?? 0;
  return { available: events.filter(event => event.voicing?.kind === selection).length, total };
}

export function restoreVoicingSource(snapshots: ProgressionVoicingPracticeSnapshots | undefined, initial: ProgressionVoicingSelection, storage?: RecentProgressionStorage): ProgressionVoicingSelection {
  try {
    const id = preferenceId(snapshots);
    const entry = readEntries(storage).find(([key]) => key === id);
    const selected = entry?.[1];
    if (selected && snapshots?.[selected] && (selected !== "saved" && selected !== "source-midi" && selected !== "custom"
      || sourceCoverage(snapshots, selected).available > 0)) return selected;
  } catch { /* Preference storage is optional. */ }
  return initial;
}

export function rememberVoicingSource(snapshots: ProgressionVoicingPracticeSnapshots | undefined, selected: ProgressionVoicingSelection, storage?: RecentProgressionStorage): void {
  try {
    const id = preferenceId(snapshots);
    if (!id) return;
    const entries = [[id, selected], ...readEntries(storage).filter(([key]) => key !== id)].slice(0, 50);
    (storage ?? window.localStorage).setItem(VOICING_SOURCE_PREFERENCE_KEY, JSON.stringify({ version: 1, entries }));
  } catch { /* Do not block practice when storage is disabled or full. */ }
}

export function preferenceId(snapshots: ProgressionVoicingPracticeSnapshots | undefined): string | undefined {
  const reference = Object.values(snapshots ?? {}).find(Boolean)?.source.reference;
  return reference ? JSON.stringify([reference.ideaId, reference.blockId]) : undefined;
}

function readEntries(storage?: RecentProgressionStorage): [string, ProgressionVoicingSelection][] {
  const value = JSON.parse((storage ?? window.localStorage).getItem(VOICING_SOURCE_PREFERENCE_KEY) ?? "null") as { version?: unknown; entries?: unknown } | null;
  if (value?.version !== 1 || !Array.isArray(value.entries)) return [];
  return value.entries.filter((entry): entry is [string, ProgressionVoicingSelection] => Array.isArray(entry)
    && entry.length === 2 && typeof entry[0] === "string" && entry[0].length <= 512 && selections.includes(entry[1])).slice(0, 50);
}
