// @vitest-environment jsdom

import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createAnalysisSession,
  type AnalysisSession,
} from "../../domain/midi/preAnalysis";
import { PreAnalysisWorkspace } from "./PreAnalysisWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeCanvasContext() as unknown as CanvasRenderingContext2D,
  );
});

describe("PreAnalysisWorkspace", () => {
  it("renders one Canvas instead of one DOM element per note", async () => {
    const session = fixtureSession();
    const { container, unmount } = await renderWorkspace(session);

    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(0);
    expect(container.textContent).toContain("解析するパートを確認");
    expect(container.textContent).toContain("Piano");
    expect(container.textContent).toContain("Bass");
    expect(container.textContent).toContain("Drums");

    await unmount();
  });

  it("switches presets and moves manual role edits to Custom", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const { container, unmount } = await renderWorkspace(
      session,
      { onSessionChange },
    );

    const allParts = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "全パート")!;
    await act(async () => allParts.click());
    expect(lastSession(onSessionChange)).toMatchObject({
      preset: "all-pitched",
    });

    const roleSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Acoustic Grand Pianoの解析役割"]',
    )!;
    await act(async () => {
      roleSelect.value = "exclude";
      roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(lastSession(onSessionChange)).toMatchObject({
      preset: "custom",
    });
    const changed = lastSession(onSessionChange);
    expect(changed.voices.find((voice) =>
      voice.displayName === "Acoustic Grand Piano")).toMatchObject({
      assignedRole: "exclude",
      included: false,
    });

    await unmount();
  });

  it("keeps Voice visibility independent from analysis inclusion", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const { container, unmount } = await renderWorkspace(
      session,
      { onSessionChange },
    );

    const hide = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Acoustic Bassを非表示"]',
    )!;
    await act(async () => hide.click());
    const changed = lastSession(onSessionChange);
    expect(changed.voices.find((voice) =>
      voice.displayName === "Acoustic Bass")).toMatchObject({
      visible: false,
      included: true,
    });

    await unmount();
  });

  it("exposes add, remove, analyze, keyboard, and accessible controls", async () => {
    const session = fixtureSession();
    const onAddMidi = vi.fn();
    const onRemoveSource = vi.fn();
    const onAnalyze = vi.fn();
    const { container, unmount } = await renderWorkspace(session, {
      onAddMidi,
      onRemoveSource,
      onAnalyze,
    });

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("MIDIを追加"))?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("この構成で解析"))?.click();
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="MIDIを削除"]',
      )?.click();
    });
    expect(onAddMidi).toHaveBeenCalledOnce();
    expect(onAnalyze).toHaveBeenCalledOnce();
    expect(onRemoveSource).toHaveBeenCalledWith("master");

    const canvas = container.querySelector<HTMLCanvasElement>("canvas")!;
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }));
    });
    expect(canvas.getAttribute("aria-label")).toContain("左右キー");

    await unmount();
  });

  it("keeps Voice audition controls independent and exposes Play / Stop", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const { container, unmount } = await renderWorkspace(session, {
      onSessionChange,
      onPlay,
      onStop,
    });

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("再生"))?.click();
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="停止"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Acoustic Grand Pianoをミュート"]',
      )?.click();
    });

    expect(onPlay).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(lastSession(onSessionChange).voices.find((voice) =>
      voice.displayName === "Acoustic Grand Piano")).toMatchObject({
      muted: true,
    });
    await unmount();
  });

  it("renders 100,000 notes on one Canvas without creating note DOM nodes", async () => {
    const base = fixtureSession();
    const voice = base.voices.find((candidate) => !candidate.isDrum)!;
    const source = base.sources.find((candidate) => candidate.id === voice.sourceId)!;
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((candidate) => candidate.id === source.id
        ? { ...candidate, durationBeats: 720 }
        : candidate),
      notes: Array.from({ length: 100_000 }, (_, index) => ({
        sourceId: source.id,
        voiceId: voice.id,
        trackIndex: voice.trackIndex,
        channel: voice.channel,
        pitch: 48 + index % 36,
        velocity: 80,
        startBeat: index % 720,
        durationBeats: 0.25,
      })),
    };
    const startedAt = performance.now();
    const { container, unmount } = await renderWorkspace(session);
    const elapsedMs = performance.now() - startedAt;

    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(3_000);

    await unmount();
  }, 10_000);
});

async function renderWorkspace(
  session: AnalysisSession,
  overrides: Partial<Parameters<typeof PreAnalysisWorkspace>[0]> = {},
) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 1000 });
  const root = createRoot(container);
  await act(async () => root.render(
    <PreAnalysisWorkspace
      session={session}
      language="ja"
      onSessionChange={vi.fn()}
      onAddMidi={vi.fn()}
      onRemoveSource={vi.fn()}
      onAnalyze={vi.fn()}
      {...overrides}
    />,
  ));
  return {
    container,
    unmount: async () => act(async () => root.unmount()),
  };
}

function fixtureSession(): AnalysisSession {
  return createAnalysisSession([
    {
      sourceId: "master",
      displayName: "full.mid",
      bytes: midi([0, 1, 9]),
    },
    {
      sourceId: "split",
      displayName: "split.mid",
      bytes: midi([2]),
    },
  ]).session!;
}

function midi(channels: readonly number[]): Uint8Array {
  const events: MidiEvent[] = [{ deltaTime: 0, meta: true, type: "trackName", text: "Piano" }];
  channels.forEach((channel, index) => {
    events.push({
      deltaTime: 0,
      type: "programChange",
      channel,
      programNumber: channel === 0 ? 0 : channel === 1 ? 32 : 80,
    });
    events.push({
      deltaTime: 0,
      type: "noteOn",
      channel,
      noteNumber: channel === 9 ? 36 : 48 + index * 12,
      velocity: 100,
    });
    events.push({
      deltaTime: 480,
      type: "noteOff",
      channel,
      noteNumber: channel === 9 ? 36 : 48 + index * 12,
      velocity: 0,
    });
  });
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
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

function lastSession(callback: ReturnType<typeof vi.fn>): AnalysisSession {
  return callback.mock.calls[callback.mock.calls.length - 1][0] as AnalysisSession;
}
