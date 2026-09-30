import type { DragEvent } from "react";
import { playbackController, type PlaybackController, type PlayingSource } from "../../audio/playbackController";
import type { ChordTimelineItem, MidiProgressionAnalysis } from "../../domain/types";
import { resolveTimelineItemVoicing } from "../../domain/voicing";

/** Shared by CaptureView and its hooks (moved out of CaptureView.tsx unchanged). */
export type CaptureAnalysisProgressStage = "reading" | "analyzing" | "finalizing";

export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function waitForStatusFeedback(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
}

export function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

export function isMidiFileName(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export function hasDroppedFiles(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function stopCapturePlayback(controller: PlaybackController = playbackController): void {
  if (controller.getState().source?.kind === "capture") {
    controller.stop();
  }
}

export function captureAnalysisIdentity(result: MidiProgressionAnalysis | undefined): string {
  if (!result) return "analysis";
  if (result.sourceFingerprint) return `fingerprint:${encodeURIComponent(result.sourceFingerprint)}`;

  return [
    result.sourceAssetId ? `asset:${encodeURIComponent(result.sourceAssetId)}` : undefined,
    result.fileName ? `file:${encodeURIComponent(result.fileName)}` : undefined,
    `analyzed:${encodeURIComponent(result.analyzedAt)}`,
    `analyzer:${encodeURIComponent(result.analyzerVersion)}`,
  ].filter(Boolean).join("|");
}

/**
 * Notes for a single chord card click.
 *
 * Clicking one chord used to fall through to the generated preview voicing while
 * the same chord played its original MIDI voicing everywhere else, so a chord
 * auditioned in capture sounded different from the same chord in Progression
 * Detail and Chord Dojo. This resolves it the same way those screens do.
 *
 * `resolveTimelineItemVoicing` checks the stored voicing against the chord, so an
 * edited chord falls back to a generated voicing instead of replaying the
 * voicing of the chord it replaced.
 */
export function singleChordVoicing(event: ChordTimelineItem | undefined): readonly number[] | undefined {
  if (!event) return undefined;
  return resolveTimelineItemVoicing(event).midiNotes;
}

export function captureCandidateSource(
  result: MidiProgressionAnalysis | undefined,
  candidateId: string,
): PlayingSource {
  return {
    kind: "capture",
    id: `analysis:${captureAnalysisIdentity(result)}:candidate:${candidateId}`,
  };
}

export function captureFullTimelineSource(result: MidiProgressionAnalysis): PlayingSource {
  return {
    kind: "capture",
    id: `analysis:${captureAnalysisIdentity(result)}:full-timeline`,
  };
}
