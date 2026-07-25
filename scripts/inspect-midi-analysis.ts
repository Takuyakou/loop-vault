import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";

const path = argv[argv.length - 1];
if (!path) throw new Error("Usage: vite-node scripts/inspect-midi-analysis.ts <midi-path>");
const bytes = new Uint8Array(await readFile(resolve(cwd(), path)));
for (const mode of ["legacy", "phase4-v1"] as const) {
  const result = analyzeMidi(bytes, { mode, fileName: path });
  stdout.write(`${mode} (${result.analyzerVersion})\n`);
  result.fullTimeline.forEach((item) => stdout.write(
    `  ${item.bar}:${item.beat} +${item.durationBeats} ${item.chord.label} [${item.alternatives.map((entry) => entry.chord.label).join(", ")}] ${item.warnings.join(",")}\n`,
  ));
}
