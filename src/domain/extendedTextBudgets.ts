/** Independent source-document safety limits; Standard text keeps its own caps. */
export const EXTENDED_TEXT_LIMITS = Object.freeze({
  maxInputCodeUnits: 65_536,
  maxBars: 256,
  maxScoreTokens: 4_096,
  maxHarmonicSpans: 2_400,
  maxAttacks: 4_096,
  maxComments: 400,
  maxSections: 512,
  maxSlotsPerBar: 16,
  timingPpq: 960,
  maxScoreBeats: 256 * 12,
});
