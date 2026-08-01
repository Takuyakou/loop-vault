// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PracticeWorkspace } from "./PracticeWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("PracticeWorkspace", () => {
  test("keeps Chord Dojo as the selected existing surface", async () => {
    const onModeChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <PracticeWorkspace
        mode="chord-dojo"
        onModeChange={onModeChange}
        chordDojo={<div data-testid="dojo">existing dojo</div>}
        bassPractice={<div data-testid="bass">degree only</div>}
      />,
    ));

    expect(container.querySelector("[data-testid='dojo']")).not.toBeNull();
    expect(container.querySelector("[data-testid='bass']")).toBeNull();
    expect(container.textContent).not.toContain("Rhythm Echo");
    expect(container.textContent).not.toContain("Bassline Echo");

    const bassButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Bass Practice");
    await act(async () => bassButton?.click());
    expect(onModeChange).toHaveBeenCalledWith("bass-practice");
  });

  test("uses roving tab focus and the complete tablist keyboard pattern", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    function Harness() {
      const [mode, setMode] = useState<"chord-dojo" | "bass-practice">("chord-dojo");
      return (
        <PracticeWorkspace
          mode={mode}
          onModeChange={setMode}
          chordDojo={<div>dojo panel</div>}
          bassPractice={<div>bass panel</div>}
        />
      );
    }
    await act(async () => root?.render(<Harness />));

    const tabs = container.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs[0].focus();
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(tabs[1]).toHaveProperty("tabIndex", 0);
    expect(tabs[1]).toBe(document.activeElement);
    expect(container.textContent).toContain("bass panel");

    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(tabs[0]).toBe(document.activeElement);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(tabs[1]).toBe(document.activeElement);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(tabs[0]).toBe(document.activeElement);
    expect(document.querySelector("[role='tabpanel']")).not.toBe(document.activeElement);
  });
});
