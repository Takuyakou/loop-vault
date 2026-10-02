import { useCallback, useEffect, useState } from "react";

/**
 * P10.3 §1: a notice in the control bar shows for `ms` (5 s) and goes; it stays while the
 * pointer is on it (`hold(true)`), and a new notice replaces it (and starts its own time).
 * Notices people must read (role="alert") do not use this.
 */
export function useFadingNotice(ms = 5000): { notice: string | undefined; say: (text?: string) => void; hold: (held: boolean) => void } {
  const [notice, setNotice] = useState<{ text: string; seq: number }>();
  const [held, setHeld] = useState(false);
  const say = useCallback((text?: string) => setNotice((current) => text ? { text, seq: (current?.seq ?? 0) + 1 } : undefined), []);
  useEffect(() => {
    if (!notice || held) return undefined;
    const timer = setTimeout(() => setNotice(undefined), ms);
    return () => clearTimeout(timer);
  }, [held, ms, notice]);
  return { notice: notice?.text, say, hold: setHeld };
}
