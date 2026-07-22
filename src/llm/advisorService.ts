import { validateAdvisorResponse, type AdvisorRequest, type AdvisorResponse } from "../domain/progressionAdvisor";
import { cancelAdvisorRequest, invokeAdvisorSuggestion, isLlmDesktopAvailable, llmErrorCode, type ProviderUsage } from "./bridge";
import type { LlmPreferences } from "./preferences";

export interface AdvisorRunResult {
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
  try {
    const execution = await invokeAdvisorSuggestion(requestId, request, preferences);
    const validated = validateAdvisorResponse(execution.response);
    if (!validated.success) throw new AdvisorServiceError("domain_validation_failed", validated.issues.map((issue) => issue.message).join(" "));
    return { ...execution, response: validated.response };
  } catch (error) {
    if (error instanceof AdvisorServiceError) throw error;
    throw new AdvisorServiceError(llmErrorCode(error), "The progression proposal could not be generated.");
  }
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
