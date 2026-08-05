import type { ChannelMode, ResolvedChannel } from "./types";

/**
 * Input-channel routing (contract 01 / brief §10.2). A recording is always mono.
 * Explicit modes map directly; `auto` inspects short-window per-channel RMS and
 * picks the louder channel — but only when the decision is confident. On low
 * confidence (both near silence, or the two channels too close) it declines, so
 * the UI can ask instead of silently capturing the wrong input.
 */

export interface ChannelEnergies {
  readonly left: number;
  readonly right: number;
}

export type AutoResolution =
  | { readonly ok: true; readonly channel: ResolvedChannel }
  | { readonly ok: false; readonly reason: "silent" | "ambiguous" };

/** Below this RMS both channels are considered silent. */
export const AUTO_NOISE_FLOOR = 0.02;
/** The louder channel must exceed the other by at least this ratio to win. */
export const AUTO_DOMINANCE_RATIO = 1.5;

export function resolveAutoChannel(
  energies: ChannelEnergies,
  noiseFloor: number = AUTO_NOISE_FLOOR,
  dominanceRatio: number = AUTO_DOMINANCE_RATIO,
): AutoResolution {
  const { left, right } = energies;
  if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) {
    throw new RangeError("Channel energies must be finite and non-negative.");
  }
  if (left < noiseFloor && right < noiseFloor) {
    return Object.freeze({ ok: false, reason: "silent" });
  }
  const louder = Math.max(left, right);
  const quieter = Math.min(left, right);
  // Guard divide-by-zero: quieter can be 0 when one channel is fully silent.
  const ratio = quieter === 0 ? Infinity : louder / quieter;
  if (ratio < dominanceRatio) {
    return Object.freeze({ ok: false, reason: "ambiguous" });
  }
  return Object.freeze({ ok: true, channel: left >= right ? "left" : "right" });
}

/**
 * Resolves the concrete mono channel to capture. For `auto`, `autoResolution`
 * must be supplied; when Auto cannot decide, this returns undefined so the
 * caller falls back to a manual picker (never a silent wrong guess).
 */
export function resolveChannel(
  mode: ChannelMode,
  autoResolution?: AutoResolution,
): ResolvedChannel | undefined {
  switch (mode) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "mono-sum":
      return "mono-sum";
    case "auto":
      return autoResolution?.ok ? autoResolution.channel : undefined;
    default:
      throw new RangeError("Unknown channel mode.");
  }
}
