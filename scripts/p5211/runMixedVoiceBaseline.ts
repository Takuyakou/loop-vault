import { auditP5211LocalHarmonicCoreBaseline } from "./auditMixedVoiceBaseline";

async function main(): Promise<void> {
  const artifact = await auditP5211LocalHarmonicCoreBaseline();
  process.stdout.write(`P5.21.1 local baseline: fixture=${artifact.fixtureId}; deterministic=${artifact.deterministic}; topology=${artifact.topology.failureTopologyVerified}; output=ignored-local.\n`);
}

void main().catch(() => {
  process.stderr.write("P5.21.1 local baseline failed: local input validation or analysis failed.\n");
  process.exitCode = 1;
});
