import { describe, expect, it } from "vitest";
import {
  selectReviewedBuildArtifactFingerprints,
  type BuildArtifactFingerprint,
} from "./buildArtifactLockPolicy";

const frozen: BuildArtifactFingerprint[] = [
  {
    kind: "executable",
    path: "src-tauri/target/release/loop-vault.exe",
    sha256: "a".repeat(64),
    byteLength: 100,
  },
  {
    kind: "msi",
    path: "src-tauri/target/release/bundle/msi/loop-vault.msi",
    sha256: "b".repeat(64),
    byteLength: 200,
  },
  {
    kind: "nsis",
    path: "src-tauri/target/release/bundle/nsis/loop-vault-setup.exe",
    sha256: "c".repeat(64),
    byteLength: 300,
  },
];
const rebuilt: BuildArtifactFingerprint[] = [{
  ...frozen[0]!,
  sha256: "d".repeat(64),
  byteLength: 101,
}, frozen[1]!, frozen[2]!];

describe("reviewed build artifact lock policy", () => {
  it("fails closed on build drift during normal read-only evaluation", () => {
    expect(() => selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: false,
      current: rebuilt,
      frozen,
    })).toThrow(/Build artifact lock mismatch/);
  });

  it("permits build drift only for an explicit reviewed candidate", () => {
    expect(selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: true,
      current: rebuilt,
      frozen,
    })).toEqual(rebuilt);
    expect(() => selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: false,
      current: rebuilt,
      frozen,
    })).toThrow(/Build artifact lock mismatch/);
  });

  it("preserves frozen values during normal matching evaluation", () => {
    expect(selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: false,
      current: structuredClone(frozen),
      frozen,
    })).toBe(frozen);
  });

  it("rejects incomplete reviewed candidates and duplicate artifact kinds", () => {
    expect(() => selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: true,
      current: rebuilt.slice(0, 2),
      frozen,
    })).toThrow(/exactly one executable, MSI, and NSIS/);
    expect(() => selectReviewedBuildArtifactFingerprints({
      emitReviewedLockCandidate: true,
      current: [rebuilt[0]!, rebuilt[0]!, rebuilt[2]!],
      frozen,
    })).toThrow(/exactly one executable, MSI, and NSIS/);
  });
});
