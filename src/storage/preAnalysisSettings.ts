import type { AnalysisProfile } from "./accuracyFirstSettings";

const storageKey = "loopvault.preAnalysisSourceSelection";
const settingsVersion = 1;

export interface PreAnalysisSourceSelectionSettings {
  enablePreAnalysisSourceSelection: boolean;
  alwaysShowPreAnalysis: boolean;
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
  profile: AnalysisProfile,
  settings = getPreAnalysisSourceSelectionSettings(),
): boolean {
  return settings.enablePreAnalysisSourceSelection
    && (profile === "accuracy-first" || settings.alwaysShowPreAnalysis);
}
