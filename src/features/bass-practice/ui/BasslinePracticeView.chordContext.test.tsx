// @vitest-environment jsdom

import { act, StrictMode } from "react";
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
    readonly recordStartDisabledReason?: string;
    readonly targetPlayer?: { play(onEnded: () => void): { stop(): void } };
  },
}));
const preview = vi.hoisted(() => ({
  stopped: 0,
  started: 0,
  delayStart: false,
  pendingStart: undefined as (() => void) | undefined,
  lastNotes: undefined as unknown,
}));

vi.mock("../../../audio/chordPreview", () => ({
  stopPreview: vi.fn(() => { preview.stopped += 1; }),
  previewMidiNotes: vi.fn((
    notes: unknown,
    _tempo: unknown,
    _timbre: unknown,
    callbacks?: { onStarted?(): void; onEnded?(): void },
  ) => {
    preview.lastNotes = notes;
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
import { extractSourceBasslineSnapshot } from "../../../domain/sourceBassline";
import type { SavedProgressionBlock } from "../../../domain/types";
import { buildBasslinePresetSnapshot, buildGeneratedChordContextSnapshot, buildVaultChordContextSnapshot, createSourceBasslineHistoryEntry, type ChordContextSnapshot, type SourceBasslineHistoryEntry } from "../domain";
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
  preview.lastNotes = undefined;
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
    const vaultPickerCandidates = Object.freeze([Object.freeze({
      displayTitle: "Live Vault Title",
      searchableTitle: "live vault title",
      safeSnapshot: result.snapshot,
    })]);
    const container = await renderView({ language: "ja", chordContextSnapshots: [result.snapshot], vaultPickerCandidates });
    const openPicker = container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']")!;

    expect(openPicker.textContent).toContain("Vaultから選ぶ");
    expect(container.querySelector("[aria-label='ベースラインのコード進行']")?.textContent).toContain("Dm7G7Cmaj7");

    await clickStart(container);
    await act(async () => {
      openPicker.click();
      await Promise.resolve();
    });
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Vaultからコード進行を選ぶ");
    expect(document.querySelector("[data-testid='vault-progression-picker-candidate-title']")?.textContent).toBe("Live Vault Title");
    expect(document.querySelector("[data-testid='vault-progression-picker-preview-title']")?.textContent).toBe("Live Vault Title");
    expect(document.querySelector("[data-testid='vault-progression-picker-preview-chords']")?.textContent).toContain("Dmaj7");
    const search = document.querySelector<HTMLInputElement>("[data-testid='vault-progression-picker-search']")!;
    await act(async () => {
      setTextInputValue(search, "LIVE VAULT");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(document.querySelectorAll("[data-testid='vault-progression-picker-candidate']")).toHaveLength(1);
    expect(JSON.stringify(vaultPickerCandidates[0]!.safeSnapshot)).not.toContain("Live Vault Title");
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

  it("integrates preset sources with key changes across Bassline, Chord Context, Record & Compare, and factual History", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;

    expect(sourceSelect.value).toBe("generated");
    expect(sourceSelect.options).toHaveLength(10);
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("Default generated source");

    await chooseSelect(sourceSelect, "pop-four-chords");
    expect(sourceSelect.value).toBe("pop-four-chords");
    expect(container.querySelector("[data-testid='bassline-source-kind']")?.textContent).toContain("Preset source · Pop Four Chords");
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("C major");
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("92 BPM");
    expect(container.querySelector("[aria-label='Bassline progression strip']")?.textContent).toBe("CGAmF");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("92");

    await clickStart(container);
    const presetSession = playback.sessions[playback.sessions.length - 1]!;
    expect(presetSession.events.filter((event) => event.layer === "chords")).toHaveLength(4);

    const keySelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-preset-key-select']")!;
    await chooseSelect(keySelect, "D major");
    expect(presetSession.stopped).toBeGreaterThan(0);
    expect(presetSession.disposed).toBeGreaterThan(0);
    expect(container.querySelector("[aria-label='Bassline progression strip']")?.textContent).toBe("DABmG");
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("D major");

    await act(async () => findButton(container, "Review")?.click());
    const expectedPreset = buildBasslinePresetSnapshot({ presetId: "pop-four-chords", key: "D major" });
    if (!expectedPreset.ok) throw new Error(expectedPreset.error.message);
    expect(recordCompare.props?.resetKey).toContain(expectedPreset.snapshot.signature);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='chord-context-save-history']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({
      source: {
        kind: "preset",
        presetId: "pop-four-chords",
        catalogVersion: "bassline-preset-catalog-v1",
        safeLabel: "Pop Four Chords",
      },
      section: { startBar: 1, endBar: 4, lengthBeats: 16 },
      originalBpm: 92,
      effectiveBpm: 92,
    });

    await chooseSelect(sourceSelect, "generated");
    expect(sourceSelect.value).toBe("generated");
    expect(container.querySelector("[data-testid='bassline-preset-key-select']")).toBeNull();
    expect(container.querySelector("[aria-label='Bassline progression strip']")?.textContent).toBe("Dm7G7Cmaj7");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");
  });
  it("uses the full twelve-bar preset section without clipping in Chord Context", async () => {
    const container = await renderView();
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;

    await chooseSelect(sourceSelect, "twelve-bar-blues");
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("Bars 1-12");
    expect(container.querySelector("[data-testid='bassline-source-summary']")?.textContent).toContain("96 BPM");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");

    await clickStart(container);
    const session = playback.sessions[playback.sessions.length - 1]!;
    expect(session.events.filter((event) => event.layer === "chords")).toHaveLength(12);
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

  it("releases every driver across repeated replay, layer-switch, and play-stop cycles", async () => {
    const container = await renderView();
    const modes = ["Play", "Listen", "Play", "Listen"] as const;
    for (const mode of modes) {
      await clickStart(container);
      await act(async () => {
        container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")?.click();
        await Promise.resolve();
      });
      await chooseRadio(container, "chord-context-practice-mode", mode);
    }

    expect(playback.sessions).toHaveLength(modes.length);
    expect(playback.sessions.every((session) => session.stopped > 0 && session.disposed > 0)).toBe(true);
    expect(playback.driversDisposed).toBe(modes.length);
    expect(container.querySelector("[data-testid='chord-context-status']")?.textContent).toContain("Chord Context stopped");
  });
  it("releases every active session across each generated and preset source switch", async () => {
    const container = await renderView();
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;
    const sources = ["pop-four-chords", "twelve-bar-blues", "minor-descent", "generated"];

    for (const source of sources) {
      await clickStart(container);
      await chooseSelect(sourceSelect, source);
    }

    expect(playback.sessions).toHaveLength(sources.length);
    expect(playback.sessions.every((session) => session.stopped > 0 && session.disposed > 0)).toBe(true);
    expect(playback.driversDisposed).toBe(sources.length);
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

  it("selects the detached source explicitly, navigates exact 1/2-bar windows, and reuses Level 3 in Record & Compare", async () => {
    const fixture = sourceBasslineFixture(true);
    const container = await renderView({
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultPickerCandidates: [fixture],
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
    });
    const source = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(source.value).toBe("generated");
    expect(Array.from(source.options).find((option) => option.value === "source-bassline")?.disabled).toBe(false);
    expect(source.getAttribute("aria-describedby")).toBe("bassline-line-source-description");

    await chooseSelect(source, "source-bassline");
    const sourceSelector = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    expect(sourceSelector.value).toBe("");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("Select a saved Source Bassline");
    const sourceCandidate = Array.from(sourceSelector.options).find((option) => option.value && !option.disabled)!;
    await chooseSelect(sourceSelector, sourceCandidate.value);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    expect(level.disabled).toBe(false);
    expect(level.value).toBe("3");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
    const windowPanel = container.querySelector<HTMLElement>("[data-testid='source-bassline-window']")!;
    expect(windowPanel.className).toContain("min-w-0");
    const previous = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-previous']")!;
    expect(previous.disabled).toBe(false);
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(previous.getAttribute("aria-describedby")).toBe("source-bassline-previous-reason");
    previous.focus();
    await act(async () => previous.click());
    expect(document.activeElement).toBe(previous);
    expect(container.querySelector("[data-testid='source-bassline-projection-facts']")?.textContent).toContain("Cropped notes 3 / monophonic projection 2 / level target 2 / simultaneous notes omitted 1");
    expect(container.textContent).toContain("Transfer is unavailable for Source Bassline");

    const listen = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    await act(async () => listen.click());
    expect(preview.lastNotes).toEqual([
      expect.objectContaining({ pitch: 43, startBeat: 0, durationBeats: 0.5 }),
      expect.objectContaining({ pitch: 45, startBeat: 0.5 }),
    ]);
    const stoppedBeforeMove = preview.stopped;
    const next = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-next']")!;
    next.focus();
    await act(async () => next.click());
    expect(document.activeElement).toBe(next);
    expect(preview.stopped).toBeGreaterThan(stoppedBeforeMove);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 2-2");
    const emptyReason = container.querySelector<HTMLElement>("[data-testid='source-bassline-empty']")!;
    const reviewButton = findButton(container, "Review")!;
    const hintButton = findButton(container, "Hint")!;
    const contextButton = container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")!;
    expect(emptyReason.id).toBe("source-bassline-empty");
    expect(listen.disabled).toBe(true);
    expect(listen.getAttribute("aria-describedby")).toBe("source-bassline-empty");
    expect(reviewButton.disabled).toBe(true);
    expect(reviewButton.getAttribute("aria-describedby")).toBe("source-bassline-empty");
    expect(hintButton.getAttribute("aria-describedby")).toBe("source-bassline-empty");
    expect(contextButton.disabled).toBe(true);
    expect(contextButton.getAttribute("aria-describedby")).toBe("source-bassline-empty");

    next.focus();
    await act(async () => next.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 3-3");
    expect(next.disabled).toBe(false);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);

    const windowLength = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(windowLength, 2)?.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-2");
    const finalNext = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-next']")!;
    finalNext.focus();
    await act(async () => finalNext.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("Bars 3-3 (final partial window)");
    expect(document.activeElement).toBe(finalNext);
    expect(finalNext.getAttribute("aria-disabled")).toBe("true");
    const finalPrevious = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-previous']")!;
    finalPrevious.focus();
    await act(async () => finalPrevious.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-2");
    expect(document.activeElement).toBe(finalPrevious);
    expect(finalPrevious.getAttribute("aria-disabled")).toBe("true");

    await act(async () => windowButton(windowLength, 1)?.click());
    await act(async () => findButton(container, "Review")?.click());
    expect(recordCompare.props?.resetKey).toContain("source-bassline:");
    expect(recordCompare.props?.resetKey).toContain(fixture.sourceCatalogEntry.sourceBassline.snapshotSignature);
    recordCompare.props?.targetPlayer?.play(() => undefined);
    expect(preview.lastNotes).toEqual(expect.arrayContaining([expect.objectContaining({ pitch: 43 })]));
    expect(container.querySelector("[data-testid='chord-context-history-save']")).toBeNull();
  });

  it("keeps Level 3 eligible when the current Chord Context catalog becomes unsupported", async () => {
    const fixture = sourceBasslineFixture(true);
    const shared = {
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
    } as const;
    const container = await renderView({ ...shared, vaultPickerCandidates: [fixture] });
    await chooseSourceBassline(container);

    await act(async () => {
      root?.render(<BasslinePracticeView {...shared} vaultPickerCandidates={[]} />);
      await Promise.resolve();
    });

    const source = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(source.value).toBe("source-bassline");
    expect(Array.from(source.options).find((option) => option.value === "source-bassline")?.disabled).toBe(false);
    expect(container.querySelector<HTMLSelectElement>("#bassline-level")?.value).toBe("3");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
  });

  it("selects a strict source independently after restart and never falls through to another catalog item", async () => {
    const fixture = sourceBasslineFixture(true);
    const other = replacementSourceCatalogEntry({ ideaId: "other-idea", blockId: "other-block" });
    const container = await renderView({
      chordContextSnapshots: [],
      vaultPickerCandidates: [],
      vaultSourceBasslines: [fixture.sourceCatalogEntry, other],
    });
    const sourceMode = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(sourceMode.value).toBe("generated");
    await chooseSelect(sourceMode, "source-bassline");
    const selector = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    expect(selector.value).toBe("");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("Select a saved Source Bassline");
    const fixtureOption = Array.from(selector.options).find((option) => option.textContent?.includes("Synthetic source"))!;
    await chooseSelect(selector, fixtureOption.value);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
    await clickStart(container);
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toEqual(expect.arrayContaining(["bass", "chords"]));

    const reloadedSource = structuredClone(fixture.sourceCatalogEntry);
    const unrelatedContext = replacementChordContextSnapshot({ ideaId: "current-idea", blockId: "current-block" });
    await act(async () => {
      root?.render(<BasslinePracticeView
        chordContextSnapshot={unrelatedContext}
        chordContextSnapshots={[unrelatedContext]}
        vaultPickerCandidates={[]}
        vaultSourceBasslines={[reloadedSource, other]}
      />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");

    await act(async () => {
      root?.render(<BasslinePracticeView vaultPickerCandidates={[]} chordContextSnapshots={[]} vaultSourceBasslines={[other]} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const afterRemoval = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    const expectedMissingKey = `${encodeURIComponent(fixture.sourceCatalogEntry.reference.ideaId)}:${encodeURIComponent(fixture.sourceCatalogEntry.reference.blockId)}`;
    expect(afterRemoval.value).toBe(expectedMissingKey);
    expect(container.textContent).toContain("selected saved Source Bassline is unavailable");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).not.toBe("Bars 1-1");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.disabled).toBe(true);

    const otherOption = Array.from(afterRemoval.options).find((option) => option.textContent?.includes("Synthetic replacement"))!;
    await chooseSelect(afterRemoval, otherOption.value);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
  });
  it("uses the session default tempo for Source mode instead of a non-96 current progression tempo", async () => {
    const fixture = sourceBasslineFixture(true);
    const current = replacementChordContextSnapshot({ ideaId: "current-tempo-idea", blockId: "current-tempo-block" });
    const container = await renderView({
      chordContextSnapshot: current,
      chordContextSnapshots: [current],
      vaultPickerCandidates: [],
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
    });
    const tempo = container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")!;
    const tempoControls = container.querySelector<HTMLElement>("[data-testid='chord-context-tempo']")!;
    expect(current.originalBpm).toBe(104);
    expect(tempo.value).toBe("104");
    expect(tempoControls.textContent).toContain("Original: 104 BPM");
    await chooseSourceBassline(container);
    expect(tempo.value).toBe("96");
    expect(tempoControls.textContent).toContain("Session default: 96 BPM");
    expect(tempoControls.textContent).not.toContain("Original: 104 BPM");
    await act(async () => findButton(container, "+4 BPM")?.click());
    expect(tempo.value).toBe("100");
    await act(async () => findButton(container, "Use session default")?.click());
    expect(tempo.value).toBe("96");
  });
  it("invalidates active review when the external Chord Context snapshot is replaced or deleted", async () => {
    const fixture = sourceBasslineFixture(true);
    const replacement = replacementChordContextSnapshot(fixture.safeSnapshot.source.reference);
    const sourceCatalog = [fixture.sourceCatalogEntry] as const;
    const container = await renderView({
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultPickerCandidates: [fixture],
      vaultSourceBasslines: sourceCatalog,
    });
    await chooseSourceBassline(container);
    await act(async () => findButton(container, "Review")?.click());
    recordCompare.props?.targetPlayer?.play(() => undefined);
    const stoppedBeforeReplacement = preview.stopped;

    await act(async () => {
      root?.render(<BasslinePracticeView
        chordContextSnapshot={replacement}
        chordContextSnapshots={[replacement]}
        vaultPickerCandidates={[{ displayTitle: "Replacement", searchableTitle: "replacement", safeSnapshot: replacement }]}
        vaultSourceBasslines={sourceCatalog}
      />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preview.stopped).toBeGreaterThan(stoppedBeforeReplacement);
    expect(container.querySelector("[data-testid='record-compare-probe']")).toBeNull();
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLOptionElement>("option[value='source-bassline']")?.disabled).toBe(false);

    await act(async () => findButton(container, "Review")?.click());
    const stoppedBeforeDeletion = preview.stopped;
    await act(async () => {
      root?.render(<BasslinePracticeView vaultSourceBasslines={sourceCatalog} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(preview.stopped).toBeGreaterThan(stoppedBeforeDeletion);
    expect(container.querySelector("[data-testid='record-compare-probe']")).toBeNull();
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLOptionElement>("option[value='source-bassline']")?.disabled).toBe(false);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
  });
  it("stops playback and clears review when deletion or global quarantine removes the strict source catalog item", async () => {
    const fixture = sourceBasslineFixture(true);
    const base = {
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultPickerCandidates: [fixture],
    } as const;
    const container = await renderView({ ...base, vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => {
      recordCompare.props?.onRecordingActivityChange?.(true);
      recordCompare.props?.onUnkeptTakeChange?.(true);
      await recordCompare.props?.onRecordingPrepare?.();
      await recordCompare.props?.onRecordingStart?.();
      recordCompare.props?.targetPlayer?.play(() => undefined);
      await Promise.resolve();
    });
    const activePlayback = playback.sessions[playback.sessions.length - 1]!;
    const stoppedBefore = preview.stopped;
    expect(container.querySelector("[data-testid='record-compare-probe']")).not.toBeNull();

    await act(async () => {
      root?.render(<BasslinePracticeView {...base} vaultSourceBasslines={[]} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preview.stopped).toBeGreaterThan(stoppedBefore);
    expect(activePlayback.stopped).toBeGreaterThan(0);
    expect(activePlayback.disposed).toBeGreaterThan(0);
    expect(container.querySelector("[data-testid='record-compare-probe']")).toBeNull();
    const source = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(source.value).toBe("source-bassline");
    expect(source.disabled).toBe(false);
    expect(Array.from(source.options).find((option) => option.value === "source-bassline")?.disabled).toBe(false);
    const savedSource = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    expect(savedSource.disabled).toBe(true);
    expect(savedSource.selectedOptions[0]?.textContent).toContain("Selected source unavailable");
    const listen = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    expect(listen.disabled).toBe(true);
    expect(listen.getAttribute("aria-describedby")).toBe("source-bassline-unavailable");
  });

  it("invalidates review and safely returns to bar 1 when the external source range/signature is replaced", async () => {
    const fixture = sourceBasslineFixture(true);
    const replacement = replacementSourceCatalogEntry(fixture.safeSnapshot.source.reference);
    const base = {
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultPickerCandidates: [fixture],
    } as const;
    const container = await renderView({ ...base, vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const next = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-next']")!;
    await act(async () => next.click());
    await act(async () => next.click());
    await act(async () => findButton(container, "Review")?.click());
    recordCompare.props?.targetPlayer?.play(() => undefined);
    const stoppedBefore = preview.stopped;
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 3-3");
    expect(replacement.sourceBassline.snapshotSignature).not.toBe(fixture.sourceCatalogEntry.sourceBassline.snapshotSignature);

    await act(async () => {
      root?.render(<BasslinePracticeView {...base} vaultSourceBasslines={[replacement]} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preview.stopped).toBeGreaterThan(stoppedBefore);
    expect(container.querySelector("[data-testid='record-compare-probe']")).toBeNull();
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 1-1");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
  });
  it("uses captured harmony directly for Source Chord Context without reconstructing current chords", async () => {
    const fixture = sourceBasslineFixture(true);
    const container = await renderView({ chordContextSnapshot: fixture.safeSnapshot, chordContextSnapshots: [fixture.safeSnapshot], vaultPickerCandidates: [fixture], vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const start = container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")!;
    expect(start.disabled).toBe(false);
    await clickStart(container);
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toEqual(expect.arrayContaining(["bass", "chords"]));
  });

  it("keeps Source Record & Compare available without captured harmony while disabling accompaniment honestly", async () => {
    const fixture = sourceBasslineFixture(false);
    const container = await renderView({ language: "ja", chordContextSnapshot: fixture.safeSnapshot, chordContextSnapshots: [fixture.safeSnapshot], vaultPickerCandidates: [fixture], vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("セッション既定: 96 BPM");
    expect(findButton(container, "セッション既定に戻す")).toBeDefined();
    const contextStart = container.querySelector<HTMLButtonElement>("[data-testid='chord-context-start-stop']")!;
    expect(contextStart.disabled).toBe(true);
    expect(contextStart.getAttribute("aria-describedby")).toBe("source-bassline-context-reason");
    expect(container.textContent).toContain("正確な保存済み和声がないため、Chord Contextは利用できません");
    await act(async () => findButton(container, "レビュー")?.click());
    expect(container.textContent).toContain("録音中の伴奏: なし");
    let prepared: boolean | void | undefined;
    let started: boolean | void | undefined;
    await act(async () => {
      prepared = await recordCompare.props?.onRecordingPrepare?.();
      started = await recordCompare.props?.onRecordingStart?.();
    });
    expect(prepared).toBe(true);
    expect(started).toBe(true);
  });

  it("selects deterministic Level 1/2 targets, discloses replacements, and keeps the source immutable", async () => {
    const fixture = sourceBasslineFixture(true);
    const before = JSON.stringify(fixture.sourceCatalogEntry.sourceBassline);
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    expect(Array.from(level.options).map(({ value, disabled }) => ({ value, disabled }))).toEqual([
      { value: "1", disabled: false },
      { value: "2", disabled: false },
      { value: "3", disabled: false },
    ]);

    await chooseSelect(level, "1");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.click());
    expect(preview.lastNotes).toEqual([
      expect.objectContaining({ pitch: 48, startBeat: 0 }),
      expect.objectContaining({ pitch: 48, startBeat: 0.5 }),
    ]);
    expect(container.querySelector("[data-testid='source-bassline-projection-facts']")?.textContent).toContain("pitches replaced 2");

    await chooseSelect(level, "2");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.click());
    expect(preview.lastNotes).toEqual([
      expect.objectContaining({ pitch: 43, startBeat: 0 }),
      expect.objectContaining({ pitch: 43, startBeat: 0.5 }),
    ]);
    expect(container.querySelector("[data-testid='source-bassline-harmony-comparison']")?.textContent).toContain("Match");
    expect(JSON.stringify(fixture.sourceCatalogEntry.sourceBassline)).toBe(before);
  });

  it("changes Record & Compare identity and target when Source Level changes from 1 to 2", async () => {
    const fixture = sourceBasslineFixture(true);
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;

    await chooseSelect(level, "1");
    await act(async () => findButton(container, "Review")?.click());
    const level1ResetKey = recordCompare.props?.resetKey;
    recordCompare.props?.targetPlayer?.play(() => undefined);
    const level1Target = (preview.lastNotes as readonly { readonly pitch: number }[]).map(({ pitch }) => pitch);

    await chooseSelect(level, "2");
    await act(async () => findButton(container, "Review")?.click());
    const level2ResetKey = recordCompare.props?.resetKey;
    recordCompare.props?.targetPlayer?.play(() => undefined);
    const level2Target = (preview.lastNotes as readonly { readonly pitch: number }[]).map(({ pitch }) => pitch);

    expect(level2ResetKey).not.toBe(level1ResetKey);
    expect(level1Target).toEqual([48, 48]);
    expect(level2Target).toEqual([43, 43]);
    const disclosure = container.querySelector("[data-testid='source-bassline-harmony-comparison']");
    expect(disclosure?.getAttribute("role")).toBe("status");
    expect(disclosure?.getAttribute("aria-live")).toBe("polite");
  });
  it("keeps unavailable simplifications explicit and leaves Level 3 selectable", async () => {
    const fixture = sourceBasslineFixture(false);
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    expect(level.value).toBe("3");
    expect(Array.from(level.options).find(({ value }) => value === "1")?.disabled).toBe(true);
    expect(Array.from(level.options).find(({ value }) => value === "2")?.disabled).toBe(true);
    expect(Array.from(level.options).find(({ value }) => value === "3")?.disabled).toBe(false);
    expect(container.querySelector("#bassline-level-description")?.textContent).toContain("captured harmony");
  });

  it("omits the captured-harmony signature when saving History for a source without harmony", async () => {
    const fixture = sourceBasslineFixture(false);
    const onSourceBasslineHistoryRecorded = vi.fn(async (_entry: SourceBasslineHistoryEntry) => undefined);
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineHistoryRecorded,
    });
    await chooseSourceBassline(container);
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-save-history']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const entry = onSourceBasslineHistoryRecorded.mock.calls[0]?.[0];
    expect(entry?.source).not.toHaveProperty("capturedHarmonySignature");
    expect(entry?.capturedHarmonyComparison).toBe("comparison-unavailable");
  });
  it("saves factual Source History and restarts only an exact reference/signature", async () => {
    const fixture = sourceBasslineFixture(true);
    const onSourceBasslineHistoryRecorded = vi.fn(async (_entry: SourceBasslineHistoryEntry) => undefined);
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineHistoryRecorded,
    });
    await chooseSourceBassline(container);
    await chooseSelect(container.querySelector<HTMLSelectElement>("#bassline-level")!, "2");
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-save-history']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSourceBasslineHistoryRecorded).toHaveBeenCalledTimes(1);
    const entry = onSourceBasslineHistoryRecorded.mock.calls[0]![0];
    expect(entry).toMatchObject({
      source: { kind: "source-bassline", reference: fixture.sourceCatalogEntry.reference, snapshotSignature: fixture.sourceCatalogEntry.sourceBassline.snapshotSignature, capturedHarmonySignature: fixture.sourceCatalogEntry.sourceBassline.capturedHarmony?.signature },
      level: 2,
      monophonicProjection: true,
      capturedHarmonyComparison: "match",
      selfReview: "completed",
      facts: { croppedSourceNoteCount: 3, projectedNoteCount: 2, pitchReplacementCount: 1 },
    });
    expect(JSON.stringify(entry)).not.toMatch(/"(?:notes|capturedHarmony|path|title|fileName|device|audio|voice)"\s*:/i);

    await act(async () => root?.render(<BasslinePracticeView
      vaultSourceBasslines={[fixture.sourceCatalogEntry]}
      sourceBasslineHistory={[entry]}
    />));
    const restart = findButton(container, "Restart these settings")!;
    await act(async () => restart.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLSelectElement>("#bassline-level")?.value).toBe("2");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("Restored");
    await chooseSelect(container.querySelector<HTMLSelectElement>("#bassline-level")!, "1");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")).toBeNull();
  });

  it("keeps missing or changed History readable without selecting a substitute", async () => {
    const fixture = sourceBasslineFixture(true);
    const entry = createSourceBasslineHistoryEntry({
      id: "source-history:missing",
      completedAt: "2026-08-21T12:00:00.000Z",
      reference: fixture.sourceCatalogEntry.reference,
      snapshotSignature: fixture.sourceCatalogEntry.sourceBassline.snapshotSignature,
      capturedHarmonySignature: "f".repeat(64),
      requestedBars: 1,
      startBar: 1,
      endBar: 1,
      actualBars: 1,
      level: 3,
      croppedSourceNoteCount: 3,
      projectedNoteCount: 2,
      omittedSimultaneousNoteCount: 1,
      boundaryClippedNoteCount: 0,
      overlapClippedNoteCount: 1,
      pitchReplacementCount: 0,
      capturedHarmonyComparison: "match",
    });
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry], sourceBasslineHistory: [entry] });
    expect(container.querySelector("[data-testid='source-bassline-history']")?.textContent).toContain("source changed");
    await act(async () => findButton(container, "Restart these settings")?.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("generated");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("No substitute was selected");
    await chooseSourceBassline(container);
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")).toBeNull();
  });

  it("rejects a source-inconsistent saved end/actual range without substituting settings", async () => {
    const fixture = sourceBasslineFixture(true);
    const entry = createSourceBasslineHistoryEntry({
      id: "source-history:range-mismatch",
      completedAt: "2026-08-21T12:00:00.000Z",
      reference: fixture.sourceCatalogEntry.reference,
      snapshotSignature: fixture.sourceCatalogEntry.sourceBassline.snapshotSignature,
      capturedHarmonySignature: fixture.sourceCatalogEntry.sourceBassline.capturedHarmony!.signature,
      requestedBars: 2,
      startBar: 1,
      endBar: 1,
      actualBars: 1,
      level: 3,
      croppedSourceNoteCount: 3,
      projectedNoteCount: 2,
      omittedSimultaneousNoteCount: 1,
      boundaryClippedNoteCount: 0,
      overlapClippedNoteCount: 1,
      pitchReplacementCount: 0,
      capturedHarmonyComparison: "match",
    });
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      sourceBasslineHistory: [entry],
    });

    await act(async () => findButton(container, "Restart these settings")?.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("generated");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("exact saved conditions are unavailable");
  });

  it("drops stale Source History save completion after a Level target change", async () => {
    const fixture = sourceBasslineFixture(true);
    let resolveSave: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { resolveSave = resolve; });
    const onSourceBasslineHistoryRecorded = vi.fn(() => pending);
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineHistoryRecorded,
    });
    await chooseSourceBassline(container);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    await chooseSelect(level, "2");
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-save-history']")?.click());
    expect(container.textContent).toContain("Saving factual History.");

    await chooseSelect(level, "1");
    await act(async () => findButton(container, "Review")?.click());
    expect(container.textContent).toContain("History is not yet saved.");
    await act(async () => {
      resolveSave?.();
      await pending;
      await Promise.resolve();
    });
    expect(container.textContent).toContain("History is not yet saved.");
    expect(container.textContent).not.toContain("Factual session saved to History.");
  });

  it("drops stale Chord Context History rejection after the target changes", async () => {
    let rejectSave: ((reason?: unknown) => void) | undefined;
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const onChordContextHistoryRecorded = vi.fn(() => pending);
    const container = await renderView({ onChordContextHistoryRecorded });
    await act(async () => findButton(container, "Review")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='chord-context-save-history']")?.click());
    expect(container.textContent).toContain("Saving factual History.");

    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='chord-context-bpm-plus-four']")?.click());
    expect(container.textContent).toContain("History is not yet saved.");
    await act(async () => {
      rejectSave?.(new Error("synthetic stale rejection"));
      await pending.catch(() => undefined);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("History is not yet saved.");
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("uses default two and exposes an accessible 1/2/4/8 segmented selector", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    const onSourceBasslineWindowBarsChange = vi.fn(async () => undefined);
    const container = await renderView({
      initialWindowBars: undefined,
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineWindowBarsChange,
    });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Source Bassline window length");
    expect(Array.from(group.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["1", "2", "4", "8"]);
    expect(windowButton(group, 2)?.getAttribute("aria-pressed")).toBe("true");
    const four = windowButton(group, 4)!;
    four.focus();
    await act(async () => four.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.activeElement).toBe(four);
    expect(four.getAttribute("aria-pressed")).toBe("true");
    expect(onSourceBasslineWindowBarsChange).toHaveBeenCalledWith(4);
    const eight = windowButton(group, 8)!;
    eight.focus();
    await act(async () => eight.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(document.activeElement).toBe(eight);
    expect(eight.getAttribute("aria-pressed")).toBe("true");
    expect(onSourceBasslineWindowBarsChange).toHaveBeenCalledWith(8);
  });

  it("rolls back only the current failed preference and ignores stale failure", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    let rejectFour: ((reason?: unknown) => void) | undefined;
    let resolveEight: (() => void) | undefined;
    const fourPending = new Promise<void>((_resolve, reject) => { rejectFour = reject; });
    const eightPending = new Promise<void>((resolve) => { resolveEight = resolve; });
    const save = vi.fn((bars: number) => bars === 4 ? fourPending : eightPending);
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 4)?.click());
    await act(async () => windowButton(group, 8)?.click());
    await act(async () => {
      rejectFour?.(new Error("stale"));
      await fourPending.catch(() => undefined);
    });
    expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).toBeNull();
    await act(async () => { resolveEight?.(); await eightPending; });
    expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the newest valid fallback when the current save fails before stale success completes", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    let resolveFour: (() => void) | undefined;
    let rejectEight: ((reason?: unknown) => void) | undefined;
    const fourPending = new Promise<void>((resolve) => { resolveFour = resolve; });
    const eightPending = new Promise<void>((_resolve, reject) => { rejectEight = reject; });
    const save = vi.fn((bars: number) => bars === 4 ? fourPending : eightPending);
    const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 4)?.click());
    await act(async () => windowButton(group, 8)?.click());
    await act(async () => { rejectEight?.(new Error("current")); await eightPending.catch(() => undefined); });
    expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).toBeNull();
    await act(async () => { resolveFour?.(); await fourPending; });
    expect(windowButton(group, 4)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).not.toBeNull();
  });

  it("rolls back a still-current failed preference with a localized notice", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    const save = vi.fn(async () => { throw new Error("private backend detail"); });
    const container = await renderView({ language: "ja", initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => { windowButton(group, 4)?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(windowButton(group, 2)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")?.textContent).toContain("保存済みの選択へ戻しました");
    expect(container.textContent).not.toContain("private backend detail");
  });

  it("derives exact and over-limit Record eligibility without disabling practice playback", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineHistoryRecorded: vi.fn(async () => undefined),
    });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 8)?.click());
    const bpm = container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")!;
    await act(async () => { setNumberInputValue(bpm, "32"); bpm.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => findButton(container, "Review")?.click());
    expect(recordCompare.props?.recordStartDisabledReason).toBeUndefined();
    await act(async () => { setNumberInputValue(bpm, "31"); bpm.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(recordCompare.props?.recordStartDisabledReason).toContain("exceeds 60 seconds");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-save-history']")?.disabled).toBe(false);
  });

  for (const rejectOrder of ["older-first", "newer-first"] as const) {
    it(`returns to persisted two when rapid 4/8 saves both fail (${rejectOrder})`, async () => {
      const fixture = sourceBasslineFixture(true, 8);
      let rejectFour: ((reason?: unknown) => void) | undefined;
      let rejectEight: ((reason?: unknown) => void) | undefined;
      const fourPending = new Promise<void>((_resolve, reject) => { rejectFour = reject; });
      const eightPending = new Promise<void>((_resolve, reject) => { rejectEight = reject; });
      const save = vi.fn((bars: number) => bars === 4 ? fourPending : eightPending);
      const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
      await chooseSourceBassline(container);
      const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
      await act(async () => windowButton(group, 4)?.click());
      await act(async () => windowButton(group, 8)?.click());
      if (rejectOrder === "older-first") {
        await act(async () => { rejectFour?.(new Error("four")); await fourPending.catch(() => undefined); });
        await act(async () => { rejectEight?.(new Error("eight")); await eightPending.catch(() => undefined); });
      } else {
        await act(async () => { rejectEight?.(new Error("eight")); await eightPending.catch(() => undefined); });
        await act(async () => { rejectFour?.(new Error("four")); await fourPending.catch(() => undefined); });
      }
      expect(windowButton(group, 2)?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).not.toBeNull();
    });
  }

  it("ignores a preference settlement after unmount", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    let rejectSave: ((reason?: unknown) => void) | undefined;
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const container = await renderView({
      initialWindowBars: 2,
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineWindowBarsChange: vi.fn(() => pending),
    });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 4)?.click());
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => {
      rejectSave?.(new Error("late failure"));
      await pending.catch(() => undefined);
    });
    expect(container.childElementCount).toBe(0);
  });

  it("keeps confirmed preference rollback correct under StrictMode effect replay", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    const save = vi.fn((bars: number) => bars === 4 ? Promise.resolve() : Promise.reject(new Error("eight failed")));
    const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save }, true);
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => { windowButton(group, 4)?.click(); await Promise.resolve(); });
    expect(windowButton(group, 4)?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { windowButton(group, 8)?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(windowButton(group, 4)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).not.toBeNull();
  });

  it("turns a synchronous preference callback throw into rollback and a safe notice", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    const save = vi.fn(() => { throw new Error("synchronous private detail"); });
    const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 4)?.click());
    expect(windowButton(group, 2)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).not.toBeNull();
    expect(container.textContent).not.toContain("synchronous private detail");
  });

  for (const outcome of ["success", "failure"] as const) {
    it(`does not let a late preference ${outcome} replace an exact History restart`, async () => {
      const fixture = sourceBasslineFixture(true, 12);
      let resolveSave: (() => void) | undefined;
      let rejectSave: ((reason?: unknown) => void) | undefined;
      const pending = new Promise<void>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
      const entry = createSourceBasslineHistoryEntry({
        id: `source-history:race-${outcome}`, completedAt: "2026-08-21T12:00:00.000Z",
        reference: fixture.sourceCatalogEntry.reference,
        snapshotSignature: fixture.sourceCatalogEntry.sourceBassline.snapshotSignature,
        capturedHarmonySignature: fixture.sourceCatalogEntry.sourceBassline.capturedHarmony!.signature,
        requestedBars: 8, startBar: 9, endBar: 12, actualBars: 4, level: 3,
        croppedSourceNoteCount: 4, projectedNoteCount: 4, omittedSimultaneousNoteCount: 0,
        boundaryClippedNoteCount: 0, overlapClippedNoteCount: 0, pitchReplacementCount: 0,
        capturedHarmonyComparison: "match",
      });
      const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], sourceBasslineHistory: [entry], onSourceBasslineWindowBarsChange: vi.fn(() => pending) });
      await chooseSourceBassline(container);
      const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
      await act(async () => windowButton(group, 4)?.click());
      await act(async () => findButton(container, "Restart these settings")?.click());
      expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 9-12 (final partial window)");
      await act(async () => { if (outcome === "success") resolveSave?.(); else rejectSave?.(new Error("late failure")); await pending.catch(() => undefined); });
      expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("Bars 9-12 (final partial window)");
      expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).toBeNull();
    });
  }

  it("does not let a late failed preference replace a source lifecycle choice", async () => {
    const fixture = sourceBasslineFixture(true, 8);
    let rejectSave: ((reason?: unknown) => void) | undefined;
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: vi.fn(() => pending) });
    await chooseSourceBassline(container);
    const group = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(group, 4)?.click());
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!, "generated");
    await act(async () => { rejectSave?.(new Error("late")); await pending.catch(() => undefined); });
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("generated");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).toBeNull();
  });
});

