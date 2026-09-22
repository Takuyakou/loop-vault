/**
 * P5.38 ignored-local runner. Emits privacy-safe counts only.
 *
 * The input path is accepted as the final CLI argument but is never printed.
 */
import { readFileSync } from "node:fs";
import { argv } from "node:process";

import { stage00DownstreamBaseline } from "./stage00Baseline";

const path = argv[argv.length - 1];
if (!/\.(mid|midi)$/i.test(path ?? "")) {
  throw new Error("usage: vite-node scripts/p538/run-stage00-local.ts <midi-path>");
}

const baseline = stage00DownstreamBaseline(new Uint8Array(readFileSync(path)));
process.stdout.write(`${JSON.stringify(baseline)}\n`);
