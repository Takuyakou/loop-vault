import { normalizeQuery } from "../harmony/degrees";
import { degreeOf } from "../harmony/degrees";
import { functionKeyOf, progressionFunctions } from "../harmony/chordFunction";
import { parseChordLabel } from "../chords";
import type { SavedProgressionBlock, SongIdea } from "../types";
import { buildProgressionVoicingPracticeHandoffFromVault, resolveVaultPracticeTempo, type VaultPracticeTempoOrigin } from "./handoff";
import type { ProgressionPracticeChord, ProgressionPracticeSnapshotErrorCode, ProgressionPracticeSourceReference } from "./types";

export interface VoicingLoopVaultCandidate {
  readonly id: string;
  readonly sourceReference: ProgressionPracticeSourceReference;
  readonly title: string;
  readonly key?: string;
  readonly bpm?: number;
  readonly tempoOrigin?: VaultPracticeTempoOrigin;
  readonly chordLabels: readonly string[];
  readonly capturedAt: string;
  /** The Vault favourite flag (`block.pinned`). The Voicing Loop shows and toggles the same value. */
  readonly favorite: boolean;
  /** The saved length in bars, when Vault has one. */
  readonly lengthBars?: number;
  /** Stored safely in Vault, but outside the bounded Voicing Loop practice capacity. */
  readonly unavailableReason?: ProgressionPracticeSnapshotErrorCode | "source-unavailable";
  /** P23-29: the saved block itself — the picker's right column draws its roll and auditions its chords. */
  readonly block?: SavedProgressionBlock;
  /** P23-29: chords in the block / how many of them carry their own saved voicing (`voicingMemory`). */
  readonly chordCount?: number;
  readonly savedVoiceCount?: number;
  /** P23-29: false hides 「元の MIDI」 in the picker's 使える音 line. */
  readonly hasSourceMidi?: boolean;
  /** P23-29: the role colour per shown chord (T / SD / SDm / D, "" when the key is unknown). */
  readonly chordRoles?: readonly string[];
  /** P23-29: the degree per shown chord (Ⅱm7 form), undefined when the key is unknown. */
  readonly chordDegrees?: readonly (string | undefined)[];
}

/** How many of the recently used progressions the picker shows above the rest (the stored list keeps 5). */
export const MAX_RECENT_VOICING_LOOP_SECTION = 3;

export type VoicingLoopSectionKind = "favorites" | "recent" | "others";

export interface VoicingLoopSection {
  readonly kind: VoicingLoopSectionKind;
  readonly candidates: readonly VoicingLoopVaultCandidate[];
}

/**
 * The picker's three sections: favourites, the first few recently used (favourites excluded), then the rest.
 * Each progression appears in one section only, and every section keeps the newest-first order.
 */
export function groupVoicingLoopVaultCandidates(
  candidates: readonly VoicingLoopVaultCandidate[],
  recentReferences: readonly ProgressionPracticeSourceReference[],
): readonly VoicingLoopSection[] {
  const sorted = [...candidates].sort(compareCandidates);
  const favorites = sorted.filter((candidate) => candidate.favorite);
  const remaining = sorted.filter((candidate) => !candidate.favorite);
  const byId = new Map(remaining.map((candidate) => [candidate.id, candidate]));
  const recent: VoicingLoopVaultCandidate[] = [];
  for (const reference of recentReferences) {
    if (recent.length >= MAX_RECENT_VOICING_LOOP_SECTION) break;
    const candidate = byId.get(voicingLoopSourceId(reference));
    if (!candidate || recent.includes(candidate)) continue;
    recent.push(candidate);
    byId.delete(candidate.id);
  }
  const others = remaining.filter((candidate) => byId.has(candidate.id));
  return ([
    { kind: "favorites" as const, candidates: favorites },
    { kind: "recent" as const, candidates: recent },
    { kind: "others" as const, candidates: others },
  ]).filter((section) => section.candidates.length > 0);
}

/**
 * Search results stay one list, but keep the picker's order behind it: favourites first, then the recently
 * used (same cap), then the rest. The star marker stays visible in the results.
 */
