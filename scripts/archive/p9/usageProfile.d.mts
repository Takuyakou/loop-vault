export interface UsageNote {
  id: string; pitch: number; startTick: number; durationTick: number;
  role: "support" | "bass" | "melody" | "ornament" | "artifact" | "residual";
  track: number; channel: number; velocity: number;
}
export interface UsageGoldEvent { startTick: number; endTick: number; sourceNotes: number[] }
export interface UsageCase {
  id: string; family: string; notes: UsageNote[]; gold: UsageGoldEvent[];
  meter: [number, number]; tempoBpm: number; ppq: number;
}
export interface UsageCorpus {
  manifest: { generatorVersion: string; split: string; caseCount: number; scenarioIds: string[]; sha256: string };
  cases: UsageCase[];
}
export declare const generatorVersion: string;
export declare function canonicalJson(value: unknown): string;
export declare function sha256(value: string): string;
export declare function generateUsageCorpus(): UsageCorpus;
