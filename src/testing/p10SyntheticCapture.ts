/**
 * P10 synthetic capture songs (shared by the CorrectionModel tests and the P10.0-00
 * audit script, so both count the same songs). Built in memory; nothing is read
 * from disk and no MIDI file is committed.
 */
import { Midi } from "@tonejs/midi";
import { analyzeMidi, annotateVoiceRolesV2, buildVoices, normalizeNotes, parseMidi } from "../domain/midi";
import { attachSourceVoicings } from "../domain/voicing";
import { getAnalysisProfileAnalyzeOptions } from "../storage/accuracyFirstSettings";

const TPB = 480;
export type N = { pitch: number; start: number; dur: number };
export type Part = { name: string; program: number; channel: number; notes: N[] };
export type Scenario = { id: string; about: string; parts: Part[]; expectedCards?: number };

// ---- synthetic scenarios ----------------------------------------------------------------
const LOOP = [[60, 64, 67], [57, 60, 64], [53, 57, 60, 65], [55, 59, 62, 65]]; // C Am F G7
const ROOTS = [36, 33, 41, 43];

function chords(bars: number, perBar = 1, loop = LOOP): N[] {
  const notes: N[] = [];
  const len = 4 / perBar;
  for (let bar = 0; bar < bars; bar += 1) {
    for (let hit = 0; hit < perBar; hit += 1) {
      for (const pitch of loop[bar % loop.length]!) notes.push({ pitch, start: bar * 4 + hit * len, dur: len });
    }
  }
  return notes;
}
const bass = (bars: number): N[] => Array.from({ length: bars }, (_, bar) => ({ pitch: ROOTS[bar % 4]!, start: bar * 4, dur: 4 }));
/** A melody whose long notes cross the bar lines (held from beat 3 into the next bar). */
const melody = (bars: number): N[] => Array.from({ length: bars }, (_, bar) => [
  { pitch: 74 + (bar % 3), start: bar * 4, dur: 2 },
  { pitch: 76 - (bar % 2), start: bar * 4 + 2, dur: 3 },
]).flat();
/** Short same-pitch hits on every half beat, in a pitched track (a drum loop exported to piano). */
const hats = (bars: number): N[] => Array.from({ length: bars * 8 }, (_, i) => ({ pitch: 37, start: i / 2, dur: 0.25 }));
/** Short stabs of one chord with silence between (beats 1 and 3), two bars per chord. */
const stabs = (bars: number): N[] => Array.from({ length: bars }, (_, bar) => [0, 2].flatMap((beat) =>
  LOOP[Math.floor(bar / 2) % 4]!.map((pitch) => ({ pitch, start: bar * 4 + beat, dur: 0.5 })))).flat();
/** Same chords, but bar pairs repeat the same chord: C C Am Am F F G7 G7. */
const REPEAT_LOOP = [LOOP[0]!, LOOP[0]!, LOOP[1]!, LOOP[1]!, LOOP[2]!, LOOP[2]!, LOOP[3]!, LOOP[3]!];

const piano = (notes: N[]): Part => ({ name: "Piano", program: 0, channel: 0, notes });
export const p10Scenarios: Scenario[] = [
  { id: "plain-8", about: "piano chords + bass, one chord a bar", parts: [piano(chords(8)), { name: "Bass", program: 33, channel: 1, notes: bass(8) }], expectedCards: 8 },
  { id: "melody-track-8", about: "plain-8 + a melody track crossing bar lines", parts: [piano(chords(8)), { name: "Bass", program: 33, channel: 1, notes: bass(8) }, { name: "Lead", program: 80, channel: 2, notes: melody(8) }], expectedCards: 8 },
  { id: "melody-in-piano-8", about: "melody notes inside the piano track", parts: [piano([...chords(8), ...melody(8)]), { name: "Bass", program: 33, channel: 1, notes: bass(8) }], expectedCards: 8 },
  { id: "hats-in-piano-8", about: "short repeated C#2 hits inside the piano track", parts: [piano([...chords(8), ...hats(8)]), { name: "Bass", program: 33, channel: 1, notes: bass(8) }], expectedCards: 8 },
  { id: "reattack-8", about: "each chord struck twice a bar", parts: [piano(chords(8, 2)), { name: "Bass", program: 33, channel: 1, notes: bass(8) }], expectedCards: 8 },
  { id: "repeat-pairs-8", about: "the same chord for two bars (C C Am Am …)", parts: [piano(chords(8, 1, REPEAT_LOOP)), { name: "Bass", program: 33, channel: 1, notes: Array.from({ length: 8 }, (_, bar) => ({ pitch: [36, 36, 33, 33, 41, 41, 43, 43][bar]!, start: bar * 4, dur: 4 })) }], expectedCards: 4 },
  { id: "stabs-8", about: "short stabs with rests, two bars per chord", parts: [piano(stabs(8)), { name: "Bass", program: 33, channel: 1, notes: Array.from({ length: 8 }, (_, bar) => ({ pitch: ROOTS[Math.floor(bar / 2) % 4]!, start: bar * 4, dur: 4 })) }], expectedCards: 4 },
  { id: "long-64", about: "64 bars: chords, bass, melody track, hats in piano", parts: [piano([...chords(64), ...hats(64)]), { name: "Bass", program: 33, channel: 1, notes: bass(64) }, { name: "Lead", program: 80, channel: 2, notes: melody(64) }], expectedCards: 64 },
  { id: "long-300", about: "300 bars, chords + bass (performance only)", parts: [piano(chords(300)), { name: "Bass", program: 33, channel: 1, notes: bass(300) }], expectedCards: 300 },
];

export function buildScenarioMidi(scenario: Scenario): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  for (const part of scenario.parts) {
    const track = midi.addTrack();
    track.name = part.name;
    track.channel = part.channel;
    track.instrument.number = part.program;
    for (const note of part.notes) track.addNote({ midi: note.pitch, ticks: Math.round(note.start * TPB), durationTicks: Math.round(note.dur * TPB), velocity: 0.8 });
  }
  return new Uint8Array(midi.toArray());
}

export function p10Scenario(id: string): Scenario {
  const scenario = p10Scenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`Unknown P10 scenario: ${id}`);
  return scenario;
}

/** The store's own capture pipeline (vaultStore.analyzeMidiBytes), for tests. */
export function analyzeScenario(scenario: Scenario) {
  const bytes = buildScenarioMidi(scenario);
  const options = getAnalysisProfileAnalyzeOptions();
  const result = analyzeMidi(bytes, options);
  const sourceData = parseMidi(bytes);
  const sourceVoices = annotateVoiceRolesV2(buildVoices(sourceData), normalizeNotes(sourceData));
  const fullTimeline = attachSourceVoicings(result.fullTimeline, { analysis: result, sourceData, sourceVoices, accuracyFirst: options.accuracyFirst });
  return { result: { ...result, fullTimeline }, sourceData, sourceVoices };
}
