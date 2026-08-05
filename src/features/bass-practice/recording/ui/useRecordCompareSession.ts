import { useEffect, useRef, useState } from "react";
import { negotiateCodec } from "../domain/codecNegotiation";
import type { ChannelMode } from "../domain/types";
import type { RecorderState } from "../domain/recorderStateMachine";
import { createBrowserRecordingController } from "../application/createController";
import type { RecordingSessionController } from "../application/recordingSessionController";
import type { RecordingTake } from "../application/ports";

/**
 * React lifecycle wrapper around a RecordingSessionController (P5.17-02). It
 * owns exactly one controller, probes capability on mount, mirrors the recorder
 * state into React, and — critically — disposes the controller on unmount / mode
 * change so switching Bass Practice modes or leaving the route never leaks a
 * capture graph. The host view decides *when* to render the section; this hook
 * decides *how* it behaves.
 */

export interface UseRecordCompareOptions {
  /** Injected in tests; defaults to the browser adapter controller. */
  readonly controllerFactory?: () => RecordingSessionController;
  /** Injected in tests; defaults to `MediaRecorder.isTypeSupported`. */
  readonly isTypeSupported?: (mimeType: string) => boolean;
  /** Re-create the controller when this key changes (e.g. mode switch). */
  readonly resetKey?: string;
}

export interface RecordCompareSession {
  readonly state: RecorderState | null;
  currentTake(): RecordingTake | undefined;
  enable(): Promise<void>;
  setChannel(mode: ChannelMode): void;
  startCountIn(): void;
  cancelCountIn(): void;
  record(): Promise<void>;
  stop(): Promise<void>;
  playTarget(): void;
  playTake(): void;
  playbackEnded(): void;
  retake(): void;
  discard(): void;
  keep(): Promise<void>;
}

function defaultIsTypeSupported(mimeType: string): boolean {
  return typeof MediaRecorder !== "undefined"
    && typeof MediaRecorder.isTypeSupported === "function"
    && MediaRecorder.isTypeSupported(mimeType);
}

export function useRecordCompareSession(
  options: UseRecordCompareOptions = {},
): RecordCompareSession {
  const { controllerFactory, isTypeSupported = defaultIsTypeSupported, resetKey } = options;
  const controllerRef = useRef<RecordingSessionController | null>(null);
  const [state, setState] = useState<RecorderState | null>(null);

  useEffect(() => {
    const controller = controllerFactory
      ? controllerFactory()
      : createBrowserRecordingController();
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setState);
    setState(controller.probe());
    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
    // Only resetKey re-creates the controller; controllerFactory is captured
    // once on purpose so a new closure each render does not tear down capture.
  }, [resetKey]);

  const withController = <T>(run: (controller: RecordingSessionController) => T): T | undefined => {
    const controller = controllerRef.current;
    return controller ? run(controller) : undefined;
  };

  const chooseMimeType = (): string => {
    const choice = negotiateCodec(isTypeSupported);
    return choice?.mimeType ?? "audio/webm";
  };

  return {
    state,
    currentTake() {
      return withController((controller) => controller.currentTake());
    },
    async enable() {
      await withController((controller) => controller.enableRecording());
    },
    setChannel(mode) {
      withController((controller) => controller.setChannel(mode));
    },
    startCountIn() {
      withController((controller) => controller.startCountIn());
    },
    cancelCountIn() {
      withController((controller) => controller.cancelCountIn());
    },
    async record() {
      await withController((controller) => controller.beginRecording({ mimeType: chooseMimeType() }));
    },
    async stop() {
      await withController((controller) => controller.stop());
    },
    playTarget() {
      withController((controller) => controller.playTarget());
    },
    playTake() {
      withController((controller) => controller.playTake());
    },
    playbackEnded() {
      withController((controller) => controller.playbackEnded());
    },
    retake() {
      withController((controller) => controller.retake());
    },
    discard() {
      withController((controller) => controller.discard());
    },
    async keep() {
      await withController((controller) => controller.keep());
    },
  };
}
