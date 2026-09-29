/** One-shot P9.0 seal. No semantic inspection or evaluation occurs here. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";
import { generateUsageCorpus } from "./usageProfile.mjs";

const localDir = resolve(".local-evaluation/p9-sealed");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const shifts = [12, -12, 7, -7];
function shiftedCase(item, index) {
  const pitchShift = shifts[index % shifts.length];
  const offset = 16 + (index % 5) * 4;
  const tempoBpm = 166 + (index % 6) * 8;
  const meter = index % 2 ? [5, 4] : [3, 4];
  const notes = item.notes.map((note, noteIndex) => {
    const jitter = noteIndex % 2 ? offset : -offset;
    return { ...note, pitch: note.pitch + pitchShift,
      startTick: Math.max(0, note.startTick + jitter),
      durationTick: Math.max(1, note.durationTick - Math.max(0, jitter)),
      track: noteIndex % 3 };
  });
  return { ...item, id: "sealed-" + index, tempoBpm, meter, notes,
    gold: item.gold.map((event) => ({
      ...event, sourceNotes: event.sourceNotes.map((pitch) => pitch + pitchShift),
    })) };
}
const source = generateUsageCorpus().cases;
const selected = [3, 6, 8, 9, 12, 13, 14, 15, 16, 17].map((index, order) => shiftedCase(source[index], order));
const payload = JSON.stringify({ version: "p9-sealed-v1", split: "holdout", cases: selected });
const manifest = {
  schemaVersion: 1, id: "p9-sealed-v1", split: "holdout",
  generatorVersion: "p9-usage-profile-v1+shift-v1",
  recipeFamily: "composite-temporal-transcription-instrument",
  sourceRecipeCount: selected.length,
  shift: { tempoBpm: [166, 206], jitterTicks: [16, 32], meter: ["3/4", "5/4"],
    registerSemitones: [-12, -7, 7, 12], trackPattern: "three-way-split" },
  payloadSha256: sha(payload), openingCount: 0, status: "SEALED",
};
await mkdir(localDir, { recursive: true });
await writeFile(resolve(localDir, "holdout.json"), payload, { flag: "wx" });
await writeFile(resolve(localDir, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
process.stdout.write(JSON.stringify(manifest) + "\n");
