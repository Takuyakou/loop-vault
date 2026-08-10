/**
 * Privacy-safe Stage 00 corpus lock. These are SHA-256 identities of the
 * schema-valid local manifests, never source paths, MIDI titles, or content.
 */
export const lockedP521OfficialSafetyCorpus = Object.freeze({
  clean: {
    identity: "sha256:f5a6a3f20a6e34c9bb486cdc0b0a438b7d9d95303ef24d4068c2379f56251328",
    caseCount: 100,
  },
  dirty: {
    identity: "sha256:d5fb17dde67027057db26725163416b279cac08009d779855aff3d8405681abf",
    caseCount: 1100,
  },
  expectedMode: "voice-aware-rerank-v1",
  /** A docs-only closure descendant may reuse a measured code candidate. */
  codeCandidatePolicy: "same-commit-or-docs-only-descendant",
} as const);

export type LockedP521OfficialSafetyCorpus = typeof lockedP521OfficialSafetyCorpus;
