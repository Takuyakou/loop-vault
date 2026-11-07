import {
  buildSessionAnalysisRequest,
  type AnalysisSession,
  type AnalysisSessionVoice,
  type PreAnalysisControlChange,
  type PreAnalysisNote,
  type SessionAnalysisRequest,
} from "../midi/preAnalysis";
import type { MidiSongData, Voice } from "../midi/types";

/**
 * P15-02 「線で分ける」. A part can be split by pitch into a lower part (chords) and an upper part
 * (melody). The notes of the upper part are handed to the analysis as 「使わない」 (they are left out of
 * the analysis input) and are put back for display after the analysis (`restoreExcluded.ts`).
 * The split lives only in a *derived session* that is used to build the analysis request.
 * The screen's own session keeps the original parts, so the correction log, the part list and the
 * saved data never see a made-up part. Nothing under `src/domain/midi/**` is changed: the derived
 * session is an ordinary `AnalysisSession` that `buildSessionAnalysisRequest` accepts as it is.
 */
export interface PartSplit {
  /** Notes at or above this pitch are the melody (the note on the line is melody). */
  melodyFrom: number;
  /** Optional second line: notes below it are bass. Not offered by the screen yet. */
  bassBelow?: number;
}

export type PartSplits = Readonly<Record<string, PartSplit>>;
export type PartSide = "lower" | "upper" | "bass";

export interface PartOrigin {
  partId: string;
  side: PartSide;
}

export interface PartMap {
  /** The parts that reached the analysis, in order: index = the `trackIndex` after analysis. */
  preparedOrder: readonly string[];
  /** Made-up part id → the part it came from. Parts that were not split are not in here. */
  origin: ReadonlyMap<string, PartOrigin>;
}

/** The notes above a line: not analysed, shown again in the correction workspace. */
export interface ExcludedPart {
  partId: string;
  /** The notes of the original session (not copies). */
  notes: readonly PreAnalysisNote[];
  melodyFrom: number;
}

export interface SplitRequest {
  request: SessionAnalysisRequest;
  map: PartMap;
  excluded: readonly ExcludedPart[];
  /** A note of the derived session → the original session's note it was made from (split parts only). */
  originalOf: ReadonlyMap<PreAnalysisNote, PreAnalysisNote>;
  /** What was handed to `buildSessionAnalysisRequest` (the original session when nothing is split). */
  derived: AnalysisSession;
}

/** Drums, duplicates and unused parts have no line. Lines are only for chord parts. */
export function canSplitPart(voice: AnalysisSessionVoice): boolean {
  return !voice.isDrum
    && voice.duplicateOf === undefined
    && voice.included
    && voice.assignedRole === "harmony";
}

const SUFFIX: Readonly<Record<PartSide, string>> = {
  lower: "（線より下）",
  upper: "（線より上）",
  bass: "（ベースの境目より下）",
};

/**
 * The session the analysis request is built from. With no (usable) line it is the same object.
 *
 * Made-up parts and the two rules of `analyzerInput.ts` this relies on (if either rule changes the
 * lines silently stop working; `splitSession.test.ts` and `splitGate.test.ts` guard both):
 *  (a) with 「アプリに任せる」 (harmonic-core) a part whose `assignedRole === autoRole` is NOT passed as a
 *      role override (`buildPreparedAnalysisInput`);
 *  (b) a session is "backward equivalent" (analysed from the file's bytes, ignoring the session) only
 *      when every part has `assignedRole === autoRole` (`isBackwardEquivalentSession`);
 *  (c) a part with `included: false` or the role `exclude` is not handed to the analysis at all
 *      (`isSelectedVoice`), which is how the notes above the line are left out.
 * So each made-up part has an `autoRole` that differs from its `assignedRole`: its role always
 * reaches the analysis as an override, and a split session never takes the bytes route.
 */
