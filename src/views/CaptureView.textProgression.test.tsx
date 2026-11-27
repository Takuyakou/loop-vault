// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackController, type PlaybackAudioDriver } from "../audio/playbackController";
import { NotificationProvider } from "../components/notifications";
import { createNotificationStore } from "../components/notifications/notificationStore";
import { appCopy } from "../i18n";
import type { TextProgressionIdeaDraft } from "../store/vaultStore";
import { CaptureView } from "./CaptureView";

const tauriMocks = vi.hoisted(() => ({
  onDragDropEvent: vi.fn(async () => () => undefined),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: tauriMocks.onDragDropEvent,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CaptureView text progression entry", () => {
  it("mounts directly in Text mode when requested while preserving the normal MIDI default", async () => {
    const mounted = await renderCapture("text");

    try {
      const mode = mounted.container.querySelector<HTMLElement>("[data-testid='capture-input-mode']");
      const midiButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "MIDI");
      const textButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "テキスト");

      expect(mounted.container.querySelector("[data-capture-stage='text']")).not.toBeNull();
      expect(textButton?.getAttribute("aria-pressed")).toBe("true");
      expect(midiButton?.getAttribute("aria-pressed")).toBe("false");
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();
    } finally {
      await mounted.unmount();
    }
  });

  it("saves a practice-incompatible score from the one text screen and disables the Voicing Loop action", async () => {
    const mounted = await renderCapture("text");
    try {
      await setInput(mounted.container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]'),
        "| C Dm G7 F Am |");
      const save = mounted.container.querySelector<HTMLButtonElement>('[data-testid="text-progression-save"]');
      expect(save?.disabled).toBe(false);
      await act(async () => save?.click());
      expect(mounted.createIdeaFromTextProgression).toHaveBeenCalledOnce();
      // P25 V27: the panel under the preview is gone; the bottom-right notice is the only word.
      const notices = mounted.notifications.getSnapshot();
      const last = notices[notices.length - 1]!;
      expect(last).toMatchObject({ tone: "info", message: "進行をVaultに保存しました。この進行は Voicing Loop では練習できません。" });
      expect(last.action).toBeUndefined();
      expect(mounted.container.textContent).not.toContain("練習制限");
      expect(mounted.container.textContent).not.toContain("invalid-timing");
      expect(mounted.container.textContent).not.toContain("保存した進行を" + "練習できます");
      expect(mounted.container.textContent).not.toContain("進行エディタで開く");
    } finally {
      await mounted.unmount();
    }
  });

  it("saves Standard directly through the existing text Vault adapter without opening Draft", async () => {
    const mounted = await renderCapture("text");
    try {
      await setInput(mounted.container.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']"),
        "| C Dm |");
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-name']"),
        "Authored progression");
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-bpm']"), "121");
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-bpm']"), "120");
      const save = mounted.container.querySelector<HTMLButtonElement>("[data-testid='text-progression-save']");
      expect(save?.disabled).toBe(false);
      await act(async () => save?.click());
      expect(mounted.createIdeaFromTextProgression).toHaveBeenCalledTimes(1);
      expect(mounted.createIdeaFromDraft).not.toHaveBeenCalled();
      expect(mounted.container.querySelector("[data-testid='manual-candidate-editor']")).toBeNull();
      expect(mounted.savedTextDraft()).toMatchObject({
        title: "Authored progression", bpm: 120, scoreLengthBeats: 4,
        userEdited: false, userVerified: true,
      });
      expect(mounted.savedTextDraft()?.chords).toHaveLength(2);
    } finally { await mounted.unmount(); }
  });

  it("switches from the default MIDI input without MIDI analysis and previews one text chord through a 4/4 timeline", async () => {
    const mounted = await renderCapture();

    try {
      const mode = mounted.container.querySelector<HTMLElement>("[data-testid='capture-input-mode']");
      const midiButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "MIDI");
      const textButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "テキスト");

      expect(midiButton?.getAttribute("aria-pressed")).toBe("true");
      expect(textButton?.tagName).toBe("BUTTON");
      textButton?.focus();
      expect(document.activeElement).toBe(textButton);

      await act(async () => textButton?.click());

      expect(mounted.container.querySelector("[data-capture-stage='text']")).not.toBeNull();
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();

      const textInput = mounted.container.querySelector<HTMLTextAreaElement>(
        "[data-testid='text-progression-input']",
      );
      await setInput(textInput, "| Cmaj7 |");

      const chordCard = mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='text-preview-band']",
      );
      expect(chordCard?.textContent).toContain("Cmaj7");
      await act(async () => chordCard?.click());
      expect(mounted.toggle).toHaveBeenCalledTimes(1);
      expect(mounted.controller.getState().request).toMatchObject({
        type: "timeline",
        bpm: 120,
        beatsPerBar: 4,
      });
      const bpmInput = mounted.container.querySelector<HTMLInputElement>(
        "[data-testid='text-progression-bpm']",
      );
      await setInput(bpmInput, "132");

      // P25-03: the band's 「鳴らす」 plays the chosen card.
      const preview = mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='text-dock-play']",
      );
      expect(preview?.disabled).toBe(false);
      await act(async () => preview?.click());

      expect(mounted.toggle).toHaveBeenCalledTimes(2);
      const request = mounted.controller.getState().request;
      if (!request || request.type !== "timeline") {
        throw new Error("Text chord preview must use a timeline playback request.");
      }
      expect(request).toMatchObject({
        type: "timeline",
        bpm: 132,
        beatsPerBar: 4,
      });
      expect(request).not.toHaveProperty("chord");
      expect(request.timeline).toHaveLength(1);
      expect(request.timeline[0]).toMatchObject({
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: { label: "Cmaj7" },
      });

      const stopsBeforeModeExit = mounted.stop.mock.calls.length;
      const midiExit = [...mounted.container.querySelectorAll<HTMLButtonElement>(
        "[data-testid='capture-input-mode'] button",
      )].find((button) => button.textContent === "MIDI");
      await act(async () => midiExit?.click());
      expect(mounted.stop).toHaveBeenCalledTimes(stopsBeforeModeExit + 1);
      expect(mounted.container.querySelector("[data-capture-stage='text']")).toBeNull();
      expect(mounted.container.querySelector("[data-capture-stage='empty']")).not.toBeNull();
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();
    } finally {
      await mounted.unmount();
    }
  });

  it("saves the text only through the text save adapter, with no draft screen", async () => {
    const mounted = await renderCapture();

    try {
      const textButton = [...mounted.container.querySelectorAll<HTMLButtonElement>(
        "[data-testid='capture-input-mode'] button",
      )].find((button) => button.textContent === "テキスト");
      await act(async () => textButton?.click());

      await setInput(
        mounted.container.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']"),
        "| Cmaj7 |",
      );
      // The scrub control displays a practice default of 120 before a BPM is authored.
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-bpm']"), "121");
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-bpm']"), "120");
      // P25-03 C12: no draft screen; the panel's own save goes through the text save adapter.
      expect(mounted.container.querySelector("[data-testid='text-progression-convert']")).toBeNull();
      await setInput(mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-name']"), "Edited text title");
      await act(async () => mounted.container.querySelector<HTMLButtonElement>("[data-testid='text-progression-save']")?.click());

      expect(mounted.createIdeaFromTextProgression).toHaveBeenCalledTimes(1);
      expect(mounted.createIdeaFromDraft).not.toHaveBeenCalled();
      expect(mounted.container.querySelector("[data-testid='manual-candidate-editor']")).toBeNull();
      const payload = mounted.savedTextDraft();
      if (!payload) throw new Error("Expected text save adapter payload.");
      expect(payload).toMatchObject({ title: "Edited text title", bpm: 120 });
      expect(payload.chords).toHaveLength(1);
      expect(payload.chords[0]).toMatchObject({ chord: { label: "Cmaj7" } });
      expect(payload).not.toHaveProperty("analysis");
      expect(payload).not.toHaveProperty("sourcePath");
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();

      const notices = mounted.notifications.getSnapshot();
      const last = notices[notices.length - 1]!;
      expect(last).toMatchObject({ tone: "success", message: appCopy.ja.capture.savedToVault });
      expect(last.action?.label).toBe("Voicing Loopで練習");
      await act(async () => last.action?.onClick());
      expect(mounted.openSavedTextProgressionPractice).toHaveBeenCalledWith({ ideaId: "text-idea", blockId: "text-block" });
      expect(mounted.container.textContent).not.toContain("保存した進行を" + "練習できます");
      expect(mounted.container.textContent).not.toContain("進行エディタで開く");
    } finally { await mounted.unmount(); }
  });
});

