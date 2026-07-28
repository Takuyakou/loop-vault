import type {
  AccuracyFirstFeatureFlags,
  AnalyzeMidiOptions,
  MidiAnalyzerMode,
} from "../domain/midi/types";

const storageKey = "loopvault.accuracyFirstFeatures";
const settingsVersion = 2;

export type AnalysisProfile = "stable" | "accuracy-first";

export interface AnalysisProfileSettings {
  profile: AnalysisProfile;
  flags: AccuracyFirstFeatureFlags;
  analyzerMode: MidiAnalyzerMode;
}

interface PersistedAnalysisSettings {
  version: typeof settingsVersion;
  profile: AnalysisProfile;
  disabledFeatures: Array<keyof AccuracyFirstFeatureFlags>;
}

export const defaultAnalysisProfile: AnalysisProfile = "stable";

export const analysisProfileFeatureDefaults: Record<
  AnalysisProfile,
  AccuracyFirstFeatureFlags
> = {
  stable: {
    bassCompanionCandidates: true,
    melodyContaminationFilter: false,
    enableObservedFlatNineDominantCandidate: true,
    enableAccuracyCandidateUnion: false,
  },
  "accuracy-first": {
    bassCompanionCandidates: true,
    melodyContaminationFilter: true,
    enableObservedFlatNineDominantCandidate: true,
    enableAccuracyCandidateUnion: true,
  },
};

const analyzerModeByProfile: Record<AnalysisProfile, MidiAnalyzerMode> = {
  stable: "phase4-v1",
  // Hybrid passed the isolated ten-second runtime gate, but did not reduce
  // correction cost across corpora. Accuracy First therefore uses Phase4 plus
  // the lighter candidate union rather than changing the primary analyzer.
  "accuracy-first": "phase4-v1",
};

const featureKeys = [
  "bassCompanionCandidates",
  "melodyContaminationFilter",
  "enableObservedFlatNineDominantCandidate",
  "enableAccuracyCandidateUnion",
] as const satisfies readonly (keyof AccuracyFirstFeatureFlags)[];

export const defaultAccuracyFirstFeatureFlags: AccuracyFirstFeatureFlags = {
  ...analysisProfileFeatureDefaults[defaultAnalysisProfile],
};

export function getAnalysisProfileSettings(): AnalysisProfileSettings {
  const persisted = readPersistedSettings();
  return {
    profile: persisted.profile,
    flags: resolveFlags(persisted),
    analyzerMode: analyzerModeByProfile[persisted.profile],
  };
}

export function getAccuracyFirstFeatureFlags(): AccuracyFirstFeatureFlags {
  return getAnalysisProfileSettings().flags;
}

export function getAnalysisProfileAnalyzeOptions(): Pick<
  AnalyzeMidiOptions,
  "mode" | "accuracyFirst"
> {
  const settings = getAnalysisProfileSettings();
  return {
    mode: settings.analyzerMode,
    accuracyFirst: settings.flags,
  };
}

export function setAnalysisProfile(profile: AnalysisProfile): void {
  const current = readPersistedSettings();
  writePersistedSettings({ ...current, profile });
}

export function setAccuracyFirstFeatureFlags(
  flags: AccuracyFirstFeatureFlags,
): void {
  const current = readPersistedSettings();
  const defaults = analysisProfileFeatureDefaults[current.profile];
  const disabled = new Set(current.disabledFeatures);
  featureKeys.forEach((key) => {
    if (!defaults[key]) return;
    if (flags[key]) disabled.delete(key);
    else disabled.add(key);
  });
  writePersistedSettings({
    ...current,
    disabledFeatures: featureKeys.filter((key) => disabled.has(key)),
  });
}

function resolveFlags(settings: PersistedAnalysisSettings): AccuracyFirstFeatureFlags {
  const defaults = analysisProfileFeatureDefaults[settings.profile];
  const disabled = new Set(settings.disabledFeatures);
  return Object.fromEntries(featureKeys.map((key) => [
    key,
    defaults[key] && !disabled.has(key),
  ])) as unknown as AccuracyFirstFeatureFlags;
}

function readPersistedSettings(): PersistedAnalysisSettings {
  if (typeof localStorage === "undefined") return defaultPersistedSettings();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultPersistedSettings();
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const disabledFeatures = stored.disabledFeatures;
    if (
      stored.version === settingsVersion
      && isAnalysisProfile(stored.profile)
      && Array.isArray(disabledFeatures)
    ) {
      return {
        version: settingsVersion,
        profile: stored.profile,
        disabledFeatures: featureKeys.filter((key) =>
          disabledFeatures.includes(key)),
      };
    }
    return migrateLegacySettings(stored);
  } catch {
    return defaultPersistedSettings();
  }
}

function migrateLegacySettings(stored: Record<string, unknown>): PersistedAnalysisSettings {
  const profile: AnalysisProfile = "accuracy-first";
  const aliases: Partial<Record<keyof AccuracyFirstFeatureFlags, string>> = {
    enableObservedFlatNineDominantCandidate: "observedFlatNineDominantCandidate",
  };
  return {
    version: settingsVersion,
    profile,
    disabledFeatures: featureKeys.filter((key) => {
      const legacyKey = aliases[key] ?? key;
      return stored[legacyKey] === false;
    }),
  };
}

function defaultPersistedSettings(): PersistedAnalysisSettings {
  return {
    version: settingsVersion,
    profile: defaultAnalysisProfile,
    disabledFeatures: [],
  };
}

function writePersistedSettings(settings: PersistedAnalysisSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

function isAnalysisProfile(value: unknown): value is AnalysisProfile {
  return value === "stable" || value === "accuracy-first";
}
