import { describe, expect, it } from "vitest";
import { selectExactLockedCorpusPair } from "./measureRoleV2OfficialChordSafety";
import { lockedP521OfficialSafetyCorpus } from "./roleV2OfficialSafetyContract";

describe("P5.21 Stage 02 official corpus selection", () => {
  it("selects the one exact Stage 00 manifest pair", () => {
    const selected = selectExactLockedCorpusPair([
      sameCountDifferentCleanHash(),
      exactPair(),
    ]);

    expect(selected.id).toBe("exact");
  });

  it("fails closed when only a same-count different-hash pair is available", () => {
    expect(() => selectExactLockedCorpusPair([sameCountDifferentCleanHash()]))
      .toThrow("expected exactly one exact locked clean/dirty corpus pair");
  });
});

function exactPair() {
  return {
    id: "exact",
    cleanManifest: { identity: lockedP521OfficialSafetyCorpus.clean.identity, fileCount: lockedP521OfficialSafetyCorpus.clean.caseCount },
    dirtyManifest: { identity: lockedP521OfficialSafetyCorpus.dirty.identity, fileCount: lockedP521OfficialSafetyCorpus.dirty.caseCount },
  };
}

function sameCountDifferentCleanHash() {
  return {
    id: "same-count-different-hash",
    cleanManifest: {
      identity: `sha256:${"0".repeat(64)}`,
      fileCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
    },
    dirtyManifest: { identity: lockedP521OfficialSafetyCorpus.dirty.identity, fileCount: lockedP521OfficialSafetyCorpus.dirty.caseCount },
  };
}
