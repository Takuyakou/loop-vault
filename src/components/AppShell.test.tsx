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
  settingsOpen = false,
  masterVolume = 100,
  onMasterVolumeChange = vi.fn(),
}: {
  view?: "home" | "capture" | "library" | "detail";
  saveStatus?: SaveStatus;
  controller?: ReturnType<typeof createPlaybackController>;
  setView?: ReturnType<typeof vi.fn>;
  openSettings?: ReturnType<typeof vi.fn>;
  settingsOpen?: boolean;
  masterVolume?: number;
  onMasterVolumeChange?: ReturnType<typeof vi.fn>;
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
      settingsOpen={settingsOpen}
      copy={appCopy.en}
      saveStatus={saveStatus}
      masterVolume={masterVolume}
      onMasterVolumeChange={onMasterVolumeChange}
      controller={controller}
      pageTitle="Home"
      pageContext="Today’s loop"
    >
      <main id="test-content">Content</main>
    </AppShell>,
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
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-label")).toBe(label);
    expect(status?.getAttribute("title")).toBe(label);
    expect(status?.querySelector(`.${iconClass}`)).not.toBeNull();
    expect(status?.querySelector(".xl\\:inline")?.textContent).toBe(label);
    await act(async () => root.unmount());
  });

  it("marks the active navigation pill and opens settings accessibly", async () => {
    const openSettings = vi.fn();
    const setView = vi.fn();
    const { container, root } = await renderShell({ view: "detail", openSettings, setView });
    const active = container.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    expect(active?.textContent).toBe("Vault");
    expect(active?.className).toContain("bg-[var(--lv-accent-soft)]");
    expect([...container.querySelectorAll("nav button")].map((button) => button.textContent)).toEqual([
      "Home",
      "Chord Capture",
      "Vault",
      "Practice",
      "Live MIDI",
      "History",
      "Settings",
    ]);
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.title === "+ Idea");
    expect(createButton).toBeDefined();
    expect(createButton?.textContent).toContain("Idea");

    const settings = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
    const settingsByText = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Settings");
    expect(settings).toBeNull();
    expect(settingsByText?.className).toContain("min-h-10");
    await act(async () => settingsByText?.click());
    expect(openSettings).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("places the master volume knob between the level meter and sound selector", async () => {
    const onMasterVolumeChange = vi.fn();
    const { container, root } = await renderShell({
      masterVolume: 72,
      onMasterVolumeChange,
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Master volume"]');
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.title === "+ Idea");

    expect(input?.value).toBe("72");
    expect(input?.getAttribute("aria-valuetext")).toBe("72%");
    const meter = container.querySelector("[data-playback-level-meter]");
    const soundSelector = container.querySelector('[role="group"][aria-label="Preview sound"]');
    expect(meter?.nextElementSibling).toBe(input?.closest("label"));
    expect(input?.closest("label")?.nextElementSibling).toBe(soundSelector);
    expect(soundSelector?.nextElementSibling).toBe(createButton);
    expect(input?.closest("label")?.className).not.toContain("border");
    expect(input?.closest("label")?.className).toContain("bg-transparent");
    expect(
      input?.closest("label")?.querySelector('[data-volume-tooltip="true"]')?.textContent,
    ).toBe("Master volume: 72%");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "41");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onMasterVolumeChange).toHaveBeenCalledWith(41);
    await act(async () => root.unmount());
  });

  it("places the global preview sound selector immediately after master volume", async () => {
    const { container, root } = await renderShell();
    const group = container.querySelector<HTMLElement>(
      '[role="group"][aria-label="Preview sound"]',
    );
    const piano = group?.querySelector<HTMLButtonElement>(
      'button[data-preview-sound="piano"]',
    );
    const electricPiano = group?.querySelector<HTMLButtonElement>(
      'button[data-preview-sound="electric-piano"]',
    );
    const volume = container.querySelector<HTMLInputElement>(
      'input[aria-label="Master volume"]',
    );

    expect(piano?.getAttribute("aria-pressed")).toBe("true");
    expect(electricPiano?.getAttribute("aria-pressed")).toBe("false");
    expect(volume?.closest("label")?.nextElementSibling).toBe(group);

    await act(async () => electricPiano?.click());
    expect(piano?.getAttribute("aria-pressed")).toBe("false");
    expect(electricPiano?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.unmount());
  });

  it("keeps the level meter mounted and uses it as the global stop action", async () => {
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
    const stopButton = container.querySelector<HTMLButtonElement>("[data-playback-level-meter]");
    expect(stopButton?.getAttribute("data-playback-status")).toBe("playing");
    expect(stopButton?.getAttribute("aria-label")).toBe("Stop current playback");
    expect(stopButton?.disabled).toBe(false);

    await act(async () => stopButton?.click());
    expect(controller.getState()).toEqual({ status: "idle" });
    const idleMeter = container.querySelector<HTMLButtonElement>("[data-playback-level-meter]");
    expect(idleMeter).toBe(stopButton);
    expect(idleMeter?.getAttribute("data-playback-status")).toBe("idle");
    expect(idleMeter?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("marks Settings as the active sidebar destination while the dialog is open", async () => {
    const { container, root } = await renderShell({ settingsOpen: true });
    const active = container.querySelector<HTMLButtonElement>('nav button[aria-current="page"]');
    expect(active?.textContent).toBe("Settings");
    await act(async () => root.unmount());
  });

  it("collapses the sidebar without removing accessible route names", async () => {
    const { container, root } = await renderShell();
    const sidebar = container.querySelector("[data-sidebar]");
    const toggle = container.querySelector<HTMLButtonElement>("[data-sidebar-toggle]");

    expect(sidebar?.getAttribute("data-sidebar")).toBe("expanded");
    await act(async () => toggle?.click());
    expect(sidebar?.getAttribute("data-sidebar")).toBe("collapsed");
    expect(
      container.querySelector<HTMLButtonElement>('nav button[aria-label="Chord Capture"]')?.title,
    ).toBe("Chord Capture");
    expect(toggle?.getAttribute("aria-label")).toBe("Expand sidebar");

    await act(async () => root.unmount());
  });

  it("keeps one bounded app shell so main content owns vertical scrolling", async () => {
    const { container, root } = await renderShell();
    const shell = container.firstElementChild as HTMLElement;
    const contentColumn = shell.children[1] as HTMLElement;

    expect(shell.className).toContain("h-full");
    expect(shell.className).toContain("min-h-0");
    expect(shell.className).not.toContain("min-h-[520px]");
    expect(contentColumn.className).toContain("min-h-0");

    await act(async () => root.unmount());
  });});
