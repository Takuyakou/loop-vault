import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { stdout } from "node:process";
import { URL } from "node:url";

const outputPath = new URL("../demo-data/loop-vault-demo-100.json", import.meta.url);
const keys = ["C", "D", "Eb", "E", "F", "F#", "G", "A", "Bb"];
const roots = { C: 0, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, A: 9, Bb: 10 };
const names = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const tags = ["warm", "dark", "lift", "neo-soul", "turnaround", "ambient"];
const startedAt = performance.now();

function uuid(index, group = 1) {
  return `00000000-0000-4${String(group).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}
function chord(root, quality, bar) {
  const pitch = (root + 120) % 12;
  const suffix = quality === "maj7" ? "maj7" : quality === "min7" ? "m7" : quality === "dom7" ? "7" : "";
  return { bar, beat: 1, durationBeats: 4, chord: { root: pitch, quality, tensions: [], label: `${names[pitch]}${suffix}` }, confidence: 0.94, alternatives: [], warnings: [] };
}
function progression(key, variant) {
  const tonic = roots[key];
  const pattern = variant % 4 === 0
    ? [[0, "maj7"], [7, "dom7"], [9, "min7"], [5, "maj7"]]
    : [[5, "maj7"], [7, "dom7"], [4, "min7"], [9, "min7"]];
  return pattern.map(([interval, quality], index) => chord(tonic + interval, quality, index + 1));
}

let blockIndex = 0;
const ideas = Array.from({ length: 30 }, (_, ideaIndex) => {
  const key = keys[ideaIndex % keys.length];
  const count = ideaIndex < 10 ? 4 : 3;
  const progressionBlocks = Array.from({ length: count }, () => {
    const index = blockIndex++;
    const capturedAt = new Date(Date.UTC(2026, index % 12, (index % 27) + 1, 12)).toISOString();
    return {
      id: uuid(index + 1, 2), pinned: index % 13 === 0, sourceFileName: `demo-${(index % 12) + 1}.mid`,
      startBar: 1, endBar: [4, 8, 16][index % 3], lengthBars: [4, 8, 16][index % 3],
      summaryText: index % 4 === 0 ? "Pop loop" : "4-5-3-6 turnaround", chords: progression(key, index),
      detectedKey: key, bpm: 72 + (index % 22) * 4, memo: "Demo progression", tags: [tags[index % tags.length]],
      capturedAt, analyzerVersion: "demo-seed-1",
    };
  });
  const now = new Date(Date.UTC(2026, 0, ideaIndex + 1, 12)).toISOString();
  return {
    id: uuid(ideaIndex + 1), title: `Demo Idea ${String(ideaIndex + 1).padStart(2, "0")}`,
    bpm: 72 + ideaIndex * 3, key, genre: ideaIndex % 2 ? "future garage" : "neo soul",
    moods: [tags[ideaIndex % tags.length]], status: "idea",
    nextAction: { text: "Build an eight-bar loop", updatedAt: now }, chordMemo: "",
    references: [], assets: [], progressionBlocks, statusHistory: [{ status: "idea", at: now }],
    createdAt: now, updatedAt: now,
  };
});
const vault = { app: "loopvault", fileVersion: 1, settings: { monthlyGoal: 4, language: "ja", showRomanNumerals: true }, ideas };
await mkdir(new URL("../demo-data/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(vault, null, 2)}\n`, "utf8");
const matching = ideas.flatMap((idea) => idea.progressionBlocks).filter((block) => block.summaryText.includes("4-5-3-6")).length;
stdout.write(`Generated ${ideas.length} ideas / ${blockIndex} progression blocks (${matching} transposed 4-5-3-6 examples) in ${(performance.now() - startedAt).toFixed(1)} ms\n`);
stdout.write(`${outputPath.pathname.replace(/^\//, "")}\n`);
