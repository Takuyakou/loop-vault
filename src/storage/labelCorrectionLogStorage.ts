import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  labelCorrectionDedupKey,
  type LabelCorrectionLog,
} from "../domain/midi/labelCorrectionLog";
import { isAnalysisFeedbackEnabled } from "./analysisFeedbackStorage";

const logPath = "loopvault/label-corrections.jsonl";
const appData = { baseDir: BaseDirectory.AppData };

export async function appendLabelCorrectionLogs(
  events: readonly LabelCorrectionLog[],
): Promise<number> {
  if (!events.length || !isAnalysisFeedbackEnabled()
    || !("__TAURI_INTERNALS__" in window)) {
    return 0;
  }
  await mkdir("loopvault", { ...appData, recursive: true });
  const existingRaw = await readLabelCorrectionLog();
  const pending = deduplicateLabelCorrectionLogs(existingRaw, events);
  if (pending.length === 0) return 0;
  await writeTextFile(
    logPath,
    `${pending.map((event) => JSON.stringify(event)).join("\n")}\n`,
    { ...appData, append: true },
  );
  return pending.length;
}

export async function exportLabelCorrectionLog(targetPath: string): Promise<number> {
  if (!("__TAURI_INTERNALS__" in window)) return 0;
  const raw = await readLabelCorrectionLog();
  await writeTextFile(targetPath, raw);
  return raw.split(/\r?\n/).filter((line) => line.trim()).length;
}

export async function deleteLabelCorrectionLog(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  if (await exists(logPath, appData)) await remove(logPath, appData);
}

export function deduplicateLabelCorrectionLogs(
  existingRaw: string,
  events: readonly LabelCorrectionLog[],
): LabelCorrectionLog[] {
  const existingKeys = new Set(existingRaw.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [labelCorrectionDedupKey(JSON.parse(line) as LabelCorrectionLog)];
    } catch {
      return [];
    }
  }));
  const pending: LabelCorrectionLog[] = [];
  for (const event of events) {
    const key = labelCorrectionDedupKey(event);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    pending.push(event);
  }
  return pending;
}

async function readLabelCorrectionLog(): Promise<string> {
  return await exists(logPath, appData)
    ? readTextFile(logPath, appData)
    : "";
}

export const labelCorrectionLogRelativePath = logPath;
