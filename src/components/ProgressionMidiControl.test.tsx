// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ProgressionMidiExportResult } from "../domain/midiExport";
import { ProgressionMidiControl } from "./ProgressionMidiControl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const result: ProgressionMidiExportResult = {
  bytes: new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
  ppq: 480,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  durationTicks: 1920,
  events: [],
  voicingSummary: "saved",
  warnings: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function pointerEvent(
  type: string,
  values: { pointerId: number; clientX: number; clientY: number; button?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: values.clientX,
    clientY: values.clientY,
    button: values.button ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: values.pointerId });
  return event;
}

describe("ProgressionMidiControl", () => {
  test("click and context menu use the accessible save path", async () => {
    const save = vi.fn().mockResolvedValue({ status: "saved", bytesLength: 4 });
    const prepare = vi.fn().mockResolvedValue(preparedArtifact());
    const actions = {
      save,
      prepare,
      startDrag: vi.fn(),
    };
    const setToast = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionMidiControl
          result={result}
          language="ja"
          setToast={setToast}
          actions={actions}
        />,
      );
    });
    const button = container.querySelector<HTMLButtonElement>("button")!;

    expect(button.getAttribute("aria-label")).toContain("MIDIとして保存");
    expect(container.textContent).toContain("保存ボイシング");
    await act(async () => button.click());
    expect(save).toHaveBeenCalledWith(result);
    expect(setToast).toHaveBeenCalledWith("MIDIファイルを保存しました。");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  test("starts one native drag only after the pointer crosses the threshold", async () => {
    const prepare = vi.fn().mockResolvedValue(preparedArtifact());
    const startDrag = vi
      .fn()
      .mockResolvedValue({ status: "dropped", effect: 1 });
    const save = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionMidiControl
          result={result}
          language="en"
          setToast={vi.fn()}
          actions={{ save, prepare, startDrag }}
        />,
      );
    });
    const button = container.querySelector<HTMLButtonElement>("button")!;

    await act(async () => {
      button.dispatchEvent(pointerEvent("pointerdown", {
        pointerId: 7,
        clientX: 10,
        clientY: 10,
      }));
      button.dispatchEvent(pointerEvent("pointermove", {
        pointerId: 7,
        clientX: 13,
        clientY: 13,
      }));
    });
    expect(startDrag).not.toHaveBeenCalled();

    await act(async () => {
      button.dispatchEvent(pointerEvent("pointermove", {
        pointerId: 7,
        clientX: 20,
        clientY: 10,
      }));
      await Promise.resolve();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(startDrag).toHaveBeenCalledTimes(1);
    expect(startDrag).toHaveBeenCalledWith(preparedArtifact());

    await act(async () => {
      button.dispatchEvent(pointerEvent("pointermove", {
        pointerId: 7,
        clientX: 30,
        clientY: 10,
      }));
      button.dispatchEvent(pointerEvent("pointerup", {
        pointerId: 7,
        clientX: 30,
        clientY: 10,
      }));
      button.click();
    });
    expect(startDrag).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  test("shows a recovery action and keeps the alternative save path discoverable", async () => {
    const setToast = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionMidiControl
          result={result}
          language="en"
          setToast={setToast}
          actions={{
            save: vi.fn(),
            prepare: vi.fn().mockRejectedValue(new Error("private detail")),
            startDrag: vi.fn(),
          }}
        />,
      );
    });
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      button.dispatchEvent(pointerEvent("pointerdown", {
        pointerId: 8,
        clientX: 0,
        clientY: 0,
      }));
      button.dispatchEvent(pointerEvent("pointermove", {
        pointerId: 8,
        clientX: 10,
        clientY: 0,
      }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Click MIDI to save");
    expect(container.textContent).not.toContain("private detail");
    await act(async () => root.unmount());
  });
});

function preparedArtifact() {
  return {
    dragToken: "token",
    fileName: "loop-vault-progression.mid",
    tempPath: "private",
    bytesLength: 4,
    preparedAt: 1,
    expiresAt: 2,
    contentHash: "hash",
    reused: false,
  };
}
