import { resolve } from "node:path";
import { argv } from "node:process";
import { recoverPhase515ReportTransaction } from "./artifactWriter";

const repositoryRoot = argv.at(-1);
if (!repositoryRoot || repositoryRoot.endsWith(".ts")) {
  throw new Error("Recovery crash child requires a repository root.");
}

await recoverPhase515ReportTransaction(
  repositoryRoot,
  resolve(repositoryRoot, "docs/phase5.15"),
  {
    afterRollbackTargetCaptured: argv.includes("--kill-after-rollback-capture")
      ? () => {
        process.kill(process.pid, "SIGKILL");
      }
      : undefined,
    afterRollbackCaptureVerified: argv.includes("--kill-after-rollback-verification")
      ? () => {
        process.kill(process.pid, "SIGKILL");
      }
      : undefined,
    afterBackupCapture: argv.includes("--kill-after-backup-capture")
      ? () => {
        process.kill(process.pid, "SIGKILL");
      }
      : undefined,
    afterAuxiliaryCleanup: (count) => {
      if (
        argv.includes("--kill-after-backup-capture")
        || argv.includes("--kill-after-rollback-capture")
        || argv.includes("--kill-after-rollback-verification")
      ) return;
      if (count === 1) process.kill(process.pid, "SIGKILL");
    },
  },
);
