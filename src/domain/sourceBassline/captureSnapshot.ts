import type { ProgressionBlockCandidate } from "../types";
import type { AnalysisSession, AnalysisSessionVoice } from "../midi/preAnalysis/types";
import { buildSessionAnalysisRequest } from "../midi/preAnalysis/analyzerInput";
import { fingerprintMidiBytes } from "../midi/fingerprint";
import { extractSourceBasslineSnapshot } from "./snapshot";
import type { SourceBasslineSnapshotV1 } from "./types";

export type CaptureSnapshotReason =
  | "select-voice"
  | "voice-ineligible"
  | "source-unavailable"
  | "source-misaligned"
  | "analysis-unavailable"
  | "analysis-mismatch"
  | "range-ineligible"
  | "meter-ineligible"
  | "timing-unavailable"
  | "empty"
  | "invalid-or-over-budget";

export interface SourceBasslineCaptureAssessment {
  readonly snapshot?: SourceBasslineSnapshotV1;
  readonly reason?: CaptureSnapshotReason;
  readonly bars: number;
  readonly noteCount: number;
  readonly hasSimultaneousNotes: boolean;
  readonly hasOverlappingNotes: boolean;
  readonly rangeKey: string;
}

export function sourceBasslineCandidateVoices(
  session: AnalysisSession | undefined,
): readonly AnalysisSessionVoice[] {
  return session?.voices.filter((voice) =>
    !voice.isDrum
    && voice.included
    && voice.duplicateOf === undefined
    && voice.assignedRole === "bass") ?? [];
}

export function sourceBasslineCandidateRangeKey(
  candidate: Pick<ProgressionBlockCandidate, "id" | "startBar" | "endBar">,
): string {
  return `${candidate.id}:${candidate.startBar}:${candidate.endBar}`;
}

export function sourceBasslineAuthorizationKey(
  candidate: Pick<ProgressionBlockCandidate, "id" | "startBar" | "endBar" | "chords">,
  selectedVoiceId: string,
  analysisFingerprint: string | undefined,
): string {
  return JSON.stringify({
    analysisFingerprint: analysisFingerprint ?? null,
    selectedVoiceId,
    candidate: {
      id: candidate.id,
      startBar: candidate.startBar,
      endBar: candidate.endBar,
      chords: candidate.chords.map((event) => ({
        eventId: event.eventId ?? null,
        bar: event.bar,
        beat: event.beat,
        durationBeats: event.durationBeats,
        chord: {
          root: event.chord.root,
          quality: event.chord.quality,
          tensions: event.chord.tensions,
          bass: event.chord.bass ?? null,
          label: event.chord.label,
        },
      })),
    },
  });
}
export function sourceBasslineAnalysisAuthority(
  session: AnalysisSession | undefined,
): string | undefined {
  if (!session || session.sources.length === 0) return undefined;
  try {
    const request = buildSessionAnalysisRequest(session);
    return request.options.analysisFingerprint ?? fingerprintMidiBytes(request.bytes);
  } catch {
    return undefined;
  }
}

export function assessManualSourceBasslineCapture(
  session: AnalysisSession | undefined,
  candidate: Pick<ProgressionBlockCandidate, "id" | "startBar" | "endBar">,
  range: { readonly startBeat: number; readonly endBeat: number },
  beatsPerBar: number,
  selectedVoiceId: string,
  analysisFingerprint: string | undefined,
): SourceBasslineCaptureAssessment {
  if (beatsPerBar !== 4 || range.startBeat !== 1 || range.endBeat !== 4) {
    return {
      ...assessSourceBasslineCapture(session, candidate, "", analysisFingerprint),
      reason: "range-ineligible",
    };
  }
  return assessSourceBasslineCapture(
    session, candidate, selectedVoiceId, analysisFingerprint,
  );
}

