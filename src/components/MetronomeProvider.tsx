import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { loadMetronomeEnabled, saveMetronomeEnabled } from "../audio/metronomePreference";

interface MetronomeValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

const MetronomeContext = createContext<MetronomeValue | null>(null);

/** Only ON/OFF is global. Every feature keeps its own transport tempo. */
export function MetronomeProvider({ children }: { children: ReactNode }) {
  const [enabled, setStoredEnabled] = useState(loadMetronomeEnabled);
  const setEnabled = useCallback((next: boolean) => {
    setStoredEnabled(next);
    saveMetronomeEnabled(next);
  }, []);
  const toggle = useCallback(() => {
    setStoredEnabled(current => {
      const next = !current;
      saveMetronomeEnabled(next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ enabled, setEnabled, toggle }), [enabled, setEnabled, toggle]);
  return <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>;
}

export function useMetronome(): MetronomeValue {
  const shared = useContext(MetronomeContext);
  const [localEnabled, setLocalEnabled] = useState(false);
  const setEnabled = useCallback((next: boolean) => setLocalEnabled(next), []);
  const toggle = useCallback(() => setLocalEnabled(current => !current), []);
  return shared ?? { enabled: localEnabled, setEnabled, toggle };
}
