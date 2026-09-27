// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import type { PreviewLifecycleCallbacks } from "../audio/chordPreview";
import { appCopy } from "../i18n";
import { AppShell, type SaveStatus } from "./AppShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function mockNarrow(narrow: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: narrow && query.includes("max-width"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockNarrow(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function renderShell({
  view = "home",
  saveStatus = "saved",
  controller,
  setView = vi.fn(),
  openVoicingLoop = vi.fn(),
  openLiveMidi = vi.fn(),
  voicingLoopActive = false,
  openSettings = vi.fn(),
  onSearch = vi.fn(),
  settingsOpen = false,
  standardTitleBar = false,
  masterVolume = 100,
  onMasterVolumeChange = vi.fn(),
}: {
  view?: "home" | "capture" | "library" | "detail" | "practice";
  saveStatus?: SaveStatus;
  controller?: ReturnType<typeof createPlaybackController>;
  setView?: ReturnType<typeof vi.fn>;
  openVoicingLoop?: ReturnType<typeof vi.fn>;
  openLiveMidi?: ReturnType<typeof vi.fn>;
  voicingLoopActive?: boolean;
  openSettings?: ReturnType<typeof vi.fn>;
  onSearch?: ReturnType<typeof vi.fn>;
  settingsOpen?: boolean;
  standardTitleBar?: boolean;
  masterVolume?: number;
  onMasterVolumeChange?: ReturnType<typeof vi.fn>;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AppShell
      view={view}
      setView={setView}
      openLiveMidi={openLiveMidi}
      openVoicingLoop={openVoicingLoop}
      openSettings={openSettings}
      onSearch={onSearch}
      settingsOpen={settingsOpen}
      standardTitleBar={standardTitleBar}
      voicingLoopActive={voicingLoopActive}
      copy={appCopy.en}
      saveStatus={saveStatus}
      masterVolume={masterVolume}
      onMasterVolumeChange={onMasterVolumeChange}
      controller={controller}
      pageTitle="ホーム"
    >
      <main id="test-content">Content</main>
    </AppShell>,
  ));
  return { container, root };
}

const navKeys = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-nav]")].map((item) => item.dataset.nav);

