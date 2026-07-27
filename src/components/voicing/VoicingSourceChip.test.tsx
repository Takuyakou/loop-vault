// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { VoicingSourceChip } from "./VoicingSourceChip";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];

afterEach(() => {
  while (cleanup.length > 0) cleanup.pop()?.();
});

describe("VoicingSourceChip", () => {
  it.each([
    ["source", "元MIDI"],
    ["generated", "自動生成"],
    ["review", "要確認"],
  ] as const)("renders %s without relying on color alone", (status, label) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <VoicingSourceChip
        status={status}
        language="ja"
        reason={status === "review" ? "source-low-confidence" : undefined}
      />,
    ));
    cleanup.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const chip = container.querySelector<HTMLElement>(
      '[data-testid="voicing-source-chip"]',
    );
    expect(chip?.textContent).toContain(label);
    expect(chip?.querySelector("svg")).not.toBeNull();
    expect(chip?.getAttribute("data-voicing-source")).toBe(status);
    expect(chip?.getAttribute("title")).toBeTruthy();
  });
});
