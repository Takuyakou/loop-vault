import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GLOBAL_BPM_DEFAULT, clampGlobalBpm, loadGlobalBpm, saveGlobalBpm } from "../audio/globalBpmPreference";

export interface GlobalBpmValue {
  /** The one app-wide BPM, a whole number in 30–240. */
  bpm: number;
  /** Clamps, stores and publishes. */
  setBpm: (bpm: number) => void;
  /** setBpm(bpm + delta). */
  nudgeBpm: (delta: number) => void;
  /** The BPM of the song on screen, when a screen has announced one (P23-06 uses this). Undefined otherwise. */
  songBpm: number | undefined;
  /** A screen announces its song's BPM; the returned function takes the announcement back. */
  announceSongBpm: (bpm: number | undefined) => () => void;
}

const GlobalBpmContext = createContext<GlobalBpmValue | null>(null);

/** One BPM value: clamped, and only a change is written. `store` is false for the local fallback outside the provider. */
function useBpmState(initial: () => number, store: boolean) {
  const [bpm, setState] = useState(initial);
  const current = useRef(bpm);
  const setBpm = useCallback((next: number) => {
    const value = clampGlobalBpm(next);
    if (value === current.current) return;
    current.current = value;
    if (store) saveGlobalBpm(value);
    setState(value);
  }, [store]);
  const nudgeBpm = useCallback((delta: number) => setBpm(current.current + delta), [setBpm]);
  return { bpm, setBpm, nudgeBpm };
}

/** The app-wide BPM. Voicing Loop, Jazz and the two Bass echoes play at it; screens may announce their song's BPM. */
export function GlobalBpmProvider({ children }: { children: ReactNode }) {
  const { bpm, setBpm, nudgeBpm } = useBpmState(loadGlobalBpm, true);
  const [announcements, setAnnouncements] = useState<readonly { id: number; bpm: number | undefined }[]>([]);
  const nextId = useRef(0);
  const announceSongBpm = useCallback((value: number | undefined) => {
    const id = ++nextId.current;
    const song = typeof value === "number" && Number.isFinite(value) ? clampGlobalBpm(value) : undefined;
    setAnnouncements(list => [...list, { id, bpm: song }]);
    return () => setAnnouncements(list => list.filter(entry => entry.id !== id));
  }, []);
  const songBpm = announcements[announcements.length - 1]?.bpm;
  const value = useMemo(
    () => ({ bpm, setBpm, nudgeBpm, songBpm, announceSongBpm }),
    [bpm, setBpm, nudgeBpm, songBpm, announceSongBpm],
  );
  return <GlobalBpmContext.Provider value={value}>{children}</GlobalBpmContext.Provider>;
}

const noAnnouncement = () => () => undefined;

export function useGlobalBpm(): GlobalBpmValue {
  const shared = useContext(GlobalBpmContext);
  const local = useBpmState(() => GLOBAL_BPM_DEFAULT, false);
  return shared ?? { ...local, songBpm: undefined, announceSongBpm: noAnnouncement };
}

/** For screens: announces `bpm` while mounted and whenever it changes; takes it back on unmount. */
export function useAnnounceSongBpm(bpm: number | undefined): void {
  const { announceSongBpm } = useGlobalBpm();
  useEffect(() => announceSongBpm(bpm), [announceSongBpm, bpm]);
}
