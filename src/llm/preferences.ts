import { z } from "zod";
import type { AppLanguage } from "../domain/types";

export type LlmProviderId = "local" | "openai";

export interface LlmPreferences {
  provider: LlmProviderId;
  local: {
    baseUrl: string;
    model: string;
    timeoutSeconds: number;
  };
  openai: {
    model: string;
    confirmBeforePaidRequest: boolean;
  };
  language: AppLanguage;
}

const schema = z.object({
  provider: z.enum(["local", "openai"]).default("local"),
  local: z.object({
    baseUrl: z.string().url().default("http://127.0.0.1:11434"),
    model: z.string().max(200).default(""),
    timeoutSeconds: z.number().int().min(5).max(120).default(30),
  }).strict().default({ baseUrl: "http://127.0.0.1:11434", model: "", timeoutSeconds: 30 }),
  openai: z.object({
    model: z.string().min(1).max(200).default("gpt-5-mini"),
    confirmBeforePaidRequest: z.boolean().default(true),
  }).strict().default({ model: "gpt-5-mini", confirmBeforePaidRequest: true }),
  language: z.enum(["ja", "en"]).default("ja"),
}).strict();

const storageKey = "loop-vault:llm-preferences:v1";

export function defaultLlmPreferences(language: AppLanguage = "ja"): LlmPreferences {
  return { provider: "local", local: { baseUrl: "http://127.0.0.1:11434", model: "", timeoutSeconds: 30 }, openai: { model: "gpt-5-mini", confirmBeforePaidRequest: true }, language };
}

export function loadLlmPreferences(storage: StorageLike = window.localStorage): LlmPreferences {
  const raw = storage.getItem(storageKey);
  if (!raw) return defaultLlmPreferences();
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : defaultLlmPreferences();
  } catch {
    return defaultLlmPreferences();
  }
}

export function saveLlmPreferences(preferences: LlmPreferences, storage: StorageLike = window.localStorage): void {
  storage.setItem(storageKey, JSON.stringify(schema.parse(preferences)));
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
