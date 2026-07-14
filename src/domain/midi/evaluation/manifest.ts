import type { ChordQuality } from "../../types";
import type { MidiEvaluationCase, MidiEvaluationCategory } from "./types";

interface ChordDripFile {
  caseId: string;
  midiFile: string;
  generationRecord: {
    presetId: string;
    voicingId: string;
    patternId: string;
    bars: number;
  };
  chordTimeline: Array<{
    startBeat: number;
    durationBeats: number;
    chordSymbol: { root: number; quality: ChordQuality; label: string; bass?: number };
  }>;
}

export interface ChordDripCorpusManifest {
  schemaVersion: 1;
  generatorVersion: string;
  recipeSha256: string;
  files: ChordDripFile[];
}

export function adaptChordDripManifest(manifest: ChordDripCorpusManifest): MidiEvaluationCase[] {
  return manifest.files.map((file) => {
    const recipeFamily = `${file.generationRecord.presetId}:${file.generationRecord.voicingId}`;
    return {
      id: file.caseId,
      title: file.caseId,
      midiPath: file.midiFile,
      recipeFamily,
      split: stableSplit(recipeFamily),
      category: categoriesFor(file),
      difficulty: difficultyFor(file),
      expected: {
        chordTimeline: file.chordTimeline.map((segment) => ({
          startBeat: segment.startBeat,
          endBeat: segment.startBeat + segment.durationBeats,
          primary: segment.chordSymbol.label,
          root: segment.chordSymbol.root,
          quality: segment.chordSymbol.quality,
          ...(segment.chordSymbol.bass !== undefined ? { bass: segment.chordSymbol.bass } : {}),
        })),
      },
    };
  });
}

function stableSplit(family: string): "tune" | "holdout" {
  let hash = 2166136261;
  for (const character of family) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 5 === 0 ? "holdout" : "tune";
}

function categoriesFor(file: ChordDripFile): MidiEvaluationCategory[] {
  const values: MidiEvaluationCategory[] = ["chord-drip", "chord-only"];
  const text = `${file.generationRecord.voicingId} ${file.generationRecord.patternId}`;
  if (/rootless/i.test(text)) values.push("rootless", "no-bass");
  if (/broken|arp/i.test(text)) values.push("arpeggio");
  if (/sustain|pad/i.test(text)) values.push("pad");
  return [...new Set(values)];
}

function difficultyFor(file: ChordDripFile): "easy" | "medium" | "hard" {
  const text = `${file.generationRecord.voicingId} ${file.generationRecord.patternId}`;
  if (/rootless|push|broken/i.test(text)) return "hard";
  if (/wide|lead|comp/i.test(text)) return "medium";
  return "easy";
}
