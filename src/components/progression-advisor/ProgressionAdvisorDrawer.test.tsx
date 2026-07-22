// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedProgressionBlock } from "../../domain/types";
import { ProgressionAdvisorDrawer } from "./ProgressionAdvisorDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "block-1",
  summaryText: "Cmaj7",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    confidence: 1,
    alternatives: [],
    warnings: [],
  }],
  tags: [],
  capturedAt: "2026-07-23T00:00:00.000Z",
  analyzerVersion: "test",
};

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("ProgressionAdvisorDrawer focus", () => {
  it("keeps focus in the intent field while controlled input rerenders", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<ProgressionAdvisorDrawer open block={block} title="Idea" language="ja" onClose={vi.fn()} onAppend={vi.fn()} onSave={() => true} onApplyTags={() => true} setToast={vi.fn()} />);
    });

    const input = host.querySelector<HTMLTextAreaElement>("#advisor-instruction")!;
    input.focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, "浮遊感");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.value).toBe("浮遊感");
    expect(document.activeElement).toBe(input);
    await act(async () => root.unmount());
  });
});
