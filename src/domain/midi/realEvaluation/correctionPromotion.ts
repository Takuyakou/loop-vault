import { parseChordLabel } from "../../chords";
import type { MidiChordCorrectionEvent } from "../feedback";
import type { LocalMidiSourceIndexEntry, RealMidiEvaluationCase } from "./types";
import { deriveAcceptableAlternatives } from "./acceptableAlternatives";

export interface CorrectionConflict {
  sourceFingerprint: string;
  range: { startBeat: number; endBeat: number };
  corrections: { chord: string; count: number }[];
}

export interface CorrectionPromotionResult {
  promoted: RealMidiEvaluationCase[];
  orphans: MidiChordCorrectionEvent[];
  conflicts: CorrectionConflict[];
  duplicateCount: number;
  liveMidiSkipped: number;
  invalidChordCount: number;
}

export function promoteCorrectionEvents(
  events: readonly MidiChordCorrectionEvent[],
  sourceIndex: readonly LocalMidiSourceIndexEntry[],
): CorrectionPromotionResult {
  const sources = new Map(sourceIndex.map((entry) => [entry.fingerprint, entry]));
  const fileEvents = events.filter((event) => !event.analyzerVersion.startsWith("live-chord-"));
  const liveMidiSkipped = events.length - fileEvents.length;
  const groups = new Map<string, MidiChordCorrectionEvent[]>();
  fileEvents.forEach((event) => {
    const key = `${event.sourceFingerprint}:${event.segment.startBeat}:${event.segment.endBeat}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });

  const promoted: RealMidiEvaluationCase[] = [];
  const orphans: MidiChordCorrectionEvent[] = [];
  const conflicts: CorrectionConflict[] = [];
  let duplicateCount = 0;
  let invalidChordCount = 0;

  [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([, group]) => {
    const source = sources.get(group[0].sourceFingerprint);
    if (!source) {
      orphans.push(...deduplicateExact(group));
      duplicateCount += group.length - deduplicateExact(group).length;
      return;
    }
    const byCorrection = new Map<string, MidiChordCorrectionEvent[]>();
    group.forEach((event) => {
      const normalized = parseChordLabel(event.corrected)?.label;
      if (!normalized) {
        invalidChordCount += 1;
        return;
      }
      byCorrection.set(normalized, [...(byCorrection.get(normalized) ?? []), event]);
    });
    duplicateCount += [...byCorrection.values()].reduce((sum, duplicates) => sum + Math.max(0, duplicates.length - 1), 0);
    if (byCorrection.size > 1) {
      conflicts.push({
        sourceFingerprint: group[0].sourceFingerprint,
        range: { ...group[0].segment },
        corrections: [...byCorrection.entries()]
          .map(([chord, duplicates]) => ({ chord, count: duplicates.length }))
          .sort((left, right) => right.count - left.count || left.chord.localeCompare(right.chord)),
      });
      return;
    }
    const selected = [...byCorrection.values()][0]?.[0];
    if (!selected) return;
    const chord = parseChordLabel(selected.corrected);
    if (!chord) return;
    const alternatives = deriveAcceptableAlternatives(chord, { includeWeak: true });
    promoted.push({
      schemaVersion: 1,
      id: correctionCaseId(selected, chord.label),
      source: {
        fingerprint: selected.sourceFingerprint,
        ...(source.assetId ? { assetId: source.assetId } : {}),
        ...(source.fileName ? { fileName: source.fileName } : {}),
      },
      range: { ...selected.segment },
      expected: {
        primary: [{
          ...selected.segment,
          primary: chord.label,
          root: chord.root,
          quality: chord.quality,
          ...(chord.bass !== undefined ? { bass: chord.bass } : {}),
          ...(alternatives.length > 0 ? { acceptableAlternatives: alternatives.map((item) => item.chord) } : {}),
        }],
        ...(alternatives.length > 0 ? { alternatives: [{ ...selected.segment, alternatives }] } : {}),
      },
      label: { strength: "gold", origin: "manual-correction", reviewer: "local-user" },
      context: {
        ...(selected.keyContext ? { key: selected.keyContext } : {}),
        ...(selected.previousChord ? { previousChord: selected.previousChord } : {}),
        ...(selected.nextChord ? { nextChord: selected.nextChord } : {}),
      },
      analyzerContext: {
        sourceAnalyzerVersion: selected.analyzerVersion,
        sourceWeightsVersion: selected.weightsVersion,
      },
    });
  });

  return { promoted, orphans, conflicts, duplicateCount, liveMidiSkipped, invalidChordCount };
}

function deduplicateExact(events: readonly MidiChordCorrectionEvent[]): MidiChordCorrectionEvent[] {
  return [...new Map(events.map((event) => [
    `${event.sourceFingerprint}:${event.segment.startBeat}:${event.segment.endBeat}:${event.corrected}`,
    event,
  ])).values()];
}

function correctionCaseId(event: MidiChordCorrectionEvent, corrected: string): string {
  const safeChord = corrected.replace(/[^A-Za-z0-9#b]+/g, "-");
  return `correction-${event.sourceFingerprint}-${event.segment.startBeat}-${event.segment.endBeat}-${safeChord}`;
}