async function renderCapture(initialInputMode: "midi" | "text" = "midi") {
  const stop = vi.fn();
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, callbacks) => callbacks.onStarted?.()),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, callbacks) => callbacks.onStarted?.()),
    stop,
  };
  const controller = createPlaybackController(driver);
  const toggle = vi.spyOn(controller, "toggle");
  const analyzeMidiBytes = vi.fn();
  const clearAnalysis = vi.fn();
  const createIdeaFromDraft = vi.fn(() => "midi-idea");
  let savedTextDraft: TextProgressionIdeaDraft | undefined;
  const createIdeaFromTextProgression = vi.fn((draft: TextProgressionIdeaDraft) => {
    savedTextDraft = draft;
    return { ideaId: "text-idea", blockId: "text-block" };
  });
  const appendBlockToIdea = vi.fn(() => true);
  const openSavedTextProgressionPractice = vi.fn();
  const notifications = createNotificationStore();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <NotificationProvider store={notifications}>
        <CaptureView
          initialInputMode={initialInputMode}
          ideas={[]}
          analysis={{ status: "idle" }}
          analyzeMidiBytes={analyzeMidiBytes}
          clearAnalysis={clearAnalysis}
          createIdeaFromDraft={createIdeaFromDraft}
          createIdeaFromTextProgression={createIdeaFromTextProgression}
          appendBlockToIdea={appendBlockToIdea}
          appendTextProgressionToIdea={vi.fn(() => true)}
          openSavedTextProgressionPractice={openSavedTextProgressionPractice}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals
          controller={controller}
        />
      </NotificationProvider>,
    );
  });

  return {
    container,
    analyzeMidiBytes,
    clearAnalysis,
    createIdeaFromDraft,
    createIdeaFromTextProgression,
    appendBlockToIdea,
    openSavedTextProgressionPractice,
    notifications,
    controller,
    stop,
    toggle,
    savedTextDraft: () => savedTextDraft,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function setInput(
  input: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
) {
  if (!input) throw new Error("Expected input was not rendered.");
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Expected native value setter.");
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
