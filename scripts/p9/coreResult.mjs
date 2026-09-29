export function validateCoreResult(result) {
  const issues = [];
  const notes = result?.sourceTruth?.notes;
  if (!Array.isArray(notes)) return ["sourceTruth.notes missing"];
  const ids = new Set(notes.map((note) => note.noteId));
  if (ids.size !== notes.length) issues.push("duplicate source note ID");
  for (const note of notes) {
    if (!Number.isInteger(note.midiNote) || note.midiNote < 0 || note.midiNote > 127 ||
      !Number.isInteger(note.onsetTick) || note.offsetTick <= note.onsetTick) issues.push("invalid source note");
  }
  for (const excluded of result.excludedNotes ?? []) {
    const source = notes.find((note) => note.noteId === excluded.noteId);
    if (!source || source.midiNote !== excluded.midiNote || source.onsetTick !== excluded.sourceTick ||
      source.offsetTick - source.onsetTick !== excluded.durationTick ||
      excluded.restorable !== true || excluded.confidence < 0 || excluded.confidence > 1) {
      issues.push("excluded note not restorable from sourceTruth");
    }
  }
  const referenced = [
    ...(result.harmonicInterpretation ?? []).flatMap((row) => row.sourceNoteIds),
    ...(result.boundaryCandidates ?? []).flatMap((row) => row.evidenceNoteIds),
    ...(result.topKIdentities ?? []).flatMap((row) => row.evidenceNoteIds),
    ...(result.attacks ?? []).flatMap((row) => [row.noteId, row.restrikeOfNoteId].filter(Boolean)),
    ...(result.reviewReasons ?? []).flatMap((row) => row.sourceNoteIds),
  ];
  if (referenced.some((id) => !ids.has(id))) issues.push("dangling source note reference");
  return [...new Set(issues)];
}
