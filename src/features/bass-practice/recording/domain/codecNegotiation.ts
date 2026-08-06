import type { CodecChoice } from "./types";

/**
 * Codec negotiation (contract 04 / brief §11.3). Never hard-codes one codec:
 * given a support probe (`MediaRecorder.isTypeSupported`), pick the first
 * candidate that the runtime supports. The considered order is reported.
 *
 * Actually starting a recording and confirming playback happens in the
 * application layer; this pure step only chooses the MIME type to attempt.
 */

export type SupportProbe = (mimeType: string) => boolean;

/** Preference order: Opus-in-WebM first (WebView2/Chromium), then fallbacks. */
export const DEFAULT_CODEC_PREFERENCE: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
];

export function negotiateCodec(
  isTypeSupported: SupportProbe,
  preference: readonly string[] = DEFAULT_CODEC_PREFERENCE,
): CodecChoice | undefined {
  if (preference.length === 0) {
    throw new RangeError("Codec preference must not be empty.");
  }
  const consideredOrder = Object.freeze([...preference]);
  for (const mimeType of preference) {
    let supported: boolean;
    try {
      supported = isTypeSupported(mimeType);
    } catch {
      supported = false; // a throwing probe is treated as "unsupported"
    }
    if (supported) {
      return Object.freeze({ mimeType, consideredOrder });
    }
  }
  return undefined; // caller disables only recording; Bass Practice stays usable
}
