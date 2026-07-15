import { useSyncExternalStore } from "react";
import {
  playbackController,
  type PlaybackController,
  type PlaybackState,
} from "../audio/playbackController";

export function usePlaybackState(
  controller: PlaybackController = playbackController,
): PlaybackState {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
}
