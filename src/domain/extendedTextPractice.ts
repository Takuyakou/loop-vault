import { extendedTextSaveData } from "./extendedTextSave";
import type { ExtendedTextResult } from "./extendedTextProgression";
import { buildProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice/snapshot";
import type { SavedProgressionBlock } from "./types";

export interface ExtendedTextPracticeStatus {
  readonly ready: boolean;
  readonly reason?: string;
}

/** Preflight the same practice snapshot without creating or modifying Vault data. */
export function evaluateExtendedTextPractice(result: ExtendedTextResult, bpm: number): ExtendedTextPracticeStatus {
  if (!result.canConvert) return { ready: false, reason: "invalid-source" };
  const data = extendedTextSaveData(result);
  const block: SavedProgressionBlock = {
    id: "text-preflight", summaryText: data.summaryText, chords: [...data.chords],
    sourceStartBeat: 0, sourceEndBeat: data.scoreLengthBeats,
    startBar: 1, endBar: result.bars.length, lengthBars: result.bars.length,
    bpm, timeSignature: String(data.beatsPerBar) + "/4",
    tags: [], capturedAt: "2000-01-01T00:00:00.000Z",
    analyzerVersion: "text-progression-v1", textSource: data.textSource,
  };
  const evaluated = buildProgressionVoicingPracticeSnapshot({
    sourceReference: { ideaId: "text-preflight", blockId: block.id },
    block, selection: "basic-full",
  });
  return evaluated.ok ? { ready: true } : { ready: false, reason: evaluated.error.code };
}
