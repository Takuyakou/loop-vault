export interface NoteTextureInput {
  readonly id: string;
  readonly pitch: number;
  readonly startBeat: number;
  readonly endBeat: number;
}

export interface NoteTextureFeatures {
  readonly noteId: string;
  readonly isLocalTop: boolean;
  readonly pitchRank: number;
  readonly lowerSupportCount: number;
  readonly lowerSupportCoverage: number;
  readonly durationRatioToLowerBed: number;
  readonly onsetIndependence: number;
  readonly topLineContinuity: number;
  readonly melodicMotionContinuity: number;
  readonly sustainedExtensionProtection: number;
  readonly localTextureStability: number;
}

const supportThreshold = 2;
const lineGapBeats = 1.5;
const lineLeapSemitones = 12;

/**
 * Extracts pre-chord, per-note local texture evidence for one pitched Voice.
 * The function has no chord, candidate, boundary, role, or persistence input.
 */
export function extractNoteTextureFeatures(
  input: readonly NoteTextureInput[],
): readonly NoteTextureFeatures[] {
  const notes = normalizeInput(input);
  const base = notes.map((note) => baseFeatures(note, notes));
  const localTopIndices = base.flatMap((entry, index) => entry.isLocalTop ? [index] : []);
  const line = new Map<number, { top: number; motion: number }>();
  for (const [position, index] of localTopIndices.entries()) {
    const previousIndex = localTopIndices[position - 1];
    const nextIndex = localTopIndices[position + 1];
    const previous = previousIndex === undefined ? undefined : notes[previousIndex];
    const next = nextIndex === undefined ? undefined : notes[nextIndex];
    const current = notes[index];
    const links = [previous, next].filter((value): value is NoteTextureInput => value !== undefined)
      .map((neighbor) => lineLink(current, neighbor));
    line.set(index, {
      top: average(links.map((entry) => entry.connected)),
      motion: average(links.map((entry) => entry.melodic)),
    });
  }
  return base.map((entry, index) => ({
    ...entry,
    topLineContinuity: line.get(index)?.top ?? 0,
    melodicMotionContinuity: line.get(index)?.motion ?? 0,
  }));
}

function baseFeatures(
  note: NoteTextureInput,
  notes: readonly NoteTextureInput[],
): Omit<NoteTextureFeatures, "topLineContinuity" | "melodicMotionContinuity"> {
  const overlapping = notes.filter((candidate) => candidate.id !== note.id && overlaps(note, candidate));
  const lower = overlapping.filter((candidate) => candidate.pitch < note.pitch);
  const higher = overlapping.filter((candidate) => candidate.pitch > note.pitch);
  const simultaneous = [note, ...overlapping];
  const lowerCoverage = supportCoverage(note, lower, supportThreshold);
  const duration = note.endBeat - note.startBeat;
  const lowerDurations = lower.map((candidate) => candidate.endBeat - candidate.startBeat)
    .sort((left, right) => left - right);
  const lowerMedian = median(lowerDurations);
  const durationRatio = lowerMedian > 0 ? clamp01(duration / lowerMedian) : 1;
  const establishedLower = lower.filter((candidate) => candidate.startBeat < note.startBeat).length;
  const alignedLower = lower.filter((candidate) => candidate.startBeat === note.startBeat).length;
  const onsetIndependence = lower.length > 0 ? establishedLower / lower.length : 0;
  const onsetAlignment = lower.length > 0 ? alignedLower / lower.length : 0;
  const pitchRank = simultaneous.length <= 1
    ? 1
    : simultaneous.filter((candidate) => candidate.pitch <= note.pitch).length / simultaneous.length;
  const isLocalTop = higher.length === 0;
  const textureStability = clamp01(lowerCoverage * 0.7 + onsetAlignment * 0.3);
  const sustainedProtection = clamp01(
    durationRatio * 0.45 + (1 - onsetIndependence) * 0.25 + textureStability * 0.3,
  );
  return {
    noteId: note.id,
    isLocalTop,
    pitchRank,
    lowerSupportCount: lower.length,
    lowerSupportCoverage: lowerCoverage,
    durationRatioToLowerBed: durationRatio,
    onsetIndependence,
    sustainedExtensionProtection: sustainedProtection,
    localTextureStability: textureStability,
  };
}

function normalizeInput(input: readonly NoteTextureInput[]): NoteTextureInput[] {
  const ids = new Set<string>();
  return input.map((note) => {
    if (!note.id || ids.has(note.id)) throw new Error("note texture ids must be unique and non-empty");
    ids.add(note.id);
    if (![note.pitch, note.startBeat, note.endBeat].every(Number.isFinite)
      || note.pitch < 0
      || note.pitch > 127
      || note.startBeat < 0
      || note.endBeat <= note.startBeat) {
      throw new Error("note texture input is invalid");
    }
    return { ...note };
  }).sort((left, right) => left.startBeat - right.startBeat
    || left.endBeat - right.endBeat
    || left.pitch - right.pitch
    || stableTextCompare(left.id, right.id));
}

function supportCoverage(
  note: NoteTextureInput,
  lower: readonly NoteTextureInput[],
  required: number,
): number {
  const events = lower.flatMap((candidate) => {
    const start = Math.max(note.startBeat, candidate.startBeat);
    const end = Math.min(note.endBeat, candidate.endBeat);
    return end > start ? [{ beat: start, delta: 1 }, { beat: end, delta: -1 }] : [];
  }).sort((left, right) => left.beat - right.beat || left.delta - right.delta);
  let active = 0;
  let previous = note.startBeat;
  let covered = 0;
  for (const event of events) {
    if (active >= required) covered += event.beat - previous;
    active += event.delta;
    previous = event.beat;
  }
  if (active >= required) covered += note.endBeat - previous;
  return clamp01(covered / (note.endBeat - note.startBeat));
}

function lineLink(
  current: NoteTextureInput,
  neighbor: NoteTextureInput,
): { connected: number; melodic: number } {
  const chronological = current.startBeat <= neighbor.startBeat
    ? { first: current, second: neighbor }
    : { first: neighbor, second: current };
  const gap = Math.max(0, chronological.second.startBeat - chronological.first.endBeat);
  const interval = Math.abs(current.pitch - neighbor.pitch);
  const connected = gap <= lineGapBeats && interval <= lineLeapSemitones ? 1 : 0;
  const melodic = connected && interval > 0 && interval <= 7 ? 1 : 0;
  return { connected, melodic };
}

function overlaps(left: NoteTextureInput, right: NoteTextureInput): boolean {
  return left.startBeat < right.endBeat && right.startBeat < left.endBeat;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
    : values[middle] ?? 0;
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableTextCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
