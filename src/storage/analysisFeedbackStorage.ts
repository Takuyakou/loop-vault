import { BaseDirectory, exists, mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import type { PersistedAnalysisFeedbackEvent } from "../domain/midi/analysisFeedback";

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
  await mkdir("loopvault", { ...appData, recursive: true });
  await writeTextFile(feedbackPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    ...appData,
    append: true,
  });
}

export async function deleteAnalysisFeedback(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  if (await exists(feedbackPath, appData)) await remove(feedbackPath, appData);
}

export const analysisFeedbackRelativePath = feedbackPath;
