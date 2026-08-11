// @vitest-environment jsdom

import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeMidi } from "../domain/midi/analysis";
import type { AnalyzeMidiOptions } from "../domain/midi/types";
import { appCopy } from "../i18n";
import { setPreAnalysisSourceSelectionSettings } from "../storage/preAnalysisSettings";
import type { AnalysisState } from "../store/vaultStore";
import { CaptureView, captureAnalysisTargetLabel } from "./CaptureView";

const tauriMocks = vi.hoisted(() => ({
  openFileDialog: vi.fn(),
  readFile: vi.fn(),
  onDragDropEvent: vi.fn(async () => () => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: tauriMocks.openFileDialog,
}));
vi.mock("@tauri-apps/plugin-fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tauri-apps/plugin-fs")>(),
  readFile: tauriMocks.readFile,
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: tauriMocks.onDragDropEvent,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeCanvasContext() as unknown as CanvasRenderingContext2D,
  );
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
});

describe("Phase 5.12 Capture product path", () => {
  it("keeps a stale Channel 10 voice out of the Capture analysis target label", () => {
    expect(captureAnalysisTargetLabel([
      {
        displayName: "Piano",
        included: true,
        isDrum: false,
        assignedRole: "harmony",
      },
      {
        displayName: "Drums",
        included: true,
        isDrum: true,
        assignedRole: "harmony",
      },
    ])).toBe("Piano");
  });

  it("keeps an all-in-one drop inline until its only Analyze button is pressed", async () => {
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);
    const bytes = allInstrumentsMidi();

    await dropMidi(mounted.container, "all_instruments.mid", bytes);
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='pre-analysis']") !== null);

    expect(analyzerCalls).toHaveLength(0);
    expect(mounted.container.querySelector("[data-pre-analysis-mode='expanded']"))
      .not.toBeNull();
    expect(mounted.container.querySelectorAll("[data-voice-id]")).toHaveLength(11);
    expect(mounted.container.querySelectorAll("canvas")).toHaveLength(1);
    expect(mounted.container.textContent).toContain("Acoustic Grand Piano");
    expect(mounted.container.textContent).toContain("Electric Guitar (jazz)");
    expect(mounted.container.textContent).toContain("Drums");
    expect(mounted.container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);
    expect(mounted.container.textContent).not.toContain("パートを確定");
    expect(mounted.container.textContent).not.toContain("次へ");

    await act(async () => {
      mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='pre-analysis-analyze']",
      )?.click();
    });
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='result']") !== null);

    expect(analyzerCalls).toHaveLength(1);
    expect(analyzerCalls[0]).toMatchObject({ mode: "phase4-v1" });
    expect(mounted.container.querySelector("[data-capture-stage='result']"))
      .not.toBeNull();
    await waitFor(() => mounted.container.querySelector(
      "[data-testid='capture-analysis-preset-summary']",
    )?.textContent?.includes("標準モードで解析済み") === true);

    await mounted.unmount();
  }, 20_000);

  it("shows which Harmonic Core analysis produced the result and requires rerun after returning", async () => {
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);

    await dropMidi(mounted.container, "all_instruments.mid", allInstrumentsMidi());
    await waitFor(() =>
      mounted.container.querySelectorAll("[data-voice-id]").length === 11);

    const harmonicCore = mounted.container.querySelector<HTMLButtonElement>(
      "[data-analysis-contribution-preset='harmonic-core']",
    )!;
    expect(mounted.container.textContent).toContain(
      "選択後は「この設定で解析」を押すと結果に反映されます。",
    );

    await act(async () => harmonicCore.click());
    await act(async () => {
      mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='pre-analysis-analyze']",
      )?.click();
    });
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='result']") !== null);

    expect(analyzerCalls).toHaveLength(1);
    expect(analyzerCalls[0]).toMatchObject({
      mode: "voice-aware-rerank-v1",
      analysisInput: { voiceContributionPreset: "harmonic-core" },
    });
    await waitFor(() => mounted.container.querySelector(
      "[data-testid='capture-analysis-preset-summary']",
    )?.textContent?.includes("和声コアで解析済み") === true);
    const summary = mounted.container.querySelector(
      "[data-testid='capture-analysis-preset-summary']",
    );
    expect(summary?.textContent).toContain(
      "候補が同じでも内部の重み付けには反映されています。",
    );

    await act(async () => {
      mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='capture-change-part-selection']",
      )?.click();
    });
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='pre-analysis']") !== null);

    const warning = mounted.container.querySelector(
      "[data-testid='pre-analysis-reanalysis-required']",
    );
    expect(warning?.textContent).toContain("再解析が必要です");
    expect(warning?.textContent).toContain("この設定で解析");

    await mounted.unmount();
  }, 20_000);

  it("passes a custom part selection through the product Analyze button", async () => {
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);

    await dropMidi(
      mounted.container,
      "all_instruments.mid",
      allInstrumentsMidi(),
    );
    await waitFor(() =>
      mounted.container.querySelectorAll("[data-voice-id]").length === 11);

    const selectedRow = [
      ...mounted.container.querySelectorAll<HTMLElement>("[data-voice-id]"),
    ].find((row) => row.querySelector<HTMLInputElement>(
      'input[type="checkbox"]:checked:not(:disabled)',
    ));
    const selectedCheckbox = selectedRow?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const excludedChannel = Number(selectedRow?.dataset.voiceChannel);
    expect(selectedCheckbox).toBeDefined();
    expect(Number.isInteger(excludedChannel)).toBe(true);

    await act(async () => selectedCheckbox?.click());
    expect(mounted.container.querySelector<HTMLElement>(
      '[data-analysis-preset="custom"]',
    )?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='pre-analysis-analyze']",
      )?.click();
    });
    await waitFor(() => analyzerCalls.length === 1);

    const prepared = analyzerCalls[0].preparedData;
    expect(prepared).toBeDefined();
    expect(prepared?.notes.some((note) =>
      note.channel === excludedChannel)).toBe(false);
    expect(prepared?.tracks.some((track) =>
      track.channel === excludedChannel)).toBe(false);
    expect(analyzerCalls[0].analysisInput?.enabledVoiceIds)
      .toHaveLength(prepared?.tracks.length ?? 0);

    await mounted.unmount();
  }, 20_000);

  it("routes the file picker through the same eleven-Voice inline surface", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const bytes = allInstrumentsMidi();
    tauriMocks.openFileDialog.mockResolvedValue("C:/fixtures/all_instruments.mid");
    tauriMocks.readFile.mockResolvedValue(bytes);
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);

    await act(async () => {
      [...mounted.container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === appCopy.ja.capture.loadMidi)
        ?.click();
    });
    await waitFor(() =>
      mounted.container.querySelectorAll("[data-voice-id]").length === 11);

    expect(tauriMocks.openFileDialog).toHaveBeenCalledWith(expect.objectContaining({
      multiple: true,
    }));
    expect(tauriMocks.readFile).toHaveBeenCalledWith(
      "C:/fixtures/all_instruments.mid",
    );
    expect(analyzerCalls).toHaveLength(0);
    expect(mounted.container.querySelector("[data-pre-analysis-mode='expanded']"))
      .not.toBeNull();
    expect(mounted.container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);

    await mounted.unmount();
  });

  it("keeps simple MIDI compact and preserves its two-action product path", async () => {
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);

    await dropMidi(mounted.container, "piano.mid", simplePianoMidi());
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='pre-analysis']") !== null);

    expect(analyzerCalls).toHaveLength(0);
    expect(mounted.container.querySelector("[data-pre-analysis-mode='compact']"))
      .not.toBeNull();
    expect(mounted.container.querySelector("canvas")).toBeNull();
    expect(mounted.container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);

    await act(async () => {
      mounted.container.querySelector<HTMLButtonElement>(
        "[data-testid='pre-analysis-analyze']",
      )?.click();
    });
    await waitFor(() => analyzerCalls.length === 1);
    expect(analyzerCalls[0]).toMatchObject({ mode: "phase4-v1" });

    await mounted.unmount();
  });

  it("restores the Phase 5 direct path when the feature flag is off", async () => {
    setPreAnalysisSourceSelectionSettings({
      enablePreAnalysisSourceSelection: false,
      alwaysShowPreAnalysis: false,
    });
    const analyzerCalls: AnalyzeMidiOptions[] = [];
    const mounted = await renderCaptureProduct(analyzerCalls);

    await dropMidi(mounted.container, "piano.mid", simplePianoMidi());
    await waitFor(() =>
      mounted.container.querySelector("[data-capture-stage='result']") !== null);

    expect(analyzerCalls).toHaveLength(1);
    expect(mounted.container.querySelector("[data-testid='pre-analysis-workspace']"))
      .toBeNull();

    await mounted.unmount();
  });

  it("adds MIDI in place without remounting the workspace or losing zoom", async () => {
    const mounted = await renderCaptureProduct([]);
    await dropMidi(mounted.container, "all_instruments.mid", allInstrumentsMidi());
    await waitFor(() =>
      mounted.container.querySelectorAll("[data-voice-id]").length === 11);
    const workspace = mounted.container.querySelector(
      "[data-testid='pre-analysis-workspace']",
    );
    const firstRole = mounted.container.querySelector<HTMLSelectElement>(
      "select[aria-label$='の解析役割']",
    )!;
    await act(async () => {
      firstRole.value = "exclude";
      firstRole.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mounted.container.querySelector<HTMLElement>(
      '[role="radio"][aria-checked="true"]',
    )?.textContent).toBe("カスタム");
    const zoom = mounted.container.querySelector<HTMLInputElement>("#pre-analysis-zoom")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
        ?.set?.call(zoom, "3");
      zoom.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(zoom.value).toBe("3");

    await dropMidi(mounted.container, "bass.mid", bassMidi());
    await waitFor(() =>
      mounted.container.querySelectorAll("[data-source-id]").length === 2);

    expect(mounted.container.querySelector("[data-testid='pre-analysis-workspace']"))
      .toBe(workspace);
    expect(mounted.container.querySelector<HTMLInputElement>("#pre-analysis-zoom")?.value)
      .toBe("3");
    expect(mounted.container.querySelector<HTMLSelectElement>(
      "select[aria-label$='の解析役割']",
    )?.value).toBe("exclude");
    expect(mounted.container.querySelector<HTMLElement>(
      '[role="radio"][aria-checked="true"]',
    )?.textContent).toBe("カスタム");
    expect(mounted.container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);

    await mounted.unmount();
  });
});