export function assessSourceBasslineCapture(
  session: AnalysisSession | undefined,
  candidate: Pick<ProgressionBlockCandidate, "id" | "startBar" | "endBar">,
  selectedVoiceId: string,
  analysisFingerprint: string | undefined,
): SourceBasslineCaptureAssessment {
  const rangeKey = sourceBasslineCandidateRangeKey(candidate);
  const bars = candidate.endBar - candidate.startBar + 1;
  const empty = {
    bars: Number.isSafeInteger(bars) ? bars : 0,
    noteCount: 0,
    hasSimultaneousNotes: false,
    hasOverlappingNotes: false,
    rangeKey,
  };
  if (!selectedVoiceId) return { ...empty, reason: "select-voice" };
  const voice = sourceBasslineCandidateVoices(session).find((entry) => entry.id === selectedVoiceId);
  if (!session || !voice) return { ...empty, reason: "voice-ineligible" };
  const source = session.sources.find((entry) => entry.id === voice.sourceId);
  if (!source) return { ...empty, reason: "source-unavailable" };
  if (source.id !== session.masterSourceId) {
    return { ...empty, reason: "source-misaligned" };
  }
  const expectedAnalysisFingerprint = sourceBasslineAnalysisAuthority(session);
  if (!expectedAnalysisFingerprint || !analysisFingerprint) {
    return { ...empty, reason: "analysis-unavailable" };
  }
  if (analysisFingerprint !== expectedAnalysisFingerprint) {
    return { ...empty, reason: "analysis-mismatch" };
  }
  if (!Number.isSafeInteger(candidate.startBar)
    || !Number.isSafeInteger(candidate.endBar)
    || candidate.startBar < 1
    || bars < 1
    || bars > 12) {
    return { ...empty, reason: "range-ineligible" };
  }
  if (!source.timeSignatures.length
    || source.timeSignatures[0]?.beat !== 0
    || source.timeSignatures.some((meter) =>
      meter.numerator !== 4 || meter.denominator !== 4)) {
    return { ...empty, reason: "meter-ineligible" };
  }
  const ppq = source.ppq;
  if (!Number.isSafeInteger(ppq) || ppq <= 0) {
    return { ...empty, reason: "timing-unavailable" };
  }
  const sourceNotes = session.notes.filter((note) => note.sourceId === source.id);
  const voiceNotes = sourceNotes.filter((note) => note.voiceId === voice.id);
  if (!Number.isSafeInteger(source.durationTick) || source.durationTick! <= 0
    || !voiceNotes.length || sourceNotes.some((note) =>
      !Number.isSafeInteger(note.startTick)
      || !Number.isSafeInteger(note.durationTick)
      || note.startTick! < 0
      || note.durationTick! <= 0
      || note.ticksPerQuarter !== ppq)) {
    return { ...empty, reason: "timing-unavailable" };
  }
  try {
    const barTicks = checkedMultiply(ppq, 4);
    const startTick = checkedMultiply(candidate.startBar - 1, barTicks);
    const endTick = checkedMultiply(candidate.endBar, barTicks);
    const sourceEndTick = source.durationTick!;
    if (sourceNotes.some((note) =>
      checkedAdd(note.startTick!, note.durationTick!) > sourceEndTick)) {
      return { ...empty, reason: "timing-unavailable" };
    }
    if (endTick > sourceEndTick) return { ...empty, reason: "range-ineligible" };
    const intersectingNoteCount = voiceNotes.filter((note) =>
      note.startTick! < endTick
      && checkedAdd(note.startTick!, note.durationTick!) > startTick).length;
    if (intersectingNoteCount === 0) return { ...empty, reason: "empty" };
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: voice.sourceId,
      selectedVoiceId: voice.id,
      notes: voiceNotes.map((note, index) => ({
        sourceId: note.sourceId,
        voiceId: note.voiceId,
        pitch: note.pitch,
        velocity: note.velocity,
        startTick: note.startTick!,
        durationTick: note.durationTick!,
        ticksPerQuarter: note.ticksPerQuarter!,
        sourceEventIndex: index,
      })),
      range: {
        authority: "raw-integer-ticks",
        constantMeterProven: true,
        barAlignmentProven: true,
        sourceId: voice.sourceId,
        startTick,
        endTick,
        sourceEndTick,
        ticksPerQuarter: ppq,
        meter: { numerator: 4, denominator: 4 },
      },
    });
    const facts = noteFacts(snapshot);
    return { snapshot, bars, rangeKey, ...facts };
  } catch {
    return { ...empty, reason: "invalid-or-over-budget" };
  }
}

function noteFacts(snapshot: SourceBasslineSnapshotV1): Pick<
  SourceBasslineCaptureAssessment,
  "noteCount" | "hasSimultaneousNotes" | "hasOverlappingNotes"
> {
  const facts = sourceBasslineNoteFacts(snapshot.notes);
  return {
    noteCount: snapshot.notes.length,
    hasSimultaneousNotes: facts.simultaneous,
    hasOverlappingNotes: facts.overlap,
  };
}

type ExactFraction = { numerator: number; denominator: number };
type BigFraction = { numerator: bigint; denominator: bigint };

/** O(n) because validated SourceBassline notes are in canonical start order. */
export function sourceBasslineNoteFacts(
  notes: readonly { start: ExactFraction; duration: ExactFraction }[],
): { simultaneous: boolean; overlap: boolean } {
  let simultaneous = false;
  let overlap = false;
  let previousStart: BigFraction | undefined;
  let runningMaxEnd: BigFraction | undefined;
  for (const note of notes) {
    const start = toBigFraction(note.start);
    if (previousStart && compareBigFraction(start, previousStart) === 0) simultaneous = true;
    if (runningMaxEnd && compareBigFraction(start, runningMaxEnd) < 0) overlap = true;
    const end = addBigFraction(start, toBigFraction(note.duration));
    if (!runningMaxEnd || compareBigFraction(end, runningMaxEnd) > 0) runningMaxEnd = end;
    previousStart = start;
  }
  return { simultaneous, overlap };
}

function toBigFraction(value: ExactFraction): BigFraction {
  return { numerator: BigInt(value.numerator), denominator: BigInt(value.denominator) };
}

function addBigFraction(left: BigFraction, right: BigFraction): BigFraction {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function compareBigFraction(left: BigFraction, right: BigFraction): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function checkedMultiply(left: number, right: number): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new Error("Source range is outside the supported timing budget.");
  return value;
}

function checkedAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error("Source range is outside the supported timing budget.");
  return value;
}
