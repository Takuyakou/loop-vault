import { labelFromSymbol, parseChordLabel } from "../chords";
import type { ChordQuality, ChordSymbol, ChordTimelineItem, SavedProgressionBlock, Tension, VoicingSnapshot } from "../types";
import { voicingCompatibility, voicingSourceStatus } from "../voicing";
import {
  PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
  type DetachedPracticeVoicing,
  type ProgressionPracticeEvent,
  type ProgressionPracticeSnapshotError,
  type ProgressionPracticeSnapshotResult,
  type ProgressionPracticeSourceReference,
  type ProgressionVoicingSelection,
} from "./types";
import { progressionPracticeBeatAtTick, progressionPracticeTicksAtBeat } from "./timingGrid";

const supportedQualities = new Set<ChordQuality>([
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
]);
const supportedTensions = new Set<Tension>(["9", "b9", "#9", "11", "#11", "13", "b13"]);
const supportedSelections = new Set<ProgressionVoicingSelection>([
  "source-midi", "custom", "basic-shell", "basic-full", "left-hand",
]);
const TIMING_EPSILON = 1e-6;

export interface BuildProgressionVoicingPracticeSnapshotInput {
  readonly sourceReference: ProgressionPracticeSourceReference;
  readonly block: SavedProgressionBlock;
  readonly selection: ProgressionVoicingSelection;
}

/**
 * Creates the owned session input used by Voicing Loop.
 *
 * Only canonical musical facts, logical Vault ids, and compatible saved voicing
 * pitches cross this boundary. The result has no live reference to the Vault
 * block and omits filenames, paths, MIDI bytes, diagnostics, user text, and
 * performance data.
 */
export function buildProgressionVoicingPracticeSnapshot(
  input: BuildProgressionVoicingPracticeSnapshotInput,
): ProgressionPracticeSnapshotResult {
  if (!isSafeLogicalIdentifier(input.sourceReference.ideaId)
    || !isSafeLogicalIdentifier(input.sourceReference.blockId)
    || input.block.id !== input.sourceReference.blockId) {
    return failure("invalid-reference", "Voicing Loop requires safe logical Vault identifiers.");
  }
  if (!supportedSelections.has(input.selection)) {
    return failure("invalid-selection", "Voicing Loop selection is not supported.");
  }
  if (!isSupportedBpm(input.block.bpm)) {
    return failure("invalid-bpm", "Voicing Loop BPM must be between 30 and 240.");
  }
  if (normalizeMeter(input.block.timeSignature) !== "4/4") {
    return failure("unsupported-meter", "Voicing Loop currently requires an explicit 4/4 meter.");
  }
  if (input.block.detectedKey !== undefined && !isSafeKey(input.block.detectedKey)) {
    return failure("invalid-key", "Voicing Loop key metadata is not supported.");
  }
  if (!Array.isArray(input.block.chords) || input.block.chords.length === 0) {
    return failure("empty-progression", "Voicing Loop requires at least one chord.");
  }

  const normalizedKey = input.block.detectedKey?.trim();
  const normalized = normalizeEvents(input.block.chords, input.selection);
  if (!normalized.ok) return normalized;
  const source = Object.freeze({
    kind: "vault" as const,
    reference: Object.freeze({
      ideaId: input.sourceReference.ideaId,
      blockId: input.sourceReference.blockId,
    }),
  });
  const withoutFingerprint = Object.freeze({
    version: PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
    source,
    selection: input.selection,
    ...(normalizedKey === undefined ? {} : { key: normalizedKey }),
    bpm: input.block.bpm,
    meter: Object.freeze({ numerator: 4 as const, denominator: 4 as const }),
    lengthBeats: normalized.lengthBeats,
    events: normalized.events,
  });
  const fingerprint = `p527-snapshot-v1-${fnv1a(JSON.stringify(withoutFingerprint))}`;
  return { ok: true, snapshot: Object.freeze({ ...withoutFingerprint, fingerprint }) };
}