async function renderCaptureProduct(analyzerCalls: AnalyzeMidiOptions[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
    return (
      <CaptureView
        ideas={[]}
        analysis={analysis}
        analyzeMidiBytes={(bytes, options = {}) => {
          analyzerCalls.push(options);
          const result = analyzeMidi(bytes, options);
          setAnalysis({ status: "done", result });
          return result;
        }}
        clearAnalysis={() => setAnalysis({ status: "idle" })}
        createIdeaFromDraft={vi.fn()}
        appendBlockToIdea={vi.fn()}
        updateIdea={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
        showRomanNumerals
      />
    );
  }

  await act(async () => root.render(<Harness />));
  return {
    container,
    unmount: async () => act(async () => root.unmount()),
  };
}

async function dropMidi(
  container: HTMLElement,
  name: string,
  bytes: Uint8Array,
) {
  const target = container.querySelector<HTMLElement>(
    "[data-capture-midi-drop-zone]",
  )!;
  const file = {
    name,
    type: "audio/midi",
    arrayBuffer: async () => bytes.slice().buffer,
  };
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [file],
      types: ["Files"],
      dropEffect: "copy",
    },
  });
  await act(async () => target.dispatchEvent(event));
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    });
  }
  throw new Error("Timed out waiting for the Capture product path.");
}

