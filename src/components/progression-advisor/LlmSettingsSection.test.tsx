// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmSettingsSection } from "./LlmSettingsSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  testLocal: vi.fn(),
  getKeyStatus: vi.fn(async () => ({ registered: false })),
}));

vi.mock("../../llm/bridge", () => ({
  deleteOpenAiApiKey: vi.fn(),
  getOpenAiApiKeyStatus: mocks.getKeyStatus,
  isLlmDesktopAvailable: () => true,
  listLocalLlmModels: vi.fn(async () => []),
  llmErrorCode: (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : "unknown",
  setOpenAiApiKey: vi.fn(),
  testLocalLlmConnection: mocks.testLocal,
  testOpenAiLlmConnection: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  mocks.testLocal.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("LlmSettingsSection connection feedback", () => {
  it("allows an endpoint check without a selected model and keeps progress and success visible", async () => {
    let finish: (() => void) | undefined;
    mocks.testLocal.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ provider: "local", available: true }); }));
    const { host, root, toast } = await renderSection();
    const button = findButton(host, "接続を確認");

    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
    expect(host.querySelector("[role='status']")?.textContent).toContain("接続を確認しています");

    await act(async () => { finish?.(); await Promise.resolve(); });
    expect(host.querySelector("[role='status']")?.textContent).toContain("接続できました");
    expect(toast).toHaveBeenCalledWith("接続できました");
    await act(async () => root.unmount());
  });

  it("keeps a useful connection error visible", async () => {
    mocks.testLocal.mockRejectedValueOnce({ code: "local_server_unavailable" });
    const { host, root, toast } = await renderSection();

    await act(async () => { findButton(host, "接続を確認").click(); await Promise.resolve(); });

    expect(host.querySelector("[role='status']")?.textContent).toContain("ローカルLLMが起動しているか");
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("接続できませんでした"));
    await act(async () => root.unmount());
  });
});

async function renderSection() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const toast = vi.fn();
  await act(async () => { root.render(<LlmSettingsSection language="ja" setToast={toast} />); });
  return { host, root, toast };
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}
