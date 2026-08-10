import {
  buildCandidateEventsInBeatRange,
  summaryFromEvents,
  type CandidateChordEvent,
} from "./midi/candidateBlock";
import { timelineRangeBeats } from "./midi/manualRange";
import type { ManualCandidateDraft } from "./midi/manualDraft";
import { createEditableProgression, setEditableVoicingMemory } from "./progressionEditing";
import type { EditableProgression } from "./progressionEditing";
import type { ChordVoicingMemory, ChordTimelineItem, VoicingSnapshot } from "./types";
import { confirmedTextProgressionKeyState } from "./textProgression";
import type { TextProgressionEvent, TextProgressionParseResult } from "./textProgression";
import { isValidVoicingSnapshot, voicingCompatibility } from "./voicing";

/**
 * Session-only Live MIDI overrides chosen while inspecting Text Progression
 * cards. Keys are canonical text event identities, never raw input offsets or
 * source MIDI identifiers. The bridge resolves them to editable slot IDs only
 * after the existing ManualCandidateDraft has been created.
 */
export type TextProgressionVoicingOverrides = ReadonlyMap<string, ChordVoicingMemory | undefined>;

export interface CreateTextProgressionDraftInput {
  readonly result: TextProgressionParseResult;
  readonly voicingOverrides?: TextProgressionVoicingOverrides;
  /** Supplied by callers/tests when a reproducible session Draft is useful. */
  readonly now?: string;
  readonly draftId?: string;
}

export interface TextProgressionDraftSavePayload {
  readonly title: string;
  readonly nextAction: string;
  readonly chords: readonly ChordTimelineItem[];
  readonly summaryText: string;
  readonly userEdited: boolean;
  readonly userVerified: boolean;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}

export interface CreateTextProgressionDraftSavePayloadInput {
  /** A human-edited title; invalid/empty input falls back to the canonical seed. */
  readonly title: string;
  readonly nextAction: string;
  readonly userVerified: boolean;
  /** Omit until the person explicitly supplies a valid BPM. */
  readonly bpm?: number;
  /** Omit unless the person explicitly confirmed this key. */
  readonly confirmedKey?: string;
}

/**
 * Converts a fully valid transient text result into the existing session-only
 * ManualCandidateDraft. It deliberately builds CandidateChordEvent records
 * directly from the text timeline rather than creating a ProgressionBlockCandidate:
 * the text grammar allows every whole-bar length from one through twelve.
 */
export function createTextProgressionDraft(
  input: CreateTextProgressionDraftInput,
): ManualCandidateDraft {
  const { result } = input;
  if (!result.canConvert || result.events.length === 0 || result.bars < 1 || result.bars > 12) {
    throw new Error("A fully valid Text Progression result is required before conversion.");
  }

  const timeline = textProgressionTimeline(result);
  const events = buildCandidateEventsInBeatRange(timeline, 0, result.bars * 4, 4)
    .map(cloneTextDraftEvent);
  const createdAt = input.now ?? new Date().toISOString();
  const draft: ManualCandidateDraft = {
    draftId: input.draftId ?? `text-draft-${textProgressionSessionFingerprint(result)}-${createdAt}`,
    source: { type: "text-progression" },
    // This required legacy Draft field is a session-only digest of canonical
    // parsed timing/labels, not a MIDI source fingerprint.
    sourceTimelineFingerprint: textProgressionSessionFingerprint(result),
    selectedRange: { startBar: 1, startBeat: 1, endBar: result.bars, endBeat: 4 },
    events,
    originalEvents: events.map(cloneTextDraftEvent),
    repairOperations: [{ type: "create-from-text" }],
    createdAt,
    isDirty: false,
    snapMode: "beat",
    history: [],
    historyIndex: -1,
    beatsPerBar: 4,
    lengthBars: result.bars,
    warnings: [],
  };
  return applyTextVoicingOverrides(draft, input.voicingOverrides);
}

