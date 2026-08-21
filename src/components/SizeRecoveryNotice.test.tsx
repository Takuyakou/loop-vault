// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SizeRecoveryNotice } from "./SizeRecoveryNotice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
afterEach(() => host?.remove());

async function render(
  language: "ja" | "en",
  options: { saving?: boolean; error?: string; onOpenVault?: () => void } = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(
    <SizeRecoveryNotice
      language={language}
      saving={options.saving ?? false}
      error={options.error}
      onOpenVault={options.onOpenVault ?? vi.fn()}
    />,
  ));
  return root;
}

describe("SizeRecoveryNotice", () => {
  it("explains the allowed shrink/delete recovery in Japanese and opens Vault", async () => {
    const onOpenVault = vi.fn();
    const root = await render("ja", { error: "縮小が必要です。", onOpenVault });
    expect(host.textContent).toContain("既存内容を短くするか、アイデア／進行を削除");
    expect(host.textContent).toContain("縮小が必要です。");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("縮小が必要です。");
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    const button = host.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-describedby")).toContain("vault-size-recovery-status");
    await act(async () => button.click());
    expect(onOpenVault).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("disables recovery navigation while the atomic save is active and stays usable at narrow width", async () => {
    const root = await render("en", { saving: true });
    const notice = host.querySelector<HTMLElement>("[data-testid=vault-size-recovery-notice]")!;
    const button = host.querySelector<HTMLButtonElement>("button")!;
    expect(notice.className).toContain("min-w-0");
    expect(host.textContent).toContain("Saving the reduced Vault");
    expect(button.disabled).toBe(true);
    await act(async () => root.unmount());
  });
});