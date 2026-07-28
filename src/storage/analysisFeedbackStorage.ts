import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  readAnalysisFeedbackJsonl,
  type PersistedAnalysisFeedbackEvent,
} from "../domain/midi/analysisFeedback";
import { analysisFeedbackEventSchema } from "../domain/midi/realEvaluation/schema";

const feedbackPath = "loopvault/analysis-feedback.jsonl";
const enabledKey = "loopvault.analysisFeedbackEnabled";
const appData = { baseDir: BaseDirectory.AppData };

export function isAnalysisFeedbackEnabled(): boolean {
  return localStorage.getItem(enabledKey) !== "false";
}

export function setAnalysisFeedbackEnabled(enabled: boolean): void {
  localStorage.setItem(enabledKey, String(enabled));
}

export async function appendAnalysisFeedback(events: readonly PersistedAnalysisFeedbackEvent[]): Promise<void> {
  if (!events.length || !isAnalysisFeedbackEnabled() || !("__TAURI_INTERNALS__" in window)) return;
  events.forEach((event) => {
    const result = analysisFeedbackEventSchema.safeParse(event);
    if (!result.success) throw new Error("Analysis feedback schema validation failed.");
  });
  await mkdir("loopvault", { ...appData, recursive: true });
  await writeTextFile(feedbackPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    ...appData,
    append: true,
  });
}

export async function exportAnalysisFeedback(targetPath: string): Promise<number> {
  if (!("__TAURI_INTERNALS__" in window)) return 0;
  const raw = await exists(feedbackPath, appData)
    ? await readTextFile(feedbackPath, appData)
    : "";
  const parsed = readAnalysisFeedbackJsonl(raw);
  const output = parsed.events.length > 0
    ? `${parsed.events.map((event) => JSON.stringify(event)).join("\n")}\n`
    : "";
  await writeTextFile(targetPath, output);
  return parsed.events.length;
}

export async function deleteAnalysisFeedback(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  if (await exists(feedbackPath, appData)) await remove(feedbackPath, appData);
}

export const analysisFeedbackRelativePath = feedbackPath;