function normalizeEvents(
  sourceEvents: readonly SavedProgressionBlock["chords"][number][],
  selection: ProgressionVoicingSelection,
):
  | { readonly ok: true; readonly events: readonly ProgressionPracticeEvent[]; readonly lengthBeats: number }
  | { readonly ok: false; readonly error: ProgressionPracticeSnapshotError } {
  const candidates = sourceEvents.map((event, sourceIndex) => ({
    event,
    sourceIndex,
    absoluteBeat: absoluteBeat(event.bar, event.beat),
  }));
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.event.durationBeats)
      || candidate.event.durationBeats <= 0
      || !isChordSymbol(candidate.event.chord)) {
      return failure("invalid-chord", "Voicing Loop contains an invalid chord or duration.");
    }
    if (!Number.isFinite(candidate.absoluteBeat)) {
      return failure("invalid-timing", "Voicing Loop contains an invalid event position.");
    }
  }
  candidates.sort((left, right) => left.absoluteBeat - right.absoluteBeat || left.sourceIndex - right.sourceIndex);
  const firstBeat = candidates[0]!.absoluteBeat;
  let sourceCursor = firstBeat;
  let previousEndTick = 0;
  const events: ProgressionPracticeEvent[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const { event, absoluteBeat: onset } = candidates[index]!;
    if (Math.abs(onset - sourceCursor) > TIMING_EPSILON) {
      return failure("invalid-timing", "Voicing Loop requires a continuous non-overlapping progression.");
    }
    let startTick: number;
    let endTick: number;
    try {
      progressionPracticeTicksAtBeat(onset);
      startTick = progressionPracticeTicksAtBeat(onset - firstBeat);
      endTick = progressionPracticeTicksAtBeat(onset + event.durationBeats - firstBeat);
    } catch {
      return failure("invalid-timing", "Voicing Loop timing is outside its safe playback grid.");
    }
    if (startTick !== previousEndTick || endTick <= startTick) {
      return failure("invalid-timing", "Voicing Loop timing cannot be represented on its playback grid.");
    }
    const chord = cloneChord(event.chord);
    const selectedVoicing = selectVoicing(event, selection);
    events.push(Object.freeze({
      id: `event-${index + 1}`,
      startBeat: progressionPracticeBeatAtTick(startTick),
      durationBeats: progressionPracticeBeatAtTick(endTick - startTick),
      chord,
      ...(selectedVoicing === undefined ? {} : { voicing: selectedVoicing }),
    }));
    sourceCursor = onset + event.durationBeats;
    previousEndTick = endTick;
  }
  const lengthBeats = progressionPracticeBeatAtTick(previousEndTick);
  if (!(lengthBeats > 0)) {
    return failure("invalid-timing", "Voicing Loop progression length must be positive.");
  }
  return { ok: true, events: Object.freeze(events), lengthBeats };
}

function cloneChord(chord: ChordSymbol): ProgressionPracticeEvent["chord"] {
  const canonical: ChordSymbol = {
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    label: "",
  };
  return Object.freeze({
    root: canonical.root,
    quality: canonical.quality,
    tensions: Object.freeze([...canonical.tensions]),
    ...(canonical.bass === undefined ? {} : { bass: canonical.bass }),
    label: validatedSavedChordLabel(chord, canonical) ?? labelFromSymbol(canonical),
  });
}

function validatedSavedChordLabel(source: ChordSymbol, canonical: ChordSymbol): string | undefined {
  if (typeof source.label !== "string") return undefined;
  const label = source.label.trim();
  if (label.length === 0 || label.length > 64) return undefined;
  const parsed = parseChordLabel(label);
  if (!parsed || !sameChordSemantics(parsed, canonical)) return undefined;
  return label;
}

function sameChordSemantics(left: ChordSymbol, right: ChordSymbol): boolean {
  return left.root === right.root
    && left.quality === right.quality
    && left.bass === right.bass
    && [...left.tensions].sort().join("|") === [...right.tensions].sort().join("|");
}

function selectVoicing(
  event: ChordTimelineItem,
  selection: ProgressionVoicingSelection,
): DetachedPracticeVoicing | undefined {
  if (selection === "source-midi") {
    if (voicingSourceStatus(event.chord, event.voicingMemory).status !== "source") return undefined;
    return cloneSelectedVoicing(event.voicingMemory!.sourceVoicing!, "source-midi");
  }
  if (selection === "custom") {
    const custom = event.voicingMemory?.practiceVoicingOverride;
    if (!custom || voicingCompatibility(custom, event.chord) !== "compatible") return undefined;
    return cloneSelectedVoicing(custom, "custom");
  }
  return undefined;
}

function cloneSelectedVoicing(
  snapshot: VoicingSnapshot,
  kind: DetachedPracticeVoicing["kind"],
): DetachedPracticeVoicing {
  return Object.freeze({
    kind,
    midiNotes: Object.freeze([...snapshot.midiNotes]),
    ...(snapshot.bassNote === undefined ? {} : { bassNote: snapshot.bassNote }),
  });
}

function isChordSymbol(value: ChordSymbol): boolean {
  return Number.isInteger(value.root) && value.root >= 0 && value.root <= 11
    && supportedQualities.has(value.quality)
    && Array.isArray(value.tensions)
    && value.tensions.every((tension) => supportedTensions.has(tension))
    && (value.bass === undefined
      || (Number.isInteger(value.bass) && value.bass >= 0 && value.bass <= 11));
}

function absoluteBeat(bar: number, beat: number): number {
  if (!Number.isSafeInteger(bar) || bar < 1 || !Number.isFinite(beat) || beat < 1 || beat > 4) {
    return Number.NaN;
  }
  const value = (bar - 1) * 4 + beat - 1;
  try {
    progressionPracticeTicksAtBeat(value);
    return value;
  } catch {
    return Number.NaN;
  }
}

function normalizeMeter(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/\s/g, "") : undefined;
}
function isSupportedBpm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 30 && value <= 240;
}
function isSafeKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-G](?:#|b){0,2} (?:major|minor)$/.test(value.trim());
}
function isSafeLogicalIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    && !/^[A-Za-z]:/.test(value);
}
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function failure(
  code: ProgressionPracticeSnapshotError["code"],
  message: string,
): { readonly ok: false; readonly error: ProgressionPracticeSnapshotError } {
  return { ok: false, error: { code, message } };
}
