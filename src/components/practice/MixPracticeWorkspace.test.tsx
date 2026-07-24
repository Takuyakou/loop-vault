// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../../domain/chords";
import {
  createMixSessionState,
  preflightMixSession,
  type MixProgressionCandidate,
  type MixSessionConfig,
  type MixSessionState,
} from "../../domain/practiceMix";
import type { SavedProgressionBlock } from "../../domain/types";
import { createLiveNoteState } from "../../domain/liveMidi";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import type { LiveMidiConnectionStatus } from "../../liveMidi/types";
import type { PracticeClockStartOptions } from "../../practice/PracticeClock";
import { MixPracticeWorkspace } from "./MixPracticeWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const config: MixSessionConfig = {
  references: [
    { ideaId: "idea-a", blockId: "block-a" },
    { ideaId: "idea-b", blockId: "block-b" },
  ],
  level: 2,
  mode: "flow",
  leniency: "normal",
  targetSource: { type: "resolved-voicing" },
  allowUnsupportedFallback: false,
  cycles: 1,
  bpm: 72,
};

beforeEach(() => {
  defaultLiveMidiStore.setState({
    active: true,
    status: "connected",
    selected: { backendId: "test", name: "Test Keys", index: 0 },
    notes: createLiveNoteState(),
    error: undefined,
  });
  vi.spyOn(globalThis, "confirm").mockReturnValue(true);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("MixPracticeWorkspace Flow lifecycle", () => {
  it.each(["resolve", "reject"] as const)(
    "cancels a pending start, restarts from a new generation, and ignores stale %s",
    async (settlement) => {
      const deferred = createDeferred();
      const starts: PracticeClockStartOptions[] = [];
      const clock = makeClock((options) => {
        starts.push(options);
        return starts.length === 1 ? deferred.promise : Promise.resolve();
      });
      const onError = vi.fn();
      const view = await renderWorkspace({ clock, onError });

      await click(view.container, "Start this progression");
      await click(view.container, "Pause");
      expect(clock.stop).toHaveBeenCalled();
      expect(findButton(view.container, "Resume")).toBeDefined();

      await click(view.container, "Resume");
      expect(starts).toHaveLength(2);
      expect(clock.resume).not.toHaveBeenCalled();
      const stopCount = clock.stop.mock.calls.length;

      if (settlement === "resolve") deferred.resolve();
      else deferred.reject(new Error("stale start"));
      await act(async () => Promise.resolve());

      expect(clock.stop).toHaveBeenCalledTimes(stopCount);
      expect(onError).not.toHaveBeenCalled();
      expect(findButton(view.container, "Pause")).toBeDefined();
      await view.unmount();
    },
  );

  it("retries a failed active start from the beginning without resuming a stopped clock", async () => {
    const starts: PracticeClockStartOptions[] = [];
    const clock = makeClock((options) => {
      starts.push(options);
      return starts.length === 1
        ? Promise.reject(new Error("audio failed"))
        : Promise.resolve();
    });
    const onError = vi.fn();
    const view = await renderWorkspace({ clock, onError });

    await click(view.container, "Start this progression");
    await act(async () => Promise.resolve());
    expect(onError).toHaveBeenCalledWith("Could not start Mix Flow practice.");
    expect(findButton(view.container, "Resume")).toBeDefined();

    await click(view.container, "Resume");
    expect(starts).toHaveLength(2);
    expect(clock.resume).not.toHaveBeenCalled();
    expect(findButton(view.container, "Pause")).toBeDefined();
    await view.unmount();
  });

  it("keeps the active Clock position for a normal pause and resume", async () => {
    const starts: PracticeClockStartOptions[] = [];
    const clock = makeClock(async (options) => {
      starts.push(options);
    });
    const view = await renderWorkspace({ clock });

    await click(view.container, "Start this progression");
    await act(async () => starts[0]?.callbacks.onTargetOpen(1));
    expect(view.container.textContent).toContain("2 / 2");
    await click(view.container, "Pause");
    await click(view.container, "Resume");

    expect(clock.start).toHaveBeenCalledTimes(1);
    expect(clock.pause).toHaveBeenCalledTimes(1);
    expect(clock.resume).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("2 / 2");
    await view.unmount();
  });

  it("pauses an active Clock before opening settings and never auto-resumes", async () => {
    const clock = makeClock(async () => undefined);
    const openSettings = vi.fn();
    const view = await renderWorkspace({ clock, openSettings });
    await click(view.container, "Start this progression");

    await click(view.container, "Settings");
    expect(openSettings).toHaveBeenCalledOnce();
    expect(clock.pause).toHaveBeenCalledOnce();
    expect(findButton(view.container, "Resume")).toBeDefined();
    await view.rerender();
    expect(clock.resume).not.toHaveBeenCalled();

    await click(view.container, "Resume");
    expect(clock.start).toHaveBeenCalledOnce();
    expect(clock.resume).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("cancels a pending Clock before opening settings and requires a fresh start", async () => {
    const deferred = createDeferred();
    const starts: PracticeClockStartOptions[] = [];
    const clock = makeClock((options) => {
      starts.push(options);
      return starts.length === 1 ? deferred.promise : Promise.resolve();
    });
    const openSettings = vi.fn();
    const onError = vi.fn();
    const view = await renderWorkspace({ clock, openSettings, onError });
    await click(view.container, "Start this progression");

    await click(view.container, "Settings");
    expect(openSettings).toHaveBeenCalledOnce();
    expect(clock.stop).toHaveBeenCalled();
    expect(clock.pause).not.toHaveBeenCalled();
    expect(findButton(view.container, "Resume")).toBeDefined();
    deferred.resolve();
    await act(async () => Promise.resolve());
    expect(onError).not.toHaveBeenCalled();
    expect(clock.resume).not.toHaveBeenCalled();

    await click(view.container, "Resume");
    expect(starts).toHaveLength(2);
    expect(clock.resume).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("stops on MIDI disconnect, exposes reconnect/settings, and rebuilds on resume", async () => {
    const starts: PracticeClockStartOptions[] = [];
    const clock = makeClock(async (options) => {
      starts.push(options);
    });
    const reconnectMidi = vi.fn();
    const openSettings = vi.fn();
    const view = await renderWorkspace({ clock, reconnectMidi, openSettings });
    await click(view.container, "Start this progression");

    await view.rerender({ midiStatus: "disconnected", midiError: "Device lost" });
    expect(view.container.textContent).toContain("Disconnected");
    expect(view.container.textContent).toContain("Device lost");
    expect(findButton(view.container, "Resume")?.disabled).toBe(true);
    expect(clock.stop).toHaveBeenCalled();
    await click(view.container, "Reconnect");
    await click(view.container, "Settings");
    expect(reconnectMidi).toHaveBeenCalledOnce();
    expect(openSettings).toHaveBeenCalledOnce();

    await view.rerender({ midiStatus: "connected", midiError: undefined });
    await click(view.container, "Resume");
    expect(starts).toHaveLength(2);
    expect(clock.resume).not.toHaveBeenCalled();
    await view.unmount();
  });

  it.each(["end", "unmount"] as const)(
    "invalidates a pending start on %s without a late error",
    async (operation) => {
      const deferred = createDeferred();
      const clock = makeClock(() => deferred.promise);
      const onError = vi.fn();
      const onExit = vi.fn();
      const view = await renderWorkspace({ clock, onError, onExit });
      await click(view.container, "Start this progression");

      if (operation === "end") await click(view.container, "End");
      else await view.unmount();
      const stopCount = clock.stop.mock.calls.length;
      deferred.reject(new Error("late failure"));
      await act(async () => Promise.resolve());

      expect(clock.stop).toHaveBeenCalledTimes(stopCount);
      expect(onError).not.toHaveBeenCalled();
      if (operation === "end") expect(onExit).toHaveBeenCalledOnce();
      if (operation === "end") await view.unmount();
    },
  );

  it("pauses on Vault drift and only continues after an explicit reload", async () => {
    const originalCandidates = makeCandidates();
    const changedCandidates = structuredClone(originalCandidates);
    changedCandidates[0].block!.chords[0] = {
      ...changedCandidates[0].block!.chords[0],
      chord: makeChordSymbol(2, "maj7"),
    };
    const replacement = makeState(changedCandidates);
    const reloadSession = vi.fn(() => replacement);
    const clock = makeClock(async () => undefined);
    const view = await renderWorkspace({
      candidates: originalCandidates,
      clock,
      reloadSession,
    });

    expect(view.container.textContent).toContain("Target Source: Saved voicing");
    await click(view.container, "Start this progression");
    await view.rerender({ candidates: changedCandidates });

    expect(view.container.querySelector('[data-testid="mix-snapshot-drift"]')).not.toBeNull();
    expect(findButton(view.container, "Resume")).toBeUndefined();
    expect(clock.stop).toHaveBeenCalled();
    await click(view.container, "Reload current data");
    expect(reloadSession).toHaveBeenCalledWith(config);
    expect(view.container.querySelector('[data-testid="mix-snapshot-drift"]')).toBeNull();
    expect(findButton(view.container, "Start this progression")).toBeDefined();
    await view.unmount();
  });

  it("shows drift instead of a stale summary and removes both retry actions", async () => {
    const starts: PracticeClockStartOptions[] = [];
    const clock = makeClock(async (options) => {
      starts.push(options);
    });
    const originalCandidates = makeCandidates();
    const changedCandidates = structuredClone(originalCandidates);
    changedCandidates[0].block!.chords[0] = {
      ...changedCandidates[0].block!.chords[0],
      chord: makeChordSymbol(2, "maj7"),
    };
    const view = await renderWorkspace({
      candidates: originalCandidates,
      clock,
    });

    await click(view.container, "Start this progression");
    await act(async () => starts[0]?.callbacks.onRoundCompleted());
    await click(view.container, "Start this progression");
    await act(async () => starts[1]?.callbacks.onRoundCompleted());
    expect(view.container.querySelector('[data-testid="mix-summary"]')).not.toBeNull();

    await view.rerender({ candidates: changedCandidates });
    expect(view.container.querySelector('[data-testid="mix-summary"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="mix-snapshot-drift"]')).not.toBeNull();
    expect(findButton(
      view.container,
      "Retry only progressions that were not clean",
    )).toBeUndefined();
    expect(findButton(view.container, "Repeat the same selection")).toBeUndefined();
    expect(findButton(view.container, "Reload current data")).toBeDefined();
    expect(findButton(view.container, "End")).toBeDefined();
    await view.unmount();
  });
});

function makeCandidates(): MixProgressionCandidate[] {
  return config.references.map((reference, index) => ({
    reference,
    title: `Progression ${index + 1}`,
    block: makeBlock(reference.blockId),
    effectiveKeySignature: "C major",
  }));
}

function makeBlock(id: string): SavedProgressionBlock {
  return {
    id,
    summaryText: id,
    chords: [
      makeChordSymbol(0, "maj7"),
      makeChordSymbol(5, "maj7"),
    ].map((chord, index) => ({
      eventId: `${id}-${index}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    detectedKey: "C major",
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-24T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

function makeState(candidates = makeCandidates()): MixSessionState {
  const result = preflightMixSession({ config, candidates });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return createMixSessionState(config, result.snapshots, 123);
}

function makeClock(
  start: (options: PracticeClockStartOptions) => Promise<void>,
) {
  return {
    start: vi.fn(start),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
}

async function renderWorkspace(overrides: {
  candidates?: readonly MixProgressionCandidate[];
  clock?: ReturnType<typeof makeClock>;
  midiStatus?: LiveMidiConnectionStatus;
  midiError?: string;
  reconnectMidi?: () => void | Promise<void>;
  openSettings?: () => void;
  reloadSession?: (config: MixSessionConfig) => MixSessionState | undefined;
  onError?: (message: string) => void;
  onExit?: () => void;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const base = {
    candidates: overrides.candidates ?? makeCandidates(),
    clock: overrides.clock ?? makeClock(async () => undefined),
    midiStatus: overrides.midiStatus ?? "connected" as LiveMidiConnectionStatus,
    midiError: overrides.midiError,
    reconnectMidi: overrides.reconnectMidi ?? vi.fn(),
    openSettings: overrides.openSettings ?? vi.fn(),
    reloadSession: overrides.reloadSession ?? (() => makeState()),
    onError: overrides.onError ?? vi.fn(),
    onExit: overrides.onExit ?? vi.fn(),
  };
  const render = async (next: Partial<typeof base> = {}) => {
    Object.assign(base, next);
    await act(async () => root.render(
      <MixPracticeWorkspace
        initialState={makeState()}
        language="en"
        practiceClock={base.clock}
        candidates={base.candidates}
        midiStatus={base.midiStatus}
        midiDeviceName="Test Keys"
        midiError={base.midiError}
        createSeed={() => 456}
        reloadSession={base.reloadSession}
        reconnectMidi={base.reconnectMidi}
        openSettings={base.openSettings}
        onError={base.onError}
        onExit={base.onExit}
      />,
    ));
  };
  await render();
  return {
    container,
    rerender: render,
    unmount: async () => act(async () => root.unmount()),
  };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  await act(async () => findButton(container, label)?.click());
}

function findButton(
  container: HTMLElement,
  label: string,
): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === label);
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}
