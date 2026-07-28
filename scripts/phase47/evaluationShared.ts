import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  diagnoseLegacyWindowCandidates,
  type LegacyWindowCandidateDiagnostic,
} from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import type { TimedNote } from "../../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import type { ChordQuality, ChordSymbol } from "../../src/domain/types";

export interface Phase47Manifest {
  corpusVersion: string;
  files: Phase47CorpusFile[];
}

export interface Phase47CorpusFile {
  fileId: string;
  path: string;
  split: "dev" | "validation" | "holdout";
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  timeSignature: { numerator: number; denominator: number };
  events: Phase47GoldEvent[];
}

export interface Phase47GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  acceptableAlternatives?: string[];
  family?: string;
  bassCondition?: string;
}

export interface LoadedPhase47File {
  file: Phase47CorpusFile;
  bytes: Uint8Array;
  evidenceNotes: TimedNote[];
  ticksPerBeat: number;
}

export const regressionCorpusDir = resolve(
  cwd(),
  "test/loop-vault-voicing-gold-corpus-v1",
);

export async function loadPhase47Files(
  corpusDir: string,
  split?: Phase47CorpusFile["split"],
): Promise<{ manifest: Phase47Manifest; files: LoadedPhase47File[] }> {
  const manifest = JSON.parse(
    await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
  ) as Phase47Manifest;
  const selected = split
    ? manifest.files.filter((file) => file.split === split)
    : manifest.files;
  const files: LoadedPhase47File[] = [];
  for (const file of selected) {
    const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
    const parsed = parseMidi(bytes);
    files.push({
      file,
      bytes,
      evidenceNotes: selectChordEvidenceNotes(parsed.notes),
      ticksPerBeat: parsed.ticksPerBeat,
    });
  }
  return { manifest, files };
}

export function diagnoseLoadedFile(
  loaded: LoadedPhase47File,
): LegacyWindowCandidateDiagnostic[] {
  return diagnoseLegacyWindowCandidates(loaded.bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
}

export function bestWindow(
  windows: readonly LegacyWindowCandidateDiagnostic[],
  event: Phase47GoldEvent,
  beatsPerBar: number,
): LegacyWindowCandidateDiagnostic | undefined {
  return [...windows].sort((left, right) => {
    const leftStart = (left.bar - 1) * beatsPerBar + left.beat - 1;
    const rightStart = (right.bar - 1) * beatsPerBar + right.beat - 1;
    return intervalIou(
      rightStart,
      rightStart + right.durationBeats,
      event.startBeat,
      event.endBeat,
    ) - intervalIou(
      leftStart,
      leftStart + left.durationBeats,
      event.startBeat,
      event.endBeat,
    ) || leftStart - rightStart;
  })[0];
}

export function notesForWindow(
  loaded: LoadedPhase47File,
  window: LegacyWindowCandidateDiagnostic,
  beatsPerBar: number,
) {
  const startBeat = (window.bar - 1) * beatsPerBar + window.beat - 1;
  const endBeat = startBeat + window.durationBeats;
  const startTick = startBeat * loaded.ticksPerBeat;
  const endTick = endBeat * loaded.ticksPerBeat;
  return loaded.evidenceNotes
    .filter((note) =>
      note.startTick < endTick
      && note.startTick + note.durationTick > startTick)
    .map((note, index) => ({
      noteInstanceId: [
        loaded.file.fileId,
        `n${index}`,
        `t${note.trackIndex}`,
        `c${note.channel ?? -1}`,
        `p${note.pitch}`,
        `s${note.startTick}`,
        `d${note.durationTick}`,
      ].join(":"),
      pitchClass: ((note.pitch % 12) + 12) % 12,
    }));
}

export function identityKey(chord: ChordSymbol): string {
  return chordIdentityKey(normalizeChordSymbol(chord));
}

export function identityKeyForLabel(label: string): string | null {
  const identity = normalizeChordLabel(label);
  return identity ? chordIdentityKey(identity) : null;
}

export function plainCompanion(chord: ChordSymbol): ChordSymbol {
  return makeChordSymbol(chord.root, chord.quality, [...chord.tensions]);
}

export function isNonRootSlash(chord: ChordSymbol): boolean {
  return chord.bass !== undefined && chord.bass !== chord.root;
}

export function qualityFamily(chord: ChordSymbol): string {
  const familyByQuality: Partial<Record<ChordQuality, string>> = {
    min7: "m7",
    min9: "m9",
    maj9: "maj9",
    dom7sus4: "7sus4",
    dom13: "13",
    maj7: "maj7",
    dom7: "dom7",
    maj: "triad",
    min: "triad",
    add9: "add9",
  };
  return familyByQuality[chord.quality] ?? chord.quality;
}

export function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

export function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function intervalIou(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const intersection = Math.max(
    0,
    Math.min(aEnd, bEnd) - Math.max(aStart, bStart),
  );
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union > 0 ? intersection / union : 0;
}

