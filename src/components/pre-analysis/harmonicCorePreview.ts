import { normalizeNotes } from "../../domain/midi/normalize";
import { buildVoices, voiceId } from "../../domain/midi/voices";
import { buildVoiceAwareRoleContext } from "../../domain/midi/voiceAwareReranker";
import { buildHarmonicCoreNoteWeights } from "../../domain/midi/harmonicCoreNoteWeights";
import {
  type AnalysisSession,
  type PreAnalysisNote,
} from "../../domain/midi/preAnalysis";
import {
  buildSplitAnalysisRequest,
  type PartSplits,
} from "../../domain/preAnalysisParts/splitSession";
import { isAnalyzedVoice } from "./sessionView";

/**
 * What 「アプリに任せる」 (Harmonic Core) will do to each note, computed by the analysis's own
 * functions on the analysis's own input: the same parts (lines included), the same roles, the same
 * note ends (pedal included). Nothing is re-implemented here; notes are only mapped back to the
 * session the person sees.
 *
 * The result maps a session note to its weight (1 = full). Notes of parts that Harmonic Core
 * does not weigh (bass, drums, melody parts, unused parts, notes above a line) are not in the map.
 */
export function harmonicCoreNoteMultipliers(
  session: AnalysisSession,
  splits: PartSplits = {},
): ReadonlyMap<PreAnalysisNote, number> {
  const result = new Map<PreAnalysisNote, number>();
  let built;
  try {
    built = buildSplitAnalysisRequest({ ...session, voiceContributionPreset: "harmonic-core" }, splits);
  } catch {
    return result; // no part is analysed
  }
  const { preparedData, analysisInput } = built.request.options;
  if (!preparedData || !analysisInput) return result;

  const normalized = normalizeNotes(preparedData);
  const context = buildVoiceAwareRoleContext(buildVoices(preparedData), normalized, analysisInput);
  const enabled = new Set(context.analysisInput.enabledVoiceIds);
  const evidence = normalized.filter((note) =>
    note.channel !== undefined && enabled.has(voiceId(note.trackIndex, note.channel)));
  const { multipliers } = buildHarmonicCoreNoteWeights(evidence, context.roles);

  const byKey = new Map<string, number>();
  for (const [note, multiplier] of multipliers) {
    byKey.set(noteKey(note.trackIndex, note.startTick, note.durationTick, note.pitch), multiplier);
  }
  const master = built.derived.sources.find((source) => source.id === built.derived.masterSourceId)
    ?? built.derived.sources[0];
  if (!master) return result;
  const trackOf = new Map(built.derived.voices.filter(isAnalyzedVoice).map((voice, index) => [voice.id, index]));
  // Notes of a split part were copied into the derived session; they map back to the original note.
  const back = built.originalOf;
  for (const note of built.derived.notes) {
    const trackIndex = trackOf.get(note.voiceId);
    if (trackIndex === undefined) continue;
    // The same rounding `buildPreparedMidiSongData` applies.
    const startTick = Math.max(0, Math.round(note.startBeat * master.ppq));
    const durationTick = Math.max(1, Math.max(0, Math.round(note.durationBeats * master.ppq)));
    const multiplier = byKey.get(noteKey(trackIndex, startTick, durationTick, note.pitch));
    if (multiplier !== undefined) result.set(back.get(note) ?? note, multiplier);
  }
  return result;
}

function noteKey(trackIndex: number, startTick: number, durationTick: number, pitch: number): string {
  return `${trackIndex}:${startTick}:${durationTick}:${pitch}`;
}
