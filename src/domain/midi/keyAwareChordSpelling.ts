import { normalizePc, pitchClassFromNoteToken } from "../chords";
import type {
  ChordQuality, ChordSymbol, ChordTimelineItem, MidiProgressionAnalysis,
  ProgressionBlockCandidate, Tension,
} from "../types";
import type { CandidateChordEvent } from "./candidateBlock";
import type { CandidateOccurrence } from "./occurrence";

export const keyAwareChordSpellingVersion = "p526-key-aware-spelling-v1" as const;

const notePattern = "[A-G](?:#|b)*";
const rootPattern = new RegExp(`^(${notePattern})`);
const bassPattern = new RegExp(`/(${notePattern})$`);
const naturalPitchClasses: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const letters = ["C", "D", "E", "F", "G", "A", "B"] as const;

const majorSignatures: Readonly<Record<string, readonly string[]>> = {
  C: ["C", "D", "E", "F", "G", "A", "B"],
  G: ["G", "A", "B", "C", "D", "E", "F#"],
  D: ["D", "E", "F#", "G", "A", "B", "C#"],
  A: ["A", "B", "C#", "D", "E", "F#", "G#"],
  E: ["E", "F#", "G#", "A", "B", "C#", "D#"],
  B: ["B", "C#", "D#", "E", "F#", "G#", "A#"],
  "F#": ["F#", "G#", "A#", "B", "C#", "D#", "E#"],
  "C#": ["C#", "D#", "E#", "F#", "G#", "A#", "B#"],
  F: ["F", "G", "A", "Bb", "C", "D", "E"],
  Bb: ["Bb", "C", "D", "Eb", "F", "G", "A"],
  Eb: ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
  Ab: ["Ab", "Bb", "C", "Db", "Eb", "F", "G"],
  Db: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"],
  Gb: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"],
  Cb: ["Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"],
};

const relativeMajorByMinor: Readonly<Record<string, string>> = {
  A: "C", E: "G", B: "D", "F#": "A", "C#": "E", "G#": "B", "D#": "F#", "A#": "C#",
  D: "F", G: "Bb", C: "Eb", F: "Ab", Bb: "Db", Eb: "Gb", Ab: "Cb",
};

interface GenericDegree { readonly interval: number; readonly letterSteps: number }

const qualityDegrees: Readonly<Record<ChordQuality, readonly GenericDegree[]>> = {
  maj: degrees([0, 0], [4, 2], [7, 4]),
  min: degrees([0, 0], [3, 2], [7, 4]),
  dim: degrees([0, 0], [3, 2], [6, 4]),
  aug: degrees([0, 0], [4, 2], [8, 4]),
  maj7: degrees([0, 0], [4, 2], [7, 4], [11, 6]),
  min7: degrees([0, 0], [3, 2], [7, 4], [10, 6]),
  dom7: degrees([0, 0], [4, 2], [7, 4], [10, 6]),
  min7b5: degrees([0, 0], [3, 2], [6, 4], [10, 6]),
  dim7: degrees([0, 0], [3, 2], [6, 4], [9, 6]),
  maj9: degrees([0, 0], [4, 2], [7, 4], [11, 6], [14, 1]),
  min9: degrees([0, 0], [3, 2], [7, 4], [10, 6], [14, 1]),
  dom9: degrees([0, 0], [4, 2], [7, 4], [10, 6], [14, 1]),
  min11: degrees([0, 0], [3, 2], [7, 4], [10, 6], [14, 1], [17, 3]),
  dom13: degrees([0, 0], [4, 2], [7, 4], [10, 6], [14, 1], [21, 5]),
  sus2: degrees([0, 0], [2, 1], [7, 4]),
  sus4: degrees([0, 0], [5, 3], [7, 4]),
  dom7sus4: degrees([0, 0], [5, 3], [7, 4], [10, 6]),
  add9: degrees([0, 0], [4, 2], [7, 4], [14, 1]),
  six: degrees([0, 0], [4, 2], [7, 4], [9, 5]),
  min6: degrees([0, 0], [3, 2], [7, 4], [9, 5]),
  sixNine: degrees([0, 0], [4, 2], [7, 4], [9, 5], [14, 1]),
};

