import { useSyncExternalStore } from "react";
export type FingeringRankerMode = "CURRENT" | "E1-T";
export const DEFAULT_FINGERING_RANKER_MODE: FingeringRankerMode = "E1-T";
let currentMode: FingeringRankerMode = DEFAULT_FINGERING_RANKER_MODE;
const listeners = new Set<() => void>();
export function setFingeringRankerMode(mode: FingeringRankerMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useFingeringRankerMode(): FingeringRankerMode {
  return useSyncExternalStore(subscribe, () => currentMode, () => DEFAULT_FINGERING_RANKER_MODE);
}
