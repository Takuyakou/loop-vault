import { BaseDirectory, exists, mkdir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { parseMetricsJsonl, summarizeMetrics, type CorrectionMetricsRecord, type MetricsSummary } from "../domain/correction/metrics";

/**
 * P10.0-07 local edit metrics (spec v2.5 §13): one JSON line per import in the app
 * data folder, never in the Vault. On by default. A failure (or a browser build) is
 * skipped silently; importing and saving never wait on it.
 */
const metricsPath = "loopvault/correction-metrics.jsonl";
const enabledKey = "loopvault.correctionMetricsEnabled";
const appData = { baseDir: BaseDirectory.AppData };

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function isCorrectionMetricsEnabled(): boolean {
  try {
    return localStorage.getItem(enabledKey) !== "false";
  } catch {
    return true;
  }
}

export function setCorrectionMetricsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(enabledKey, String(enabled));
  } catch {
    // Without storage the setting stays at its default.
  }
}

export async function appendCorrectionMetrics(record: CorrectionMetricsRecord): Promise<void> {
  if (!isCorrectionMetricsEnabled() || !isTauri()) return;
  try {
    await mkdir("loopvault", { ...appData, recursive: true });
    await writeTextFile(metricsPath, `${JSON.stringify(record)}\n`, { ...appData, append: true });
  } catch {
    // Metrics are optional; never block the workspace.
  }
}

export async function readCorrectionMetricsSummary(): Promise<MetricsSummary> {
  if (!isTauri()) return summarizeMetrics([]);
  try {
    return summarizeMetrics(await exists(metricsPath, appData) ? parseMetricsJsonl(await readTextFile(metricsPath, appData)) : []);
  } catch {
    return summarizeMetrics([]);
  }
}

export async function clearCorrectionMetrics(): Promise<void> {
  if (!isTauri()) return;
  try {
    if (await exists(metricsPath, appData)) await remove(metricsPath, appData);
  } catch {
    // Nothing else to do; the settings show the count again.
  }
}
