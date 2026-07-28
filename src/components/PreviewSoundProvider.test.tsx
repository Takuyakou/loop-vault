// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPreviewSound } from "../audio/previewSoundPreference";
import {
  PreviewSoundProvider,
  usePreviewSound,
} from "./PreviewSoundProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function SoundConsumer({ id }: { id: string }) {
  const { sound, setSound } = usePreviewSound();
  return (
    <button
      data-consumer={id}
      onClick={() => setSound(
        sound === "piano" ? "electric-piano" : "piano",
      )}
    >
      {sound}
    </button>
  );
}

describe("PreviewSoundProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shares, persists, and stops playback when the sound changes", async () => {
    const controller = { stop: vi.fn() };
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(
      <PreviewSoundProvider controller={controller}>
        <SoundConsumer id="header" />
        <SoundConsumer id="view" />
      </PreviewSoundProvider>,
    ));

    const header = container.querySelector<HTMLButtonElement>(
      '[data-consumer="header"]',
    );
    const view = container.querySelector<HTMLButtonElement>(
      '[data-consumer="view"]',
    );
    expect(header?.textContent).toBe("piano");
    expect(view?.textContent).toBe("piano");

    await act(async () => header?.click());

    expect(header?.textContent).toBe("electric-piano");
    expect(view?.textContent).toBe("electric-piano");
    expect(controller.stop).toHaveBeenCalledOnce();
    expect(loadPreviewSound()).toBe("electric-piano");

    await act(async () => root.unmount());
  });
});
