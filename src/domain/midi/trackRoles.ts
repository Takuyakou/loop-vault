import type { MidiSongData, NormalizedTimedNote } from "./types";
import type { AnalyzerWeights } from "./weights";
import { defaultAnalyzerWeights } from "./weights";

export type HybridTrackRole = "drums" | "bass" | "chord" | "pad" | "arpeggio" | "melody" | "lead" | "counter" | "unknown";

export interface TrackFeatures {
  trackIndex: number;
  noteCount: number;
  averagePitch: number;
  averageDurationBeats: number;
  pitchRange: number;
  notesPerBar: number;
  meanOnsetPolyphony: number;
  lowRegisterRatio: number;
  highRegisterRatio: number;
  repeatedPitchRatio: number;
}

export interface TrackRoleProfile {
  trackIndex: number;
  role: HybridTrackRole;
  qualityWeight: number;
  rootWeight: number;
  confidence: number;
  reasons: string[];
}

export function extractTrackFeatures(notes: readonly NormalizedTimedNote[], data: MidiSongData): TrackFeatures[] {
  return data.tracks.map((track) => {
    const trackNotes = notes.filter((note) => note.trackIndex === track.index);
    const starts = new Map<number, number>();
    trackNotes.forEach((note) => starts.set(note.startTick, (starts.get(note.startTick) ?? 0) + 1));
    const pitches = trackNotes.map((note) => note.pitch);
    return {
      trackIndex: track.index,
      noteCount: trackNotes.length,
      averagePitch: average(pitches),
      averageDurationBeats: average(trackNotes.map((note) => note.sustainedEndBeat - note.startBeat)),
      pitchRange: pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0,
      notesPerBar: trackNotes.length / Math.max(1, data.totalBars),
      meanOnsetPolyphony: average([...starts.values()]),
      lowRegisterRatio: ratio(trackNotes.filter((note) => note.pitch < 52).length, trackNotes.length),
      highRegisterRatio: ratio(trackNotes.filter((note) => note.pitch >= 72).length, trackNotes.length),
      repeatedPitchRatio: repeatedRatio(trackNotes),
    };
  });
}

export function inferTrackRoleProfiles(
  data: MidiSongData, notes: readonly NormalizedTimedNote[], weights: AnalyzerWeights = defaultAnalyzerWeights,
): Map<number, TrackRoleProfile> {
  const features = extractTrackFeatures(notes, data);
  return new Map(features.map((feature) => {
    const track = data.tracks.find((entry) => entry.index === feature.trackIndex);
    const role = classify(feature, track?.name ?? "", track?.program, track?.roleHint === "percussion");
    const qualityWeight = roleQualityWeight(role, weights);
    const rootWeight = role === "bass" ? weights.bassRoleRootWeight : qualityWeight;
    const reasons = reasonsFor(feature, role, track?.name ?? "");
    return [feature.trackIndex, {
      trackIndex: feature.trackIndex, role, qualityWeight, rootWeight,
      confidence: Math.min(0.95, 0.55 + reasons.length * 0.1), reasons,
    }];
  }));
}

function classify(feature: TrackFeatures, name: string, program?: number, percussion = false): HybridTrackRole {
  if (percussion || /drum|perc|kick|snare|hat/i.test(name)) return "drums";
  if (/bass|sub|808/i.test(name) || isBassProgram(program) || feature.lowRegisterRatio > 0.72) return "bass";
  if (/pad|string/i.test(name) || (feature.averageDurationBeats > 2.2 && feature.meanOnsetPolyphony > 1.7)) return "pad";
  if (/arp|pluck/i.test(name) || (feature.meanOnsetPolyphony < 1.35 && feature.notesPerBar > 7 && feature.pitchRange > 12)) return "arpeggio";
  if (/chord|keys|piano|rhodes|organ|guitar/i.test(name) || feature.meanOnsetPolyphony >= 2.1) return "chord";
  if (/lead|solo/i.test(name)) return "lead";
  if (/melody|topline|vocal/i.test(name) || (feature.highRegisterRatio > 0.55 && feature.meanOnsetPolyphony < 1.4)) return "melody";
  if (feature.meanOnsetPolyphony < 1.4 && feature.notesPerBar > 3) return "counter";
  return "unknown";
}

function roleQualityWeight(role: HybridTrackRole, weights: AnalyzerWeights): number {
  if (role === "drums") return 0;
  if (role === "bass") return weights.bassRoleQualityWeight;
  if (role === "chord") return weights.chordRoleWeight;
  if (role === "pad") return weights.padRoleWeight;
  if (role === "arpeggio") return weights.arpeggioRoleWeight;
  if (role === "melody") return weights.melodyRoleWeight;
  if (role === "lead") return weights.leadRoleWeight;
  if (role === "counter") return weights.counterRoleWeight;
  return weights.unknownRoleWeight;
}

function reasonsFor(feature: TrackFeatures, role: HybridTrackRole, name: string): string[] {
  const reasons = [`role:${role}`];
  if (name) reasons.push(`name:${name.toLocaleLowerCase()}`);
  if (feature.lowRegisterRatio > 0.7) reasons.push("low-register");
  if (feature.highRegisterRatio > 0.5) reasons.push("high-register");
  if (feature.meanOnsetPolyphony >= 2) reasons.push("polyphonic");
  if (feature.averageDurationBeats >= 2) reasons.push("sustained");
  return reasons;
}

function isBassProgram(program?: number): boolean { return program !== undefined && program >= 32 && program <= 39; }
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function ratio(value: number, total: number): number { return total ? value / total : 0; }
function repeatedRatio(notes: readonly NormalizedTimedNote[]): number {
  if (notes.length < 2) return 0;
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  return ratio(sorted.slice(1).filter((note, index) => note.pitch === sorted[index].pitch).length, sorted.length - 1);
}
