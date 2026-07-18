import type { ChordSymbol } from "../types";
import { slotStartBeat } from "./editableProgression";
import {
  analyzerQuickCandidates,
  composeQuickChordCandidates,
  type QuickChordCandidate,
} from "./quickCandidates";
import { generateSmoothCandidates } from "./smoothCandidates";
import {
  generateStyleCandidates,
  type AuthorReferenceIndex,
} from "./styleCandidates";
import type { EditableProgression } from "./types";

export interface SlotQuickCandidateInput {
  editable: EditableProgression;
  slotId: string;
  keySignature?: string;
  authorReferenceIndex?: AuthorReferenceIndex;
  loop?: boolean;
}

export function quickCandidatesForSlot({
  editable,
  slotId,
  keySignature,
  authorReferenceIndex,
  loop = false,
}: SlotQuickCandidateInput): QuickChordCandidate[] {
  const ordered = [...editable.slots].sort(
    (left, right) => slotStartBeat(left, editable.beatsPerBar)
      - slotStartBeat(right, editable.beatsPerBar),
  );
  const index = ordered.findIndex((slot) => slot.id === slotId);
  const slot = ordered[index];
  if (!slot) return [];
  const progression = ordered.map((item) => item.currentChord);
  const analyzerCandidates = analyzerQuickCandidates(slot.alternatives);
  const smoothCandidates = generateSmoothCandidates({
    previousChord: ordered[index - 1]?.currentChord,
    currentChord: slot.currentChord,
    nextChord: ordered[index + 1]?.currentChord,
    progression,
    targetIndex: index,
    keySignature,
    durationBeats: slot.position.durationBeats,
    analyzerCandidates: slot.alternatives.map((alternative) => alternative.chord),
    loop,
  });
  const styleCandidates = authorReferenceIndex
    ? generateStyleCandidates({
        index: authorReferenceIndex,
        previousChord: ordered[index - 1]?.currentChord,
        currentChord: slot.currentChord,
        nextChord: ordered[index + 1]?.currentChord,
        keySignature,
      })
    : [];
  return composeQuickChordCandidates({
    currentChord: slot.currentChord,
    analyzerCandidates,
    smoothCandidates,
    styleCandidates,
  });
}

export function insertionQuickCandidates({
  previousChord,
  nextChord,
  progression,
  targetIndex,
  keySignature,
  durationBeats,
  authorReferenceIndex,
}: {
  previousChord: ChordSymbol;
  nextChord?: ChordSymbol;
  progression: readonly ChordSymbol[];
  targetIndex: number;
  keySignature?: string;
  durationBeats: number;
  authorReferenceIndex?: AuthorReferenceIndex;
}): QuickChordCandidate[] {
  const smoothCandidates = generateSmoothCandidates({
    previousChord,
    currentChord: previousChord,
    nextChord,
    progression,
    targetIndex,
    keySignature,
    durationBeats,
  });
  const styleCandidates = authorReferenceIndex
    ? generateStyleCandidates({
        index: authorReferenceIndex,
        previousChord,
        currentChord: previousChord,
        nextChord,
        keySignature,
      })
    : [];
  return composeQuickChordCandidates({
    currentChord: previousChord,
    analyzerCandidates: [],
    smoothCandidates,
    styleCandidates,
  });
}
