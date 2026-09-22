/**
 * Union-chimera partition decision (P5.37 policy v1) — pure, deterministic, and
 * shared by production (`analyzeMidiWithRankingScores`), the shadow, and the
 * promotion tests, so there is a single implementation of the frozen trigger.
 *
 * It changes no candidate vocabulary, scorer, or bass extraction. It only decides
 * WHETHER a fixed 2-beat window's evidence is a union chimera (two materially
 * different coherent local harmonies merged so the top-1 candidate is supported by
 * neither beat individually) and, if so, which two coherent local states it
 * partitions into. The trigger reads only runtime candidate rankings + per-beat
 * pitch-class evidence; no expected/known chord is consulted.
 *
 * Frozen policy v1 (P5.37-01/02, PROMOTION = PASS): trigger iff
 *   (A) the W2 winner is top-1 in NEITHER beat, AND
 *   (C) the two beats' winners are materially different harmonic identities (roots), AND
 *   (D) the W2 winner's chord tones are supported by BOTH beats, AND
 *   (F) each beat carries >= `minBucketPcs` distinct pitch classes.
 */

export const UNION_CHIMERA_DEFAULT_MIN_BUCKET_PCS = 3;

export type UnionChimeraReason =
  | "legacy-coherent"
  | "union-chimera-detected"
  | "insufficient-bucket-evidence"
  | "same-state-reattack"
  | "buckets-same-identity"
  | "support-not-spanning";

export interface UnionChimeraWindowInput {
  /** W2 (2-beat window) top-1 label / root / chord-tone pitch classes. */
  readonly w2WinnerLabel: string;
  readonly w2WinnerRoot: number;
  readonly w2WinnerPcs: readonly number[];
  /** Beat-0 top-1 label / root, and the distinct pitch classes present in beat 0. */
  readonly b0WinnerLabel: string | null;
  readonly b0WinnerRoot: number | null;
  readonly b0Pcs: ReadonlySet<number>;
  readonly b0HasEvidence: boolean;
  /** Beat-1 top-1 label / root, and the distinct pitch classes present in beat 1. */
  readonly b1WinnerLabel: string | null;
  readonly b1WinnerRoot: number | null;
  readonly b1Pcs: ReadonlySet<number>;
  readonly b1HasEvidence: boolean;
}

export interface UnionChimeraDecision {
  readonly triggered: boolean;
  readonly reason: UnionChimeraReason;
  /** Coherent local states when triggered (beat-0 / beat-1 winners), else null. */
  readonly state0Label: string | null;
  readonly state1Label: string | null;
  readonly winnerWinsNeitherBeat: boolean;
  readonly bucketsDifferentIdentity: boolean;
  readonly supportSpansBothBeats: boolean;
}

/** Evaluates the frozen union-chimera trigger for one window. Pure. */
export function evaluateUnionChimeraWindow(
  input: UnionChimeraWindowInput,
  minBucketPcs: number = UNION_CHIMERA_DEFAULT_MIN_BUCKET_PCS,
): UnionChimeraDecision {
  const winnerWinsNeitherBeat =
    input.b0HasEvidence && input.b1HasEvidence
    && input.w2WinnerLabel !== input.b0WinnerLabel
    && input.w2WinnerLabel !== input.b1WinnerLabel;
  const bucketsDifferentIdentity =
    input.b0WinnerRoot !== null && input.b1WinnerRoot !== null
    && input.b0WinnerRoot !== input.b1WinnerRoot;

  // Support of the W2 winner's chord tones across the two beats.
  let b0Only = 0;
  let b1Only = 0;
  let both = 0;
  for (const pc of input.w2WinnerPcs) {
    const in0 = input.b0Pcs.has(pc);
    const in1 = input.b1Pcs.has(pc);
    if (in0 && in1) both += 1;
    else if (in0) b0Only += 1;
    else if (in1) b1Only += 1;
  }
  const supportSpansBothBeats = (b0Only > 0 || both > 0) && (b1Only > 0 || both > 0) && (b0Only + b1Only) > 0;

  const base = { winnerWinsNeitherBeat, bucketsDifferentIdentity, supportSpansBothBeats };

  if (!input.b0HasEvidence || !input.b1HasEvidence || input.b0Pcs.size < minBucketPcs || input.b1Pcs.size < minBucketPcs) {
    return { triggered: false, reason: "insufficient-bucket-evidence", state0Label: null, state1Label: null, ...base };
  }
  if (!winnerWinsNeitherBeat) {
    return {
      triggered: false,
      reason: input.b0WinnerLabel === input.b1WinnerLabel ? "same-state-reattack" : "legacy-coherent",
      state0Label: null, state1Label: null, ...base,
    };
  }
  if (!bucketsDifferentIdentity) {
    return { triggered: false, reason: "buckets-same-identity", state0Label: null, state1Label: null, ...base };
  }
  if (!supportSpansBothBeats) {
    return { triggered: false, reason: "support-not-spanning", state0Label: null, state1Label: null, ...base };
  }
  return {
    triggered: true,
    reason: "union-chimera-detected",
    state0Label: input.b0WinnerLabel,
    state1Label: input.b1WinnerLabel,
    ...base,
  };
}
