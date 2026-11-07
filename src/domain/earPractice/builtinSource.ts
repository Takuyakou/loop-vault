import { BUILTINS, buildBuiltin } from "../chordDojo/builtins";
import { earKeyName } from "./keys";
import { earLevelOf } from "./levels";
import { DEFAULT_EAR_BPM, EAR_BEATS_PER_BAR, judgeOfMadeNotes, type EarQuestion, type EarQuestionChord } from "./question";
import { voiceForEar } from "./voicing";

/** The standard progressions of Chord Dojo, as questions. */
export const builtinIds = (): string[] => BUILTINS.map((entry) => entry.id);

/**
 * A standard progression in a key, sounded the way this practice sounds chords (not with the notes
 * `buildBuiltin` made for the Dojo: the practice must be able to promise that the notes it plays pass its
 * judgement). A progression longer than `length` bars is cut at a bar line, from `fromBar` (1-based);
 * `undefined` when a chord crosses the cut.
 */
export function buildBuiltinQuestion(
  id: string,
  key: number,
  options: { length?: number; fromBar?: number; bpm?: number } = {},
): EarQuestion | undefined {
  const entry = BUILTINS.find((candidate) => candidate.id === id);
  if (!entry) return undefined;
  const built = buildBuiltin(id, key);
  const beatsPerBar = EAR_BEATS_PER_BAR;
  const totalBars = Math.ceil(built.chords.reduce((sum, chord) => sum + chord.beats, 0) / beatsPerBar);
  const fromBar = options.fromBar ?? 1;
  const length = options.length === undefined ? totalBars : Math.min(options.length, totalBars - fromBar + 1);
  const segmentStart = (fromBar - 1) * beatsPerBar;
  const segmentEnd = segmentStart + length * beatsPerBar;
  const chords: EarQuestionChord[] = [];
  let at = 0;
  for (const chord of built.chords) {
    const start = at;
    const end = at + chord.beats;
    at = end;
    if (end <= segmentStart || start >= segmentEnd) continue;
    if (start < segmentStart || end > segmentEnd) return undefined;
    chords.push({
      label: chord.chord.label,
      symbol: chord.chord,
      bar: Math.floor((start - segmentStart) / beatsPerBar) + 1,
      startBeat: start - segmentStart,
      durationBeats: chord.beats,
      notes: voiceForEar(chord.chord),
      judge: judgeOfMadeNotes(chord.chord),
    });
  }
  if (!chords.length) return undefined;
  return {
    id: fromBar === 1 && length === totalBars ? `builtin:${id}` : `builtin:${id}:${fromBar}`,
    source: "builtin",
    level: earLevelOf(chords.map((chord) => chord.symbol), { tonic: key, mode: entry.mode }),
    length,
    mode: entry.mode,
    tonic: key,
    keyName: earKeyName(key, entry.mode),
    bpm: options.bpm ?? DEFAULT_EAR_BPM,
    beatsPerBar,
    chords,
  };
}
