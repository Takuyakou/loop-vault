import { useCallback, useEffect, useState } from "react";

/**
 * P23-47-fix-2: "正解したら自動で次へ" is one guide-wide preference. It defaults to off, is shared by
 * the basic and advanced screens, and survives reopening the app.
 */
const STORAGE_KEY = "loop-vault:guided-course-auto-advance:v1";
const listeners = new Set<(on: boolean) => void>();

function storedValue(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useGuidedAutoAdvance(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(storedValue);

  useEffect(() => {
    // Other mounted guided views (basic/advanced) follow the same in-app value.
    const listener = (next: boolean) => setOn(next);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // A blocked storage must not break practice; the in-memory value still applies.
    }
    for (const listener of listeners) listener(next);
  }, []);

  return [on, set] as const;
}
