import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { parseMidi } from "../../src/domain/midi/parser";

/**
 * Selects the approved ignored-local fixture without emitting private paths.
 * The identifying metadata is pre-existing P5.38 evidence and stays local to
 * the discovery boundary.
 */
export function discoverLfMidi001Candidates(root: string): string[] {
  const matches: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!/^\.midi?$/i.test(extname(entry.name))) continue;
      try {
        const data = parseMidi(new Uint8Array(readFileSync(entryPath)));
        if (
          data.timeSignature === "1/4"
          && data.totalBars === 65
          && data.ticksPerBeat === 96
          && data.notes.length === 574
        ) {
          matches.push(entryPath);
        }
      } catch {
        // Ignore unreadable/non-SMF files without disclosing their path.
      }
    }
  }
  return matches;
}
