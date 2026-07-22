import { validateAdvisorResponse, type AdvisorRequest, type AdvisorResponse } from "../domain/progressionAdvisor";
import { cancelAdvisorRequest, invokeAdvisorSuggestion, isLlmDesktopAvailable, llmErrorCode, type ProviderUsage } from "./bridge";
import type { LlmPreferences } from "./preferences";
import { recordAdvisorRunMetric } from "./advisorMetrics";

export interface AdvisorRunResult {
  requestId: string;
  response: AdvisorResponse;
  provider: "local" | "openai";
  model: string;
  latencyMs: number;
  retryCount: number;
  usage?: ProviderUsage;
}

export class AdvisorServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AdvisorServiceError";
  }
}

export async function requestAdvisorSuggestions(requestId: string, request: AdvisorRequest, preferences: LlmPreferences): Promise<AdvisorRunResult> {
  if (!isLlmDesktopAvailable()) throw new AdvisorServiceError("desktop_only", "Progression Advisor requires the desktop app.");
  const startedAt = Date.now();
  let execution: Awaited<ReturnType<typeof invokeAdvisorSuggestion>> | undefined;
  try {
    execution = await invokeAdvisorSuggestion(requestId, request, preferences);
    const validated = validateAdvisorResponse(execution.response, request.progression.events);
    if (!validated.success) throw new AdvisorServiceError("domain_validation_failed", validated.issues.map((issue) => issue.message).join(" "));
    recordAdvisorRunMetric({ requestId, provider: execution.provider, model: execution.model, latencyMs: execution.latencyMs, retryCount: execution.retryCount, usage: execution.usage, status: "success" });
    return { ...execution, requestId, response: validated.response };
  } catch (error) {
    const code = error instanceof AdvisorServiceError ? error.code : llmErrorCode(error);
    recordAdvisorRunMetric({ requestId, provider: execution?.provider ?? preferences.provider, model: execution?.model ?? selectedModel(preferences), latencyMs: execution?.latencyMs ?? Math.max(0, Date.now() - startedAt), retryCount: execution?.retryCount ?? 0, usage: execution?.usage, status: "error", errorCode: code });
    if (error instanceof AdvisorServiceError) throw error;
    throw new AdvisorServiceError(code, "The progression proposal could not be generated.");
  }
}

function selectedModel(preferences: LlmPreferences): string {
  return preferences.provider === "local" ? preferences.local.model : preferences.openai.model;
}

export async function cancelAdvisorRun(requestId: string): Promise<void> {
  if (!isLlmDesktopAvailable()) return;
  await cancelAdvisorRequest(requestId);
}

export function isCurrentAdvisorResponse(
  activeRequestId: string | undefined,
  responseRequestId: string,
  currentFingerprint: string,
  requestFingerprint: string,
): boolean {
  return activeRequestId === responseRequestId && currentFingerprint === requestFingerprint;
}
