// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackController, type PlaybackAudioDriver } from "../audio/playbackController";
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
  it("switches from the default MIDI input without MIDI analysis and previews one text chord through a 4/4 timeline", async () => {
    const mounted = await renderCapture();

    try {
      const mode = mounted.container.querySelector<HTMLElement>("[data-testid='capture-input-mode']");
      const midiButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "MIDI");
      const textButton = [...(mode?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent === "Text");

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
        "[data-testid='text-progression-card']",
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

      const preview = mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='text-progression-preview']",
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

  it("saves a converted text Draft only through the text save adapter", async () => {
    const mounted = await renderCapture();

    try {
      const textButton = [...mounted.container.querySelectorAll<HTMLButtonElement>(
        "[data-testid='capture-input-mode'] button",
      )].find((button) => button.textContent === "Text");
      await act(async () => textButton?.click());

      await setInput(
        mounted.container.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']"),
        "| Cmaj7 |",
      );
      await setInput(
        mounted.container.querySelector<HTMLInputElement>("[data-testid='text-progression-bpm']"),
        "120",
      );
      await act(async () => mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='text-progression-convert']",
      )?.click());

      expect(mounted.container.querySelector("[data-testid='manual-candidate-editor']")).not.toBeNull();
      expect(mounted.container.querySelector("[data-testid='draft-source']")?.textContent)
        .toContain("Created from text entry");
      for (const action of ["split", "merge", "insert", "delete"]) {
        expect(mounted.container.querySelector(`button[data-action="${action}"]`)).toBeNull();
      }
      expect(mounted.container.querySelector("[data-chord-card]")?.textContent).not.toContain("Review");
      const sourceChip = mounted.container.querySelector<HTMLElement>(
        "[data-testid='capture-voicing-source-chip']",
      );
      expect(sourceChip?.getAttribute("title")).toBe("Auto-generated from this text entry.");
      expect(mounted.container.textContent).not.toContain("Source MIDI");
      expect(mounted.createIdeaFromDraft).not.toHaveBeenCalled();
      expect(mounted.appendBlockToIdea).not.toHaveBeenCalled();
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();

      const saveToVault = [...mounted.container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes(appCopy.en.capture.saveToVault));
      await act(async () => saveToVault?.click());

      const title = mounted.container.querySelector<HTMLInputElement>("input[name='progression-title']");
      expect(title?.value).toBe("Cmaj7");
      await setInput(title, "Edited text title");
      const form = mounted.container.querySelector<HTMLFormElement>("form[role='dialog']");
      await act(async () => form?.dispatchEvent(new Event("submit", {
        bubbles: true,
        cancelable: true,
      })));

      expect(mounted.createIdeaFromTextProgression).toHaveBeenCalledTimes(1);
      expect(mounted.createIdeaFromDraft).not.toHaveBeenCalled();
      expect(mounted.appendBlockToIdea).not.toHaveBeenCalled();
      const payload = mounted.savedTextDraft();
      if (!payload) throw new Error("Expected text save adapter payload.");
      expect(payload).toMatchObject({
        title: "Edited text title",
        bpm: 120,
      });
      expect(payload.chords).toHaveLength(1);
      expect(payload.chords[0]).toMatchObject({ chord: { label: "Cmaj7" } });
      expect(payload).not.toHaveProperty("analysis");
      expect(payload).not.toHaveProperty("sourcePath");
      expect(mounted.analyzeMidiBytes).not.toHaveBeenCalled();
      expect(mounted.clearAnalysis).not.toHaveBeenCalled();
    } finally {
      await mounted.unmount();
    }
  });
});

async function renderCapture() {
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
    return "text-idea";
  });
  const appendBlockToIdea = vi.fn(() => true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <CaptureView
        ideas={[]}
        analysis={{ status: "idle" }}
        analyzeMidiBytes={analyzeMidiBytes}
        clearAnalysis={clearAnalysis}
        createIdeaFromDraft={createIdeaFromDraft}
        createIdeaFromTextProgression={createIdeaFromTextProgression}
        appendBlockToIdea={appendBlockToIdea}
        appendTextProgressionToIdea={vi.fn(() => true)}
        updateIdea={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.en}
        language="en"
        showRomanNumerals
        controller={controller}
      />,
    );
  });

  return {
    container,
    analyzeMidiBytes,
    clearAnalysis,
    createIdeaFromDraft,
    createIdeaFromTextProgression,
    appendBlockToIdea,
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
