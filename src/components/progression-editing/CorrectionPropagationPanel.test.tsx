// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackAudioDriver } from "../../audio/playbackController";
import { createPlaybackController } from "../../audio/playbackController";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import { CorrectionPropagationPanel } from "./CorrectionPropagationPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const correctedChord = { root: 7, quality: "dom7" as const, tensions: [], label: "G7" };

function slot(id: string, bar: number): EditableChordSlot {
  const originalChord = { root: 0, quality: "maj7" as const, tensions: [], label: "Cmaj7" };
  return {
    id,
    position: { bar, beat: 1, durationBeats: 4 },
    originalChord,
    currentChord: originalChord,
    alternatives: [],
    warnings: [],
    edited: false,
  };
}

describe("CorrectionPropagationPanel", () => {
  it("requires an explicit checkbox selection and isolates each preview source", async () => {
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, callbacks) => callbacks.onStarted?.()),
      playTimeline: vi.fn(async () => undefined),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const onApply = vi.fn();
    const slots = [slot("source", 1), slot("target-1", 5), slot("target-2", 9)];
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CorrectionPropagationPanel
          sourceSlotId="source"
          chord={correctedChord}
          candidates={[
            { segmentId: "target-1", similarity: 0.94, reasons: ["weighted-pcp-match"] },
            { segmentId: "target-2", similarity: 0.89, reasons: ["duration-match"] },
          ]}
          slots={slots}
          language="ja"
          playbackSource={{ kind: "capture", id: "candidate:test" }}
          controller={controller}
          onApply={onApply}
        />,
      );
    });

    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.textContent).toContain("同じ修正を適用できそうな区間が2件あります");
    const apply = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("選択した区間へ適用"));
    expect(apply?.disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();

    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => checkboxes[1]?.click());
    expect(apply?.disabled).toBe(false);

    const preview = container.querySelector<HTMLButtonElement>(
      'button[aria-label="9小節 1拍の修正後を試聴"]',
    );
    await act(async () => preview?.click());
    expect(controller.getState().source?.id).toBe("candidate:test:propagation:target-2");
    await act(async () => preview?.click());
    expect(controller.getState().status).toBe("idle");

    await act(async () => apply?.click());
    expect(onApply).toHaveBeenCalledWith(["target-2"]);
    await act(async () => root.unmount());
  });

  it("renders the propagation flow in English", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <CorrectionPropagationPanel
          sourceSlotId="source"
          chord={correctedChord}
          candidates={[{ segmentId: "target", similarity: 0.9, reasons: [] }]}
          slots={[slot("source", 1), slot("target", 5)]}
          language="en"
          playbackSource={{ kind: "capture", id: "candidate:test" }}
          onApply={vi.fn()}
        />,
      );
    });
    expect(container.textContent).toContain("1 similar sections may accept this correction");
    expect(container.textContent).toContain("Apply to selected sections");
    act(() => root.unmount());
  });
});
