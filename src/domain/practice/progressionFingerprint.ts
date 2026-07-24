import type { SavedProgressionBlock } from "../types";
import { normalizedChordKey } from "../voicing";

export function progressionFingerprint(
  block: SavedProgressionBlock,
  effectiveKeySignature?: string,
): string {
  return fingerprintForKey(
    block,
    effectiveKeySignature ?? block.detectedKey,
  );
}

export function legacyProgressionFingerprint(
  block: SavedProgressionBlock,
): string {
  return fingerprintForKey(block, block.detectedKey);
}

export function isCompatibleProgressionFingerprint(
  block: SavedProgressionBlock,
  fingerprint: string,
  effectiveKeySignature?: string,
): boolean {
  return fingerprint === progressionFingerprint(block, effectiveKeySignature)
    || (
      block.detectedKey === undefined
      && effectiveKeySignature !== undefined
      && fingerprint === legacyProgressionFingerprint(block)
    );
}

function fingerprintForKey(
  block: SavedProgressionBlock,
  keySignature: string | undefined,
): string {
  const payload = JSON.stringify({
    events: block.chords.map((event) => ({
      chord: normalizedChordKey(event.chord),
      bar: event.bar,
      beat: event.beat,
      durationBeats: event.durationBeats,
    })),
    key: keySignature ?? null,
    bpm: block.bpm ?? null,
    timeSignature: block.timeSignature ?? null,
  });
  return `practice-v1-${fnv1a(payload)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