const tensionDegrees: Readonly<Record<Tension, GenericDegree>> = {
  "#5": degree(8, 4),
  "9": degree(14, 1),
  b9: degree(13, 1),
  "#9": degree(15, 1),
  "11": degree(17, 3),
  "#11": degree(18, 3),
  "13": degree(21, 5),
  b13: degree(20, 5),
};

interface KeySignature {
  readonly spellingByPitchClass: ReadonlyMap<number, string>;
}

/**
 * Re-spells display labels after analyzer/ranker selection. Numeric identity,
 * timing, confidence, ranking and persistence shapes are deliberately untouched.
 */
export function applyKeyAwareChordSpelling(
  analysis: MidiProgressionAnalysis,
): MidiProgressionAnalysis {
  const signature = keySignatureOf(analysis.detectedKey);
  if (!signature) return analysis;

  let changed = false;
  const labelChanges = new Map<string, string>();
  const chord = (value: ChordSymbol): ChordSymbol => {
    const label = spellChordLabel(value, signature);
    if (label === value.label) return value;
    changed = true;
    labelChanges.set(value.label, label);
    return { ...value, label };
  };
  const timeline = (item: ChordTimelineItem): ChordTimelineItem => {
    const primary = chord(item.chord);
    const alternatives = item.alternatives.map((entry) => {
      const alternative = chord(entry.chord);
      return alternative === entry.chord ? entry : { ...entry, chord: alternative };
    });
    return primary === item.chord
      && alternatives.every((entry, index) => entry === item.alternatives[index])
      ? item
      : { ...item, chord: primary, alternatives };
  };
  const event = (value: CandidateChordEvent): CandidateChordEvent => {
    const eventChord = chord(value.chord);
    const source = timeline(value.source);
    return eventChord === value.chord && source === value.source
      ? value
      : { ...value, chord: eventChord, source };
  };
  const occurrence = (value: CandidateOccurrence): CandidateOccurrence => {
    const events = value.events.map(event);
    return events.every((entry, index) => entry === value.events[index])
      ? value
      : { ...value, events };
  };

  const fullTimeline = analysis.fullTimeline.map(timeline);
  const blockCandidates = analysis.blockCandidates.map((candidate) => mapCandidate(
    candidate, timeline, event, labelChanges,
  ));
  const candidatePatterns = analysis.candidatePatterns?.map((pattern) => ({
    ...pattern,
    occurrences: pattern.occurrences.map(occurrence),
  }));
  const candidateCatalog = analysis.candidateCatalog === undefined
    ? undefined
    : {
        ...analysis.candidateCatalog,
        patterns: analysis.candidateCatalog.patterns.map((pattern) => ({
          ...pattern,
          occurrences: pattern.occurrences.map(occurrence),
        })),
      };

  if (!changed) return analysis;
  return {
    ...analysis,
    fullTimeline,
    blockCandidates,
    ...(candidatePatterns ? { candidatePatterns } : {}),
    ...(candidateCatalog ? { candidateCatalog } : {}),
    analyzerVersion: appendVersion(analysis.analyzerVersion),
  };
}

function mapCandidate(
  candidate: ProgressionBlockCandidate,
  timeline: (item: ChordTimelineItem) => ChordTimelineItem,
  event: (value: CandidateChordEvent) => CandidateChordEvent,
  labelChanges: ReadonlyMap<string, string>,
): ProgressionBlockCandidate {
  const chords = candidate.chords.map(timeline);
  const events = candidate.events?.map(event);
  const summaryText = rewriteSummary(candidate.summaryText, labelChanges);
  const chordsUnchanged = chords.every((entry, index) => entry === candidate.chords[index]);
  const eventsUnchanged = events === undefined
    || events.every((entry, index) => entry === candidate.events?.[index]);
  return chordsUnchanged && eventsUnchanged && summaryText === candidate.summaryText
    ? candidate
    : { ...candidate, chords, ...(events ? { events } : {}), summaryText };
}

