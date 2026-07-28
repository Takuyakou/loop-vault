import {
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../chordIdentity";
import type {
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
} from "../types";
import type { EditableProgression } from "../progressionEditing/types";
import { beatsPerBar } from "./timing";

export type LabelCorrectionEditType =
  | "accepted-rank1"
  | "selected-rank2"
  | "selected-rank3"
  | "manual-input"
  | "reverted"
  | "deleted";

export interface LabelCorrectionLog {
  schemaVersion: 1;
  analyzerVersion: string;
  analyzerMode: string;
  eventFingerprint: string;
  detectedLabel: string;
  displayedCandidates: string[];
  finalSavedLabel: string;
  editType: LabelCorrectionEditType;
  selectedCandidateRank?: 1 | 2 | 3;
  canonicalDiff: {
    rootChanged: boolean;
    qualityChanged: boolean;
    seventhChanged: boolean;
    tensionsAdded: string[];
    tensionsRemoved: string[];
    bassChanged: boolean;
  };
  rootConfidence?: number;
  noteSnapshotHash: string;
  occurredAt: string;
  staleEdit: boolean;
}

export interface BuildLabelCorrectionLogsOptions {
  analyzerMode?: string;
  occurredAt: string;
  staleEventIds?: ReadonlySet<string>;
}

export function buildLabelCorrectionLogs(
  original: Pick<ProgressionBlockCandidate, "chords">,
  editable: EditableProgression,
  analysis: Pick<
    MidiProgressionAnalysis,
    "sourceFingerprint" | "timeSignature" | "analyzerVersion"
  >,
  options: BuildLabelCorrectionLogsOptions,
): LabelCorrectionLog[] {
  if (!analysis.sourceFingerprint) return [];
  const barLengthBeats = beatsPerBar(analysis.timeSignature);
  const currentById = new Map(editable.slots.map((slot) => [slot.id, slot]));
  const activeHistory = editable.history.slice(0, editable.historyIndex);

  return original.chords.map((detected, index) => {
    const eventId = detected.eventId
      ?? `legacy:${editable.candidateId}:${detected.bar}:${detected.beat}:${index}`;
    const current = currentById.get(eventId);
    const displayedCandidates = [
      detected.chord.label,
      ...detected.alternatives.map((candidate) => candidate.chord.label),
    ];
    const finalSavedLabel = current?.currentChord.label ?? "";
    const selectedCandidateRank = candidateRank(
      finalSavedLabel,
      displayedCandidates,
    );
    const editedThenReverted = current !== undefined
      && selectedCandidateRank === 1
      && activeHistory.some((operation) => {
        const before = operation.before.slots.find((slot) => slot.id === eventId);
        const after = operation.after.slots.find((slot) => slot.id === eventId);
        return before?.currentChord.label !== after?.currentChord.label;
      });
    const startBeat = (detected.bar - 1) * barLengthBeats + detected.beat - 1;
    const endBeat = startBeat + detected.durationBeats;
    const eventFingerprint = stableFingerprint([
      analysis.sourceFingerprint!,
      analysis.analyzerVersion,
      startBeat,
      endBeat,
      detected.chord.label,
    ]);
    const detectedIdentity = normalizeChordLabel(detected.chord.label);
    const finalIdentity = finalSavedLabel
      ? normalizeChordLabel(finalSavedLabel)
      : null;

    return {
      schemaVersion: 1,
      analyzerVersion: analysis.analyzerVersion,
      analyzerMode: options.analyzerMode ?? "phase4-v1",
      eventFingerprint,
      detectedLabel: detected.chord.label,
      displayedCandidates,
      finalSavedLabel,
      editType: current === undefined
        ? "deleted"
        : (editedThenReverted
          ? "reverted"
          : editType(selectedCandidateRank)),
      ...(selectedCandidateRank ? { selectedCandidateRank } : {}),
      canonicalDiff: canonicalDiff(detectedIdentity, finalIdentity),
      ...(Number.isFinite(detected.confidence)
        ? { rootConfidence: detected.confidence }
        : {}),
      noteSnapshotHash: stableFingerprint([
        analysis.sourceFingerprint!,
        startBeat,
        endBeat,
        detected.chord.label,
        displayedCandidates.join("|"),
      ]),
      occurredAt: options.occurredAt,
      staleEdit: options.staleEventIds?.has(eventId) ?? false,
    };
  });
}

export function labelCorrectionDedupKey(event: LabelCorrectionLog): string {
  return [
    event.eventFingerprint,
    event.finalSavedLabel,
    event.editType,
    event.staleEdit ? "stale" : "fresh",
  ].join("|");
}

function candidateRank(
  label: string,
  displayedCandidates: readonly string[],
): 1 | 2 | 3 | undefined {
  const identity = normalizeChordLabel(label);
  if (!identity) return undefined;
  const rank = displayedCandidates.slice(0, 3).findIndex((candidate) => {
    const candidateIdentity = normalizeChordLabel(candidate);
    return candidateIdentity
      ? identitiesEqual(identity, candidateIdentity)
      : false;
  });
  return rank >= 0 ? (rank + 1) as 1 | 2 | 3 : undefined;
}

function editType(
  rank: 1 | 2 | 3 | undefined,
): LabelCorrectionEditType {
  if (rank === 1) return "accepted-rank1";
  if (rank === 2) return "selected-rank2";
  if (rank === 3) return "selected-rank3";
  return "manual-input";
}

function canonicalDiff(
  detected: NormalizedChordIdentity | null,
  final: NormalizedChordIdentity | null,
): LabelCorrectionLog["canonicalDiff"] {
  if (!detected || !final) {
    return {
      rootChanged: detected?.rootPitchClass !== final?.rootPitchClass,
      qualityChanged: detected?.triad !== final?.triad,
      seventhChanged: detected?.seventh !== final?.seventh,
      tensionsAdded: final
        ? [...final.extensions.map(String), ...final.alterations]
        : [],
      tensionsRemoved: detected
        ? [...detected.extensions.map(String), ...detected.alterations]
        : [],
      bassChanged: detected?.bassPitchClass !== final?.bassPitchClass,
    };
  }
  const detectedTensions = new Set([
    ...detected.extensions.map(String),
    ...detected.alterations,
  ]);
  const finalTensions = new Set([
    ...final.extensions.map(String),
    ...final.alterations,
  ]);
  return {
    rootChanged: detected.rootPitchClass !== final.rootPitchClass,
    qualityChanged: detected.triad !== final.triad,
    seventhChanged: detected.seventh !== final.seventh,
    tensionsAdded: [...finalTensions].filter((value) =>
      !detectedTensions.has(value)).sort(),
    tensionsRemoved: [...detectedTensions].filter((value) =>
      !finalTensions.has(value)).sort(),
    bassChanged: detected.bassPitchClass !== final.bassPitchClass,
  };
}

function identitiesEqual(
  left: NormalizedChordIdentity,
  right: NormalizedChordIdentity,
): boolean {
  return left.rootPitchClass === right.rootPitchClass
    && left.triad === right.triad
    && left.seventh === right.seventh
    && left.extensions.join(".") === right.extensions.join(".")
    && left.alterations.join(".") === right.alterations.join(".")
    && left.bassPitchClass === right.bassPitchClass;
}

function stableFingerprint(parts: readonly (string | number)[]): string {
  const text = parts.join("\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
