// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedProgressionBlock } from "../../domain/types";

const mocks = vi.hoisted(() => ({
  requestAdvisorSuggestions: vi.fn(),
}));

vi.mock("../../llm/advisorService", () => {
  class MockAdvisorServiceError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    AdvisorServiceError: MockAdvisorServiceError,
    requestAdvisorSuggestions: mocks.requestAdvisorSuggestions,
    cancelAdvisorRun: vi.fn(),
    isCurrentAdvisorResponse: () => true,
  };
});

import { AdvisorServiceError } from "../../llm/advisorService";
import { ProgressionAdvisorDrawer } from "./ProgressionAdvisorDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "block-local-error",
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
  mocks.requestAdvisorSuggestions.mockReset();
});

describe("ProgressionAdvisorDrawer local provider errors", () => {
  it("shows the safe grammar message and always clears loading", async () => {
    mocks.requestAdvisorSuggestions.mockRejectedValueOnce(
      new AdvisorServiceError("structured_output_unsupported", "provider details must stay hidden"),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<ProgressionAdvisorDrawer open block={block} title="Idea" language="ja" onClose={vi.fn()} onAppend={vi.fn()} onSave={() => true} onApplyTags={() => true} setToast={vi.fn()} />);
    });
    const generate = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("3つの案を生成"));
    expect(generate).toBeDefined();

    await act(async () => {
      generate!.click();
    });

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Ollamaが出力形式を初期化できませんでした");
    expect(alert?.textContent).not.toContain("タイムアウト");
    expect(generate?.disabled).toBe(false);
    expect(mocks.requestAdvisorSuggestions).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