describe("AppShell (P8.9-02)", () => {
  it("shows nothing for a successful save and a small mark while saving, unsaved or failed", async () => {
    const saved = await renderShell({ saveStatus: "saved" });
    const quiet = saved.container.querySelector('[data-save-status="saved"]');
    expect(quiet?.getAttribute("role")).toBe("status");
    expect(quiet?.textContent).toBe("");
    expect(quiet?.getAttribute("aria-label")).toBeNull();
    await act(async () => saved.root.unmount());

    for (const [status, label] of [["saving", "Saving…"], ["unsaved", "Unsaved"], ["error", "Save failed"]] as const) {
      const { container, root } = await renderShell({ saveStatus: status });
      const mark = container.querySelector(`[data-save-status="${status}"]`);
      expect(mark?.getAttribute("aria-label")).toBe(label);
      expect(mark?.textContent).toContain(label);
      await act(async () => root.unmount());
    }
  });

  it("lists the Japanese sidebar in the mock order with stable data-nav hooks", async () => {
    const openSettings = vi.fn();
    const { container, root } = await renderShell({ view: "detail", openSettings });
    expect(navKeys(container)).toEqual(["home", "capture", "vault", "voicing-loop", "chord-dojo", "bass-practice", "live-midi", "history", "settings"]);
    expect([...container.querySelectorAll("[data-nav]")].map((item) => item.textContent)).toEqual([
      "ホーム", "取り込む", "Vault", "Voicing Loop", "Chord Dojo", "Bass Practice", "Live MIDI", "履歴", "設定",
    ]);
    expect(container.textContent).not.toMatch(/WORKSPACE|SYSTEM/);
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("data-nav")).toBe("vault");
    const create = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.title === "+ Idea");
    expect(create).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click());
    expect(openSettings).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("gives only the active practice item current-page semantics", async () => {
    const openVoicingLoop = vi.fn();
    const { container, root } = await renderShell({ view: "practice", openVoicingLoop, voicingLoopActive: true });
    expect([...container.querySelectorAll('[aria-current="page"]')].map((item) => item.getAttribute("data-nav"))).toEqual(["voicing-loop"]);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-nav="voicing-loop"]')?.click());
    expect(openVoicingLoop).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("marks Settings as the active destination while the dialog is open", async () => {
    const { container, root } = await renderShell({ settingsOpen: true });
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("data-nav")).toBe("settings");
    await act(async () => root.unmount());
  });

  it("starts icon-only below 1200px, keeps names as labels and tooltips, and remembers a manual toggle", async () => {
    mockNarrow(true);
    const narrow = await renderShell();
    const sidebar = narrow.container.querySelector("[data-sidebar]");
    expect(sidebar?.getAttribute("data-sidebar")).toBe("collapsed");
    const capture = narrow.container.querySelector<HTMLButtonElement>('[data-nav="capture"]');
    expect(capture?.getAttribute("aria-label")).toBe("取り込む");
    expect(capture?.querySelector(".lv-tooltip")?.textContent).toBe("取り込む");
    const toggle = narrow.container.querySelector<HTMLButtonElement>("[data-sidebar-toggle]");
    expect(toggle?.getAttribute("aria-label")).toBe("サイドバーを広げる");
    await act(async () => toggle?.click());
    expect(sidebar?.getAttribute("data-sidebar")).toBe("expanded");
    await act(async () => narrow.root.unmount());

    const remembered = await renderShell();
    expect(remembered.container.querySelector("[data-sidebar]")?.getAttribute("data-sidebar")).toBe("expanded");
    await act(async () => remembered.root.unmount());
  });

  it("groups the volume icon with the level meter and opens the knob in a popover", async () => {
    const onMasterVolumeChange = vi.fn();
    const { container, root } = await renderShell({ masterVolume: 72, onMasterVolumeChange });
    const actions = container.querySelector("[data-global-actions]")!;
    expect([...actions.children].map((child) => child.getAttribute("data-midi-status") ? "midi"
      : child.getAttribute("aria-label") === "Preview sound" ? "sound"
        : child.getAttribute("data-testid") === "global-metronome" ? "metronome"
          : child.classList.contains("lv-volume-group") ? "volume"
              : child.getAttribute("data-save-status") ? "save" : "?")).toEqual(["midi", "sound", "metronome", "volume", "save"]);
    expect(container.querySelector('input[aria-label="Master volume"]')).toBeNull();
    const trigger = container.querySelector<HTMLButtonElement>("[data-volume-trigger]");
    expect(trigger?.getAttribute("aria-label")).toBe("Master volume 72%");
    await act(async () => trigger?.click());
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Master volume"]');
    expect(input?.value).toBe("72");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "41");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onMasterVolumeChange).toHaveBeenCalledWith(41);
    await act(async () => root.unmount());
  });

  it("keeps the level meter mounted as the immediate global stop action", async () => {
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
    expect(stopButton?.closest(".lv-volume-group")).not.toBeNull();
    expect(stopButton?.getAttribute("aria-label")).toBe("Stop current playback");
    expect(stopButton?.disabled).toBe(false);
    await act(async () => stopButton?.click());
    expect(controller.getState()).toEqual({ status: "idle" });
    expect(stopButton?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("reads the Live MIDI state without activating it and opens Live MIDI on click", async () => {
    const openLiveMidi = vi.fn();
    const { container, root } = await renderShell({ openLiveMidi });
    const chip = container.querySelector<HTMLButtonElement>("[data-midi-status]");
    expect(chip?.dataset.midiStatus).toBe("idle");
    expect(chip?.textContent).toBe("MIDI 未接続");
    await act(async () => chip?.click());
    expect(openLiveMidi).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("keeps one bounded frame: title bar, then sidebar and a column that holds the header and content", async () => {
    const { container, root } = await renderShell();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("lv-app-frame");
    expect(frame.children[0].hasAttribute("data-titlebar")).toBe(true);
    const body = frame.children[1] as HTMLElement;
    expect(body.className).toContain("lv-app-body");
    expect(body.querySelector(":scope > .lv-sidebar")).not.toBeNull();
    expect(body.querySelector(":scope > .lv-app-column > header.lv-app-header")).not.toBeNull();
    expect(body.querySelector(":scope > .lv-app-column > #test-content")).not.toBeNull();
    await act(async () => root.unmount());

    const standard = await renderShell({ standardTitleBar: true });
    expect(standard.container.querySelector("[data-titlebar]")).toBeNull();
    await act(async () => standard.root.unmount());
  });

  it("opens search from the title bar button and from Ctrl+K", async () => {
    const onSearch = vi.fn();
    const { container, root } = await renderShell({ onSearch });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-titlebar-search]")?.click());
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })); });
    expect(onSearch).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});