function allInstrumentsMidi(): Uint8Array {
  const programs = [0, 26, 33, 48, 80, 4, 18, 40, 56, 0, 88];
  const pitches = [60, 64, 36, 67, 76, 55, 59, 72, 69, 42, 62];
  const events: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: "All Instruments" },
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    },
  ];
  programs.forEach((programNumber, channel) => {
    events.push({
      deltaTime: 0,
      type: "programChange",
      channel,
      programNumber,
    });
    events.push({
      deltaTime: 0,
      type: "noteOn",
      channel,
      noteNumber: pitches[channel],
      velocity: 96,
    });
  });
  programs.forEach((_programNumber, channel) => {
    events.push({
      deltaTime: channel === 0 ? 1920 : 0,
      type: "noteOff",
      channel,
      noteNumber: pitches[channel],
      velocity: 0,
    });
  });
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return smf(events);
}

function simplePianoMidi(): Uint8Array {
  return smf([
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
    { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 96 },
    { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 96 },
    { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 96 },
    { deltaTime: 1920, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
    { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 },
    { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 0 },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ]);
}

function bassMidi(): Uint8Array {
  return smf([
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
    { deltaTime: 0, type: "noteOn", channel: 1, noteNumber: 36, velocity: 96 },
    { deltaTime: 1920, type: "noteOff", channel: 1, noteNumber: 36, velocity: 0 },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ]);
}

function smf(events: MidiEvent[]): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [events],
  }));
}

function fakeCanvasContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
}
