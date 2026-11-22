import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const FAVORITE_DOT_ANGLES = [0, 60, 120, 180, 240, 300] as const;

/** Six radial dots that burst outward when a favorite button has data-pop="true" (P23-58 A2). */
export function FavoriteDots() {
  return (
    <>
      {FAVORITE_DOT_ANGLES.map((deg) => (
        <span
          key={deg}
          aria-hidden="true"
          className="lv-fav-dot"
          style={{ "--lv-dot-a": `${deg}deg` } as CSSProperties}
        />
      ))}
    </>
  );
}

/** Transient boolean flag that resets to false after durationMs (P23-58 A1/A2). */
export function useTransientFlag(durationMs: number): [boolean, () => void, () => void] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(false);
  }, []);

  const trigger = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setActive(false);
    }, durationMs);
  }, [durationMs]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return [active, trigger, clear];
}

export type SaveButtonState = "idle" | "busy" | "done";

/** Inline save button state machine: idle -> busy (briefly visible) -> done (1.5s) -> idle (P23-58 A3). */
export function useSaveButtonState(doneDurationMs = 1500, busyDurationMs = 180) {
  const [state, setState] = useState<SaveButtonState>("idle");
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setState("idle");
  }, [clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    setState("busy");
  }, [clearTimer]);

  const succeed = useCallback(() => {
    clearTimer();
    setState("busy");
    timerRef.current = window.setTimeout(() => {
      setState("done");
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState("idle");
      }, doneDurationMs);
    }, busyDurationMs);
  }, [busyDurationMs, clearTimer, doneDurationMs]);

  useEffect(() => clearTimer, [clearTimer]);

  return { state, start, succeed, reset };
}
