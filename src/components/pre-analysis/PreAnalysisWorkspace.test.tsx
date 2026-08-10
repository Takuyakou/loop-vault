// @vitest-environment jsdom

import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { act, useState } from "react";
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
    expect(container.textContent).toContain("読み込んだMIDI");
    expect(container.textContent).toContain("Piano");
    expect(container.textContent).toContain("Bass");
    expect(container.textContent).toContain("Drums");

    await unmount();
  });

  it("renders every Voice from an all-in-one Type 0 MIDI", async () => {
    const session = createAnalysisSession([{
      sourceId: "all-in-one",
      displayName: "all_instruments.mid",
      bytes: midi(Array.from({ length: 11 }, (_, channel) => channel)),
    }]).session!;
    const { container, unmount } = await renderWorkspace(session);

    expect(session.sources).toHaveLength(1);
    expect(session.voices).toHaveLength(11);
    expect(container.querySelector("[data-testid='pre-analysis-workspace']")
      ?.getAttribute("data-pre-analysis-mode")).toBe("expanded");
    expect(container.querySelectorAll("select")).toHaveLength(11);
    expect(container.querySelectorAll("[data-voice-id]")).toHaveLength(11);
    expect(new Set([...container.querySelectorAll<HTMLElement>("[data-voice-id]")]
      .map((row) => row.dataset.voiceColor)).size).toBe(11);
    expect(container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);
    expect(container.textContent).toContain("SMF 0");
    expect(container.textContent).toContain("Drums");

    await unmount();
  });

  it("shows Role v2 confidence buckets and privacy-safe evidence without percentages", async () => {
    const base = fixtureSession();
    const voice = base.voices.find((entry) => !entry.isDrum)!;
    const session = {
      ...base,
      voices: base.voices.map((entry) => entry.id === voice.id
        ? {
            ...entry,
            autoRoleConfidence: 0.9,
            autoRoleConfidenceBucket: "low" as const,
            autoRoleEvidenceKinds: ["high-pitch-center", "stepwise-motion"],
          }
        : entry),
    };
    const { container, unmount } = await renderWorkspace(session, { language: "en" });

    expect(container.textContent).toContain("Confidence: Low");
    expect(container.textContent).toContain("High register");
    expect(container.textContent).toContain("Stepwise motion");
    expect(container.textContent).toContain("Review");
    expect(container.textContent).not.toContain("90%");

    await unmount();
  });
  it("exposes an accessible, localized opt-in Harmonic Core contribution preset", async () => {
    const { container, unmount } = await renderStatefulWorkspace(fixtureSession());
    const standard = container.querySelector<HTMLButtonElement>(
      "[data-analysis-contribution-preset='standard']",
    )!;
    const harmonicCore = container.querySelector<HTMLButtonElement>(
      "[data-analysis-contribution-preset='harmonic-core']",
    )!;

    expect(standard.getAttribute("aria-checked")).toBe("true");
    expect(harmonicCore.getAttribute("aria-checked")).toBe("false");
    expect(harmonicCore.closest("[role='radiogroup']")
      ?.getAttribute("aria-describedby")).toBe("pre-analysis-harmonic-core-description");
    expect(container.querySelector("#pre-analysis-harmonic-core-description")?.textContent)
      .toBe("テンションを取りこぼす代わりに、メロディ由来の誤検出を減らします");

    document.body.append(container);
    standard.focus();
    expect(document.activeElement).toBe(standard);
    expect(standard.tabIndex).toBe(0);
    expect(harmonicCore.tabIndex).toBe(-1);

    await act(async () => {
      standard.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(harmonicCore);
    expect(harmonicCore.getAttribute("aria-checked")).toBe("true");
    expect(harmonicCore.tabIndex).toBe(0);
    expect(standard.tabIndex).toBe(-1);

    await act(async () => {
      harmonicCore.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(standard);
    expect(standard.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      standard.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(harmonicCore);
    expect(harmonicCore.getAttribute("aria-checked")).toBe("true");

    await unmount();
    container.remove();
  });

  it("keeps a simple one-Voice MIDI compact without adding a required step", async () => {
    const session = createAnalysisSession([{
      sourceId: "simple",
      displayName: "piano.mid",
      bytes: midi([0]),
    }]).session!;
    const { container, unmount } = await renderWorkspace(session);
    const workspace = container.querySelector("[data-testid='pre-analysis-workspace']");

    expect(workspace?.getAttribute("data-pre-analysis-mode")).toBe("compact");
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.textContent).toContain("解析対象:");
    expect(container.querySelectorAll("[data-testid='pre-analysis-analyze']"))
      .toHaveLength(1);

    const details = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("パート詳細"));
    await act(async () => details?.click());
    expect(workspace?.getAttribute("data-pre-analysis-mode")).toBe("expanded");
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

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

    const reset = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("自動推定に戻す"));
    await act(async () => reset?.click());
    expect(lastSession(onSessionChange).preset).toBe("auto");

    await unmount();
  });

  it("keeps Channel 10 protected while enabling duplicate review in Custom", async () => {
    const base = fixtureSession();
    const target = base.voices.find((voice) =>
      !voice.isDrum && !voice.duplicateOf)!;
    const drum = base.voices.find((voice) => voice.isDrum)!;
    const duplicate = base.voices.find((voice) => voice.duplicateOf)!;
    const session: AnalysisSession = {
      ...base,
      preset: "auto",
      voices: base.voices.map((voice) => voice.id === target.id
        ? {
            ...voice,
            autoRole: "exclude",
            assignedRole: "exclude",
            included: false,
          }
        : (voice.isDrum
          ? { ...voice, assignedRole: "harmony" as const, included: true }
          : voice)),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const controlsFor = (voiceId: string) => {
      const row = [...container.querySelectorAll<HTMLElement>("[data-voice-id]")]
        .find((candidate) => candidate.dataset.voiceId === voiceId)!;
      return {
        checkbox: row.querySelector<HTMLInputElement>('input[type="checkbox"]')!,
        role: row.querySelector<HTMLSelectElement>("select")!,
      };
    };

    expect(controlsFor(drum.id).checkbox.checked).toBe(false);
    expect(controlsFor(drum.id).checkbox.disabled).toBe(true);
    expect(controlsFor(drum.id).role.disabled).toBe(true);
    expect(controlsFor(drum.id).role.value).toBe("exclude");
    expect(controlsFor(duplicate.id).checkbox.checked).toBe(false);
    expect(controlsFor(duplicate.id).checkbox.disabled).toBe(true);
    expect(controlsFor(duplicate.id).role.disabled).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-analysis-preset="custom"]',
      )?.click();
    });

    expect(controlsFor(drum.id).checkbox.disabled).toBe(true);
    expect(controlsFor(drum.id).role.disabled).toBe(true);
    expect(controlsFor(drum.id).role.value).toBe("exclude");
    expect(controlsFor(duplicate.id).checkbox.disabled).toBe(false);
    expect(controlsFor(duplicate.id).role.disabled).toBe(false);

    await act(async () => {
      controlsFor(target.id).checkbox.click();
      controlsFor(duplicate.id).checkbox.click();
    });

    expect(controlsFor(target.id).checkbox.checked).toBe(true);
    expect(controlsFor(target.id).role.value).toBe("harmony");
    expect(controlsFor(drum.id).checkbox.checked).toBe(false);
    expect(controlsFor(drum.id).role.value).toBe("exclude");
    expect(controlsFor(duplicate.id).checkbox.checked).toBe(true);
    expect(controlsFor(duplicate.id).role.value).not.toBe("exclude");
    expect(container.querySelector<HTMLElement>(
      '[data-analysis-preset="custom"]',
    )?.getAttribute("aria-checked")).toBe("true");

    await unmount();
  });

  it("keeps the Piano Roll synchronized with the selected analysis preset", async () => {
    const base = createAnalysisSession([{
      sourceId: "preset-visual",
      displayName: "preset-visual.mid",
      bytes: midi([0, 1, 2, 9]),
    }]).session!;
    const roles = ["harmony", "bass", "melody-weak", "exclude"] as const;
    const session: AnalysisSession = {
      ...base,
      preset: "auto",
      voices: base.voices.map((voice, index) => ({
        ...voice,
        autoRole: roles[index],
        assignedRole: roles[index],
        included: index < 3,
      })),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const canvas = container.querySelector<HTMLCanvasElement>(
      "[data-testid='pre-analysis-piano-roll']",
    )!;

    expect(canvas.dataset.displayScope).toBe("analysis-targets");
    expect(canvas.dataset.visibleNoteCount).toBe("3");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        "[data-analysis-preset='accompaniment-only']",
      )?.click();
    });
    expect(canvas.dataset.visibleNoteCount).toBe("1");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        "[data-piano-roll-scope='all-voices']",
      )?.click();
    });
    expect(canvas.dataset.displayScope).toBe("all-voices");
    expect(canvas.dataset.visibleNoteCount).toBe("4");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        "[data-analysis-preset='harmony-bass']",
      )?.click();
      container.querySelector<HTMLButtonElement>(
        "[data-piano-roll-scope='analysis-targets']",
      )?.click();
    });
    expect(canvas.dataset.displayScope).toBe("analysis-targets");
    expect(canvas.dataset.visibleNoteCount).toBe("2");

    await unmount();
  });

  it("moves the same Piano Roll viewport from the timeline scrollbar", async () => {
    const base = fixtureSession();
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((source) => ({
        ...source,
        durationBeats: 64,
      })),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const zoom = container.querySelector<HTMLInputElement>(
      "#pre-analysis-zoom",
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
        ?.set?.call(zoom, "4");
      zoom.dispatchEvent(new Event("input", { bubbles: true }));
      zoom.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const scrollbar = container.querySelector<HTMLDivElement>(
      "[data-testid='pre-analysis-time-scrollbar']",
    )!;
    expect(scrollbar.className).toContain("cursor-pointer");
    await act(async () => {
      scrollbar.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
      }));
    });

    expect(scrollbar.getAttribute("aria-valuenow")).toBe("64");
    expect(container.querySelector<HTMLCanvasElement>(
      "[data-testid='pre-analysis-piano-roll']",
    )?.dataset.viewportStartBeat).toBe("48");

    const canvas = container.querySelector<HTMLCanvasElement>(
      "[data-testid='pre-analysis-piano-roll']",
    )!;
    expect(canvas.className).toContain("cursor-pointer");
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 290,
      left: 0,
      width: 1000,
      height: 290,
      toJSON: () => ({}),
    });
    await act(async () => {
      canvas.dispatchEvent(pointerEvent("pointerdown", 519));
      canvas.dispatchEvent(pointerEvent("pointerup", 519));
    });
    expect(Number(canvas.dataset.playheadBeat)).toBeGreaterThan(48);
    expect(Number(canvas.dataset.playheadBeat)).toBeLessThan(64);

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
    expect(changed.preset).toBe("auto");

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
    const addMidiButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-add-midi']",
    )!;
    const analyzeButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-analyze']",
    )!;
    expect(addMidiButton.parentElement).toBe(analyzeButton.parentElement);
    expect(addMidiButton.compareDocumentPosition(analyzeButton)
      & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(container.querySelector(
      "[data-testid='pre-analysis-primary-actions']",
    )?.textContent).toContain("4 Voice中 2 Voiceを解析します");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("MIDIを追加"))?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("この構成で解析"))?.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.getAttribute("aria-label")
          ?.startsWith("MIDIを削除:"))?.click();
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

  it("explains why Analyze is disabled when no Voice is selected", async () => {
    const session = fixtureSession();
    const { container, unmount } = await renderWorkspace({
      ...session,
      preset: "custom",
      voices: session.voices.map((voice) => ({
        ...voice,
        included: false,
        assignedRole: "exclude",
      })),
    });
    const analyze = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-analyze']",
    )!;
    expect(analyze.disabled).toBe(true);
    expect(analyze.getAttribute("aria-describedby"))
      .toBe("pre-analysis-disabled-reason");
    expect(container.querySelector("#pre-analysis-disabled-reason")?.textContent)
      .toContain("1つ以上選んでください");
    await unmount();
  });

  it("uses one Play / Stop toggle while keeping Voice audition controls independent", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const { container, unmount } = await renderWorkspace(session, {
      onSessionChange,
      onPlay,
      onStop,
    });

    const playbackToggle = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-playback-toggle']",
    )!;
    expect(playbackToggle.textContent).toContain("再生");
    expect(playbackToggle.className).toContain("bg-[var(--lv-accent)]");
    await act(async () => playbackToggle.click());
    expect(playbackToggle.textContent).toContain("停止");
    expect(playbackToggle.className).toContain("border-rose-300/70");
    await act(async () => playbackToggle.click());
    expect(playbackToggle.textContent).toContain("再生");
    await act(async () => {
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

async function renderStatefulWorkspace(initialSession: AnalysisSession) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 1000 });
  const root = createRoot(container);

  function Harness() {
    const [session, setSession] = useState(initialSession);
    return (
      <PreAnalysisWorkspace
        session={session}
        language="ja"
        onSessionChange={setSession}
        onAddMidi={vi.fn()}
        onRemoveSource={vi.fn()}
        onAnalyze={vi.fn()}
      />
    );
  }

  await act(async () => root.render(<Harness />));
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
      noteNumber: channel === 9 ? 36 : 48 + (index % 4) * 7,
      velocity: 100,
    });
    events.push({
      deltaTime: 480,
      type: "noteOff",
      channel,
      noteNumber: channel === 9 ? 36 : 48 + (index % 4) * 7,
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

function pointerEvent(type: string, clientX: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: 1 },
  });
  return event;
}
