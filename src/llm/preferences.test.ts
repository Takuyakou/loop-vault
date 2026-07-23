import { describe, expect, it } from "vitest";
import { defaultLlmPreferences, loadLlmPreferences, saveLlmPreferences } from "./preferences";

function storage(initial?: string) {
  let value = initial ?? null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, value: () => value };
}

describe("LLM preferences", () => {
  it("defaults to a loopback local provider", () => {
    expect(defaultLlmPreferences()).toMatchObject({ provider: "local", local: { baseUrl: "http://127.0.0.1:11434", timeoutSeconds: 30 } });
  });

  it("stores only non-secret settings outside Vault data", () => {
    const target = storage();
    const preferences = defaultLlmPreferences("en");
    preferences.openai.model = "gpt-5";
    saveLlmPreferences(preferences, target);

    expect(loadLlmPreferences(target)).toEqual(preferences);
    expect(target.value()).not.toContain("apiKey");
    expect(target.value()).not.toContain("fileVersion");
  });

  it("rejects unknown or corrupt settings", () => {
    expect(loadLlmPreferences(storage('{"apiKey":"secret"}'))).toEqual(defaultLlmPreferences());
    expect(loadLlmPreferences(storage("broken"))).toEqual(defaultLlmPreferences());
  });
});
