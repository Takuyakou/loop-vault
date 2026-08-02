// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";
import { BassPracticeHomeCard } from "./BassPracticeHomeCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("BassPracticeHomeCard", () => {
  test("stays compact, honest, and opens Degree Echo", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onOpen = vi.fn();
    await act(async () => root.render(<BassPracticeHomeCard onOpen={onOpen} />));

    expect(container.textContent).toContain("今日のベース練習");
    expect(container.textContent).toContain("自動採点ではありません");
    expect(container.textContent).not.toContain("Accuracy");
    await act(async () => container.querySelector("button")?.click());
    expect(onOpen).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    document.body.replaceChildren();
  });
});
