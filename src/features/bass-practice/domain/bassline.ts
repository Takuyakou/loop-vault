import { stableHash } from "./determinism";
import type { BasslineGeneratorResult, BasslineGeneratorSnapshot, BasslinePracticeExercise, BasslineTargetEvent } from "./types";

export const BASSLINE_GENERATOR_VERSION = "bassline-v1";
export function generateBasslineExercise(snapshot: BasslineGeneratorSnapshot): BasslineGeneratorResult {
  if (snapshot.generatorVersion !== BASSLINE_GENERATOR_VERSION || !snapshot.seed || snapshot.tempo < 30 || snapshot.tempo > 240 || snapshot.chords.length === 0 || snapshot.chords.length > 8 || snapshot.chords.some((chord) => !Number.isInteger(chord.root) || chord.durationBeats <= 0 || chord.startBeat < 0)) return failure("Bassline snapshot is unsupported.");
  const end = Math.max(...snapshot.chords.map((chord) => chord.startBeat + chord.durationBeats)); if (end > 8) return failure("Bassline phrase must fit one or two 4/4 bars.");
  const events: BasslineTargetEvent[] = [];
  snapshot.chords.forEach((chord, chordIndex) => {
    const root = ((chord.bass ?? chord.root) % 12 + 12) % 12; const base = 36 + root;
    const tones = snapshot.level === 1 ? [0] : snapshot.level === 2 ? [0, 7] : [0, 7, 11, -1];
    const beats = Math.max(1, Math.floor(chord.durationBeats));
    for (let step = 0; step < beats; step += 1) { const offset = step === 0 ? 0 : tones[(stableHash(`${snapshot.seed}:${chordIndex}:${step}`).charCodeAt(0)) % tones.length]; events.push({ index: events.length, midiNote: Math.max(28, Math.min(55, base + offset)), startBeat: chord.startBeat + step, durationBeats: Math.min(1, chord.durationBeats - step), velocity: step === 0 ? .88 : .72, chordIndex }); }
  });
  const exercise: BasslinePracticeExercise = Object.freeze({ id: `bassline-${stableHash(snapshot)}`, version: 1, generatorVersion: snapshot.generatorVersion, seed: snapshot.seed, mode: "bassline", source: snapshot.source === "vault" ? { kind: "vault" as const, referenceId: snapshot.sourceReferenceId, label: snapshot.sourceLabel } : { kind: "generated" as const }, tempo: snapshot.tempo, meter: snapshot.meter, targetEvents: Object.freeze(events), chords: Object.freeze([...snapshot.chords]), difficulty: Object.freeze({ noteCount: events.length, phraseLengthBeats: end, tempo: snapshot.tempo, pitchSpanSemitones: Math.max(...events.map((e) => e.midiNote)) - Math.min(...events.map((e) => e.midiNote)), degreeComplexity: snapshot.level, rhythmComplexity: 1, positionShift: 0, listenLimit: 2, hintAvailability: 4, transferDistance: 1 }), hints: Object.freeze([{ level: 1 as const, kind: "tonal-context" as const }, { level: 2 as const, kind: "note-count-contour" as const }, { level: 3 as const, kind: "degree-sequence" as const }, { level: 4 as const, kind: "note-names-fretboard" as const }]), generatorSnapshot: snapshot });
  return Object.freeze({ ok: true, exercise });
}
function failure(message: string): BasslineGeneratorResult { return Object.freeze({ ok: false, error: Object.freeze({ code: "invalid-config", message, attempts: 1 }) }); }