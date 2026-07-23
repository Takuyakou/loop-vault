// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import type { PreviewLifecycleCallbacks } from "../audio/chordPreview";
import { appCopy } from "../i18n";
import { AppShell, type SaveStatus } from "./AppShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

async function renderShell({
  view = "home",
  saveStatus = "saved",
  controller,
  setView = vi.fn(),
  openSettings = vi.fn(),
}: {
  view?: "home" | "capture" | "library" | "detail";
  saveStatus?: SaveStatus;
  controller?: ReturnType<typeof createPlaybackController>;
  setView?: ReturnType<typeof vi.fn>;
  openSettings?: ReturnType<typeof vi.fn>;
} = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(
    <AppShell
      view={view}
      setView={setView}
      openCreate={vi.fn()}
      openLiveMidi={vi.fn()}
      openSettings={openSettings}
      copy={appCopy.en}
      saveStatus={saveStatus}
      controller={controller}
    />,
  ));
  return { container, root };
}

describe("AppShell", () => {
  it.each([
    ["saved", "Saved", "lucide-check"],
    ["saving", "Saving…", "lucide-loader-circle"],
    ["unsaved", "Unsaved", "lucide-circle-alert"],
  ] as const)("renders %s with full and compact status content", async (saveStatus, label, iconClass) => {
    const { container, root } = await renderShell({ saveStatus });
    const status = container.querySelector(`[data-save-status="${saveStatus}"]`);
    expect(status?.getAttribute("aria-label")).toBe(label);
    expect(status?.getAttribute("title")).toBe(label);
    expect(status?.querySelector(`.${iconClass}`)).not.toBeNull();
    expect(status?.querySelector(".lg\\:inline")?.textContent).toBe(label);
    await act(async () => root.unmount());
  });

  it("marks the active navigation pill and opens settings accessibly", async () => {
    const openSettings = vi.fn();
    const setView = vi.fn();
    const { container, root } = await renderShell({ view: "detail", openSettings, setView });
    const active = container.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    expect(active?.textContent).toBe("Vault");
    expect(active?.className).toContain("bg-[var(--lv-surface-raised)]");
    expect([...container.querySelectorAll("nav button")].map((button) => button.textContent)).toEqual([
      "Home",
      "Capture",
      "Vault",
      "Practice",
    ]);
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.title === "+ Idea");
    expect(createButton).toBeDefined();
    expect(createButton?.textContent).toContain("Idea");

    const settings = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
    expect(settings?.title).toBe("Settings");
    await act(async () => settings?.click());
    expect(openSettings).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("shows the global stop action while another view keeps playing", async () => {
    let callbacks: PreviewLifecycleCallbacks | undefined;
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, nextCallbacks) => {
        callbacks = nextCallbacks;
      }),
      playTimeline: vi.fn(async () => undefined),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const { container, root } = await renderShell({ controller });

    await act(async () => controller.play(
      { kind: "detail", id: "idea:one:block:one" },
      { type: "chord", chord: { root: 0, quality: "maj", tensions: [], label: "C" } },
    ));
    await act(async () => callbacks?.onStarted?.());
    const stopButton = container.querySelector<HTMLButtonElement>('button[aria-label="Stop current playback"]');
    expect(stopButton).not.toBeNull();
    expect(stopButton?.textContent).toContain("Playing");

    await act(async () => stopButton?.click());
    expect(controller.getState()).toEqual({ status: "idle" });
    expect(container.querySelector('button[aria-label="Stop current playback"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
