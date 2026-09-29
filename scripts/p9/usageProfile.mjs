import { createHash } from "node:crypto";

export const generatorVersion = "p9-usage-profile-v1";
const PPQ = 480;
const N = (pitch, start, duration, role = "support", track = 1) => ({ pitch, startTick: Math.round(start * PPQ), durationTick: Math.round(duration * PPQ), role, track, channel: 0, velocity: 90 });
const C = (pitches, start, duration, role = "support", track = 1) => pitches.map((pitch) => N(pitch, start, duration, role, track));
const H = (id, family, notes, gold, options = {}) => ({ id, family, notes, gold, meter: options.meter ?? [4, 4], tempoBpm: options.tempoBpm ?? 120 });
const templates = [
  H("block-chord", "clean", C([48, 55, 60, 64], 0, 4), [[0, 4, [48, 55, 60, 64]]]),
  H("split-bass", "instrument", [...C([60, 64, 67], 0, 4), N(36, 0, 4, "bass", 0)], [[0, 4, [36, 60, 64, 67]]]),
  H("restrike", "clean", [...C([48, 55, 60, 64], 0, 2), ...C([48, 55, 60, 64], 2, 2)], [[0, 4, [48, 55, 60, 64]]]),
  H("pedal-and-change", "clean", [N(36, 0, 4, "bass"), ...C([60, 64, 67], 0, 2), ...C([62, 65, 69], 2, 2)], [[0, 2, [36, 60, 64, 67]], [2, 4, [36, 62, 65, 69]]]),
  H("upper-motion", "clean", [...C([48, 55, 60], 0, 4), N(64, 0, 2), N(65, 2, 2)], [[0, 2, [48, 55, 60, 64]], [2, 4, [48, 55, 60, 65]]]),
  H("inner-motion", "clean", [...C([48, 60, 67], 0, 4), N(64, 0, 2), N(62, 2, 2)], [[0, 2, [48, 60, 64, 67]], [2, 4, [48, 60, 62, 67]]]),
  H("arpeggio-delayed", "instrument", [N(48, 0, 4, "bass"), N(60, 0, 4), N(64, 0.25, 3.75), N(67, 0.5, 3.5)], [[0, 4, [48, 60, 64, 67]]]),
  H("anticipation", "clean", [...C([48, 60, 64], 0, 2), N(65, 1.75, 0.25, "ornament"), ...C([53, 60, 65], 2, 2)], [[0, 2, [48, 60, 64]], [2, 4, [53, 60, 65]]]),
  H("one-beat-passing", "temporal", [...C([48, 55, 60, 64], 0, 2), ...C([49, 56, 61, 65], 2, 1), ...C([50, 57, 62, 65], 3, 1)], [[0, 2, [48, 55, 60, 64]], [2, 3, [49, 56, 61, 65]], [3, 4, [50, 57, 62, 65]]]),
  H("half-beat-passing", "temporal", [...C([48, 55, 60, 64], 0, 2), ...C([49, 56, 61, 65], 2, 0.5), ...C([50, 57, 62, 65], 2.5, 1.5)], [[0, 2, [48, 55, 60, 64]], [2, 2.5, [49, 56, 61, 65]], [2.5, 4, [50, 57, 62, 65]]]),
  H("voicing-only", "temporal", [...C([48, 55, 60, 64], 0, 2), ...C([48, 60, 64, 67], 2, 2)], [[0, 2, [48, 55, 60, 64]], [2, 4, [48, 60, 64, 67]]]),
  H("rootless-extension", "clean", C([52, 58, 62, 69], 0, 4), [[0, 4, [52, 58, 62, 69]]]),
  H("ghost-bass", "transcription", [...C([60, 64, 67], 0, 4), N(36, 0, 4, "bass"), N(24, 0.13, 0.10, "artifact")], [[0, 4, [36, 60, 64, 67]]]),
  H("offbeat-octave-bass", "transcription", [...C([60, 64, 67], 0, 4), N(36, 0, 4, "bass"), N(48, 0.35, 0.12, "artifact")], [[0, 4, [36, 60, 64, 67]]]),
  H("sustain-residual", "temporal", [...C([48, 55, 60, 64], 0, 2), ...C([50, 57, 62, 65], 2, 2), N(67, 1.8, 0.45, "residual")], [[0, 2, [48, 55, 60, 64]], [2, 4, [50, 57, 62, 65]]]),
  H("staggered-strum", "instrument", [N(48, 0, 4, "bass"), N(55, 0.08, 3.92), N(60, 0.16, 3.84), N(64, 0.24, 3.76)], [[0, 4, [48, 55, 60, 64]]]),
  H("duplicate-note", "transcription", [...C([48, 55, 60, 64], 0, 4), N(64, 0.06, 0.15, "artifact")], [[0, 4, [48, 55, 60, 64]]]),
  H("note-length-bleed", "transcription", [...C([48, 55, 60, 64], 0, 2.2), ...C([50, 57, 62, 65], 2, 2)], [[0, 2, [48, 55, 60, 64]], [2, 4, [50, 57, 62, 65]]]),
  H("one-quarter-meter", "metadata", [...C([48, 55, 60, 64], 0, 1), ...C([50, 57, 62, 65], 1, 1)], [[0, 1, [48, 55, 60, 64]], [1, 2, [50, 57, 62, 65]]], { meter: [1, 4] }),
  H("tempo-mismatch", "metadata", C([48, 55, 60, 64], 0, 4), [[0, 4, [48, 55, 60, 64]]], { tempoBpm: 97 }),
];
export function canonicalJson(value) { return JSON.stringify(value); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function generateUsageCorpus() {
  const cases = templates.map((source) => ({
    ...source,
    ppq: PPQ,
    notes: source.notes.map((note, index) => ({ ...note, id: source.id + "-n" + index })),
    gold: source.gold.map(([start, end, notes]) => ({ startTick: Math.round(start * PPQ), endTick: Math.round(end * PPQ), sourceNotes: notes })),
  }));
  const manifest = { generatorVersion, split: "dev", caseCount: cases.length, scenarioIds: cases.map((item) => item.id), sha256: sha256(canonicalJson(cases)) };
  return { manifest, cases };
}
