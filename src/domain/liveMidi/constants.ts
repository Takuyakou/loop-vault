export const LIVE_CHORD_TIMING = {
  gatherMs: 40,
  stableMs: 50,
  releaseGraceMs: 200,
  historyCommitMs: 400,
  bassGraceMs: 120,
  fullReleaseMs: 180,
} as const;

export const FAST_PROVISIONAL_NOTE_SPAN_MS = 30;
export const FAST_PROVISIONAL_SCORE_MARGIN = 0.03;

export const LIVE_CHORD_HISTORY_LIMIT = 64;
