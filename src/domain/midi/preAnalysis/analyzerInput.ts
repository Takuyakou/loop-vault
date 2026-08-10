import { normalizeNotes } from "../normalize";
import { beatsPerBar } from "../timing";
import type {
  AnalysisInput,
  AnalyzeMidiOptions,
  MidiSongData,
  TimedNote,
  TrackRole,
  VoiceRole,
} from "../types";
import { annotateVoiceRolesV2, sanitizeVoiceRoleOverrides } from "../voiceRoleV2";
import { buildVoices, voiceId } from "../voices";
import type {
  AnalysisSession,
  AnalysisSessionVoice,
  PreAnalysisVoiceRole,
} from "./types";
import { analysisSessionVoiceContributionPreset } from "./analysisSession";
import type { VoiceContributionPreset } from "../types";

export interface SessionAnalysisRequest {
  bytes: Uint8Array;
  fileName: string;
  options: Pick<
    AnalyzeMidiOptions,
    "preparedData" | "analysisInput" | "analysisFingerprint" | "mode"
  >;
  selectedVoiceIds: string[];
  backwardEquivalent: boolean;
}

export function buildSessionAnalysisRequest(
  session: AnalysisSession,
): SessionAnalysisRequest {
  const master = session.sources.find((source) =>
    source.id === session.masterSourceId) ?? session.sources[0];
  if (!master) {
    throw new Error("Analysis Session has no master MIDI source.");
  }
  const selectedVoices = session.voices.filter(isSelectedVoice);
  const selectedVoiceIds = selectedVoices.map((voice) => voice.id);
  if (isBackwardEquivalentSession(session)) {
    return {
      bytes: master.bytes,
      fileName: master.displayName,
      options: {},
      selectedVoiceIds,
      backwardEquivalent: true,
    };
  }
  if (!selectedVoices.length) {
    throw new Error("Select at least one pitched Voice for analysis.");
  }

  const voiceContributionPreset = analysisSessionVoiceContributionPreset(session);
  const preparedData = buildPreparedMidiSongData(session, selectedVoices);
  return {
    bytes: master.bytes,
    fileName: master.displayName,
    options: {
      preparedData,
      analysisInput: buildPreparedAnalysisInput(
        preparedData,
        selectedVoices,
        voiceContributionPreset,
      ),
      analysisFingerprint: fingerprintPreparedData(preparedData),
      ...(voiceContributionPreset === "harmonic-core"
        ? { mode: "voice-aware-rerank-v1" as const }
        : {}),
    },
    selectedVoiceIds,
    backwardEquivalent: false,
  };
}

export function isBackwardEquivalentSession(
  session: AnalysisSession,
): boolean {
  return session.sources.length === 1
    && session.preset === "auto"
    && analysisSessionVoiceContributionPreset(session) === "standard"
    && session.warnings.every((warning) =>
      warning.code !== "exact-duplicate")
    && session.voices.every((voice) =>
      voice.duplicateOf === undefined
      && voice.assignedRole === voice.autoRole
      && voice.included === (!voice.isDrum && voice.autoRole !== "exclude"));
}

