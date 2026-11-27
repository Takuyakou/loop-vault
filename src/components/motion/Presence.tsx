/**
 * P25-16 N3: the one way a part comes and goes. `show` false keeps the part until its leaving motion has ended
 * (`transitionend`, or the leaving time + 80ms when that never arrives), then removes it. On the way in the part is
 * drawn in its hidden state first and switched to its shown state one frame later, so the browser has a start to move
 * from. With `prefers-reduced-motion: reduce` both ways are immediate. The motion itself lives in `motion.css`.
 */
import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";

export type PresenceState = "enter" | "shown" | "exit";

export interface PresenceRender {
  /** Put on the moving element as `data-presence`. */
  readonly state: PresenceState;
  /** Put on the moving element; ends the leaving motion early when it really has ended. */
  readonly onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Presence({ show, exitMs, after = null, children }: {
  readonly show: boolean;
  /** Drawn in the part's place once it has gone (and before it first comes). */
  readonly after?: ReactNode;
  /** How long the leaving motion runs (the same number as in `motion.css`). */
  readonly exitMs: number;
  readonly children: (presence: PresenceRender) => ReactNode;
}) {
  const [state, setState] = useState<PresenceState | undefined>(() => show ? (prefersReducedMotion() ? "shown" : "enter") : undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    if (show) {
      if (prefersReducedMotion()) { setState("shown"); return undefined; }
      setState((current) => current === "shown" ? current : "enter");
      // Two frames: the browser has to paint the hidden state once before the shown state can move from it.
      // One frame is not enough — React can run the effect in the same task as the commit, so a single rAF
      // callback runs before the first paint and the part would pop in without its rise.
      let inner = 0;
      const frame = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setState("shown")); });
      return () => { cancelAnimationFrame(frame); cancelAnimationFrame(inner); };
    }
    if (prefersReducedMotion()) { setState(undefined); return undefined; }
    setState((current) => current === undefined ? current : "exit");
    timer.current = setTimeout(() => setState(undefined), exitMs + 80);
    return () => clearTimeout(timer.current);
  }, [show, exitMs]);
  if (state === undefined) return <>{after}</>;
  return <>{children({
    state,
    onTransitionEnd: (event) => {
      if (event.target !== event.currentTarget || state !== "exit") return;
      clearTimeout(timer.current);
      setState(undefined);
    },
  })}</>;
}
