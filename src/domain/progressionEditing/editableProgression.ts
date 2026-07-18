import type {
  ChordSymbol,
  ChordTimelineItem,
  ProgressionBlockCandidate,
  SavedProgressionBlock,
} from "../types";
import { operationSnapshots, recordEditOperation } from "./editHistory";
import type {
  EditableChordSlot,
  EditableProgression,
  ProgressionEditSource,
  ProgressionEditSnapshot,
  ReplaceChordOperation,
} from "./types";

export * from "./similarSegments";

export function createEditableProgression(
  candidate: Pick<ProgressionBlockCandidate, "id" | "chords">,
  beatsPerBar = 4,
): EditableProgression {
  const slots = candidate.chords.map((item, index) => ({
    id: slotId(candidate.id, item, index),
    position: {
      bar: item.bar,
      beat: item.beat,
      durationBeats: item.durationBeats,
    },
    originalChord: cloneChord(item.chord),
    currentChord: cloneChord(item.chord),
    alternatives: item.alternatives.map((alternative) => ({
      chord: cloneChord(alternative.chord),
      confidence: alternative.confidence,
    })),
    confidence: item.confidence,
    warnings: [...item.warnings],
    edited: false,
  } satisfies EditableChordSlot));

  return {
    candidateId: candidate.id,
    beatsPerBar,
    slots,
    selectedSlotId: slots[0]?.id,
    history: [],
    historyIndex: 0,
  };
}

export function applyEditableProgressionToSavedBlock(
  block: SavedProgressionBlock,
  editable: EditableProgression,
): SavedProgressionBlock {
  return {
    ...block,
    chords: [...editable.slots]
      .sort((left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar))
      .map(slotToTimelineItem),
    summaryText: editable.slots.map((slot) => slot.currentChord.label).join(" - "),
    userEdited: editable.slots.some((slot) => slot.edited) || block.userEdited,
  };
}

export function applyEditableProgression(
  candidate: ProgressionBlockCandidate,
  editable: EditableProgression,
): ProgressionBlockCandidate {
  return {
    ...candidate,
    chords: [...editable.slots]
      .sort((left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar))
      .map(slotToTimelineItem),
  };
}

export function selectEditableSlot(
  editable: EditableProgression,
  slotId: string | undefined,
): EditableProgression {
  if (slotId !== undefined && !editable.slots.some((slot) => slot.id === slotId)) {
    return editable;
  }
  return { ...editable, selectedSlotId: slotId };
}

type BatchReplacementSource = Extract<
  ProgressionEditSource,
  "manual-label" | "alternative" | "structure-editor" | "propagation"
>;

export function replaceEditableChords(
  editable: EditableProgression,
  slotIds: readonly string[],
  chord: ChordSymbol,
  editSource: BatchReplacementSource,
): EditableProgression {
  const requestedIds = new Set(slotIds);
  const changedIds = editable.slots
    .filter((slot) => requestedIds.has(slot.id) && !chordSymbolsEqual(slot.currentChord, chord))
    .map((slot) => slot.id);
  if (changedIds.length === 0) {
    return editable;
  }

  const changedIdSet = new Set(changedIds);
  const slots = editable.slots.map((slot) => {
    if (!changedIdSet.has(slot.id)) {
      return cloneSlot(slot);
    }
    const currentChord = cloneChord(chord);
    return {
      ...cloneSlot(slot),
      currentChord,
      edited: !chordSymbolsEqual(slot.originalChord, currentChord),
      editSource,
    };
  });
  const next = { slots, selectedSlotId: editable.selectedSlotId };
  const operation: ReplaceChordOperation = {
    type: "replace",
    slotIds: changedIds,
    editSource,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function cloneChord(chord: ChordSymbol): ChordSymbol {
  return { ...chord, tensions: [...chord.tensions] };
}

export function cloneSlot(slot: EditableChordSlot): EditableChordSlot {
  return {
    ...slot,
    position: { ...slot.position },
    originalChord: cloneChord(slot.originalChord),
    currentChord: cloneChord(slot.currentChord),
    alternatives: slot.alternatives.map((alternative) => ({
      chord: cloneChord(alternative.chord),
      confidence: alternative.confidence,
    })),
    warnings: [...slot.warnings],
  };
}

export function cloneSnapshot(snapshot: ProgressionEditSnapshot): ProgressionEditSnapshot {
  return {
    slots: snapshot.slots.map(cloneSlot),
    ...(snapshot.selectedSlotId ? { selectedSlotId: snapshot.selectedSlotId } : {}),
  };
}

export function snapshotOf(editable: EditableProgression): ProgressionEditSnapshot {
  return cloneSnapshot({
    slots: editable.slots,
    ...(editable.selectedSlotId ? { selectedSlotId: editable.selectedSlotId } : {}),
  });
}

export function slotStartBeat(slot: EditableChordSlot, beatsPerBar = 4): number {
  return positionStartBeat(slot.position.bar, slot.position.beat, beatsPerBar);
}

export function positionStartBeat(bar: number, beat: number, beatsPerBar = 4): number {
  return (bar - 1) * beatsPerBar + beat - 1;
}

export function positionFromStartBeat(startBeat: number, beatsPerBar = 4): { bar: number; beat: number } {
  return {
    bar: Math.floor(startBeat / beatsPerBar) + 1,
    beat: (startBeat % beatsPerBar) + 1,
  };
}

function slotToTimelineItem(slot: EditableChordSlot): ChordTimelineItem {
  return {
    bar: slot.position.bar,
    beat: slot.position.beat,
    durationBeats: slot.position.durationBeats,
    chord: cloneChord(slot.currentChord),
    confidence: slot.confidence ?? 0,
    alternatives: slot.alternatives.map((alternative) => ({
      chord: cloneChord(alternative.chord),
      confidence: alternative.confidence,
    })),
    warnings: [...slot.warnings],
  };
}

function slotId(
  candidateId: string,
  item: ChordTimelineItem,
  index: number,
): string {
  return `${candidateId}:${item.bar}:${item.beat}:${index}`;
}

function chordSymbolsEqual(left: ChordSymbol, right: ChordSymbol): boolean {
  return left.root === right.root
    && left.quality === right.quality
    && left.bass === right.bass
    && left.tensions.length === right.tensions.length
    && left.tensions.every((tension, index) => tension === right.tensions[index]);
}

