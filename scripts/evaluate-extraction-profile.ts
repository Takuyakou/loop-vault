import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { detectExtractionProfile, prepareMidiForAnalysis } from "../src/domain/midi/extractionProfile";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores, inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";

const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "extraction-profile.json";
function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
if (!midiPath || midiPath === cwd()) throw new Error("Usage: --midi <path>");

const bytes = new Uint8Array(await readFile(midiPath));
const song = parseMidi(bytes);
const profile = detectExtractionProfile(song);
const prepared = prepareMidiForAnalysis(song);

const rolesOff = inferTrackRoles(song, null);
const rolesOn = inferTrackRoles({ ...song, notes: prepared.analysisNotes }, profile);

const off = analyzeMidiWithRankingScores(bytes, {}, {}).analysis;
const on = analyzeMidiWithRankingScores(bytes, {}, { useExtractionProfile: true }).analysis;

/** False-positive check across the Chord Drip corpus. */
const corpusManifest = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
let falsePositives = 0;
let corpusChecked = 0;
let corpusIdentical = 0;
try {
  const manifest = JSON.parse(await readFile(corpusManifest, "utf8")) as ChordDripCorpusManifest;
  for (const file of manifest.files) {
    const corpusBytes = new Uint8Array(await readFile(resolve(dirname(corpusManifest), file.midiFile)));
    const corpusSong = parseMidi(corpusBytes);
    corpusChecked += 1;
    if (detectExtractionProfile(corpusSong)) falsePositives += 1;
    const a = analyzeMidiWithRankingScores(corpusBytes, {}, {}).analysis;
    const b = analyzeMidiWithRankingScores(corpusBytes, {}, { useExtractionProfile: true }).analysis;
    if (JSON.stringify(a) === JSON.stringify(b)) corpusIdentical += 1;
  }
} catch { /* corpus absent locally */ }

const report = {
  schemaVersion: 1,
  stage: "P4.1-05",
  source: { fingerprint: fingerprintMidiBytes(bytes), byteLength: bytes.length },
  profileDetected: profile !== null,
  reasons: profile?.reasons ?? [],
  confidence: profile?.confidence ?? 0,
  notes: {
    raw: song.notes.length,
    analysis: prepared.analysisNotes.length,
    rawUnchanged: prepared.rawNotes === song.notes,
  },
  trackRoles: song.tracks.map((track) => ({
    index: track.index,
    name: track.name ?? null,
    roleWithoutProfile: rolesOff.get(track.index) ?? null,
    roleWithProfile: rolesOn.get(track.index) ?? null,
  })),
  timelineEvents: { withoutProfile: off.fullTimeline.length, withProfile: on.fullTimeline.length },
  falsePositives: { corpusChecked, detections: falsePositives, analysesIdentical: corpusIdentical },
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`profile detected: ${report.profileDetected} (${report.reasons.join(", ")})\n`);
stdout.write(`notes raw ${report.notes.raw} -> analysis ${report.notes.analysis}, raw unchanged: ${report.notes.rawUnchanged}\n`);
for (const row of report.trackRoles) {
  if (!row.name) continue;
  const changed = row.roleWithoutProfile !== row.roleWithProfile ? "  <-- changed" : "";
  stdout.write(`  t${row.index} ${String(row.name).padEnd(24)} ${row.roleWithoutProfile} -> ${row.roleWithProfile}${changed}\n`);
}
stdout.write(`corpus: ${corpusChecked} files, false positives ${falsePositives}, analyses identical ${corpusIdentical}/${corpusChecked}\n`);
