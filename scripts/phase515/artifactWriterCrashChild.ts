import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv } from "node:process";
import {
  PHASE515_REPORT_NAMES,
  promotePrivacySafeReports,
} from "./artifactWriter";

const repositoryRoot = argv.at(-1);
if (!repositoryRoot || repositoryRoot.endsWith(".ts")) {
  throw new Error("Crash child requires a repository root.");
}
const outputRoot = resolve(repositoryRoot, "docs/phase5.15");
const reports = Object.fromEntries(
  await Promise.all(PHASE515_REPORT_NAMES.map(async (name) => [
    name,
    {
      ...JSON.parse(await readFile(resolve(outputRoot, name), "utf8")),
      revision: 2,
    },
  ])),
);

await promotePrivacySafeReports(repositoryRoot, outputRoot, reports, {
  afterTargetCaptured: argv.includes("--kill-after-target-capture")
    ? () => {
      process.kill(process.pid, "SIGKILL");
    }
    : undefined,
  afterTargetCaptureVerified: argv.includes("--kill-after-target-verification")
    ? () => {
      process.kill(process.pid, "SIGKILL");
    }
    : undefined,
  afterPromotion: (count) => {
    if (
      argv.includes("--kill-after-target-capture")
      || argv.includes("--kill-after-target-verification")
    ) return;
    if (count === 2) process.kill(process.pid, "SIGKILL");
  },
});
