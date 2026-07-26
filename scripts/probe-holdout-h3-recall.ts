import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import type { CandidateCatalog } from "../src/domain/midi/candidateCatalog";

/**
 * Read-only diagnosis of the one holdout-v3 Hard Gate failure.
 *
 * Nothing here changes a threshold, a gate or a product rule; it only answers
 * why two of H3's six sections have no exactly-matching window in the catalog.
 */

const corpus = ".local-evaluation/holdout-v3";
const wanted = [
  { id: "sec1", startBar: 1, endBar: 13 },
  { id: "sec2", startBar: 14, endBar: 32 },
  { id: "sec3", startBar: 33, endBar: 53 },
  { id: "sec4", startBar: 54, endBar: 69 },
  { id: "sec5", startBar: 70, endBar: 86 },
  { id: "sec6", startBar: 87, endBar: 108 },
];

const bytes = new Uint8Array(
  await readFile(resolve(cwd(), corpus, "midi", "H3_non-power-of-two-sections_clean.mid")),
);
const analysis = analyzeMidi(bytes, { mode: "phase4.1.2-v1" });
const catalog = analysis.candidateCatalog as CandidateCatalog;

const ranges = new Set<string>();
const starts = new Map<number, number[]>();
const lengths = new Map<number, number>();
for (const pattern of catalog.patterns) {
  for (const occurrence of pattern.occurrences) {
    ranges.add(`${occurrence.startBar}:${occurrence.endBar}`);
    starts.set(occurrence.startBar, [...(starts.get(occurrence.startBar) ?? []), occurrence.lengthBars]);
    lengths.set(occurrence.lengthBars, (lengths.get(occurrence.lengthBars) ?? 0) + 1);
  }
}

stdout.write(`detected sections: ${JSON.stringify(
  (analysis.sections ?? []).map((section) => [section.startBar, section.endBar]),
)}\n\n`);

stdout.write("window lengths present in the catalog\n");
for (const [length, count] of [...lengths].sort((left, right) => left[0] - right[0])) {
  stdout.write(`  ${String(length).padStart(3)} bars  ${count}\n`);
}

stdout.write("\ngold sections\n");
for (const section of wanted) {
  const exact = ranges.has(`${section.startBar}:${section.endBar}`);
  const atStart = (starts.get(section.startBar) ?? []).sort((left, right) => left - right);
  stdout.write(
    `  ${section.id} ${String(section.startBar).padStart(3)}-${String(section.endBar).padStart(3)}`
    + ` (${section.endBar - section.startBar + 1} bars)  exact ${exact ? "yes" : "NO "}`
    + `  lengths at that start: ${atStart.join(", ") || "(none)"}\n`,
  );
}
