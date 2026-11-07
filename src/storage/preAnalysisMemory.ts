import type { AnalysisSession, PreAnalysisVoiceRole } from "../domain/midi/preAnalysis";
import type { VoiceContributionPreset } from "../domain/midi/types";

/**
 * 「前回と同じ設定」 (P15-03). Files made the same way have the same parts in the same order, so the
 * roles chosen last time can be offered again. What is kept is only the shape of the parts (how
 * many, the MIDI channel and instrument number of each, whether it is drums) and what was chosen.
 * Never the file name, the track names, the notes, or where a line was: how high a line is depends
 * on the song, so a line is not carried over (a suggested line is offered instead).
 */
const storageKey = "loopvault.preAnalysisMemory";
const version = 1;
const maxEntries = 20;

export interface PreAnalysisMemoryPart {
  role: PreAnalysisVoiceRole;
  included: boolean;
  /** A line was used on this part. The height is not kept. */
  line: boolean;
}

export interface PreAnalysisMemoryEntry {
  signature: string;
  contribution: VoiceContributionPreset;
  parts: PreAnalysisMemoryPart[];
}

type SessionShape = Pick<AnalysisSession, "voices">;

/** The shape of the parts, in order. Nothing of the song or the file. */
export function preAnalysisSignature(session: SessionShape): string {
  return JSON.stringify(session.voices.map((voice) => [
    voice.channel,
    voice.dominantProgram ?? -1,
    voice.isDrum ? 1 : 0,
  ]));
}

export function memoryEntryFor(
  session: AnalysisSession,
  lines: Readonly<Record<string, unknown>>,
  contribution: VoiceContributionPreset,
): PreAnalysisMemoryEntry {
  return {
    signature: preAnalysisSignature(session),
    contribution,
    parts: session.voices.map((voice) => ({
      role: voice.assignedRole,
      included: voice.included,
      line: lines[voice.id] !== undefined,
    })),
  };
}

function read(): PreAnalysisMemoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const value = JSON.parse(raw) as { version?: number; entries?: unknown };
    if (value.version !== version || !Array.isArray(value.entries)) return [];
    return value.entries.filter(isEntry);
  } catch {
    return [];
  }
}

const roles: readonly PreAnalysisVoiceRole[] = ["harmony", "bass", "melody-weak", "exclude"];

function isEntry(value: unknown): value is PreAnalysisMemoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<PreAnalysisMemoryEntry>;
  return typeof entry.signature === "string"
    && (entry.contribution === "standard" || entry.contribution === "harmonic-core")
    && Array.isArray(entry.parts)
    && entry.parts.every((part) => typeof part === "object" && part !== null
      && roles.includes((part as PreAnalysisMemoryPart).role)
      && typeof (part as PreAnalysisMemoryPart).included === "boolean"
      && typeof (part as PreAnalysisMemoryPart).line === "boolean");
}

export function rememberPreAnalysis(entry: PreAnalysisMemoryEntry): void {
  if (typeof localStorage === "undefined") return;
  try {
    const rest = read().filter((existing) => existing.signature !== entry.signature);
    localStorage.setItem(storageKey, JSON.stringify({
      version,
      entries: [entry, ...rest].slice(0, maxEntries),
    }));
  } catch {
    // Not being able to remember is not a reason to stop an analysis.
  }
}

export function findPreAnalysisMemory(session: SessionShape): PreAnalysisMemoryEntry | undefined {
  const signature = preAnalysisSignature(session);
  return read().find((entry) => entry.signature === signature);
}
