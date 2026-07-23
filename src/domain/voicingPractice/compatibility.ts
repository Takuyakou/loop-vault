import type { ChordSymbol } from "../types";
import type {
  StyleCompatibility,
  VoicingStyleId,
} from "./types";
import { chordToneDescriptors } from "./tonePolicy";

const rootlessQualities = new Set([
  "maj7",
  "maj9",
  "min7",
  "min9",
  "min11",
  "dom7",
  "dom9",
  "dom13",
  "min7b5",
]);

export function getStyleCompatibility(
  chord: ChordSymbol,
  styleId: VoicingStyleId,
): StyleCompatibility {
  const tones = chordToneDescriptors(chord);
  if (tones.length < 3) {
    return unsupported("コード構成音を解釈できません。");
  }

  if (styleId !== "rootless-ab") {
    return { supported: true };
  }
  if (chord.bass !== undefined && chord.bass !== chord.root) {
    return unsupported("スラッシュコードはルートレスA/BのMVP対象外です。");
  }
  if (!rootlessQualities.has(chord.quality)) {
    return unsupported("このコード種はルートレスA/BのMVP対象外です。");
  }
  return { supported: true };
}

function unsupported(reason: string): StyleCompatibility {
  return {
    supported: false,
    reason,
    fallbackStyleId: "generated-close",
  };
}