function spellChordLabel(chord: ChordSymbol, signature: KeySignature): string {
  const rootMatch = rootPattern.exec(chord.label);
  if (!rootMatch || pitchClassFromNoteToken(rootMatch[1]) !== normalizePc(chord.root)) {
    return chord.label;
  }
  const root = signature.spellingByPitchClass.get(normalizePc(chord.root)) ?? rootMatch[1];
  let label = `${root}${chord.label.slice(rootMatch[1].length)}`;
  if (chord.bass === undefined || normalizePc(chord.bass) === normalizePc(chord.root)) return label;

  const match = bassPattern.exec(label);
  if (!match || pitchClassFromNoteToken(match[1]) !== normalizePc(chord.bass)) return label;
  const bass = spellBassFromChord(root, chord, match[1]);
  label = `${label.slice(0, match.index)}/${bass}`;
  return label;
}

function spellBassFromChord(
  rootSpelling: string,
  chord: ChordSymbol,
  legacySpelling: string,
): string {
  const rootLetter = rootSpelling.charAt(0);
  const rootIndex = letters.indexOf(rootLetter as (typeof letters)[number]);
  if (rootIndex < 0) return legacySpelling;
  const configured = qualityDegrees[chord.quality]
    .filter((entry) => !chord.tensions.includes("#5") || entry.interval !== 7);
  if (!configured || chord.bass === undefined) return legacySpelling;
  const relativeBass = normalizePc(chord.bass - chord.root);
  const candidates = [...configured, ...chord.tensions.map((tension) => tensionDegrees[tension])]
    .filter((candidate) => normalizePc(candidate.interval) === relativeBass);
  const uniqueDegrees = new Map(candidates.map((candidate) => [
    `${normalizePc(candidate.interval)}:${candidate.letterSteps}`,
    candidate,
  ]));
  if (uniqueDegrees.size !== 1) return legacySpelling;
  const [{ letterSteps }] = [...uniqueDegrees.values()];
  const desiredLetter = letters[(rootIndex + letterSteps) % letters.length];
  return spellPitchClassWithLetter(chord.bass, desiredLetter) ?? legacySpelling;
}

function degree(interval: number, letterSteps: number): GenericDegree {
  return { interval, letterSteps };
}

function degrees(...values: readonly [number, number][]): readonly GenericDegree[] {
  return values.map(([interval, letterSteps]) => degree(interval, letterSteps));
}

function spellPitchClassWithLetter(pitchClass: number, letter: string): string | undefined {
  const natural = naturalPitchClasses[letter];
  if (natural === undefined) return undefined;
  let offset = normalizePc(pitchClass - natural);
  if (offset > 6) offset -= 12;
  if (Math.abs(offset) > 2) return undefined;
  return `${letter}${offset > 0 ? "#".repeat(offset) : "b".repeat(-offset)}`;
}

function keySignatureOf(key: string | undefined): KeySignature | undefined {
  const match = /^([A-G](?:#|b)*)\s+(major|minor)$/i.exec(key?.trim() ?? "");
  if (!match) return undefined;
  const tonic = `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)}`;
  const mode = match[2].toLowerCase();
  const majorTonic = mode === "major" ? tonic : relativeMajorByMinor[tonic];
  const spellings = majorTonic ? majorSignatures[majorTonic] : undefined;
  if (!spellings) return undefined;
  const spellingByPitchClass = new Map<number, string>();
  for (const spelling of spellings) {
    const pitchClass = pitchClassFromNoteToken(spelling);
    if (pitchClass !== undefined) spellingByPitchClass.set(pitchClass, spelling);
  }
  return { spellingByPitchClass };
}

function rewriteSummary(summary: string, changes: ReadonlyMap<string, string>): string {
  return summary.replace(/[^|·]+/g, (segment) => {
    const value = segment.trim();
    const replacement = changes.get(value);
    return replacement === undefined ? segment : segment.replace(value, replacement);
  });
}

function appendVersion(version: string): string {
  const suffix = `+${keyAwareChordSpellingVersion}`;
  return version.endsWith(suffix) ? version : `${version}${suffix}`;
}
