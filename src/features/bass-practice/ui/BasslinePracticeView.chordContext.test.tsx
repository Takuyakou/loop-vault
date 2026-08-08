// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playback = vi.hoisted(() => ({
  sessions: [] as { events: { layer: string }[]; stopped: number; disposed: number; complete: () => void }[],
  driversDisposed: 0,
}));
const preview = vi.hoisted(() => ({
  stopped: 0,
  started: 0,
  delayStart: false,
  pendingStart: undefined as (() => void) | undefined,
}));

vi.mock("../../../audio/chordPreview", () => ({
  stopPreview: vi.fn(() => { preview.stopped += 1; }),
  previewMidiNotes: vi.fn((
    _notes: unknown,
    _tempo: unknown,
    _timbre: unknown,
    callbacks?: { onStarted?(): void; onEnded?(): void },
  ) => {
    const start = () => { preview.started += 1; callbacks?.onStarted?.(); };
    if (preview.delayStart) preview.pendingStart = start; else start();
    return Promise.resolve();
  }),
}));

vi.mock("../application/chordContextToneDriver", () => ({
  createChordContextToneDriver: vi.fn(() => ({
    prepare: vi.fn(async () => undefined),
    createPlayer: vi.fn((_mix: unknown, lifecycle: { onCompleted(): void }) => {
      const session = {
        events: [] as { layer: string }[],
        stopped: 0,
        disposed: 0,
        complete: () => lifecycle.onCompleted(),
      };
      playback.sessions.push(session);
      return {
        schedule: (event: { layer: string }) => session.events.push(event),
        stop: () => { session.stopped += 1; },
        dispose: () => { session.disposed += 1; },
      };
    }),
    dispose: () => { playback.driversDisposed += 1; },
  })),
}));

import { BasslinePracticeView } from "./BasslinePracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

beforeEach(() => {
  playback.sessions = [];
  playback.driversDisposed = 0;
  preview.stopped = 0;
  preview.started = 0;
  preview.delayStart = false;
  preview.pendingStart = undefined;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Bassline Echo Chord Context", () => {
  it("ships accessible Listen and Play controls with the locked defaults and clean labels", async () => {
    const container = await renderView();

    expect(container.querySelector("[data-testid='chord-context-controls']")).not.toBeNull();
    expect(checkedLabel(container, "chord-context-practice-mode")).toContain("Listen");
    expect(checkedLabel(container, "chord-context-listen-mode")).toContain("Bass + Chords");
    expect(container.textContent).toContain("Bass only");
    expect(container.textContent).toContain("Bass + Chords + Metronome");
    expect(container.textContent).toContain("1 - Roots");
    for (let index = 0; index < 4; index += 1) await act(async () => findButton(container, "Hint")?.click());
    expect(container.textContent).toContain("Answer notes");

    await chooseRadio(container, "chord-context-practice-mode", "Play");
    expect(checkedLabel(container, "chord-context-play-mode")).toContain("Chords only");
    expect(container.textContent).toContain("Metronome only");
    expect(container.textContent).toContain("No accompaniment");
  });

  it("uses bass only in Listen, replaces playback on a layer switch, and cleans up on unmount", async () => {
    const container = await renderView();
    await clickStart(container);

    expect(playback.sessions).toHaveLength(1);
    expect(playback.sessions[0]!.events.map((event) => event.layer)).toContain("bass");
    expect(playback.sessions[0]!.events.map((event) => event.layer)).toContain("chords");
    expect(playback.sessions[0]!.events.map((event) => event.layer)).not.toContain("metronome");

    await chooseRadio(container, "chord-context-practice-mode", "Play");
    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
    await clickStart(container);

    expect(playback.sessions).toHaveLength(2);
    expect(playback.sessions[1]!.events.map((event) => event.layer)).toEqual(["chords", "chords", "chords"]);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Play playback running");

    await act(async () => root?.unmount());
    root = undefined;
    expect(playback.sessions[1]!.stopped).toBeGreaterThan(0);
    expect(playback.driversDisposed).toBeGreaterThan(0);
  });

  it("immediately releases the prepared driver for Play with no accompaniment", async () => {
    const container = await renderView();
    await chooseRadio(container, "chord-context-practice-mode", "Play");
    await chooseRadio(container, "chord-context-play-mode", "No accompaniment");
    await clickStart(container);

    expect(playback.sessions).toHaveLength(0);
    expect(playback.driversDisposed).toBe(1);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Chord Context stopped");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")?.textContent).toContain("Start Play");
  });
  it("clears the running UI and disposes the prepared driver after natural completion", async () => {
    const container = await renderView();
    await clickStart(container);
    const session = playback.sessions[0]!;

    await act(async () => session.complete());

    expect(session.stopped).toBeGreaterThan(0);
    expect(session.disposed).toBeGreaterThan(0);
    expect(playback.driversDisposed).toBe(1);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Chord Context stopped");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")?.textContent).toContain("Start Listen");
  });

  it("keeps legacy target preview and Chord Context mutually exclusive, including Review", async () => {
    const container = await renderView();
    const legacy = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    await act(async () => legacy.click());
    expect(preview.started).toBe(1);
    expect(legacy.textContent).toContain("Stop");

    await clickStart(container);
    expect(preview.stopped).toBeGreaterThan(0);
    expect(legacy.textContent).toContain("Listen");
    expect(playback.sessions).toHaveLength(1);

    await act(async () => legacy.click());
    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
    expect(preview.started).toBe(2);

    await act(async () => findButton(container, "Review")?.click());
    expect(preview.stopped).toBeGreaterThan(1);
    expect(legacy.textContent).toContain("Listen");
  });

  it("ignores a delayed legacy preview callback after Chord Context has taken ownership", async () => {
    preview.delayStart = true;
    const container = await renderView();
    const legacy = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    await act(async () => legacy.click());
    expect(preview.pendingStart).toBeTypeOf("function");

    await clickStart(container);
    expect(preview.stopped).toBeGreaterThan(0);
    await act(async () => preview.pendingStart?.());

    expect(legacy.textContent).toContain("Listen");
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Listen playback running");
  });
  it("keeps the P5.16 Bassline surface when the Chord Context rollback is explicit", async () => {
    const container = await renderView({ chordContextEnabled: false });

    expect(container.querySelector("[data-testid='chord-context-controls']")).toBeNull();
    expect(container.querySelector("[data-testid='bassline-listen']")).not.toBeNull();
  });
});

async function renderView(props: Partial<Parameters<typeof BasslinePracticeView>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<BasslinePracticeView {...props} />));
  return container;
}

async function clickStart(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']");
  await act(async () => {
    button?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function chooseRadio(container: HTMLElement, name: string, label: string) {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>(`input[name='${name}']`))
    .find((candidate) => candidate.parentElement?.textContent?.trim() === label);
  await act(async () => {
    input?.click();
    await Promise.resolve();
  });
}

function checkedLabel(container: HTMLElement, name: string): string | undefined {
  const input = container.querySelector<HTMLInputElement>(`input[name='${name}']:checked`);
  return input?.parentElement?.textContent;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(text));
}