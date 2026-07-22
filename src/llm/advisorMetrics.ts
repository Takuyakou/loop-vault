import type { ProviderUsage } from "./bridge";
import type { LlmProviderId } from "./preferences";

export interface AdvisorRunMetric {
  requestId: string;
  provider: LlmProviderId;
  model: string;
  latencyMs: number;
  retryCount: number;
  status: "success" | "error";
  errorCode?: string;
  usage?: ProviderUsage;
  recordedAt?: string;
}

const storageKey = "loop-vault:advisor-metrics:v1";
const maximumEntries = 100;

export function recordAdvisorRunMetric(metric: AdvisorRunMetric, storage: StorageLike = window.localStorage): void {
  try {
    const entries = readAdvisorRunMetrics(storage);
    entries.push({ ...metric, recordedAt: new Date().toISOString() });
    storage.setItem(storageKey, JSON.stringify(entries.slice(-maximumEntries)));
  } catch {
    // Metrics must never interrupt generation or expose provider responses.
  }
}

export function readAdvisorRunMetrics(storage: StorageLike = window.localStorage): AdvisorRunMetric[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMetric).slice(-maximumEntries);
  } catch {
    return [];
  }
}

export function summarizeAdvisorRunMetrics(entries: readonly AdvisorRunMetric[]) {
  const successful = entries.filter((entry) => entry.status === "success");
  return {
    total: entries.length,
    successful: successful.length,
    failed: entries.length - successful.length,
    averageLatencyMs: successful.length ? Math.round(successful.reduce((sum, entry) => sum + entry.latencyMs, 0) / successful.length) : 0,
    inputTokens: successful.reduce((sum, entry) => sum + (entry.usage?.inputTokens ?? 0), 0),
    outputTokens: successful.reduce((sum, entry) => sum + (entry.usage?.outputTokens ?? 0), 0),
    retries: entries.reduce((sum, entry) => sum + entry.retryCount, 0),
  };
}

function isMetric(value: unknown): value is AdvisorRunMetric {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<AdvisorRunMetric>;
  return typeof metric.requestId === "string" && (metric.provider === "local" || metric.provider === "openai") && typeof metric.model === "string" && typeof metric.latencyMs === "number" && typeof metric.retryCount === "number" && (metric.status === "success" || metric.status === "error");
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
