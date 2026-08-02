// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PracticeRecoveryPanel } from "./PracticeRecoveryPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

test("offers honest retry and selected validated-backup recovery controls", async () => {
  const retry = vi.fn(async () => undefined); const restore = vi.fn(async (_name: string) => undefined); const startFresh = vi.fn(async () => undefined);
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(
    <PracticeRecoveryPanel
      backups={[{ name: "practice-20260802-123456-000000.json", revision: 7, token: `sha256-${"a".repeat(64)}` }]}
      error="Practice file is newer than this app supports."
      onRestore={restore}
      onRetry={retry}
      onStartFresh={startFresh}
    />,
  ));
  expect(container.textContent).toContain("fully validated before replacement");
  expect(container.textContent).not.toMatch(/accuracy|automatic score/i);
  const buttons = [...container.querySelectorAll("button")];
  await act(async () => buttons.find(({ textContent }) => textContent?.includes("Restore backup r7"))?.click());
  expect(restore).toHaveBeenCalledWith("practice-20260802-123456-000000.json");
  await act(async () => buttons.find(({ textContent }) => textContent?.includes("Retry load"))?.click());
  expect(retry).toHaveBeenCalledOnce();
  await act(async () => buttons.find(({ textContent }) => textContent?.includes("Start Fresh"))?.click());
  expect(startFresh).toHaveBeenCalledOnce();
});

test("shows future-version as read-only without restore or Start Fresh actions", async () => {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(
    <PracticeRecoveryPanel backups={[]} error="Practice fileVersion 2 is newer." onRetry={async () => undefined} readOnly />,
  ));
  expect(container.textContent).toContain("canonical file will not be replaced or hidden");
  expect(container.textContent).not.toContain("Restore backup");
  expect(container.textContent).not.toContain("Start Fresh");
});
