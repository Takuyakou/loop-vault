import { normalizeNotes } from "../normalize";
import { parseMidi } from "../parser";
import { parseRawSmf } from "../rawSmf";
import type { VoiceRole } from "../types";
import { annotateVoiceRolesV2 } from "../voiceRoleV2";
import { buildVoices } from "../voices";
import { gmProgramName } from "./gmProgramNames";
import type {
  PreAnalysisMidiSource,
  PreAnalysisControlChange,
  PreAnalysisNote,
  PreAnalysisSourceScan,
  PreAnalysisVoice,
  PreAnalysisVoiceRole,
} from "./types";

export interface PreScanMidiSourceOptions {
  sourceId: string;
  displayName: string;
}

export function preScanMidiSource(
  bytes: Uint8Array,
  options: PreScanMidiSourceOptions,
): PreAnalysisSourceScan {
  if (!options.sourceId.trim()) {
    throw new Error("sourceId is required");
  }
  const raw = parseRawSmf(bytes);
  const data = parseMidi(bytes);
  const normalized = normalizeNotes(data);
  const baseVoices = buildVoices(data);
  const voices = annotateVoiceRolesV2(baseVoices, normalized);
  const source = buildSource(raw, options);
  const mappedVoices = voices.map((voice) => {
    const programNumbers = [...new Set(
      data.notes
        .filter((note) =>
          note.trackIndex === voice.trackIndex && note.channel === voice.channel)
        .flatMap((note) => note.program === undefined ? [] : [note.program]),
    )].sort((left, right) => left - right);
    const autoRole = preAnalysisRoleFromProductRole(voice.inferredRole);
    const dominantName = gmProgramName(voice.dominantProgram);
    const displayName = voice.channel === 9
      ? "Drums"
      : dominantName ?? voice.trackName ?? `Track ${voice.trackIndex + 1} / Ch ${voice.channel + 1}`;
    return {
      id: preAnalysisVoiceId(options.sourceId, voice.trackIndex, voice.channel),
      sourceId: options.sourceId,
      trackIndex: voice.trackIndex,
      channel: voice.channel,
      programNumbers,
      ...(voice.dominantProgram !== undefined
        ? { dominantProgram: voice.dominantProgram }
        : {}),
      ...(dominantName ? { gmProgramName: dominantName } : {}),
      ...(voice.trackName ? { trackName: voice.trackName } : {}),
      displayName,
      hasProgramChanges: programNumbers.length > 1,
      isDrum: voice.channel === 9,
      noteCount: voice.noteCount,
      minPitch: voice.pitchRange[0],
      maxPitch: voice.pitchRange[1],
      averageDurationBeats: voice.avgDurationTick / data.ticksPerBeat,
      averagePolyphony: averagePolyphony(
        data.notes.filter((note) =>
          note.trackIndex === voice.trackIndex && note.channel === voice.channel),
        data.ticksPerBeat,
      ),
      autoRole,
      ...(voice.roleConfidenceBucket
        ? { autoRoleConfidenceBucket: voice.roleConfidenceBucket }
        : {}),
      ...(voice.roleEvidenceKinds
        ? { autoRoleEvidenceKinds: voice.roleEvidenceKinds }
        : {}),
      autoRoleConfidence: voice.roleConfidence,
      assignedRole: autoRole,
      included: autoRole !== "exclude",
      visible: true,
      muted: false,
      solo: false,
    } satisfies PreAnalysisVoice;
  });
  const mappedVoiceIds = new Map(
    mappedVoices.map((voice) => [
      `${voice.trackIndex}:${voice.channel}`,
      voice.id,
    ]),
  );
  const notes = data.notes.flatMap((note): PreAnalysisNote[] => {
    if (note.channel === undefined) return [];
    const voiceId = mappedVoiceIds.get(`${note.trackIndex}:${note.channel}`);
    if (!voiceId) return [];
    return [{
      sourceId: options.sourceId,
      voiceId,
      trackIndex: note.trackIndex,
      channel: note.channel,
      pitch: note.pitch,
      velocity: note.velocity,
      startBeat: note.startTick / data.ticksPerBeat,
      durationBeats: note.durationTick / data.ticksPerBeat,
      ...(note.program !== undefined ? { program: note.program } : {}),
      ...(note.programExplicit !== undefined
        ? { programExplicit: note.programExplicit }
        : {}),
    }];
  });
  const controlChanges = data.controlChanges.flatMap(
    (change): PreAnalysisControlChange[] => {
      if (change.channel === undefined) return [];
      const voiceId = mappedVoiceIds.get(`${change.trackIndex}:${change.channel}`);
      if (!voiceId) return [];
      return [{
        sourceId: options.sourceId,
        voiceId,
        trackIndex: change.trackIndex,
        channel: change.channel,
        number: change.number,
        beat: change.tick / data.ticksPerBeat,
        value: change.value,
      }];
    },
  );

  return {
    source,
    voices: mappedVoices,
    notes,
    controlChanges,
  };
}

export function createMidiSourceId(
  bytes: Uint8Array,
  occurrence = 0,
): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `midi-${(hash >>> 0).toString(16).padStart(8, "0")}-${occurrence}`;
}

export function preAnalysisVoiceId(
  sourceId: string,
  trackIndex: number,
  channel: number,
): string {
  return `${sourceId}:${trackIndex}:${channel}`;
}

export function preAnalysisRoleFromProductRole(
  role: VoiceRole,
): PreAnalysisVoiceRole {
  if (role === "bass") return "bass";
  if (role === "harmony" || role === "pad") return "harmony";
  if (role === "percussion") return "exclude";
  return "melody-weak";
}

function buildSource(
  raw: ReturnType<typeof parseRawSmf>,
  options: PreScanMidiSourceOptions,
): PreAnalysisMidiSource {
  const lastTick = raw.notes.reduce(
    (maximum, note) =>
      Math.max(maximum, note.startTick + note.durationTick),
    0,
  );
  const tempoMap = raw.tempoChanges.length
    ? raw.tempoChanges.map(({ tick, bpm }) => ({
        beat: tick / raw.ticksPerBeat,
        bpm,
      }))
    : [{ beat: 0, bpm: 120 }];
  const timeSignatures = raw.timeSignatureChanges.length
    ? raw.timeSignatureChanges.map((entry) => ({
        beat: entry.tick / raw.ticksPerBeat,
        numerator: entry.numerator,
        denominator: entry.denominator,
      }))
    : [{
        beat: 0,
        numerator: raw.timeSignature[0],
        denominator: raw.timeSignature[1],
      }];
  return {
    id: options.sourceId,
    displayName: options.displayName,
    smfType: raw.format,
    ppq: raw.ticksPerBeat,
    durationBeats: lastTick / raw.ticksPerBeat,
    tempoMap,
    timeSignatures,
  };
}

function averagePolyphony(
  notes: readonly { startTick: number; durationTick: number }[],
  ticksPerBeat: number,
): number | undefined {
  if (!notes.length) return undefined;
  const startTick = Math.min(...notes.map((note) => note.startTick));
  const endTick = Math.max(...notes.map((note) =>
    note.startTick + note.durationTick));
  const spanBeats = (endTick - startTick) / ticksPerBeat;
  if (spanBeats <= 0) return notes.length;
  const soundingBeats = notes.reduce(
    (total, note) => total + note.durationTick / ticksPerBeat,
    0,
  );
  return soundingBeats / spanBeats;
}
