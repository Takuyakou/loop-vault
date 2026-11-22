import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { BrowserPracticeStorage, TauriPracticeStorage } from "../../features/bass-practice/infra/repository/practiceStorage";
import { emptyJazzRecords, jazzRecordsSchema, type JazzRecords } from "../../domain/chordDojo/jazzRecords";
import { emptyOriginalRecords, originalRecordsSchema, type OriginalRecords } from "../../domain/chordDojo/originalRecords";
import { emptyDrillRecords, parseDrillRecords, type VoicingDrillRecords } from "../../domain/chordDojo/voicingDrillRecords";
import { earChordRecordSchema, type EarChordRecord } from "../../domain/earPractice/earRecords";

/**
 * P20: the home's read-only view of the practice files. It never uses the repositories that recover or quarantine a
 * broken file: the home only reads what is there, and a file it cannot read becomes 「読めません」 (never 0, never a
 * repair). The practice screens keep their own existing recovery behaviour.
 */
export type HomeRecordsState<T> = { readonly state: "loading" } | { readonly state: "error" } | { readonly state: "ready"; readonly file: T };

export interface HomeRecords {
  readonly jazz: HomeRecordsState<JazzRecords>;
  readonly original: HomeRecordsState<OriginalRecords>;
  readonly drill: HomeRecordsState<VoicingDrillRecords>;
  readonly ear: HomeRecordsState<readonly EarChordRecord[]>;
}

const readDocument = async (namespace: "jazz-progressions" | "original-practice" | "voicing-drill" | "ear-practice") => {
  try {
    const storage = isTauri()
      ? new TauriPracticeStorage(undefined, namespace)
      : new BrowserPracticeStorage(window.localStorage, namespace);
    return await storage.readCommitted();
  } catch {
    return undefined;
  }
};

const parseJson = (contents: string): unknown => { try { return JSON.parse(contents); } catch { return undefined; } };

async function loadJazz(): Promise<HomeRecordsState<JazzRecords>> {
  const document = await readDocument("jazz-progressions");
  if (!document) return { state: "ready", file: emptyJazzRecords() };
  const parsed = jazzRecordsSchema.safeParse(parseJson(document.contents));
  return parsed.success ? { state: "ready", file: parsed.data } : { state: "error" };
}
async function loadOriginal(): Promise<HomeRecordsState<OriginalRecords>> {
  const document = await readDocument("original-practice");
  if (!document) return { state: "ready", file: emptyOriginalRecords() };
  const parsed = originalRecordsSchema.safeParse(parseJson(document.contents));
  return parsed.success ? { state: "ready", file: parsed.data } : { state: "error" };
}
async function loadDrill(): Promise<HomeRecordsState<VoicingDrillRecords>> {
  const document = await readDocument("voicing-drill");
  if (!document) return { state: "ready", file: emptyDrillRecords() };
  const parsed = parseDrillRecords(document.contents);
  return parsed.ok ? { state: "ready", file: parsed.file } : { state: "error" };
}
async function loadEar(): Promise<HomeRecordsState<readonly EarChordRecord[]>> {
  const document = await readDocument("ear-practice");
  if (!document) return { state: "ready", file: [] };
  const parsed = parseJson(document.contents) as { app?: unknown; fileVersion?: unknown; version?: unknown; records?: unknown } | undefined;
  if (!parsed || parsed.app !== "loopvault-ear-practice" || parsed.fileVersion !== 1 || parsed.version !== 1 || !Array.isArray(parsed.records)) {
    return { state: "error" };
  }
  const records = parsed.records.flatMap((record) => {
    const valid = earChordRecordSchema.safeParse(record);
    return valid.success ? [valid.data] : [];
  });
  return { state: "ready", file: records };
}

/**
 * P23-47-fix-4: the last read, kept for this app session. Opening the Chord Dojo again shows it at once (no "—"
 * that turns into a number a moment later) and reads the files again behind it.
 */
let lastRecords: HomeRecords | undefined;

export function useHomeRecords(): HomeRecords {
  const [records, setRecords] = useState<HomeRecords>(() => lastRecords ?? {
    jazz: { state: "loading" }, original: { state: "loading" }, drill: { state: "loading" }, ear: { state: "loading" },
  });
  useEffect(() => {
    let alive = true;
    // P20 e2e: a test-set session flag delays the reads so the loading state can be observed. Production is 0.
    const delay = Number(window.sessionStorage.getItem("p20-home-read-delay") ?? 0);
    const ready = delay > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
    void ready.then(() => Promise.all([loadJazz(), loadOriginal(), loadDrill(), loadEar()])).then(([jazz, original, drill, ear]) => {
      lastRecords = { jazz, original, drill, ear };
      if (alive) setRecords(lastRecords);
    });
    return () => { alive = false; };
  }, []);
  return records;
}
