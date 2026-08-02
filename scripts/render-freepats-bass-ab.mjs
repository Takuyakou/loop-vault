/* global URL, process, console, Buffer */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetRoot = join(root, "src", "features", "bass-practice", "assets", "freepats-bass-yr");
const outputRoot = resolve(process.argv[2] ?? join(root, ".local-evaluation", "p516-freepats-bass-ab"));
const mapping = JSON.parse(readFileSync(join(assetRoot, "mapping.json"), "utf8"));
const sampleRate = 44_100;
const sampleCache = new Map();

function samples(relativePath) {
  if (sampleCache.has(relativePath)) return sampleCache.get(relativePath);
  const bytes = readFileSync(join(assetRoot, relativePath)); let offset = 12; let data;
  while (offset + 8 <= bytes.length) { const id = bytes.subarray(offset, offset + 4).toString("ascii"); const length = bytes.readUInt32LE(offset + 4); if (id === "data") data = bytes.subarray(offset + 8, offset + 8 + length); offset += 8 + length + length % 2; }
  const values = new Float64Array(data.length / 2); for (let index = 0; index < values.length; index += 1) values[index] = data.readInt16LE(index * 2) / 32768;
  sampleCache.set(relativePath, values); return values;
}
function region(timbre, midi) {
  const regions = mapping.instruments[timbre].regions;
  return regions.find((item) => midi >= item.lowKey && midi <= item.highKey) ?? (midi >= 23 && midi <= 25 ? regions.find((item) => item.rootKey === 28) : [...regions].sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi) || a.rootKey - b.rootKey)[0]);
}
function render(name, variant, events) {
  const end = Math.ceil((Math.max(...events.map((event) => event.start + event.duration)) + 0.45) * sampleRate); const output = new Float64Array(end);
  for (const event of events) {
    const start = Math.floor(event.start * sampleRate); const length = Math.floor(event.duration * sampleRate); const fade = Math.min(Math.floor(sampleRate * (variant === "pick" ? .08 : .22)), Math.floor(length / 2));
    const sourceRegion = variant === "old" ? undefined : region(variant, event.midi); const source = sourceRegion ? samples(sourceRegion.samplePath) : undefined; const ratio = sourceRegion ? 2 ** ((event.midi - sourceRegion.rootKey) / 12) : 0;
    for (let index = 0; index < length && start + index < output.length; index += 1) {
      const sourceIndex = source ? Math.min(source.length - 1, Math.floor(index * ratio)) : 0;
      const envelope = Math.min(1, index / Math.max(1, Math.floor(.004 * sampleRate))) * Math.min(1, (length - index) / Math.max(1, fade));
      const old = Math.sin(2 * Math.PI * (440 * 2 ** ((event.midi - 69) / 12)) * index / sampleRate) * Math.exp(-index / (sampleRate * .35));
      output[start + index] += (source ? source[sourceIndex] : old) * envelope * event.velocity;
    }
  }
  const measuredRms = Math.sqrt(output.reduce((sum, value) => sum + value * value, 0) / output.length); const gain = measuredRms > 0 ? 0.125 / measuredRms : 1;
  for (let index = 0; index < output.length; index += 1) output[index] = Math.max(-.98, Math.min(.98, output[index] * gain));
  const data = Buffer.alloc(output.length * 2); for (let index = 0; index < output.length; index += 1) data.writeInt16LE(Math.round(output[index] * 32767), index * 2);
  const wav = Buffer.alloc(44); wav.write("RIFF"); wav.writeUInt32LE(36 + data.length, 4); wav.write("WAVE", 8); wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(data.length, 40);
  writeFileSync(join(outputRoot, `${name}-${variant}.wav`), Buffer.concat([wav, data]));
  return { file: `${name}-${variant}.wav`, rms: Number((Math.sqrt(output.reduce((sum, value) => sum + value * value, 0) / output.length)).toFixed(6)), peak: Number(output.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0).toFixed(6)) };
}
const note = (midi, start = 0, duration = .65) => ({ midi, start, duration, velocity: .8 });
const materials = {
  "single-B0": [note(23)], "single-C1": [note(24)], "single-Csharp1": [note(25)], "single-D1": [note(26)], "single-E1": [note(28)], "single-A1": [note(33)], "single-D2": [note(38)],
  "degree-echo-8": [28, 30, 32, 33, 35, 37, 39, 40].map((midi, index) => note(midi, index * .42, .32)),
  "bassline-level-1": [28, 33, 35, 28].map((midi, index) => note(midi, index * .75, .58)),
  "bassline-level-3": [28, 31, 33, 35, 36, 38, 35, 28].map((midi, index) => note(midi, index * .36, .25)),
  "rhythm-echo-cell": [28, 28, 28, 28].map((midi, index) => note(midi, [0, .38, .75, 1.31][index], .11)),
};
rmSync(outputRoot, { recursive: true, force: true }); mkdirSync(outputRoot, { recursive: true });
const outputs = Object.entries(materials).flatMap(([name, events]) => ["old", "finger", "pick"].map((variant) => render(name, variant, events)));
writeFileSync(join(outputRoot, "summary.json"), `${JSON.stringify({ sampleRate, loudnessTargetRms: .125, upstreamCommit: mapping.upstream.commit, outputs }, null, 2)}\n`);
console.log(JSON.stringify({ output: outputRoot, files: outputs.length }, null, 2));