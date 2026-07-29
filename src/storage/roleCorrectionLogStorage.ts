import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  readRoleCorrectionLogJsonl,
  roleCorrectionLogEventSchema,
  type RoleCorrectionLogEvent,
} from "../domain/midi/preAnalysis/roleCorrectionLog";
import { isAnalysisFeedbackEnabled } from "./analysisFeedbackStorage";

const logPath = "loopvault/role-corrections.jsonl";
const appData = { baseDir: BaseDirectory.AppData };

export async function appendRoleCorrectionLog(
  events: readonly RoleCorrectionLogEvent[],
): Promise<number> {
  if (!events.length || !isAnalysisFeedbackEnabled()
    || !("__TAURI_INTERNALS__" in window)) {
    return 0;
  }
  const valid = events.flatMap((event) => {
    const parsed = roleCorrectionLogEventSchema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  });
  if (!valid.length) return 0;
  await mkdir("loopvault", { ...appData, recursive: true });
  await writeTextFile(
    logPath,
    `${valid.map((event) => JSON.stringify(event)).join("\n")}\n`,
    { ...appData, append: true },
  );
  return valid.length;
}

export async function exportRoleCorrectionLog(
  targetPath: string,
): Promise<number> {
  if (!("__TAURI_INTERNALS__" in window)) return 0;
  const raw = await readRaw();
  const { events } = readRoleCorrectionLogJsonl(raw);
  await writeTextFile(
    targetPath,
    events.length
      ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
      : "",
  );
  return events.length;
}

export async function deleteRoleCorrectionLog(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  if (await exists(logPath, appData)) await remove(logPath, appData);
}

async function readRaw(): Promise<string> {
  return await exists(logPath, appData)
    ? readTextFile(logPath, appData)
    : "";
}

export const roleCorrectionLogRelativePath = logPath;
