import { makeChordSymbol, normalizePc, noteNameFromPitchClass } from "../chords";
import { chordTemplates, type ChordTemplate } from "../midi/candidates";
import type { ChordSymbol } from "../types";
import { detectLiveBass } from "./liveBass";
import { soundingNotes, soundingPitchClasses } from "./noteState";
import type { LiveChordAlternative, LiveChordDetection, LiveNoteState } from "./types";

export function detectLiveChord(state: LiveNoteState): LiveChordDetection {
  const notes = soundingNotes(state);
  const pitchClasses = soundingPitchClasses(state);
  const bass = detectLiveBass(state);
  const noteNames = pitchClasses.map(noteNameFromPitchClass);
  if (notes.length === 0) return emptyLiveChordDetection();
  if (pitchClasses.length <= 2) return notesOnlyDetection(notes, noteNames, bass);

  const alternatives = scoreAlternatives(pitchClasses, bass).slice(0, 3);
  const best = alternatives[0];
  if (!best || best.score < 0.48) return notesOnlyDetection(notes, noteNames, bass);
  return {
    kind: "chord",
    chord: best.chord,
    alternatives: alternatives.slice(1),
    label: best.chord.label,
    notes,
    noteNames,
    bass,
  };
}

export function emptyLiveChordDetection(): LiveChordDetection {
  return { kind: "empty", alternatives: [], label: "—", notes: [], noteNames: [] };
}

function notesOnlyDetection(notes: number[], noteNames: string[], bass?: number): LiveChordDetection {
  return { kind: "notes", alternatives: [], label: noteNames.join(" · "), notes, noteNames, bass };
}

function scoreAlternatives(pitchClasses: number[], bass: number | undefined): LiveChordAlternative[] {
  const present = new Set(pitchClasses);
  const scored: LiveChordAlternative[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const template of chordTemplates) {
      scored.push(scoreTemplate(root, template, present, bass));
    }
  }
  return scored.sort((left, right) => right.score - left.score || left.chord.label.localeCompare(right.chord.label));
}

function scoreTemplate(
  root: number,
  template: ChordTemplate,
  present: ReadonlySet<number>,
  bass: number | undefined,
): LiveChordAlternative {
  const required = template.required.map((interval) => normalizePc(root + interval));
  const important = template.important.map((interval) => normalizePc(root + interval));
  const optional = template.optional.map((interval) => normalizePc(root + interval));
  const allowed = new Set([...required, ...important, ...optional]);
  const requiredCoverage = coverage(required, present);
  const importantCoverage = coverage(important, present);
  const optionalCoverage = coverage(optional, present);
  const foreign = [...present].filter((pc) => !allowed.has(pc)).length / present.size;
  const missingRequired = required.filter((pc) => !present.has(pc)).length / required.length;
  const complexityPenalty = Math.max(0, allowed.size - present.size) * 0.035;
  const bassPc = bass === undefined ? undefined : normalizePc(bass);
  const bassBonus = bassPc === root ? 0.12 : bassPc !== undefined && allowed.has(bassPc) ? 0.035 : 0;
  const score = requiredCoverage * 0.68 + importantCoverage * 0.2 + optionalCoverage * 0.13
    + bassBonus - foreign * 0.45 - missingRequired * 0.5 - complexityPenalty;
  const slashBass = bassPc !== undefined && bassPc !== root && allowed.has(bassPc) ? bassPc : undefined;
  const chord: ChordSymbol = makeChordSymbol(root, template.quality, [], slashBass);
  return { chord, score };
}

function coverage(expected: readonly number[], present: ReadonlySet<number>): number {
  if (expected.length === 0) return 0;
  return expected.filter((pc) => present.has(pc)).length / expected.length;
}
