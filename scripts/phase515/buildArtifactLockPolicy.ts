export type BuildArtifactFingerprint = {
  kind: "executable" | "msi" | "nsis";
  path: string;
  sha256: string;
  byteLength: number;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function selectReviewedBuildArtifactFingerprints(options: {
  emitReviewedLockCandidate: boolean;
  current: BuildArtifactFingerprint[];
  frozen: BuildArtifactFingerprint[];
}): BuildArtifactFingerprint[] {
  assertCompleteArtifactSet(options.frozen, "Frozen build artifact lock");
  if (options.emitReviewedLockCandidate) {
    assertCompleteArtifactSet(options.current, "Reviewed build artifact candidate");
    return options.current;
  }
  for (const current of options.current) {
    const locked = options.frozen.find((item) => item.kind === current.kind);
    if (!locked || stableJson(current) !== stableJson(locked)) {
      throw new Error(`Build artifact lock mismatch: ${current.path}.`);
    }
  }
  return options.frozen;
}

function assertCompleteArtifactSet(
  entries: readonly BuildArtifactFingerprint[],
  label: string,
): void {
  const expected = ["executable", "msi", "nsis"];
  const kinds = entries.map((entry) => entry.kind).sort();
  if (JSON.stringify(kinds) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must contain exactly one executable, MSI, and NSIS artifact.`,
    );
  }
  for (const entry of entries) {
    if (
      !entry.path
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isInteger(entry.byteLength)
      || entry.byteLength <= 0
    ) {
      throw new Error(`${label} contains incomplete artifact metadata.`);
    }
  }
}