function sourceBasslineFixture(withHarmony: boolean, bars = 3) {
  const sourceId = "synthetic-source";
  const voiceId = "synthetic-bass";
  const endTick = bars * 16;
  const sourceBassline = extractSourceBasslineSnapshot({
    selectedSourceId: sourceId,
    selectedVoiceId: voiceId,
    range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId, startTick: 0, endTick, sourceEndTick: endTick, ticksPerQuarter: 4, meter: { numerator: 4, denominator: 4 } },
    notes: [
      { sourceId, voiceId, pitch: 48, velocity: 0.9, startTick: 0, durationTick: 8, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 43, velocity: 0.7, startTick: 0, durationTick: 4, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 45, velocity: 0.8, startTick: 2, durationTick: 4, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 40, velocity: 0.8, startTick: 32, durationTick: 4, ticksPerQuarter: 4 },
      ...Array.from({ length: Math.max(0, bars - 3) }, (_, index) => ({ sourceId, voiceId, pitch: 40 + index, velocity: 0.8, startTick: (index + 3) * 16, durationTick: 4, ticksPerQuarter: 4 })),
    ],
    ...(withHarmony ? { capturedHarmony: { authority: "raw-integer-ticks" as const, sourceId, rangeStartTick: 0, rangeEndTick: endTick, ticksPerQuarter: 4, spans: Array.from({ length: bars }, (_, index) => ({ sourceId, startTick: index * 16, durationTick: 16, ticksPerQuarter: 4, chord: makeChordSymbol([0, 5, 7][index % 3]!, index % 3 === 2 ? "dom7" : "maj7") })) } } : {}),
  });
  const block = {
    id: "source-block",
    summaryText: "Synthetic progression",
    detectedKey: "C major",
    bpm: 96,
    timeSignature: "4/4",
    chords: Array.from({ length: bars }, (_, index) => ({ bar: index + 1, beat: 1, durationBeats: 4, chord: makeChordSymbol([0, 5, 7][index % 3]!, index % 3 === 2 ? "dom7" : "maj7"), confidence: 1, alternatives: [], warnings: [] })),
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
    sourceBassline,
  } as SavedProgressionBlock;
  const built = buildVaultChordContextSnapshot({ sourceReference: { ideaId: "source-idea", blockId: block.id }, block });
  if (!built.ok) throw new Error(built.error.message);
  return Object.freeze({ displayTitle: "Synthetic source", searchableTitle: "synthetic source", safeSnapshot: built.snapshot, sourceCatalogEntry: Object.freeze({ displayTitle: "Synthetic source", reference: built.snapshot.source.reference, sourceBassline, harmonyComparison: withHarmony ? "match" as const : "comparison-unavailable" as const }) });
}