export function buildPreparedMidiSongData(
  session: AnalysisSession,
  selectedVoices = session.voices.filter(isSelectedVoice),
): MidiSongData {
  const master = session.sources.find((source) =>
    source.id === session.masterSourceId) ?? session.sources[0];
  if (!master) {
    throw new Error("Analysis Session has no master MIDI source.");
  }
  const ppq = master.ppq;
  const voiceOrder = new Map(
    selectedVoices.map((voice, index) => [voice.id, index]),
  );
  const voiceById = new Map(selectedVoices.map((voice) => [voice.id, voice]));
  const notes: TimedNote[] = session.notes.flatMap((note): TimedNote[] => {
    const trackIndex = voiceOrder.get(note.voiceId);
    const voice = voiceById.get(note.voiceId);
    if (trackIndex === undefined || !voice) return [];
    return [{
      pitch: note.pitch,
      startTick: stableTick(note.startBeat, ppq),
      durationTick: Math.max(1, stableTick(note.durationBeats, ppq)),
      velocity: note.velocity,
      trackIndex,
      channel: voice.channel,
      ...(note.program !== undefined ? { program: note.program } : {}),
      ...(note.programExplicit !== undefined
        ? { programExplicit: note.programExplicit }
        : {}),
    }];
  }).sort(compareTimedNote);
  const firstMeter = master.timeSignatures[0] ?? {
    beat: 0,
    numerator: 4,
    denominator: 4,
  };
  const meter = `${firstMeter.numerator}/${firstMeter.denominator}`;
  const totalBars = Math.max(
    1,
    Math.ceil(master.durationBeats / beatsPerBar(meter)),
  );

  return {
    notes,
    ...(master.tempoMap[0] ? { tempo: master.tempoMap[0].bpm } : {}),
    tempoChanges: master.tempoMap.map((point) => ({
      tick: stableTick(point.beat, ppq),
      bpm: point.bpm,
    })),
    timeSignature: meter,
    ticksPerBeat: ppq,
    totalBars,
    tracks: selectedVoices.map((voice, index) => ({
      index,
      name: "",
      channel: voice.channel,
      ...(voice.dominantProgram !== undefined
        ? { program: voice.dominantProgram }
        : {}),
      roleOverride: voice.channel === 9
        ? "percussion"
        : trackRoleFor(voice.assignedRole),
    })),
    controlChanges: session.controlChanges.flatMap((change) => {
      const trackIndex = voiceOrder.get(change.voiceId);
      const voice = voiceById.get(change.voiceId);
      if (trackIndex === undefined || !voice) return [];
      return [{
        trackIndex,
        channel: voice.channel,
        number: change.number,
        tick: stableTick(change.beat, ppq),
        value: change.value,
      }];
    }),
  };
}

function buildPreparedAnalysisInput(
  data: MidiSongData,
  selectedVoices: readonly AnalysisSessionVoice[],
  voiceContributionPreset: VoiceContributionPreset,
): AnalysisInput {
  const normalized = normalizeNotes(data);
  const baseVoices = buildVoices(data);
  const requestedOverrides = Object.fromEntries(
    selectedVoices.flatMap((voice, index) => voice.channel === 9
      || (voiceContributionPreset === "harmonic-core"
        && voice.assignedRole === voice.autoRole)
      ? []
      : [[voiceId(index, voice.channel), voiceRoleFor(voice.assignedRole)] as const]),
  );
  const roleOverrides = sanitizeVoiceRoleOverrides(baseVoices, requestedOverrides);
  const voices = annotateVoiceRolesV2(baseVoices, normalized, roleOverrides);
  return {
    voices,
    enabledVoiceIds: voices
      .filter((voice) => voice.channel !== 9)
      .map((voice) => voice.id),
    roleOverrides,
    ...(voiceContributionPreset === "harmonic-core"
      ? { voiceContributionPreset }
      : {}),
  };
}

function isSelectedVoice(voice: AnalysisSessionVoice): boolean {
  return !voice.isDrum
    && voice.included
    && voice.assignedRole !== "exclude";
}

function trackRoleFor(role: PreAnalysisVoiceRole): TrackRole {
  if (role === "bass") return "bass";
  if (role === "melody-weak") return "melody";
  return "harmony";
}

function voiceRoleFor(role: PreAnalysisVoiceRole): VoiceRole {
  if (role === "bass") return "bass";
  if (role === "melody-weak") return "melody";
  return "harmony";
}

function stableTick(beat: number, ppq: number): number {
  return Math.max(0, Math.round(beat * ppq));
}

function compareTimedNote(left: TimedNote, right: TimedNote): number {
  return left.startTick - right.startTick
    || left.trackIndex - right.trackIndex
    || (left.channel ?? 0) - (right.channel ?? 0)
    || left.pitch - right.pitch
    || left.durationTick - right.durationTick;
}

function fingerprintPreparedData(data: MidiSongData): string {
  let hash = 0x811c9dc5;
  const values = data.notes.flatMap((note) => [
    note.trackIndex,
    note.channel ?? -1,
    note.pitch,
    note.startTick,
    note.durationTick,
    note.velocity,
  ]);
  for (const value of values) {
    const stable = Math.round(value);
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (stable >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return `session-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