/** A stable card identity based only on canonical parsed timing and label. */
export function textProgressionEventKey(
  event: Pick<TextProgressionEvent, "bar" | "startBeat" | "durationBeats" | "canonical">,
): string {
  return `${event.bar}:${event.startBeat}:${event.durationBeats}:${event.canonical}`;
}

/**
 * Text-only adapter for the existing shared chord editor. It passes only the
 * `id` and detached text timeline that `createEditableProgression` actually
 * needs; it never constructs or casts a ProgressionBlockCandidate.
 */
export function textProgressionDraftEditable(draft: ManualCandidateDraft): EditableProgression {
  if (draft.source.type !== "text-progression") {
    throw new Error("Text progression editable requested for a non-text Draft.");
  }
  return createEditableProgression({
    id: draft.draftId,
    chords: textProgressionDraftTimeline(draft),
  }, draft.beatsPerBar);
}

/**
 * Returns the exact current ManualCandidateDraft music without constructing a
 * ProgressionBlockCandidate. This supports the grammar's full 1 to 12 bar
 * range and keeps text out of MIDI candidate/analyzer adapters.
 */
export function textProgressionDraftTimeline(draft: ManualCandidateDraft): ChordTimelineItem[] {
  if (draft.source.type !== "text-progression") {
    throw new Error("Text progression timeline requested for a non-text Draft.");
  }
  const { startBeat } = timelineRangeBeats(draft.selectedRange, draft.beatsPerBar);
  return draft.events.map((event) => {
    const absolute = startBeat + event.relativeStartBeat;
    const memory = practiceOnlyMemory(event.source.voicingMemory, event.chord);
    return {
      bar: Math.floor(absolute / draft.beatsPerBar) + 1,
      beat: (absolute % draft.beatsPerBar) + 1,
      durationBeats: event.durationBeats,
      chord: cloneChord(event.chord),
      // The shared timeline requires a number. Zero is the no-analysis sentinel
      // for this text-only path and is never surfaced as analyzer evidence.
      confidence: 0,
      alternatives: [],
      warnings: [...event.warnings],
      ...(memory === undefined ? {} : { voicingMemory: memory }),
    };
  });
}

/**
 * Builds the data passed to the store-owned text save adapter. It deliberately
 * has no candidate, source MIDI, analyzer, filename, path, or fingerprint
 * fields.
 */
export function textProgressionDraftSavePayload(
  draft: ManualCandidateDraft,
  input: CreateTextProgressionDraftSavePayloadInput,
): TextProgressionDraftSavePayload {
  const chords = textProgressionDraftTimeline(draft);
  const canonicalTitle = textProgressionDraftTitleFromChords(chords, input.confirmedKey);
  const editedTitle = input.title.trim().slice(0, 80);
  return {
    title: editedTitle || canonicalTitle,
    nextAction: input.nextAction,
    chords,
    summaryText: summaryFromEvents(draft.events, draft.lengthBars, draft.beatsPerBar),
    userEdited: draft.isDirty,
    userVerified: input.userVerified,
    ...(isExplicitBpm(input.bpm) ? { bpm: input.bpm } : {}),
    ...(input.confirmedKey?.trim() ? { confirmedKey: input.confirmedKey.trim() } : {}),
  };
}

function textProgressionDraftTitleFromChords(
  chords: readonly ChordTimelineItem[],
  confirmedKey: string | undefined,
): string {
  const labels = chords.slice(0, 4).map((chord) => chord.chord.label);
  const suffix = chords.length > labels.length ? " ..." : "";
  const progression = `${labels.join(" / ")}${suffix}`.trim();
  const keyState = confirmedTextProgressionKeyState(confirmedKey);
  const key = keyState.kind === "confirmed" ? keyState.key : "";
  return (key && progression ? `${key} - ${progression}` : progression || "Text progression").slice(0, 80);
}

/**
 * A safe, canonical save-title seed. It is built only from canonical parser
 * labels and an explicitly confirmed key, never raw text, capture title,
 * filename, source path, or MIDI analysis output.
 */
