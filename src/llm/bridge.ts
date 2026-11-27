import { invoke } from "@tauri-apps/api/core";

export interface ApiKeyStatus { registered: boolean }

export function isLlmDesktopAvailable(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function getOpenAiApiKeyStatus(): Promise<ApiKeyStatus> {
  return invoke("openai_api_key_status");
}

export function deleteOpenAiApiKey(): Promise<ApiKeyStatus> {
  return invoke("delete_openai_api_key");
}
