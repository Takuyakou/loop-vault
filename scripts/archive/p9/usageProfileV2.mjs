import { generateUsageCorpus, canonicalJson, sha256 } from "./usageProfile.mjs";

export const generatorVersionV2 = "p9-usage-profile-v2";
function addNote(base, suffix, pitch, role, startTick, durationTick, track = 2) {
  return { ...base, id: base.id + "-" + suffix,
    notes: [...base.notes, { id: base.id + "-" + suffix + "-n", pitch, role, startTick, durationTick, track, channel: 0, velocity: 75 }] };
}
export function generateUsageCorpusV2() {
  const base = generateUsageCorpus().cases;
  const block = base[0];
  const melody = addNote(block, "melody-over", 76, "melody", 0, 1920);
  const ornament = addNote(block, "ornament-neighbor", 65, "ornament", 600, 120);
  const pad = { ...block, id: "pad-long-sustain",
    family: "instrument", tempoBpm: 88,
    notes: block.notes.map((note) => ({ ...note, id: "pad-" + note.id, durationTick: 3840 })),
    gold: [{ startTick: 0, endTick: 3840, sourceNotes: block.gold[0].sourceNotes }] };
  const missing = { ...block, id: "transcription-missing-note", family: "transcription",
    notes: block.notes.filter((note) => note.pitch !== 55),
    gold: block.gold.map((event) => ({ ...event, sourceNotes: event.sourceNotes.filter((pitch) => pitch !== 55) })) };
  const ppq = { ...block, id: "ppq-960-export", family: "metadata", ppq: 960,
    notes: block.notes.map((note) => ({ ...note, id: "ppq-" + note.id,
      startTick: note.startTick * 2, durationTick: note.durationTick * 2 })),
    gold: block.gold.map((event) => ({ ...event, startTick: event.startTick * 2, endTick: event.endTick * 2 })) };
  const mixed = addNote(base[3], "mixed-melody-noise", 77, "melody", 960, 960);
  mixed.id = "mixed-role-noise";
  mixed.family = "transcription";
  mixed.notes.push({ id: "mixed-artifact", pitch: 24, role: "artifact", startTick: 980,
    durationTick: 80, track: 3, channel: 0, velocity: 22 });
  const cases = [...base, melody, ornament, pad, missing, ppq, mixed];
  const manifest = { generatorVersion: generatorVersionV2, split: "dev", caseCount: cases.length,
    scenarioIds: cases.map((item) => item.id), sha256: sha256(canonicalJson(cases)) };
  return { manifest, cases };
}