export function textProgressionDraftTitle(result: TextProgressionParseResult): string {
  const labels = result.events.slice(0, 4).map((event) => event.canonical);
  const suffix = result.events.length > labels.length ? " ..." : "";
  const progression = `${labels.join(" / ")}${suffix}`.trim();
  const key = result.keyState.kind === "confirmed" ? result.keyState.key : "";
  const title = key && progression ? `${key} - ${progression}` : progression || "Text progression";
  return title.slice(0, 80);
}

/** Returns a detached, no-analysis timeline from the valid transient parser result. */
export function textProgressionTimeline(result: TextProgressionParseResult): ChordTimelineItem[] {
  return result.events.map((event) => ({
    bar: event.bar,
    beat: event.startBeat,
    durationBeats: event.durationBeats,
    chord: cloneChord(event.chord),
    confidence: 0,
    alternatives: [],
    warnings: [],
  }));
}

function applyTextVoicingOverrides(
  draft: ManualCandidateDraft,
  overrides: TextProgressionVoicingOverrides | undefined,
): ManualCandidateDraft {
  if (!overrides?.size) return draft;
  let editable = textProgressionDraftEditable(draft);
  const slotsByKey = new Map(editable.slots.map((slot) => [
    `${slot.position.bar}:${slot.position.beat}:${slot.position.durationBeats}:${slot.currentChord.label}`,
    slot,
  ]));
  for (const [eventKey, memory] of overrides) {
    const slot = slotsByKey.get(eventKey);
    const practice = slot ? practiceOnlyMemory(memory, slot.currentChord) : undefined;
    if (slot && practice) editable = setEditableVoicingMemory(editable, slot.id, practice);
  }
  const events = draft.events.map((event, index) => {
    const slot = editable.slots[index];
    const memory = slot ? practiceOnlyMemory(slot.voicingMemory, event.chord) : undefined;
    return {
      ...cloneTextDraftEvent(event),
      source: {
        ...cloneTimelineEvent(event.source),
        ...(memory === undefined ? {} : { voicingMemory: memory }),
      },
    };
  });
  return { ...draft, events, originalEvents: events.map(cloneTextDraftEvent) };
}

/** Keep only a compatible Live MIDI practice override; no source voicing is valid here. */
function practiceOnlyMemory(
  memory: ChordVoicingMemory | undefined,
  chord: ChordTimelineItem["chord"],
): ChordVoicingMemory | undefined {
  const override = memory?.practiceVoicingOverride;
  if (
    !override
    || override.source !== "live-played"
    || override.representation !== "simultaneous-voicing"
    || !isValidVoicingSnapshot(override)
    || voicingCompatibility(override, chord) !== "compatible"
  ) return undefined;
  return { practiceVoicingOverride: cloneVoicingSnapshot(override) };
}

function cloneTextDraftEvent(event: CandidateChordEvent): CandidateChordEvent {
  return {
    ...event,
    chord: cloneChord(event.chord),
    warnings: [...event.warnings],
    source: cloneTimelineEvent(event.source),
  };
}

function cloneTimelineEvent(event: ChordTimelineItem): ChordTimelineItem {
  const memory = practiceOnlyMemory(event.voicingMemory, event.chord);
  return {
    ...event,
    chord: cloneChord(event.chord),
    alternatives: [],
    warnings: [...event.warnings],
    ...(memory === undefined ? {} : { voicingMemory: memory }),
  };
}

function cloneVoicingSnapshot(snapshot: VoicingSnapshot): VoicingSnapshot {
  return { ...snapshot, midiNotes: [...snapshot.midiNotes] };
}

function cloneChord(chord: ChordTimelineItem["chord"]): ChordTimelineItem["chord"] {
  return { ...chord, tensions: [...chord.tensions] };
}

function isExplicitBpm(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 30 && value <= 240;
}

function textProgressionSessionFingerprint(result: TextProgressionParseResult): string {
  let hash = 0x811c9dc5;
  const feed = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  feed(`4|${result.bars}|${result.events.length}`);
  for (const event of result.events) {
    feed(`;${textProgressionEventKey(event)}`);
  }
  return `text-progression-${hash.toString(16).padStart(8, "0")}`;
}
