import { useSyncExternalStore } from "react";
export type FingeringRankerMode = "CURRENT" | "E1-T";
let currentMode: FingeringRankerMode = "CURRENT";
const listeners = new Set<() => void>();
export function setFingeringRankerMode(mode: FingeringRankerMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useFingeringRankerMode(): FingeringRankerMode {
  return useSyncExternalStore(subscribe, () => currentMode, () => "CURRENT");
}
