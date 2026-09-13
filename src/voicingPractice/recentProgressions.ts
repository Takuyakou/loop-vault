import type { ProgressionPracticeSourceReference } from "../domain/progressionVoicingPractice/types";
import { voicingLoopSourceId } from "../domain/progressionVoicingPractice/library";

export const MAX_RECENT_VOICING_LOOP_PROGRESSIONS = 5;
export const RECENT_VOICING_LOOP_STORAGE_KEY = "loop-vault:voicing-loop-recents:v1";

export function loadRecentVoicingLoopProgressions(
  storage?: RecentProgressionStorage,
): readonly ProgressionPracticeSourceReference[] {
  try {
    const raw = (storage ?? window.localStorage).getItem(RECENT_VOICING_LOOP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: unknown; references?: unknown };
    return parsed.version === 1 ? normalizeReferences(parsed.references) : [];
  } catch {
    return [];
  }
}

export function saveRecentVoicingLoopProgressions(
  references: readonly ProgressionPracticeSourceReference[],
  storage?: RecentProgressionStorage,
): void {
  try {
    (storage ?? window.localStorage).setItem(RECENT_VOICING_LOOP_STORAGE_KEY, JSON.stringify({
      version: 1,
      references: normalizeReferences(references),
    }));
  } catch {
    // Practice remains usable when browser preference storage is unavailable.
  }
}

export function recordRecentVoicingLoopProgression(
  references: readonly ProgressionPracticeSourceReference[],
  selected: ProgressionPracticeSourceReference,
): readonly ProgressionPracticeSourceReference[] {
  return normalizeReferences([selected, ...references]);
}

export function retainAvailableRecentVoicingLoopProgressions(
  references: readonly ProgressionPracticeSourceReference[],
  available: readonly ProgressionPracticeSourceReference[],
): readonly ProgressionPracticeSourceReference[] {
  const availableIds = new Set(available.map(voicingLoopSourceId));
  return normalizeReferences(references).filter((reference) => (
    availableIds.has(voicingLoopSourceId(reference))
  ));
}

export interface RecentProgressionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function normalizeReferences(value: unknown): readonly ProgressionPracticeSourceReference[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, ProgressionPracticeSourceReference>();
  for (const candidate of value) {
    if (!isReference(candidate)) continue;
    const reference = Object.freeze({ ideaId: candidate.ideaId, blockId: candidate.blockId });
    const id = voicingLoopSourceId(reference);
    if (!unique.has(id)) unique.set(id, reference);
    if (unique.size === MAX_RECENT_VOICING_LOOP_PROGRESSIONS) break;
  }
  return Object.freeze([...unique.values()]);
}

function isReference(value: unknown): value is ProgressionPracticeSourceReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProgressionPracticeSourceReference>;
  return typeof candidate.ideaId === "string" && candidate.ideaId.length > 0
    && typeof candidate.blockId === "string" && candidate.blockId.length > 0;
}
