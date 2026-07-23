import { invoke } from "@tauri-apps/api/core";
import type { LlmPreferences } from "./preferences";

export interface LocalLlmModel { name: string }
export interface ApiKeyStatus { registered: boolean }
export interface ProviderHealth { provider: "local" | "openai"; available: boolean; model?: string; message?: string }

export function isLlmDesktopAvailable(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function listLocalLlmModels(baseUrl: string, timeoutSeconds: number): Promise<LocalLlmModel[]> {
  return invoke("list_local_llm_models", { baseUrl, timeoutSeconds });
}

export function testLocalLlmConnection(settings: LlmPreferences["local"]): Promise<ProviderHealth> {
  return invoke("test_local_llm_connection", { settings });
}

export function getOpenAiApiKeyStatus(): Promise<ApiKeyStatus> {
  return invoke("openai_api_key_status");
}

export function setOpenAiApiKey(apiKey: string): Promise<ApiKeyStatus> {
  return invoke("set_openai_api_key", { apiKey });
}

export function deleteOpenAiApiKey(): Promise<ApiKeyStatus> {
  return invoke("delete_openai_api_key");
}

export function cancelAdvisorRequest(requestId: string): Promise<boolean> {
  return invoke("cancel_advisor_request", { requestId });
}

export function llmErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "unknown";
}
