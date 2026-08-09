// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playback = vi.hoisted(() => ({
  sessions: [] as { events: { layer: string }[]; stopped: number; disposed: number; complete: () => void }[],
  driversDisposed: 0,
  prepareFails: false,
  driverOptions: [] as unknown[],
}));
const recordCompare = vi.hoisted(() => ({
  props: undefined as undefined | {
    readonly resetKey?: string;
    readonly onRecordingPrepare?: () => boolean | void | Promise<boolean | void>;
    readonly onRecordingStart?: () => boolean | void | Promise<boolean | void>;
    readonly onTakeKept?: (retainedTakeReference: string) => void;
    readonly onUnkeptTakeChange?: (hasUnkeptTake: boolean) => void;
    readonly onRecordingActivityChange?: (active: boolean) => void;
  },
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

vi.mock("../recording/ui/RecordCompareSection", () => ({
  RecordCompareSection: (props: NonNullable<typeof recordCompare.props>) => {
    recordCompare.props = props;
    return <div data-testid="record-compare-probe" />;
  },
}));

vi.mock("../application/chordContextToneDriver", () => ({
  createChordContextToneDriver: vi.fn((options?: unknown) => {
    playback.driverOptions.push(options);
    return ({
    prepare: vi.fn(async () => { if (playback.prepareFails) throw new Error("prepare failed"); }),
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
    });
  }),
}));

import { makeChordSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import { buildGeneratedChordContextSnapshot, buildVaultChordContextSnapshot, type ChordContextSnapshot } from "../domain";
import { BasslinePracticeView } from "./BasslinePracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

beforeEach(() => {
  playback.sessions = [];
  playback.driversDisposed = 0;
  playback.prepareFails = false;
  playback.driverOptions = [];
  preview.stopped = 0;
  preview.started = 0;
  preview.delayStart = false;
  preview.pendingStart = undefined;
  recordCompare.props = undefined;
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
    expect(container.querySelector("[aria-label='Bassline Echo progress']")?.textContent).toContain("SetupListenPlayReview");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("Setup");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-timbre']")?.value).toBe("electric");
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

  it("uses a confirmation transaction when switching to a saved Vault progression", async () => {
    const block = {
      id: "selector-progression",
      summaryText: "Private title must not enter Practice",
      detectedKey: "D major",
      bpm: 112,
      timeSignature: "4/4",
      chords: [
        { bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(2, "maj7"), confidence: 1, alternatives: [], warnings: [] },
      ],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "fixture",
    } as SavedProgressionBlock;
    const result = buildVaultChordContextSnapshot({
      sourceReference: { ideaId: "selector-idea", blockId: block.id },
      block,
    });
    if (!result.ok) throw new Error(result.error.message);
    const container = await renderView({ language: "ja", chordContextSnapshots: [result.snapshot] });
    const openPicker = container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']")!;

    expect(openPicker.textContent).toContain("Vaultから選ぶ");
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toContain("Dm7G7Cmaj7");

    await clickStart(container);
    await act(async () => {
      openPicker.click();
      await Promise.resolve();
    });
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Vaultからコード進行を選ぶ");
    expect(document.querySelector("[data-testid='vault-progression-picker-preview']")?.textContent).toContain("Dmaj7");
    expect(document.body.textContent).not.toContain("Private title must not enter Practice");
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toContain("Dm7G7Cmaj7");
    expect(playback.sessions[0]!.stopped).toBe(0);

    await act(async () => {
      findButton(document.body, "キャンセル")?.click();
      await Promise.resolve();
    });
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toContain("Dm7G7Cmaj7");
    expect(playback.sessions[0]!.stopped).toBe(0);

    await act(async () => {
      openPicker.click();
      await Promise.resolve();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-confirm']")?.click();
      await Promise.resolve();
    });

    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
    expect(playback.sessions[0]!.disposed).toBeGreaterThan(0);
    expect(playback.driversDisposed).toBe(1);
    expect(container.querySelector("[data-testid='bassline-source']")?.textContent).toContain("Vault進行 · D major · bars 1-1");
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toBe("Dmaj7");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("112");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='bassline-progression-use-default']")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toContain("Dm7G7Cmaj7");
  });

  it("offers Electric and Piano chord timbres and prepares the selected session sound", async () => {
    const container = await renderView({ language: "ja" });
    const timbre = container.querySelector<HTMLSelectElement>("[data-testid='chord-context-timbre']")!;
    expect(Array.from(timbre.options).map((option) => option.textContent)).toEqual(["エレクトリック", "ピアノ"]);

    await act(async () => {
      timbre.value = "piano";
      timbre.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await clickStart(container);

    expect(playback.driverOptions[playback.driverOptions.length - 1]).toEqual({ chordTimbre: "piano" });
    expect(container.querySelector("[aria-label='Bassline Echoの進行']")?.textContent).toContain("設定聴く演奏レビュー");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("聴く");
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

  it("releases every driver across 20 replay, layer-switch, and play-stop cycles", async () => {
    const container = await renderView();
    for (let index = 0; index < 20; index += 1) {
      await clickStart(container);
      await act(async () => {
        container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")?.click();
        await Promise.resolve();
      });
      await chooseRadio(container, "chord-context-practice-mode", index % 2 === 0 ? "Play" : "Listen");
    }

    expect(playback.sessions).toHaveLength(20);
    expect(playback.sessions.every((session) => session.stopped > 0 && session.disposed > 0)).toBe(true);
    expect(playback.driversDisposed).toBe(20);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Chord Context stopped");
  });
  it("fails closed and releases the prepared driver when an unsupported chord reaches playback", async () => {
    const built = buildGeneratedChordContextSnapshot({
      key: "C major",
      bpm: 96,
      chords: [{ id: "generated:unsupported", root: 0, quality: "maj7", tensions: [], label: "Cmaj7", startBeat: 0, durationBeats: 4 }],
    });
    if (!built.ok) throw new Error(built.error.message);
    const unsupported = {
      ...built.snapshot,
      section: {
        ...built.snapshot.section,
        chords: built.snapshot.section.chords.map((chord) => ({ ...chord, quality: "made-up" })),
      },
      signature: "tampered-for-fail-closed-test",
    } as unknown as ChordContextSnapshot;
    const container = await renderView({ chordContextSnapshot: unsupported });

    await clickStart(container);

    expect(container.querySelector("[role='alert']")?.textContent).toContain("cannot voice this chord safely");
    expect(playback.sessions).toHaveLength(0);
    expect(playback.driversDisposed).toBe(1);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Chord Context stopped");
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

  it("keeps tempo session-only and saves factual Chord Context History", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });

    const tempo = container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")!;
    expect(tempo.value).toBe("96");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='chord-context-bpm-plus-four']")?.click();
      await Promise.resolve();
    });
    expect(tempo.value).toBe("100");
    await act(async () => {
      setNumberInputValue(tempo, "999");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(tempo.value).toBe("240");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='chord-context-bpm-plus-four']")?.disabled).toBe(true);
    await act(async () => {
      setNumberInputValue(tempo, "0");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(tempo.value).toBe("30");
    await act(async () => {
      setNumberInputValue(tempo, "100");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(tempo.value).toBe("100");
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("Vault is not changed");

    await act(async () => findButton(container, "Review")?.click());
    expect(checkedLabel(container, "record-accompaniment")).toContain("Chords only");
    await chooseRadio(container, "record-accompaniment", "Chords + Metronome");
    expect(checkedLabel(container, "record-accompaniment")).toContain("Chords + Metronome");
    expect(container.querySelector("[data-testid='record-accompaniment']")?.textContent)
      .toContain("never internally mixed");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='chord-context-save-history']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    const entry = onChordContextHistoryRecorded.mock.calls[0]![0];
    expect(entry).toMatchObject({
      source: { kind: "generated", safeLabel: "Generated progression" },
      originalBpm: 96,
      effectiveBpm: 100,
      listenMode: "bass-and-chords",
      playMode: "chords-only",
      metronomeUsed: false,
      recordCompareUsed: false,
    });
    expect(entry).not.toHaveProperty("retainedTakeReference");
    expect(JSON.stringify(entry)).not.toMatch(/rawMidi|sourcePath|targetEvents|score/i);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='chord-context-save-history']")?.click();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='chord-context-save-history']")?.textContent)
      .toContain("Saved to History");
  });

  it("records metronome use only after successful scheduled playback", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    await chooseRadio(container, "chord-context-practice-mode", "Play");
    await chooseRadio(container, "chord-context-play-mode", "Chords + Metronome");
    await clickStart(container);
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toContain("metronome");
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=chord-context-save-history]")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({ metronomeUsed: true });
  });

  it("does not record metronome use when preparation fails", async () => {
    playback.prepareFails = true;
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    await chooseRadio(container, "chord-context-practice-mode", "Play");
    await chooseRadio(container, "chord-context-play-mode", "Chords + Metronome");
    await clickStart(container);
    expect(playback.sessions).toHaveLength(0);
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=chord-context-save-history]")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({ metronomeUsed: false });
  });

  it("requires Keep before factual History can retain a take and clears it after BPM or recording-mode changes", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    await act(async () => findButton(container, "Review")?.click());
    expect(recordCompare.props).toBeDefined();
    const firstResetKey = recordCompare.props?.resetKey;
    const save = container.querySelector<HTMLButtonElement>("[data-testid=chord-context-save-history]")!;
    const tempo = container.querySelector<HTMLInputElement>("[data-testid=chord-context-effective-bpm]")!;
    await act(async () => { recordCompare.props?.onRecordingActivityChange?.(true); });
    expect(tempo.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    await act(async () => { recordCompare.props?.onRecordingActivityChange?.(false); });

    await act(async () => {
      const prepared = await recordCompare.props?.onRecordingPrepare?.();
      expect(prepared).toBe(true);
      await recordCompare.props?.onRecordingStart?.();
      recordCompare.props?.onUnkeptTakeChange?.(true);
    });
    expect(save.disabled).toBe(true);
    expect(container.textContent).toContain("Keep or discard the recorded take");

    await act(async () => {
      recordCompare.props?.onTakeKept?.("take-opaque-id");
      recordCompare.props?.onUnkeptTakeChange?.(false);
    });
    expect(save.disabled).toBe(false);
    await act(async () => { save.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({
      recordCompareUsed: true,
      retainedTakeReference: "take-opaque-id",
    });
    await act(async () => { save.click(); await Promise.resolve(); });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);

    await act(async () => {
      setNumberInputValue(tempo, "104");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(recordCompare.props?.resetKey).not.toBe(firstResetKey);
    await act(async () => { save.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(2);
    expect(onChordContextHistoryRecorded.mock.calls[1]![0]).toMatchObject({ recordCompareUsed: false });
    expect(onChordContextHistoryRecorded.mock.calls[1]![0]).not.toHaveProperty("retainedTakeReference");

    const bpmResetKey = recordCompare.props?.resetKey;
    await chooseRadio(container, "record-accompaniment", "Chords + Metronome");
    expect(recordCompare.props?.resetKey).not.toBe(bpmResetKey);
    await act(async () => { save.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(3);
    expect(onChordContextHistoryRecorded.mock.calls[2]![0]).toMatchObject({ recordCompareUsed: false });
    expect(onChordContextHistoryRecorded.mock.calls[2]![0]).not.toHaveProperty("retainedTakeReference");
  });

  it("keeps the P5.16 Bassline surface when the Chord Context rollback is explicit", async () => {
    const container = await renderView({ chordContextEnabled: false });

    expect(container.querySelector("[data-testid='chord-context-controls']")).toBeNull();
    expect(container.querySelector("[data-testid='vault-progression-picker-open']")).toBeNull();
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

function setNumberInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing HTMLInputElement value setter.");
  setter.call(input, value);
}

function checkedLabel(container: HTMLElement, name: string): string | undefined {
  const input = container.querySelector<HTMLInputElement>(`input[name='${name}']:checked`);
  return input?.parentElement?.textContent;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(text));
}
