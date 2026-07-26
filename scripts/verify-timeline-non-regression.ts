import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";

/**
 * Chord detection non-regression for P4.1.2.
 *
 * Stages A through E changed which candidates are offered, never how a chord is
 * named. This asserts that directly: the timeline `phase4.1.2-v1` produces must
 * be identical to `phase4-v1`'s, event for event, on the real corpus. A single
 * differing label would mean something in the selection work reached the
 * detector.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  files: Array<{ caseId: string; midiFile: string }>;
};

let checked = 0;
let identical = 0;
const differing: string[] = [];

const fingerprint = (bytes: Uint8Array, mode: "phase4-v1" | "phase4.1.2-v1") => JSON.stringify(
  analyzeMidi(bytes, { mode }).fullTimeline.map(
    (item) => [item.bar, item.beat, item.durationBeats, item.chord.label],
  ),
);

for (const entry of manifest.files) {
  const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), entry.midiFile)));
  checked += 1;
  if (fingerprint(bytes, "phase4-v1") === fingerprint(bytes, "phase4.1.2-v1")) identical += 1;
  else differing.push(entry.caseId);
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.2 final",
  corpus: "Chord Drip evaluation corpus",
  comparison: "phase4-v1 vs phase4.1.2-v1 fullTimeline",
  checked,
  identical,
  differing,
};
// Each stage records its own run rather than overwriting the previous one, so a
// later result cannot be mistaken for the evidence an earlier promotion rested on.
const outputIndex = argv.indexOf("--output");
const outputPath = resolve(
  cwd(),
  outputIndex >= 0 ? argv[outputIndex + 1] : "docs/phase4.1.2/07-timeline-non-regression.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`timeline identical ${identical}/${checked}\n`);
if (differing.length) stdout.write(`differing: ${differing.slice(0, 10).join(", ")}\n`);
