// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { BassPracticeModeView } from "./BassPracticeModeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; localStorage.clear(); document.body.replaceChildren(); });

describe("Rhythm Echo mode", () => {
  test("is separately gated and keeps its visual grid hidden until Hint 4", async () => {
    localStorage.setItem("loop-vault:bass-practice-rhythm-echo-enabled:v1", "true");
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Rhythm Echo")?.click());
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).not.toBeNull();
    expect(container.querySelector("[data-testid='rhythm-grid']")?.textContent).toContain("hidden");
    for (let index = 0; index < 4; index += 1) await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Hint"))?.click());
    expect(container.querySelector("[data-testid='rhythm-grid']")?.textContent).toContain("0+");
  });
});
