import { z } from "zod";
import { parseVaultFileJson, parseVaultFileJsonAsLegacyV1 } from "../schema";
import { dojoRecentEntrySchema, readDojoRecent } from "../../views/chord-dojo/dojoRecent";
import { loadAutoConnect } from "../../liveMidi/connectionPreferences";
import { loadLiveMidiPreferences } from "../../liveMidi/preferences";
import { loadLlmPreferences } from "../../llm/preferences";
import { parseReviewThresholds } from "../correction/reviewThresholds";
import { readRoleCorrectionLogJsonl } from "../midi/preAnalysis/roleCorrectionLog";
import { earChordRecordSchema } from "../earPractice/earRecords";
import { storeSchema } from "../chordDojo/store";
import { voicingDrillRecordsSchema } from "../chordDojo/voicingDrillRecords";
import { midiBassLibrarySchema } from "../../features/bass-practice/midi/model";
import { validatePracticeFile } from "../../features/bass-practice/infra/repository/practiceRepository";
import { sourceBasslineSnapshotSchema } from "../sourceBassline/snapshot";
import { lapRecordsSchema } from "../chordDojo/lapRecords";

/**
 * P23 / DEP-01 §2-1: the golden set of "how the saved data is read".
 *
 * Every entry is one of the app's zod entry points (a parse function or a schema that a repository validates with).
 * A case's outcome is one of:
 *   { ok: true, value }            the parsed value (exactly what the app would use)
 *   { ok: true, value, extra }     a loader that also reports a fallback (the loaders return their default on bad data)
 *   { ok: false, errorKind }       a parse that refuses the input (the vault tells why: invalid-json / future-version / invalid-vault)
 * plus, for the vault, the quarantine list (the records it set aside but kept).
 * Error messages and issue codes are not recorded: zod 3 and 4 word them differently and the app never shows or
 * branches on them (DEP-01 §2-3).
 */
export type GoldenOutcome =
  | { ok: true; value: unknown; quarantine?: { index: number; value: unknown }[] }
  | { ok: false; errorKind?: string };

export type GoldenEntry = (input: unknown) => GoldenOutcome;

const storage = (raw: unknown) => {
  const text = typeof raw === "string" ? raw : raw === undefined ? null : JSON.stringify(raw);
  return {
    getItem: () => text,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
};

const fromSchema = (schema: z.ZodTypeAny): GoldenEntry => (input) => {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false };
};

const vaultEntry: GoldenEntry = (input) => {
  const result = parseVaultFileJson(String(input));
  if (!result.ok) return { ok: false, errorKind: result.error.kind };
  return {
    ok: true,
    value: result.vault,
    quarantine: result.quarantine.map((record) => ({ index: record.index, value: record.value })),
  };
};

const vaultLegacyEntry: GoldenEntry = (input) => {
  const result = parseVaultFileJsonAsLegacyV1(String(input));
  if (!result.ok) return { ok: false, errorKind: result.error.kind };
  return {
    ok: true,
    value: result.vault,
    quarantine: result.quarantine.map((record) => ({ index: record.index, value: record.value })),
  };
};

const fromLoad = <T,>(load: (raw: unknown) => T, report?: (input: unknown, value: T) => Record<string, unknown>): GoldenEntry => (input) => {
  const value = load(input);
  return { ok: true, value, ...(report ? { extra: report(input, value) } : {}) };
};

export const goldenEntries: Record<string, GoldenEntry> = {
  vault: vaultEntry,
  "vault-legacy-v1": vaultLegacyEntry,
  "dojo-recent": (input) => {
    const entries = readDojoRecent(storage(input));
    return { ok: true, value: entries };
  },
  "live-midi-preferences": (input) => ({ ok: true, value: loadLiveMidiPreferences(storage(input)) }),
  "auto-connect": (input) => ({ ok: true, value: loadAutoConnect(storage(input)) }),
  "llm-preferences": (input) => ({ ok: true, value: loadLlmPreferences(storage(input)) }),
  "review-thresholds": (input) => {
    try {
      return { ok: true, value: parseReviewThresholds(input) };
    } catch {
      return { ok: false };
    }
  },
  "role-correction-log": (input) => {
    try {
      return { ok: true, value: readRoleCorrectionLogJsonl(String(input)) };
    } catch {
      return { ok: false };
    }
  },
  "ear-chord-record": fromSchema(earChordRecordSchema),
  "dojo-recent-entry": fromSchema(dojoRecentEntrySchema),
  "dojo-store": fromSchema(storeSchema),
  "voicing-drill-records": fromSchema(voicingDrillRecordsSchema),
  "midi-bass-library": fromSchema(midiBassLibrarySchema),
  "bass-practice-file": (input) => {
    try {
      return { ok: true, value: validatePracticeFile(input as never) };
    } catch {
      return { ok: false };
    }
  },
  "source-bassline-snapshot": fromSchema(sourceBasslineSnapshotSchema),
  "lap-records": fromSchema(lapRecordsSchema("loopvault-jazz-practice", ["jazz-progressions-001", "jazz-progressions-002"])),
};

/** Only the shape of the loader's fallback matters here; a plain object keeps the comparison readable. */
export type { GoldenOutcome as Outcome };
void fromLoad;