export function deriveSplitSession(
  session: AnalysisSession,
  splits: PartSplits,
): {
  session: AnalysisSession;
  origin: Map<string, PartOrigin>;
  excluded: ExcludedPart[];
  /** A note of the derived session → the note of the original session it was made from. */
  originalOf: Map<PreAnalysisNote, PreAnalysisNote>;
} {
  const origin = new Map<string, PartOrigin>();
  const excluded: ExcludedPart[] = [];
  const originalOf = new Map<PreAnalysisNote, PreAnalysisNote>();
  // A line only counts when something is left below it and something is above it: a line that
  // leaves nothing below cannot be placed (P15-02 B), and one with nothing above changes nothing.
  const splitIds = new Set<string>();
  const pitchesOf = new Map<string, number[]>();
  for (const note of session.notes) {
    const list = pitchesOf.get(note.voiceId);
    if (list) list.push(note.pitch);
    else pitchesOf.set(note.voiceId, [note.pitch]);
  }
  for (const voice of session.voices) {
    const split = splits[voice.id];
    if (split === undefined || !canSplitPart(voice)) continue;
    const pitches = pitchesOf.get(voice.id) ?? [];
    const below = pitches.some((pitch) => pitch < split.melodyFrom);
    const above = pitches.some((pitch) => pitch >= split.melodyFrom);
    if (below && above) splitIds.add(voice.id);
  }
  if (!splitIds.size) return { session, origin, excluded, originalOf };

  const sideOf = (note: PreAnalysisNote, split: PartSplit): PartSide =>
    note.pitch >= split.melodyFrom
      ? "upper"
      : split.bassBelow !== undefined && note.pitch < split.bassBelow
        ? "bass"
        : "lower";

  const notesByVoice = new Map<string, PreAnalysisNote[]>();
  for (const note of session.notes) {
    if (!splitIds.has(note.voiceId)) continue;
    const list = notesByVoice.get(note.voiceId);
    if (list) list.push(note);
    else notesByVoice.set(note.voiceId, [note]);
  }

  const voices: AnalysisSessionVoice[] = [];
  const notes: PreAnalysisNote[] = [];
  const controlChanges: PreAnalysisControlChange[] = [];
  const madeUp = new Map<string, string[]>();

  for (const voice of session.voices) {
    if (!splitIds.has(voice.id)) {
      voices.push(voice);
      continue;
    }
    const split = splits[voice.id]!;
    const own = notesByVoice.get(voice.id) ?? [];
    const bySide: Record<PartSide, PreAnalysisNote[]> = { lower: [], upper: [], bass: [] };
    for (const note of own) bySide[sideOf(note, split)].push(note);
    const order: PartSide[] = ["bass", "lower", "upper"];
    const ids: string[] = [];
    excluded.push({ partId: voice.id, notes: bySide.upper, melodyFrom: split.melodyFrom });
    for (const side of order) {
      const sideNotes = bySide[side];
      if (!sideNotes.length) continue;
      const id = `${voice.id}~${side}`;
      ids.push(id);
      origin.set(id, { partId: voice.id, side });
      const pitches = sideNotes.map((note) => note.pitch);
      voices.push({
        ...voice,
        id,
        displayName: `${voice.displayName}${SUFFIX[side]}`,
        noteCount: sideNotes.length,
        minPitch: Math.min(...pitches),
        maxPitch: Math.max(...pitches),
        averageDurationBeats: average(sideNotes.map((note) => note.durationBeats)),
        averagePolyphony: averagePolyphony(sideNotes),
        // The upper part is left out of the analysis (rule (c)): it is only kept so that the
        // session still shows where its notes went.
        assignedRole: side === "upper" ? "exclude" : side === "bass" ? "bass" : "harmony",
        // Differs from `assignedRole` on purpose (rules (a) and (b) above).
        autoRole: side === "lower" ? "exclude" : "harmony",
        included: side !== "upper",
      });
      for (const note of sideNotes) {
        const copy = { ...note, voiceId: id };
        originalOf.set(copy, note);
        notes.push(copy);
      }
    }
    madeUp.set(voice.id, ids);
  }
  for (const note of session.notes) {
    if (!splitIds.has(note.voiceId)) notes.push(note);
  }
  for (const change of session.controlChanges) {
    const ids = madeUp.get(change.voiceId);
    if (!ids) {
      controlChanges.push(change);
      continue;
    }
    // The pedal belongs to the whole part: every made-up part keeps it, so a note rings as long as before.
    for (const id of ids) controlChanges.push({ ...change, voiceId: id });
  }
  return { session: { ...session, voices, notes, controlChanges }, origin, excluded, originalOf };
}

/**
 * The one place the analysis request is built. Used by the analyse button and by the 「アプリに任せる」
 * preview, so both see the same parts.
 */
export function buildSplitAnalysisRequest(
  session: AnalysisSession,
  splits: PartSplits,
): SplitRequest {
  const { session: derived, origin, excluded, originalOf } = deriveSplitSession(session, splits);
  const request = buildSessionAnalysisRequest(derived);
  return {
    request,
    derived,
    excluded,
    originalOf,
    map: { preparedOrder: request.selectedVoiceIds, origin },
  };
}

/**
 * After the analysis a part is known by its place in the order it was handed over. This gives each
 * of them the name of the part it came from (the notes are not touched: the made-up part's
 * melody role is what makes the workspace and the saved voicing treat those notes as melody).
 */
export function restorePartNames(
  voices: readonly Voice[],
  map: PartMap,
  nameOf: (partId: string) => string | undefined,
): Voice[] {
  return voices.map((voice) => {
    const preparedId = map.preparedOrder[voice.trackIndex];
    if (preparedId === undefined) return voice;
    const origin = map.origin.get(preparedId);
    const partId = origin?.partId ?? preparedId;
    const base = nameOf(partId);
    if (!base) return voice;
    return { ...voice, trackName: `${base}${origin ? SUFFIX[origin.side] : ""}` };
  });
}

export interface OriginalNote {
  partId: string;
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity: number;
  program?: number;
}

/**
 * The analysis's notes, put back under the original parts (for checking that nothing was lost,
 * added or changed by splitting).
 */
export function originalNotesOf(preparedData: MidiSongData, map: PartMap): OriginalNote[] {
  return preparedData.notes.map((note) => {
    const preparedId = map.preparedOrder[note.trackIndex];
    const partId = preparedId === undefined
      ? `?${note.trackIndex}`
      : map.origin.get(preparedId)?.partId ?? preparedId;
    return {
      partId,
      pitch: note.pitch,
      startTick: note.startTick,
      durationTick: note.durationTick,
      velocity: note.velocity,
      ...(note.program !== undefined ? { program: note.program } : {}),
    };
  });
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** Average number of notes sounding at each note's start (the same idea as the part card's figure). */
function averagePolyphony(notes: readonly PreAnalysisNote[]): number {
  if (!notes.length) return 0;
  const starts = notes.map((note) => note.startBeat).sort((a, b) => a - b);
  const ends = notes.map((note) => note.startBeat + note.durationBeats).sort((a, b) => a - b);
  const countAtMost = (sorted: readonly number[], value: number) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle]! <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  let total = 0;
  for (const note of notes) {
    const at = note.startBeat + 1e-9;
    total += countAtMost(starts, at) - countAtMost(ends, at);
  }
  return total / notes.length;
}
