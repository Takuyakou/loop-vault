import type { AnalysisProfile } from "./accuracyFirstSettings";

const storageKey = "loopvault.preAnalysisSourceSelection";
const settingsVersion = 1;

export interface PreAnalysisSourceSelectionSettings {
  enablePreAnalysisSourceSelection: boolean;
  alwaysShowPreAnalysis: boolean;
}

export interface PreAnalysisReviewSession {
  sources: readonly {
    id?: string;
    smfType?: number;
  }[];
  voices: readonly {
    sourceId?: string;
    channel?: number;
    isDrum: boolean;
    autoRole?: string;
    autoRoleConfidenceBucket?: "high" | "medium" | "low";
    autoRoleConfidence: number;
  }[];
  warnings?: readonly unknown[];
}

export const defaultPreAnalysisSourceSelectionSettings:
PreAnalysisSourceSelectionSettings = {
  enablePreAnalysisSourceSelection: true,
  alwaysShowPreAnalysis: false,
};

export function getPreAnalysisSourceSelectionSettings():
PreAnalysisSourceSelectionSettings {
  if (typeof localStorage === "undefined") {
    return { ...defaultPreAnalysisSourceSelectionSettings };
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultPreAnalysisSourceSelectionSettings };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== settingsVersion) {
      return { ...defaultPreAnalysisSourceSelectionSettings };
    }
    return {
      enablePreAnalysisSourceSelection:
        value.enablePreAnalysisSourceSelection !== false,
      alwaysShowPreAnalysis: value.alwaysShowPreAnalysis === true,
    };
  } catch {
    return { ...defaultPreAnalysisSourceSelectionSettings };
  }
}

export function setPreAnalysisSourceSelectionSettings(
  settings: PreAnalysisSourceSelectionSettings,
): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify({
    version: settingsVersion,
    enablePreAnalysisSourceSelection:
      settings.enablePreAnalysisSourceSelection,
    alwaysShowPreAnalysis: settings.alwaysShowPreAnalysis,
  }));
}

export function shouldOpenPreAnalysis(
  _profile: AnalysisProfile,
  settings = getPreAnalysisSourceSelectionSettings(),
  _session?: PreAnalysisReviewSession,
): boolean {
  return settings.enablePreAnalysisSourceSelection;
}

export function needsPreAnalysisReview(
  session: PreAnalysisReviewSession,
): boolean {
  const pitchedVoices = session.voices.filter((voice) => !voice.isDrum);
  const typeZeroMultiChannel = session.sources.some((source) => (
    source.smfType === 0
    && source.id !== undefined
    && new Set(session.voices
      .filter((voice) => voice.sourceId === source.id)
      .map((voice) => voice.channel))
      .size > 1
  ));
  return session.sources.length > 1
    || pitchedVoices.length > 1
    || session.voices.some((voice) => voice.isDrum)
    || pitchedVoices.some((voice) => voice.autoRole === "melody-weak")
    || pitchedVoices.some((voice) => voice.autoRoleConfidenceBucket === "low" || voice.autoRoleConfidence < 0.45)
    || Boolean(session.warnings?.length)
    || typeZeroMultiChannel;
}
