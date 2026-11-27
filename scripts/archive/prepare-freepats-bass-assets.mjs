/* global URL, process, console */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDirectory = resolve(process.argv[2] ?? join(repositoryRoot, ".vendor", "electric-bass-YR"));
const outputDirectory = resolve(process.argv[3] ?? join(repositoryRoot, "src", "features", "bass-practice", "assets", "freepats-bass-yr"));
const upstreamCommit = process.argv[4] ?? "8dcb7ea9116f417273ef8c030d15e7b3aa654301";
const upstreamRepository = "https://github.com/freepats/electric-bass-YR";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function readSfz(file, timbre) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let group = {};
  let currentSection;
  let current = {};
  const regions = [];
  const parseAttributes = (value) => Object.fromEntries([...value.matchAll(/([A-Za-z_]+)=([^\s]+)/g)].map((match) => [match[1], match[2]]));
  const finishSection = () => {
    if (currentSection === "group") { group = { ...group, ...current }; return; }
    if (currentSection !== "region") return;
    const sourceSample = current.sample;
    if (!sourceSample) throw new Error(`Region without sample in ${file}`);
    const lowKey = Number(current.lokey ?? current.key);
    const highKey = Number(current.hikey ?? current.key);
    const rootKey = Number(current.pitch_keycenter ?? current.key);
    if (![lowKey, highKey, rootKey].every(Number.isInteger)) throw new Error(`Invalid SFZ region in ${file}`);
    regions.push({ timbre, lowKey, highKey, rootKey, sourceSample, releaseSeconds: Number(group.ampeg_release ?? 0.3), decaySeconds: Number(group.ampeg_decay ?? 0) });
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const section = line.match(/^<(group|region)>\s*(.*)$/i);
    if (section) {
      finishSection();
      currentSection = section[1].toLowerCase();
      current = parseAttributes(section[2]);
      continue;
    }
    Object.assign(current, parseAttributes(line));
  }
  finishSection();
  return regions.sort((left, right) => left.rootKey - right.rootKey);
}
function runFfmpeg(input, output) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input, "-map_metadata", "-1", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", "-fflags", "+bitexact", "-flags:a", "+bitexact", output], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${input}: ${result.stderr}`);
}

for (const required of ["LICENSE.txt", "README.txt", "FingerBassYR 20190930.sfz", "PickedBassYR 20190930.sfz"]) {
  if (!existsSync(join(sourceDirectory, required))) throw new Error(`Missing upstream FreePats file: ${required}`);
}
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(join(outputDirectory, "samples", "finger"), { recursive: true });
mkdirSync(join(outputDirectory, "samples", "pick"), { recursive: true });
const sourceFiles = [{ timbre: "finger", sfz: "FingerBassYR 20190930.sfz" }, { timbre: "pick", sfz: "PickedBassYR 20190930.sfz" }];
const allRegions = sourceFiles.flatMap(({ timbre, sfz }) => readSfz(join(sourceDirectory, sfz), timbre));
const seen = new Set();
for (const region of allRegions) {
  const input = join(sourceDirectory, region.sourceSample);
  const filename = `${region.timbre}-${region.rootKey}.wav`;
  const output = join(outputDirectory, "samples", region.timbre, filename);
  if (!seen.has(`${region.timbre}:${region.sourceSample}`)) {
    runFfmpeg(input, output);
    seen.add(`${region.timbre}:${region.sourceSample}`);
  }
  region.samplePath = `samples/${region.timbre}/${filename}`;
  region.sourceSha256 = sha256(readFileSync(input));
  delete region.sourceSample;
}
copyFileSync(join(sourceDirectory, "LICENSE.txt"), join(outputDirectory, "LICENSE.txt"));
writeFileSync(join(outputDirectory, "SOURCE.md"), [
  "# FreePats Bass Guitar YR source", "", `- Upstream repository: ${upstreamRepository}`, `- Frozen upstream commit: ${upstreamCommit}`,
  "- License: CC0-1.0 (verified from upstream LICENSE.txt and README.txt)", "- Instruments: Finger Bass YR and Picked Bass YR",
  "- Conversion: ffmpeg-static 5.2.0; mono PCM s16le WAV, 44.1 kHz; metadata removed; deterministic arguments are in scripts/prepare-freepats-bass-assets.mjs.",
  "- No external CDN or runtime download is used.", "", "The bundled WAV files are deterministic conversions from the upstream FLAC samples listed in mapping.json. Do not replace them without regenerating asset-manifest.json.", ""
].join("\n"), "utf8");
const mapping = {
  version: 1,
  upstream: { repository: upstreamRepository, commit: upstreamCommit, license: "CC0-1.0", licenseEvidence: ["LICENSE.txt", "README.txt"] },
  conversion: { tool: "ffmpeg-static", version: "5.2.0", output: { format: "WAV", codec: "pcm_s16le", sampleRateHz: 44100, channels: 1 }, deterministicCommand: "ffmpeg -map_metadata -1 -ac 1 -ar 44100 -c:a pcm_s16le -fflags +bitexact -flags:a +bitexact" },
  officialMapping: { lowestMidiKey: 26, outsideOfficialRange: { midiKeys: [23, 24, 25], labels: ["B0", "C1", "C#1"], fallbackRootMidiKey: 28, maxDownPitchSemitones: 5, harmonicClarity: { highPassHz: 28, reason: "removes only excessive subsonic energy while retaining the B0 fundamental" } } },
  instruments: {
    finger: { displayName: "Finger Bass YR", regions: allRegions.filter((region) => region.timbre === "finger") },
    pick: { displayName: "Picked Bass YR", regions: allRegions.filter((region) => region.timbre === "pick") }
  }
};
writeFileSync(join(outputDirectory, "mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
function walk(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]); }
const assets = walk(join(outputDirectory, "samples")).map((file) => ({ path: relative(outputDirectory, file).replaceAll("\\", "/"), bytes: statSync(file).size, sha256: sha256(readFileSync(file)) })).sort((left, right) => left.path.localeCompare(right.path));
const manifestBody = { version: 1, upstreamCommit, assets };
const manifest = { ...manifestBody, manifestSha256: sha256(stableJson(manifestBody)) };
writeFileSync(join(outputDirectory, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: relative(repositoryRoot, outputDirectory).replaceAll("\\", "/"), assets: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), manifestSha256: manifest.manifestSha256 }, null, 2));