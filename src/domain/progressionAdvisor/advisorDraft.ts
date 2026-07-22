import { parseChordLabel } from "../chords";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import { operationSnapshots, recordEditOperation } from "../progressionEditing/editHistory";
import { positionFromStartBeat, slotStartBeat } from "../progressionEditing/editableProgression";
import type { AdvisorAppendOperation, EditableChordSlot, EditableProgression } from "../progressionEditing/types";
import type { AdvisorSuggestion } from "./types";

export function advisorSuggestionToTimeline(suggestion: AdvisorSuggestion): ChordTimelineItem[] {
  return suggestion.events.map((event) => {
    const chord = parseChordLabel(event.chord);
    if (!chord) throw new Error(`Unsupported advisor chord: ${event.chord}`);
    return {
      bar: event.bar,
      beat: event.startBeat,
      durationBeats: event.durationBeats,
      chord,
      confidence: 0,
      alternatives: [],
      warnings: ["ai-generated-unverified"],
    };
  });
}

export function advisorSuggestionToCandidate(suggestion: AdvisorSuggestion): ProgressionBlockCandidate {
  return {
    id: `advisor-${safeId(suggestion.id)}`,
    startBar: 1,
    endBar: 8,
    lengthBars: 8,
    chords: advisorSuggestionToTimeline(suggestion),
    summaryText: suggestion.events.map((event) => event.chord).join(" - "),
    confidence: 0,
    labels: [suggestion.strategy],
    warnings: ["ai-generated-unverified"],
  };
}

export function appendAdvisorSuggestionToEditableProgression(
  editable: EditableProgression,
  suggestion: AdvisorSuggestion,
): EditableProgression {
  const timeline = advisorSuggestionToTimeline(suggestion);
  const currentEnd = editable.slots.length
    ? Math.max(...editable.slots.map((slot) => slotStartBeat(slot, editable.beatsPerBar) + slot.position.durationBeats))
    : 0;
  const appendStart = Math.ceil(currentEnd / editable.beatsPerBar) * editable.beatsPerBar;
  const appendedSlots: EditableChordSlot[] = timeline.map((item, index) => {
    const sourceStart = (item.bar - 1) * editable.beatsPerBar + item.beat - 1;
    const position = positionFromStartBeat(appendStart + sourceStart, editable.beatsPerBar);
    return {
      id: `${editable.candidateId}:advisor:${safeId(suggestion.id)}:${appendStart}:${index}`,
      position: { ...position, durationBeats: item.durationBeats },
      originalChord: { ...item.chord, tensions: [...item.chord.tensions] },
      currentChord: { ...item.chord, tensions: [...item.chord.tensions] },
      alternatives: [],
      confidence: 0,
      warnings: [...item.warnings],
      edited: true,
      editSource: "advisor",
    };
  });
  const slots = [...editable.slots, ...appendedSlots];
  const operation: AdvisorAppendOperation = {
    type: "advisor-append",
    suggestionId: suggestion.id,
    slotIds: appendedSlots.map((slot) => slot.id),
    ...operationSnapshots(editable, { slots, selectedSlotId: appendedSlots[0]?.id ?? editable.selectedSlotId }),
  };
  return recordEditOperation(editable, operation);
}

function safeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "proposal";
}