function replacementChordContextSnapshot(reference: { readonly ideaId: string; readonly blockId: string }) {
  const block = {
    id: reference.blockId,
    summaryText: "Synthetic replacement",
    detectedKey: "D major",
    bpm: 104,
    timeSignature: "4/4",
    chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(2, "maj7"), confidence: 1, alternatives: [], warnings: [] }],
    tags: [],
    capturedAt: "2026-01-02T00:00:00.000Z",
    analyzerVersion: "fixture",
  } as SavedProgressionBlock;
  const built = buildVaultChordContextSnapshot({ sourceReference: reference, block });
  if (!built.ok) throw new Error(built.error.message);
  return built.snapshot;
}function replacementSourceCatalogEntry(reference: { readonly ideaId: string; readonly blockId: string }) {
  const sourceBassline = extractSourceBasslineSnapshot({
    selectedSourceId: "replacement-source",
    selectedVoiceId: "replacement-bass",
    range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId: "replacement-source", startTick: 0, endTick: 32, sourceEndTick: 32, ticksPerQuarter: 4, meter: { numerator: 4, denominator: 4 } },
    notes: [
      { sourceId: "replacement-source", voiceId: "replacement-bass", pitch: 38, velocity: 0.75, startTick: 0, durationTick: 4, ticksPerQuarter: 4 },
      { sourceId: "replacement-source", voiceId: "replacement-bass", pitch: 41, velocity: 0.8, startTick: 16, durationTick: 4, ticksPerQuarter: 4 },
    ],
  });
  return Object.freeze({ displayTitle: "Synthetic replacement", reference, sourceBassline });
}async function renderView(props: Partial<Parameters<typeof BasslinePracticeView>[0]> = {}, strictMode = false) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const view = <BasslinePracticeView initialWindowBars={1} {...props} />;
  await act(async () => root?.render(strictMode ? <StrictMode>{view}</StrictMode> : view));
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

async function chooseSourceBassline(container: HTMLElement) {
  const sourceMode = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']");
  if (!sourceMode) throw new Error("Missing Source Bassline mode control.");
  await chooseSelect(sourceMode, "source-bassline");
  const sourceSelector = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']");
  const candidate = Array.from(sourceSelector?.options ?? []).find((option) => option.value && !option.disabled);
  if (!sourceSelector || !candidate) throw new Error("Missing explicit saved Source Bassline selection control.");
  await chooseSelect(sourceSelector, candidate.value);
}

async function chooseSelect(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
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

function windowButton(container: ParentNode, bars: number): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.trim() === String(bars));
}
function setTextInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing HTMLInputElement value setter.");
  setter.call(input, value);
}
