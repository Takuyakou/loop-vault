import type { DragEvent } from "react";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import type { MidiProgressionAnalysis } from "../../domain/types";

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