export function arrangeVoicingLoopSearchResults(
  candidates: readonly VoicingLoopVaultCandidate[],
  recentReferences: readonly ProgressionPracticeSourceReference[],
): readonly VoicingLoopVaultCandidate[] {
  return groupVoicingLoopVaultCandidates(candidates, recentReferences)
    .flatMap((section) => [...section.candidates]);
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
      const tempo = resolveVaultPracticeTempo(idea, block);
      const shared = {
        sourceReference,
        title: normalizedTitle(idea.title, fallbackTitle),
        favorite: block.pinned === true,
        ...(block.lengthBars === undefined ? {} : { lengthBars: block.lengthBars }),
        // P23-29: what the picker's rows and right column read.
        block,
        chordCount: block.chords.length,
        savedVoiceCount: block.chords.filter((item) => item.voicingMemory !== undefined).length,
      };
      if (!result.ok) {
        const bpm = tempo.bpm;
        candidates.push(Object.freeze({
          id: voicingLoopSourceId(sourceReference), ...shared,
          ...(isFiniteBpm(bpm) ? { bpm } : {}),
          tempoOrigin: tempo.origin,
          chordLabels: Object.freeze(block.chords.map(({ chord }) => chord.label)),
          capturedAt: block.capturedAt,
          unavailableReason: result.error.code === "invalid-source"
            ? result.error.cause ?? "invalid-reference" : result.error.code,
        }));
        continue;
      }
      const snapshot = result.handoff.snapshots[result.handoff.initialSelection];
      if (!snapshot) {
        candidates.push(Object.freeze({
          id: voicingLoopSourceId(sourceReference), ...shared,
          chordLabels: Object.freeze(block.chords.map(({ chord }) => chord.label)),
          capturedAt: block.capturedAt, unavailableReason: "invalid-selection" as const,
        }));
        continue;
      }
      candidates.push(Object.freeze({
        id: voicingLoopSourceId(sourceReference),
        ...shared,
        ...(snapshot.key ? { key: snapshot.key } : {}),
        bpm: snapshot.bpm,
        tempoOrigin: tempo.origin,
        chordLabels: Object.freeze(snapshot.events.map(({ chord }) => chord.label)),
        capturedAt: block.capturedAt,
        hasSourceMidi: Boolean(result.handoff.snapshots["source-midi"]),
        ...pickerHarmony(snapshot.key, snapshot.events.map(({ chord }) => chord)),
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
  return JSON.stringify([reference.ideaId, reference.blockId]);}

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

/** P23-29: the degree (Ⅱm7) and role colour (T / SD / SDm / D) the picker draws for one progression. */
function pickerHarmony(
  key: string | undefined,
  chords: readonly ProgressionPracticeChord[],
): Pick<VoicingLoopVaultCandidate, "chordDegrees" | "chordRoles"> {
  const degrees = chords.map((chord) => degreeOf({
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    label: chord.label,
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
  }, key)?.label);
  const functionKey = functionKeyOf(key);
  const toFunctionChord = (chord: ProgressionPracticeChord) => ({
    rootPc: chord.root,
    quality: chord.quality,
    tensions: chord.tensions,
    ...(chord.bass === undefined ? {} : { bassPc: chord.bass }),
  });
  if (!functionKey) return { chordDegrees: Object.freeze(degrees) };
  return {
    chordDegrees: Object.freeze(degrees),
    chordRoles: Object.freeze(progressionFunctions(chords.map(toFunctionChord), functionKey).map((entry) => entry.kind)),
  };
}

/**
 * P23-31 V1: the degrees and role colours of a list of chord names, through the very same function the
 * picker uses on the Vault's blocks. The synthetic e2e candidates call this, so their chips are never
 * hand-written and always agree with the app.
 */
export function pickerHarmonyOfLabels(
  key: string | undefined,
  labels: readonly string[],
): Pick<VoicingLoopVaultCandidate, "chordDegrees" | "chordRoles"> {
  const chords = labels.map((label) => {
    const chord = parseChordLabel(label);
    if (!chord) throw new Error(`P23-31 picker harmony did not parse: ${label}`);
    return {
      root: chord.root,
      quality: chord.quality,
      tensions: [...chord.tensions],
      label: chord.label,
      ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    };
  });
  return pickerHarmony(key, chords);
}
