// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("Toast", () => {
  it("announces normal feedback politely and allows manual dismissal", async () => {
    const onDismiss = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <Toast message="Saved" onDismiss={onDismiss} dismissLabel="Close" />,
    ));

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Saved");
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
    expect(onDismiss).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("announces errors assertively and exposes a recovery action", async () => {
    const onRetry = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <Toast
        tone="error"
        title="Could not save"
        message="Check the data folder and try again."
        action={{ label: "Retry", onClick: onRetry }}
      />,
    ));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.getAttribute("aria-live")).toBe("assertive");
    expect(alert?.textContent).toContain("Check the data folder");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")?.click());
    expect(onRetry).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});

