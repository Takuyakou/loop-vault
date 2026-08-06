import { useCallback, useSyncExternalStore } from "react";
import type { ChannelMode } from "../domain/types";

/**
 * Shared, persisted input-channel selection (P5.17 acceptance feedback). Both the
 * Record & Compare panel and Practice Settings read and write this one value, so
 * changing it in either place keeps them in sync — same-tab live via a custom
 * event, and across restarts via localStorage.
 */

export const RECORD_CHANNEL_STORAGE_KEY = "loop-vault:bass-practice-record-channel:v1";
const CHANGE_EVENT = "loop-vault:bass-practice-record-channel-change";
const CHANNELS: readonly ChannelMode[] = ["auto", "left", "right", "mono-sum"];
export const DEFAULT_RECORD_CHANNEL: ChannelMode = "auto";

function isChannel(value: unknown): value is ChannelMode {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}

export function getRecordChannel(): ChannelMode {
  if (typeof window === "undefined") return DEFAULT_RECORD_CHANNEL;
  try {
    const stored = window.localStorage.getItem(RECORD_CHANNEL_STORAGE_KEY);
    return isChannel(stored) ? stored : DEFAULT_RECORD_CHANNEL;
  } catch {
    return DEFAULT_RECORD_CHANNEL;
  }
}

export function setRecordChannel(mode: ChannelMode): void {
  if (!isChannel(mode) || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECORD_CHANNEL_STORAGE_KEY, mode);
  } catch {
    /* fall through: still notify in-memory subscribers */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
}

export function subscribeRecordChannel(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener); // cross-tab
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** React binding: the current channel plus a setter that syncs everywhere. */
export function useRecordChannel(): readonly [ChannelMode, (mode: ChannelMode) => void] {
  const channel = useSyncExternalStore(subscribeRecordChannel, getRecordChannel, () => DEFAULT_RECORD_CHANNEL);
  const setChannel = useCallback((mode: ChannelMode) => setRecordChannel(mode), []);
  return [channel, setChannel];
}
