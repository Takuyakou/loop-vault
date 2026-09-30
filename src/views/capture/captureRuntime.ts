import type { DragEvent } from "react";
import { playbackController, type PlaybackController } from "../../audio/playbackController";

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
