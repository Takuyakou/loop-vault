import { normalizeQuery } from "../harmony/degrees";
import type { SongIdea } from "../types";
import { buildProgressionVoicingPracticeHandoffFromVault } from "./handoff";
import type { ProgressionPracticeSourceReference } from "./types";

export interface VoicingLoopVaultCandidate {
  readonly id: string;
  readonly sourceReference: ProgressionPracticeSourceReference;
  readonly title: string;
  readonly key?: string;
  readonly bpm: number;
  readonly chordLabels: readonly string[];
  readonly capturedAt: string;
  /** Stored safely in Vault, but outside the bounded Voicing Loop practice capacity. */
  readonly unavailableReason?: "resource-budget";
}

export function buildVoicingLoopVaultCandidates(
  ideas: readonly SongIdea[],
  fallbackTitle: string,
): readonly VoicingLoopVaultCandidate[] {
  const candidates: VoicingLoopVaultCandidate[] = [];
  for (const idea of ideas) {
    for (const block of idea.progressionBlocks ?? []) {
      const sourceReference = Object.freeze({ ideaId: idea.id, blockId: block.id });
      const result = buildProgressionVoicingPracticeHandoffFromVault([idea], sourceReference);
      if (!result.ok) {
        if (result.error.cause === "resource-budget") {
          candidates.push(Object.freeze({
            id: voicingLoopSourceId(sourceReference), sourceReference,
            title: normalizedTitle(idea.title, fallbackTitle),
            ...(isFiniteBpm(block.bpm ?? idea.bpm) ? { bpm: (block.bpm ?? idea.bpm)! } : { bpm: 0 }),
            chordLabels: Object.freeze(block.chords.map(({ chord }) => chord.label)),
            capturedAt: block.capturedAt, unavailableReason: "resource-budget" as const,
          }));
        }
        continue;
      }
      const snapshot = result.handoff.snapshots[result.handoff.initialSelection];
      if (!snapshot) continue;
      candidates.push(Object.freeze({
        id: voicingLoopSourceId(sourceReference),
        sourceReference,
        title: normalizedTitle(idea.title, fallbackTitle),
        ...(snapshot.key ? { key: snapshot.key } : {}),
        bpm: snapshot.bpm,
        chordLabels: Object.freeze(snapshot.events.map(({ chord }) => chord.label)),
        capturedAt: block.capturedAt,
      }));
    }
  }
  return Object.freeze(candidates.sort(compareCandidates));
}

export function filterVoicingLoopVaultCandidates(
  candidates: readonly VoicingLoopVaultCandidate[],
  query: string,
): readonly VoicingLoopVaultCandidate[] {
  const parsed = normalizeQuery(query);
  const normalized = parsed.kind === "degree"
    ? normalizeText(query)
    : parsed.normalized;
  if (!normalized) return candidates;
  return candidates.filter((candidate) => normalizeText([
    candidate.title,
    candidate.key ?? "",
    ...candidate.chordLabels,
  ].join(" ")).includes(normalized));
}

export function voicingLoopSourceId(reference: ProgressionPracticeSourceReference): string {
  return JSON.stringify([reference.ideaId, reference.blockId]);
}

function compareCandidates(
  left: VoicingLoopVaultCandidate,
  right: VoicingLoopVaultCandidate,
): number {
  const captured = timestamp(right.capturedAt) - timestamp(left.capturedAt);
  if (captured) return captured;
  const title = compareText(left.title, right.title);
  return title || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedTitle(value: string, fallback: string): string {
  return value.normalize("NFC").trim() || fallback.normalize("NFC").trim() || "Untitled progression";
}

function normalizeText(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

function isFiniteBpm(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}
