// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalBpmProvider, useGlobalBpm } from "../../../components/GlobalBpmProvider";
import { StageToolsSlot } from "../stage/Stage";

const playback = vi.hoisted(() => ({
  sessions: [] as { events: { layer: string; notes?: readonly number[]; pitch?: number }[]; stopped: number; disposed: number; complete: () => void }[],
  driversDisposed: 0,
  prepareFails: false,
  driverOptions: [] as unknown[],
}));
const recordCompare = vi.hoisted(() => ({
  props: undefined as undefined | {
    readonly resetKey?: string;
    readonly presentation?: string;
    readonly onRecordingPrepare?: () => boolean | void | Promise<boolean | void>;
    readonly onRecordingStart?: () => boolean | void | Promise<boolean | void>;
    readonly onRecordingStop?: () => void;
    readonly onTakeKept?: (retainedTakeReference: string) => void;
    readonly onStatusChange?: (status: string) => void;
    readonly midiRecording?: { commands: { current: unknown }; onCompleted?(take: unknown): void; onCanceled?(): void; onCountIn?(): void };
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

/**
 * P23-63: the stage's headless take renders RecordCompareSection. jsdom has no recorder, so this probe keeps the
 * props useJudgedTake hands it: the practice's own preparation/start callbacks, and the commands the stage's ■ uses.
 */
vi.mock("../recording/ui/RecordCompareSection", () => ({
  RecordCompareSection: (props: NonNullable<typeof recordCompare.props>) => {
    recordCompare.props = props;
    const commands = props.midiRecording?.commands as { current: unknown } | undefined;
    if (commands) commands.current = { start: () => {}, stop: () => {}, playTake: () => {}, playOverlay: () => {}, keep: () => {} };
    return <div data-testid="record-compare-probe" />;
  },
}));

/**
 * P23-63: the take's clock is `MidiBassPlayback`, which needs Tone's audio graph — jsdom cannot build one
 * (「param must be an AudioParam」). The Chord Context engine under test is untouched; only the click/playhead clock
 * below it is replaced.
 */
vi.mock("../midi/playback", () => ({
  MidiBassPlayback: class {
    prepare() { return Promise.resolve(true); }
    start() { return 0; }
    countIn() { /* the count-in click is not under test */ }
    stop() { /* nothing to release */ }
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
  window.localStorage.setItem("loop-vault:global-bpm:v1", JSON.stringify({ version: 1, bpm: 96 }));
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
  window.localStorage.clear();
});

describe("Bassline Echo Chord Context", () => {
  it('delivers current saved MIDI notes to Listen/Play without changing the persisted history snapshot', async () => {
    const snapshot=replacementChordContextSnapshot({ideaId:'saved-idea',blockId:'saved-block'});
    const resolveSavedChordNotes=vi.fn(()=>({'chord:0':[36,73,85]}));
    const onChordContextHistoryRecorded=vi.fn(async()=>undefined);
    const container=await renderView({chordContextSnapshot:snapshot,resolveSavedChordNotes,onChordContextHistoryRecorded});
    await clickStart(container);expect(resolveSavedChordNotes).toHaveBeenCalledWith(snapshot);
    expect(playback.sessions[0]!.events.find(event=>event.layer==='chords')?.notes).toEqual([36,73,85]);
    // 弾く: the take's own accompaniment uses the same current-Vault pitches.
    await startTake();
    expect(playback.sessions[playback.sessions.length-1]!.events.find(event=>event.layer==='chords')?.notes).toEqual([36,73,85]);
    await cancelTake();
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded).toHaveBeenCalledOnce();expect(JSON.stringify(onChordContextHistoryRecorded.mock.calls[0])).not.toMatch(/savedMidiNotes|midiNotes/);
  });

  it("ships accessible Listen and Play controls with the locked defaults and clean labels", async () => {
    const container = await renderView();

    // P23-63/P23-64-fix-1: the 3-step stage, the 条件 chip (showing the chord progression), and every setting in the popover.
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent)
      .toBe("Dm7–G7–Cmaj7 · C · レベル 1 · 96 BPM");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).not.toContain("既定の生成進行");
    expect(container.querySelector(".bp-steps")?.textContent).toContain("1聴く2弾く3結果");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("1聴く");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-timbre']")?.value).toBe("electric");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-listen-mode']")?.value).toBe("bass-and-chords");
    expect(container.querySelector("[data-testid='chord-context-listen-mode']")?.textContent).toContain("ベースのみ");
    expect(container.querySelector("[data-testid='chord-context-listen-mode']")?.textContent).toContain("ベース + コード + メトロノーム");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")?.value).toBe("chords-only");
    expect(container.querySelector("[data-testid='chord-context-play-mode']")?.textContent).toContain("コード + メトロノーム");
    expect(container.querySelector<HTMLSelectElement>("#bassline-level")?.options[0]?.textContent).toBe("1 - ルート");
    // The listen chip shows the value that will be played, and ▶ is beside it.
    expect(container.querySelector("[data-testid='bassline-listen-mode']")?.textContent).toBe("ベース + コード");
    expect(container.querySelector("[data-testid='bassline-listen']")).not.toBeNull();
    // ヒント: 「音の数」→「音名と指板」 (the names land in the lane and on the fretboard).
    const hints = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".bp-hint"));
    expect(hints().map((button) => button.textContent)).toEqual(["音の数", "音名と指板"]);
    const laneNoteCount = container.querySelectorAll("[data-testid='bp-lane'] .bp-note").length;
    await act(async () => { hints()[0]?.click(); await Promise.resolve(); });
    expect(hints()[0]?.textContent).toBe(`${laneNoteCount} 音`);
    await act(async () => { hints()[1]?.click(); await Promise.resolve(); });
    expect(container.querySelector("[data-testid='bp-lane'] [aria-label='お手本の段'] .bp-note")?.textContent).toMatch(/^[A-G]/);
    expect(container.querySelector("[data-testid='bp-fretboard']")).not.toBeNull();
  });

  it("drives 1 聴く and 3 結果 from the keyboard (Space · H · Esc · N)", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    const press = async (key: string) => {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
        for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
      });
    };

    // Space starts 1 聴く, Esc stops it — and hearing it once unlocks 2 弾く.
    await press(" ");
    expect(playback.sessions).toHaveLength(1);
    await press("Escape");
    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-play-without-take']")?.disabled).toBe(false);

    // H opens the count hint.
    await press("h");
    expect(container.querySelector<HTMLButtonElement>(".bp-hint")?.textContent).toBe(`${container.querySelectorAll("[data-testid='bp-lane'] .bp-note").length} 音`);

    // N records the result and returns to 1 聴く.
    await showAnswer(container);
    await press("n");
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
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
    const container = await renderView({ chordContextSnapshots: [result.snapshot], vaultPickerCandidates });
    const openPicker = container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']")!;

    expect(openPicker.textContent).toContain("Vaultから選ぶ");
    expect(laneChords(container)).toContain("Dm7G7Cmaj7");

    await clickStart(container);
    await act(async () => {
      openPicker.click();
      await Promise.resolve();
    });
    expect(document.querySelector("[data-testid='vault-progression-picker']")?.textContent).toContain("Vaultからコード進行を選ぶ");
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
    expect(laneChords(container)).toContain("Dm7G7Cmaj7");
    expect(playback.sessions[0]!.stopped).toBe(0);

    await act(async () => {
      findButton(document.body, "キャンセル")?.click();
      await Promise.resolve();
    });
    expect(document.querySelector("[data-testid='vault-progression-picker']")).toBeNull();
    expect(laneChords(container)).toContain("Dm7G7Cmaj7");
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
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("Vault進行 · D major · bars 1-1");
    expect(laneChords(container)).toBe("Dmaj7");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='bassline-progression-use-default']")?.click();
      await Promise.resolve();
    });
    expect(laneChords(container)).toContain("Dm7G7Cmaj7");
  });

  it("integrates preset sources with key changes across Bassline, Chord Context, Record & Compare, and factual History", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;

    expect(sourceSelect.value).toBe("generated");
    expect(sourceSelect.options).toHaveLength(10);
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("Dm7–G7–Cmaj7");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).not.toContain("既定の生成進行");

    await chooseSelect(sourceSelect, "pop-four-chords");
    expect(sourceSelect.value).toBe("pop-four-chords");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("Pop Four Chords");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("C");
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("元のテンポ: 92 BPM");
    expect(laneChords(container)).toBe("CGAmF");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");

    await clickStart(container);
    const presetSession = playback.sessions[playback.sessions.length - 1]!;
    expect(presetSession.events.filter((event) => event.layer === "chords")).toHaveLength(4);

    const keySelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-preset-key-select']")!;
    await chooseSelect(keySelect, "D major");
    expect(presetSession.stopped).toBeGreaterThan(0);
    expect(presetSession.disposed).toBeGreaterThan(0);
    expect(laneChords(container)).toBe("DABmG");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("D");

    await showAnswer(container);
    const expectedPreset = buildBasslinePresetSnapshot({ presetId: "pop-four-chords", key: "D major" });
    if (!expectedPreset.ok) throw new Error(expectedPreset.error.message);
    expect(recordCompare.props?.resetKey).toContain(expectedPreset.snapshot.signature);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({
      source: {
        kind: "preset",
        presetId: "pop-four-chords",
        catalogVersion: "bassline-preset-catalog-v1",
        safeLabel: "Pop Four Chords",
      },
      section: { startBar: 1, endBar: 4, lengthBeats: 16 },
      originalBpm: 92,
      effectiveBpm: 96,
    });

    await chooseSelect(sourceSelect, "generated");
    expect(sourceSelect.value).toBe("generated");
    expect(container.querySelector("[data-testid='bassline-preset-key-select']")).toBeNull();
    expect(laneChords(container)).toBe("Dm7G7Cmaj7");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");
  });
  it("uses the full twelve-bar preset section without clipping in Chord Context", async () => {
    const container = await renderView();
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;

    await chooseSelect(sourceSelect, "twelve-bar-blues");
    expect(container.querySelector(".bp-meta")?.textContent).toContain("12 小節");
    expect(container.querySelector(".bp-meta")?.textContent).toContain("96 BPM");
    expect(container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")?.value).toBe("96");

    await clickStart(container);
    const session = playback.sessions[playback.sessions.length - 1]!;
    expect(session.events.filter((event) => event.layer === "chords")).toHaveLength(12);
  });
  it("offers Electric and Piano chord timbres and prepares the selected session sound", async () => {
    const container = await renderView({  });
    const timbre = container.querySelector<HTMLSelectElement>("[data-testid='chord-context-timbre']")!;
    expect(Array.from(timbre.options).map((option) => option.textContent)).toEqual(["エレクトリック", "ピアノ"]);

    await act(async () => {
      timbre.value = "piano";
      timbre.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await clickStart(container);

    expect(playback.driverOptions[playback.driverOptions.length - 1]).toEqual({ chordTimbre: "piano" });
    expect(container.querySelector(".bp-steps")?.textContent).toContain("1聴く2弾く3結果");
    expect(container.querySelector("[aria-current='step']")?.textContent).toBe("1聴く");
  });
  it("uses bass only in Listen, replaces playback on a layer switch, and cleans up on unmount", async () => {
    const container = await renderView();
    await clickStart(container);

    expect(playback.sessions).toHaveLength(1);
    expect(playback.sessions[0]!.events.map((event) => event.layer)).toContain("bass");
    expect(playback.sessions[0]!.events.map((event) => event.layer)).toContain("chords");
    expect(playback.sessions[0]!.events.map((event) => event.layer)).not.toContain("metronome");

    // A layer switch replaces the running playback: BASS ONLY in Listen means chords-only here.
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-listen-mode']")!, "chords-only");
    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
    await clickStart(container);

    expect(playback.sessions).toHaveLength(2);
    expect(playback.sessions[1]!.events.map((event) => event.layer)).toEqual(["chords", "chords", "chords"]);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.getAttribute("aria-label")).toBe("止める");

    await act(async () => root?.unmount());
    root = undefined;
    expect(playback.sessions[1]!.stopped).toBeGreaterThan(0);
    expect(playback.driversDisposed).toBeGreaterThan(0);
  });

  it("releases every driver across repeated replay and layer-switch cycles", async () => {
    const container = await renderView();
    const listenModes = ["bass-and-chords", "bass-only", "chords-only", "bass-chords-and-metronome"] as const;
    for (const listenMode of listenModes) {
      await clickStart(container);
      await act(async () => {
        container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.click();
        await Promise.resolve();
      });
      await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-listen-mode']")!, listenMode);
    }

    expect(playback.sessions).toHaveLength(listenModes.length);
    expect(playback.sessions.every((session) => session.stopped > 0 && session.disposed > 0)).toBe(true);
    expect(playback.driversDisposed).toBe(listenModes.length);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.getAttribute("aria-label")).toBe("お手本を聴く");
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
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.getAttribute("aria-label")).toBe("お手本を聴く");
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
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.getAttribute("aria-label")).toBe("お手本を聴く");
  });
  it("clears the running UI and disposes the prepared driver after natural completion", async () => {
    const container = await renderView();
    await clickStart(container);
    const session = playback.sessions[0]!;

    await act(async () => session.complete());

    expect(session.stopped).toBeGreaterThan(0);
    expect(session.disposed).toBeGreaterThan(0);
    expect(playback.driversDisposed).toBe(1);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.getAttribute("aria-label")).toBe("お手本を聴く");
    // P23-63: hearing the phrase once unlocks 2 弾く.
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-record']")?.disabled).toBe(false);
  });

  it("uses the legacy preview when the Chord Context rollback is explicit", async () => {
    const container = await renderView({ chordContextEnabled: false });
    const legacy = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    expect(container.querySelector("[data-testid='bassline-listen-mode']")).toBeNull();
    await act(async () => legacy.click());
    expect(preview.started).toBe(1);
    expect(legacy.getAttribute("aria-label")).toBe("止める");
    expect(playback.sessions).toHaveLength(0);

    await act(async () => legacy.click());
    expect(preview.stopped).toBeGreaterThan(0);
    expect(legacy.getAttribute("aria-label")).toBe("お手本を聴く");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-record']")?.disabled).toBe(false);
  });

  it("ignores a delayed legacy preview callback after the level changed", async () => {
    preview.delayStart = true;
    const container = await renderView({ chordContextEnabled: false });
    const legacy = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    await act(async () => legacy.click());
    expect(preview.pendingStart).toBeTypeOf("function");

    await chooseSelect(container.querySelector<HTMLSelectElement>("#bassline-level")!, "2");
    expect(preview.stopped).toBeGreaterThan(0);
    await act(async () => preview.pendingStart?.());

    expect(legacy.getAttribute("aria-label")).toBe("お手本を聴く");
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
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("Vault は変わりません");

    await showAnswer(container);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep, "result stage before saving").toBe("2");
    // 弾く時に鳴らす: the take's accompaniment (P23-63 moved the old 録音時の伴奏 here).
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")?.value).toBe("chords-only");
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")!, "chords-and-metronome");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")?.value).toBe("chords-and-metronome");

    await saveAndNext(container);
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    const entry = onChordContextHistoryRecorded.mock.calls[0]![0];
    expect(entry).toMatchObject({
      source: { kind: "generated", safeLabel: "Generated progression" },
      originalBpm: 96,
      effectiveBpm: 100,
      listenMode: "bass-and-chords",
      playMode: "chords-and-metronome",
      metronomeUsed: false,
      recordCompareUsed: false,
    });
    expect(entry).not.toHaveProperty("retainedTakeReference");
    expect(JSON.stringify(entry)).not.toMatch(/rawMidi|sourcePath|targetEvents|score/i);
    // 記録して次へ returns to 1 聴く; pressing it twice in one go still writes once.
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    await showAnswer(container);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='bassline-next']")?.click();
      container.querySelector<HTMLButtonElement>("[data-testid='bassline-next']")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(2);
  });

  it("records metronome use only after successful scheduled playback", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")!, "chords-and-metronome");
    await startTake();
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toContain("metronome");
    await cancelTake();
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({ metronomeUsed: true });
  });

  it("does not record metronome use when preparation fails", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")!, "chords-and-metronome");
    // A good listen first (so 2 弾く is unlocked), then the take's own preparation fails.
    await listenOnce(container);
    playback.prepareFails = true;
    const sessionsBefore = playback.sessions.length;
    await startTake(false);
    expect(playback.sessions).toHaveLength(sessionsBefore);
    await cancelTake();
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({ metronomeUsed: false });
  });

  it("keeps the take's facts and the kept reference in History, and clears them after a tempo or accompaniment change", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderView({ onChordContextHistoryRecorded });
    expect(recordCompare.props).toBeDefined();
    const firstResetKey = recordCompare.props?.resetKey;
    const tempo = container.querySelector<HTMLInputElement>("[data-testid=chord-context-effective-bpm]")!;
    await startTake();
    expect(tempo.disabled).toBe(true);
    expect(recordCompare.props?.resetKey).toBeDefined();
    await act(async () => { recordCompare.props?.onTakeKept?.("take-opaque-id"); await Promise.resolve(); });
    await cancelTake();
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(1);
    expect(onChordContextHistoryRecorded.mock.calls[0]![0]).toMatchObject({
      recordCompareUsed: true,
      retainedTakeReference: "take-opaque-id",
    });

    await act(async () => {
      setNumberInputValue(tempo, "104");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(recordCompare.props?.resetKey).not.toBe(firstResetKey);
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(2);
    expect(onChordContextHistoryRecorded.mock.calls[1]![0]).toMatchObject({ recordCompareUsed: false });
    expect(onChordContextHistoryRecorded.mock.calls[1]![0]).not.toHaveProperty("retainedTakeReference");

    const bpmResetKey = recordCompare.props?.resetKey;
    await chooseSelect(container.querySelector<HTMLSelectElement>("[data-testid='chord-context-play-mode']")!, "chords-and-metronome");
    expect(recordCompare.props?.resetKey).not.toBe(bpmResetKey);
    await showAnswer(container);
    await saveAndNext(container);
    expect(onChordContextHistoryRecorded).toHaveBeenCalledTimes(3);
    expect(onChordContextHistoryRecorded.mock.calls[2]![0]).toMatchObject({ recordCompareUsed: false });
    expect(onChordContextHistoryRecorded.mock.calls[2]![0]).not.toHaveProperty("retainedTakeReference");
  });
  it("keeps the P5.16 Bassline surface when the Chord Context rollback is explicit", async () => {
    const container = await renderView({ chordContextEnabled: false });

    expect(container.querySelector("[data-testid='bassline-progression-select']")).toBeNull();
    expect(container.querySelector("[data-testid='vault-progression-picker-open']")).toBeNull();
    expect(container.querySelector("[data-testid='chord-context-effective-bpm']")).toBeNull();
    expect(container.querySelector("#bassline-level")).not.toBeNull();
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
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("保存済みの元ベースラインを選んでください");
    const sourceCandidate = Array.from(sourceSelector.options).find((option) => option.value && !option.disabled)!;
    await chooseSelect(sourceSelector, sourceCandidate.value);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    expect(level.disabled).toBe(false);
    expect(level.value).toBe("3");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
    const windowPanel = container.querySelector<HTMLElement>("[data-testid='source-bassline-window']")!;
    expect(windowPanel.className).toContain("min-w-0");
    const previous = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-previous']")!;
    expect(previous.disabled).toBe(false);
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(previous.getAttribute("aria-describedby")).toBe("source-bassline-previous-reason");
    previous.focus();
    await act(async () => previous.click());
    expect(document.activeElement).toBe(previous);
    expect(container.querySelector("[data-testid='source-bassline-projection-facts']")?.textContent).toContain("切り出しノート 3 / 単音投影 2 / レベル対象 2 / 同時発音の省略 1");

    await clickStart(container);
    expect(bassPitchesOfLastSession()).toEqual([43, 45]);
    const stoppedBeforeMove = lastSession().stopped;
    const next = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-next']")!;
    next.focus();
    await act(async () => next.click());
    expect(document.activeElement).toBe(next);
    expect(lastSession().stopped).toBeGreaterThan(stoppedBeforeMove);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("2〜2小節");
    const emptyReason = container.querySelector<HTMLElement>("[data-testid='source-bassline-empty']")!;
    const playWithoutTake = container.querySelector<HTMLButtonElement>("[data-testid='bassline-play-without-take']")!;
    const hintButton = container.querySelector<HTMLButtonElement>(".bp-hint")!;
    const recordButton = container.querySelector<HTMLButtonElement>("[data-testid='bassline-record']")!;
    expect(emptyReason.id).toBe("source-bassline-empty");
    expect(playWithoutTake.disabled).toBe(true);
    expect(recordButton.disabled).toBe(true);
    expect(recordButton.getAttribute("aria-describedby")).toBe("bassline-record-reason");
    expect(hintButton.disabled).toBe(true);

    next.focus();
    await act(async () => next.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("3〜3小節");
    expect(next.disabled).toBe(false);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);

    const windowLength = container.querySelector<HTMLElement>("[data-testid='source-bassline-window-bars']")!;
    await act(async () => windowButton(windowLength, 2)?.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜2小節");
    const finalNext = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-next']")!;
    finalNext.focus();
    await act(async () => finalNext.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("3〜3小節（最終区間）");
    expect(document.activeElement).toBe(finalNext);
    expect(finalNext.getAttribute("aria-disabled")).toBe("true");
    const finalPrevious = container.querySelector<HTMLButtonElement>("[data-testid='source-bassline-previous']")!;
    finalPrevious.focus();
    await act(async () => finalPrevious.click());
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜2小節");
    expect(document.activeElement).toBe(finalPrevious);
    expect(finalPrevious.getAttribute("aria-disabled")).toBe("true");

    await act(async () => windowButton(windowLength, 1)?.click());
    await listenOnce(container);
    await act(async () => { findButton(container, "録らずに弾く")?.click(); await Promise.resolve(); });
    expect(recordCompare.props?.resetKey).toContain("source-bassline:");
    expect(recordCompare.props?.resetKey).toContain(fixture.sourceCatalogEntry.sourceBassline.snapshotSignature);
    await act(async () => { findButton(container, "弾けた・答えを見る")?.click(); await Promise.resolve(); });
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("2");
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

    await rerenderView(<BasslinePracticeView {...shared} vaultPickerCandidates={[]} />);

    const source = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(source.value).toBe("source-bassline");
    expect(Array.from(source.options).find((option) => option.value === "source-bassline")?.disabled).toBe(false);
    expect(container.querySelector<HTMLSelectElement>("#bassline-level")?.value).toBe("3");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
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
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toContain("保存済みの元ベースラインを選んでください");
    const fixtureOption = Array.from(selector.options).find((option) => option.textContent?.includes("Synthetic source"))!;
    await chooseSelect(selector, fixtureOption.value);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
    await clickStart(container);
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toEqual(expect.arrayContaining(["bass", "chords"]));

    const reloadedSource = structuredClone(fixture.sourceCatalogEntry);
    const unrelatedContext = replacementChordContextSnapshot({ ideaId: "current-idea", blockId: "current-block" });
    await rerenderView(<BasslinePracticeView
      chordContextSnapshot={unrelatedContext}
      chordContextSnapshots={[unrelatedContext]}
      vaultPickerCandidates={[]}
      vaultSourceBasslines={[reloadedSource, other]}
    />);
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");

    await rerenderView(<BasslinePracticeView vaultPickerCandidates={[]} chordContextSnapshots={[]} vaultSourceBasslines={[other]} />);
    const afterRemoval = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    const expectedMissingKey = `${encodeURIComponent(fixture.sourceCatalogEntry.reference.ideaId)}:${encodeURIComponent(fixture.sourceCatalogEntry.reference.blockId)}`;
    expect(afterRemoval.value).toBe(expectedMissingKey);
    expect(container.textContent).toContain("選択した保存済み元ベースラインは利用できません");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).not.toBe("1〜1小節");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.disabled).toBe(true);

    const otherOption = Array.from(afterRemoval.options).find((option) => option.textContent?.includes("Synthetic replacement"))!;
    await chooseSelect(afterRemoval, otherOption.value);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
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
    expect(tempo.value).toBe("96");
    expect(tempoControls.textContent).toContain("元のテンポ: 104 BPM");
    await chooseSourceBassline(container);
    expect(tempo.value).toBe("96");
    expect(tempoControls.textContent).toContain("目安: 96 BPM");
    expect(tempoControls.textContent).not.toContain("元のテンポ: 104 BPM");
    await act(async () => findButton(container, "+4 BPM")?.click());
    expect(tempo.value).toBe("100");
    await act(async () => findButton(container, "目安に戻す")?.click());
    expect(tempo.value).toBe("96");
  });
  it("invalidates the result when the external Chord Context snapshot is replaced or deleted", async () => {
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
    await showAnswer(container);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("2");

    await rerenderView(<BasslinePracticeView
      chordContextSnapshot={replacement}
      chordContextSnapshots={[replacement]}
      vaultPickerCandidates={[{ displayTitle: "Replacement", searchableTitle: "replacement", safeSnapshot: replacement }]}
      vaultSourceBasslines={sourceCatalog}
    />);

    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLOptionElement>("option[value='source-bassline']")?.disabled).toBe(false);

    // A listen that is sounding stops when the snapshot is removed.
    await clickStart(container);
    const playing = lastSession();
    await rerenderView(<BasslinePracticeView vaultSourceBasslines={sourceCatalog} />);
    expect(playing.stopped).toBeGreaterThan(0);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLOptionElement>("option[value='source-bassline']")?.disabled).toBe(false);
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
  });
  it("stops the take's playback and clears the result when the strict source catalog item disappears", async () => {
    const fixture = sourceBasslineFixture(true);
    const base = {
      chordContextSnapshot: fixture.safeSnapshot,
      chordContextSnapshots: [fixture.safeSnapshot],
      vaultPickerCandidates: [fixture],
    } as const;
    const container = await renderView({ ...base, vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    await startTake();
    const activePlayback = lastSession();
    expect(activePlayback).toBeDefined();
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("1");

    await rerenderView(<BasslinePracticeView {...base} vaultSourceBasslines={[]} />);

    expect(activePlayback.stopped).toBeGreaterThan(0);
    expect(activePlayback.disposed).toBeGreaterThan(0);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    const source = container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")!;
    expect(source.value).toBe("source-bassline");
    expect(source.disabled).toBe(false);
    expect(Array.from(source.options).find((option) => option.value === "source-bassline")?.disabled).toBe(false);
    const savedSource = container.querySelector<HTMLSelectElement>("[data-testid='source-bassline-vault-select']")!;
    expect(savedSource.disabled).toBe(true);
    expect(savedSource.selectedOptions[0]?.textContent).toContain("選択したソースは利用できません");
    const listen = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    expect(listen.disabled).toBe(true);
    expect(listen.getAttribute("aria-describedby")).toBe("source-bassline-unavailable");
  });

  it("invalidates the result and safely returns to bar 1 when the external source range/signature is replaced", async () => {
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
    await showAnswer(container);
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("2");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("3〜3小節");
    expect(replacement.sourceBassline.snapshotSignature).not.toBe(fixture.sourceCatalogEntry.sourceBassline.snapshotSignature);

    await rerenderView(<BasslinePracticeView {...base} vaultSourceBasslines={[replacement]} />);

    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
  });
  it("uses captured harmony directly for Source Chord Context without reconstructing current chords", async () => {
    const fixture = sourceBasslineFixture(true);
    const resolveSavedChordNotes = vi.fn(() => ({"chord:0": [36,73,85]}));
    const container = await renderView({ resolveSavedChordNotes, chordContextSnapshot: fixture.safeSnapshot, chordContextSnapshots: [fixture.safeSnapshot], vaultPickerCandidates: [fixture], vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const listen = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")!;
    expect(listen.disabled).toBe(false);
    await clickStart(container);
    expect(resolveSavedChordNotes).not.toHaveBeenCalled();
    expect(playback.sessions[playback.sessions.length - 1]?.events.map((event) => event.layer)).toEqual(expect.arrayContaining(["bass", "chords"]));
  });

  it("keeps Source Record & Compare available without captured harmony while disabling accompaniment honestly", async () => {
    const fixture = sourceBasslineFixture(false);
    const container = await renderView({ chordContextSnapshot: fixture.safeSnapshot, chordContextSnapshots: [fixture.safeSnapshot], vaultPickerCandidates: [fixture], vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("目安: 96 BPM");
    expect(findButton(container, "目安に戻す")).toBeDefined();
    // No captured harmony: the panel says 伴奏なし, the listen falls back to the legacy preview and the take records dry.
    expect(container.textContent).toContain("伴奏なし(ヘッドホンで)");
    expect(container.querySelector("[data-testid='source-bassline-context-reason']")?.textContent).toContain("正確な保存済み和声がないため、Chord Contextは利用できません");
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.disabled).toBe(false);
    let prepared: boolean | void | undefined;
    let started: boolean | void | undefined;
    await act(async () => {
      prepared = await recordCompare.props?.onRecordingPrepare?.();
      started = await recordCompare.props?.onRecordingStart?.();
      await Promise.resolve();
    });
    expect(prepared).toBe(true);
    // The take starts without an accompaniment session (nothing is played by Chord Context).
    expect(started).not.toBe(false);
    expect(playback.sessions).toHaveLength(0);
    await cancelTake();
    await showAnswer(container);
    expect(container.querySelector("[data-testid='bp-result-facts']")?.textContent).toContain("伴奏 なし");
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

    const bassPitches = () => bassPitchesOfLastSession();
    await chooseSelect(level, "1");
    await clickStart(container);
    expect(bassPitches()).toEqual([48, 48]);
    expect(container.querySelector("[data-testid='source-bassline-projection-facts']")?.textContent).toContain("pitch置換 2");

    await chooseSelect(level, "2");
    await clickStart(container);
    expect(bassPitches()).toEqual([43, 43]);
    expect(container.querySelector("[data-testid='source-bassline-harmony-comparison']")?.textContent).toContain("一致");
    expect(JSON.stringify(fixture.sourceCatalogEntry.sourceBassline)).toBe(before);
  });

  it("changes the take's identity and target when Source Level changes from 1 to 2", async () => {
    const fixture = sourceBasslineFixture(true);
    const container = await renderView({ vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    await chooseSourceBassline(container);
    const level = container.querySelector<HTMLSelectElement>("#bassline-level")!;
    const bassPitches = () => bassPitchesOfLastSession();

    await chooseSelect(level, "1");
    await clickStart(container);
    const level1ResetKey = recordCompare.props?.resetKey;
    const level1Target = bassPitches();

    await chooseSelect(level, "2");
    await clickStart(container);
    const level2ResetKey = recordCompare.props?.resetKey;
    const level2Target = bassPitches();

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
    expect(container.querySelector("#bassline-level-description")?.textContent).toContain("保存済み和声");
  });

  it("omits the captured-harmony signature when saving History for a source without harmony", async () => {
    const fixture = sourceBasslineFixture(false);
    const onSourceBasslineHistoryRecorded = vi.fn(async (_entry: SourceBasslineHistoryEntry) => undefined);
    const container = await renderView({
      vaultSourceBasslines: [fixture.sourceCatalogEntry],
      onSourceBasslineHistoryRecorded,
    });
    await chooseSourceBassline(container);
    await showAnswer(container);
    await saveAndNext(container);

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
    await showAnswer(container);
    await saveAndNext(container);
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
    // The next window follows the save (P23-63: 最後の区間なら最初へ).
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("2〜2小節");
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");

    await rerenderView(<BasslinePracticeView
      vaultSourceBasslines={[fixture.sourceCatalogEntry]}
      sourceBasslineHistory={[entry]}
    />);
    const restart = findButton(container, "この条件を再開")!;
    await act(async () => restart.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("source-bassline");
    expect(container.querySelector<HTMLSelectElement>("#bassline-level")?.value).toBe("2");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("復元しました");
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
    expect(container.querySelector("[data-testid='source-bassline-history']")?.textContent).toContain("保存元 変更済み");
    await act(async () => findButton(container, "この条件を再開")?.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("generated");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("別のソースへ置き換えません");
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

    await act(async () => findButton(container, "この条件を再開")?.click());
    expect(container.querySelector<HTMLSelectElement>("[data-testid='bassline-line-source']")?.value).toBe("generated");
    expect(container.querySelector("[data-testid='source-bassline-history-restart-status']")?.textContent).toContain("保存済み条件を正確に復元できない");
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
    await showAnswer(container);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='bassline-next']")?.click());
    expect(container.querySelector("[data-testid='bassline-next']")?.textContent).toContain("記録しています…");

    await chooseSelect(level, "1");
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    await act(async () => {
      resolveSave?.();
      await pending;
      await Promise.resolve();
    });
    // The stale completion neither advances the window nor reports a failure.
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("1〜1小節");
    expect(container.querySelector("[data-testid='bassline-history-error']")).toBeNull();
  });

  it("drops stale Chord Context History rejection after the target changes", async () => {
    let rejectSave: ((reason?: unknown) => void) | undefined;
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const onChordContextHistoryRecorded = vi.fn(() => pending);
    const container = await renderView({ onChordContextHistoryRecorded });
    await showAnswer(container);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='bassline-next']")?.click());
    expect(container.querySelector("[data-testid='bassline-next']")?.textContent).toContain("記録しています…");

    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='chord-context-bpm-plus-four']")?.click());
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    await act(async () => {
      rejectSave?.(new Error("synthetic stale rejection"));
      await pending.catch(() => undefined);
      await Promise.resolve();
    });
    expect(container.querySelector<HTMLElement>("[data-testid='bassline-echo-view']")?.dataset.stageStep).toBe("0");
    expect(container.querySelector("[data-testid='bassline-history-error']")).toBeNull();
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
    expect(group.getAttribute("aria-label")).toBe("元ベースラインの区間の長さ");
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
    const container = await renderView({ initialWindowBars: 2, vaultSourceBasslines: [fixture.sourceCatalogEntry], onSourceBasslineWindowBarsChange: save });
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
    await listenOnce(container);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-record']")?.disabled).toBe(false);
    await act(async () => { setNumberInputValue(bpm, "31"); bpm.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-record']")?.disabled).toBe(true);
    expect(container.querySelector("[data-testid='bassline-record-reason']")?.textContent).toContain("60秒を超える");
    // The over-limit window still plays (listening is not a recording).
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']")?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='bassline-play-without-take']")?.disabled).toBe(false);
  });

  it("returns to persisted two when rapid 4/8 saves both fail", async () => {
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
    await act(async () => { rejectEight?.(new Error("eight")); await eightPending.catch(() => undefined); });
    await act(async () => { rejectFour?.(new Error("four")); await fourPending.catch(() => undefined); });
    expect(windowButton(group, 2)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='source-bassline-window-save-error']")).not.toBeNull();
  });

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
    expect(container.querySelector("[data-testid='bassline-echo-view']")).toBeNull();
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
      await act(async () => findButton(container, "この条件を再開")?.click());
      expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("9〜12小節（最終区間）");
      await act(async () => { if (outcome === "success") resolveSave?.(); else rejectSave?.(new Error("late failure")); await pending.catch(() => undefined); });
      expect(windowButton(group, 8)?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector("[data-testid='source-bassline-range']")?.textContent).toBe("9〜12小節（最終区間）");
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

describe("Bassline Echo and the app-wide BPM (P23-06b)", () => {
  it("T7 starts at the app-wide BPM", async () => {
    const container = await renderWithGlobalBpm(132);
    expect(effectiveBpmInput(container).value).toBe("132");
  });

  it("T8 choosing a preset keeps the app-wide BPM and announces the song's", async () => {
    const container = await renderWithGlobalBpm(132);
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;
    await chooseSelect(sourceSelect, "pop-four-chords");
    expect(effectiveBpmInput(container).value).toBe("132");
    expect(container.querySelector("[data-testid='chord-context-tempo']")?.textContent).toContain("元のテンポ: 92 BPM");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("Pop Four Chords");
    expect(sharedBpm.songBpm).toBe(92);
  });

  it("T9 the generated progression and a source bassline announce no song BPM", async () => {
    const fixture = sourceBasslineFixture(true);
    const container = await renderWithGlobalBpm(132, { vaultSourceBasslines: [fixture.sourceCatalogEntry] });
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;
    await chooseSelect(sourceSelect, "pop-four-chords");
    expect(sharedBpm.songBpm).toBe(92);
    await chooseSelect(sourceSelect, "generated");
    expect(sharedBpm.songBpm).toBeUndefined();
    await chooseSourceBassline(container);
    expect(sharedBpm.songBpm).toBeUndefined();
  });

  it("T10 +4 BPM and going back to the original tempo move the app-wide BPM", async () => {
    const container = await renderWithGlobalBpm(132);
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;
    await chooseSelect(sourceSelect, "pop-four-chords");
    await act(async () => findButton(container, "+4 BPM")?.click());
    expect(sharedBpm.bpm).toBe(136);
    expect(effectiveBpmInput(container).value).toBe("136");
    await act(async () => findButton(container, "元のテンポに戻す")?.click());
    expect(sharedBpm.bpm).toBe(92);
    expect(effectiveBpmInput(container).value).toBe("92");
  });

  it("T11 a change from outside reaches the field and stops the playback", async () => {
    const container = await renderWithGlobalBpm(132);
    await clickStart(container);
    expect(playback.sessions[0]!.stopped).toBe(0);
    await act(async () => sharedBpm.setBpm(110));
    expect(effectiveBpmInput(container).value).toBe("110");
    expect(playback.sessions[0]!.stopped).toBeGreaterThan(0);
  });

  it("T12 a take keeps its speed until it ends", async () => {
    const container = await renderWithGlobalBpm(132);
    await startTake();
    const before = recordCompare.props?.resetKey;
    expect(before).toBeDefined();
    await act(async () => sharedBpm.setBpm(140));
    expect(effectiveBpmInput(container).value).toBe("132");
    expect(recordCompare.props?.resetKey).toBe(before);
    const pending = container.querySelector<HTMLElement>("[data-testid='chord-context-tempo-pending']");
    expect(pending?.textContent).toContain("132");
    expect(pending?.textContent).toContain("140");
    // The notice still says what happens to a take that was not kept when the speed changes.
    expect(pending?.textContent).toContain("残していない録音は消えます。");
    await cancelTake();
    expect(effectiveBpmInput(container).value).toBe("140");
    expect(recordCompare.props?.resetKey).not.toBe(before);
    expect(container.querySelector("[data-testid='chord-context-tempo-pending']")).toBeNull();
  });

  it("T13 the saved history keeps the speed the take was played at", async () => {
    const onChordContextHistoryRecorded = vi.fn(async (_entry: unknown) => undefined);
    const container = await renderWithGlobalBpm(132, { onChordContextHistoryRecorded });
    const sourceSelect = container.querySelector<HTMLSelectElement>("[data-testid='bassline-progression-select']")!;
    await chooseSelect(sourceSelect, "pop-four-chords");
    await listenOnce(container);
    await startTake();
    await cancelTake();
    await showAnswer(container);
    await saveAndNext(container);
    const entry = onChordContextHistoryRecorded.mock.calls[0]?.[0] as { effectiveBpm?: number };
    expect(entry?.effectiveBpm).toBe(132);
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
}const withGlobalBpm = (view: React.ReactElement) => <GlobalBpmProvider>{view}</GlobalBpmProvider>;

/** P23-06b: the app-wide BPM, reachable from a test the way the top bar reaches it. */
const sharedBpm = { bpm: 0, songBpm: undefined as number | undefined, setBpm: (_next: number): void => undefined };
function BpmProbe() {
  const { bpm, songBpm, setBpm } = useGlobalBpm();
  sharedBpm.bpm = bpm;
  sharedBpm.songBpm = songBpm;
  sharedBpm.setBpm = setBpm;
  return null;
}

async function renderWithGlobalBpm(
  bpm: number,
  props: Partial<Parameters<typeof BasslinePracticeView>[0]> = {},
) {
  window.localStorage.setItem("loop-vault:global-bpm:v1", JSON.stringify({ version: 1, bpm }));
  const container = document.createElement("div");
  document.body.append(container);
  toolsHost = document.createElement("div");
  container.append(toolsHost);
  const app = document.createElement("div");
  container.append(app);
  root = createRoot(app);
  viewContainer = container;
  await act(async () => root?.render(
    <StageToolsSlot value={toolsHost!}>
      <GlobalBpmProvider>
        <BpmProbe />
        <BasslinePracticeView initialWindowBars={1} {...props} />
      </GlobalBpmProvider>
    </StageToolsSlot>,
  ));
  await openConditions(container);
  return container;
}

const effectiveBpmInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("[data-testid='chord-context-effective-bpm']")!;

/**
 * P23-63: the 条件 chip lives in the top band, so the harness gives the stage the slot the app shell owns — without
 * it `StageTools` draws nothing (as in the app's hidden practice). The panel only exists while it is open.
 */
let toolsHost: HTMLElement | undefined;
let viewContainer: HTMLElement | undefined;

async function openConditions(container: HTMLElement) {
  if (container.querySelector("#bassline-level")) return;
  const chip = container.querySelector<HTMLButtonElement>("[data-testid='bassline-conditions']");
  if (!chip) throw new Error("Missing conditions chip");
  await act(async () => { chip.click(); await Promise.resolve(); });
}

async function rerenderView(element: ReactNode) {
  await act(async () => root?.render(<StageToolsSlot value={toolsHost ?? null}>{withGlobalBpm(element as React.ReactElement)}</StageToolsSlot>));
  await openConditions(viewContainer ?? document.body);
}

async function renderView(props: Partial<Parameters<typeof BasslinePracticeView>[0]> = {}, strictMode = false) {
  const container = document.createElement("div");
  document.body.append(container);
  toolsHost = document.createElement("div");
  container.append(toolsHost);
  const app = document.createElement("div");
  container.append(app);
  root = createRoot(app);
  viewContainer = container;
  const view = withGlobalBpm(<BasslinePracticeView initialWindowBars={1} {...props} />);
  await act(async () => root?.render(<StageToolsSlot value={toolsHost!}>{strictMode ? <StrictMode>{view}</StrictMode> : view}</StageToolsSlot>));
  await openConditions(container);
  return container;
}

/** ▶ in 1 聴く (the stage's listen button); the `useLegacyListen` paths use the legacy preview instead. */
async function clickStart(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']");
  await act(async () => {
    button?.click();
    // prepare → schedule → the stage's 「聴いた」 flag: let every microtask settle inside act.
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  });
}

/** Load the practice's own accompaniment and start the take, as the stage's 「録って弾く」 does. */
async function startTake(expectPrepared = true) {
  let prepared: boolean | void | undefined;
  await act(async () => { prepared = await recordCompare.props?.onRecordingPrepare?.(); await Promise.resolve(); });
  expect(prepared).toBe(expectPrepared);
  await act(async () => { await recordCompare.props?.onRecordingStart?.(); await Promise.resolve(); });
}

/** jsdom has no recorder: the take is abandoned through the recorder's own cancel path. */
async function cancelTake() {
  await act(async () => { recordCompare.props?.midiRecording?.onCanceled?.(); await Promise.resolve(); });
}

/** ▶ and ■ again: one listen long enough for the stage to unlock 2 弾く, with the sound stopped afterwards. */
async function listenOnce(container: HTMLElement) {
  await clickStart(container);
  const listenButton = container.querySelector<HTMLButtonElement>("[data-testid='bassline-listen']");
  if (listenButton?.getAttribute("aria-label") === "止める") {
    await act(async () => { listenButton.click(); for (let tick = 0; tick < 4; tick += 1) await Promise.resolve(); });
  }
}

/** 録らずに弾く → 弾けた・答えを見る: 段 3 without a take. The stage requires one listen first, and the buttons stay
 * locked while the お手本 is sounding. */
async function showAnswer(container: HTMLElement) {
  const play = () => container.querySelector<HTMLButtonElement>("[data-testid='bassline-play-without-take']");
  if (play()?.disabled) await listenOnce(container);
  await act(async () => { play()?.click(); await Promise.resolve(); });
  await act(async () => { findButton(container, "弾けた・答えを見る")?.click(); await Promise.resolve(); });
}

/** 記録して次へ: the same history write the old review screen's save button made. */
async function saveAndNext(container: HTMLElement) {
  await act(async () => {
    container.querySelector<HTMLButtonElement>("[data-testid='bassline-next']")?.click();
    await Promise.resolve();
    await Promise.resolve();
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

/** The lane's chord row: the chord names the stage draws above お手本 (without the 「コード」 row label). */
function laneChords(container: HTMLElement): string | undefined {
  const names = Array.from(container.querySelectorAll<HTMLElement>("[aria-label='コードの段'] .bp-lane-chord"))
    .map((element) => element.textContent?.trim() ?? "")
    .join("");
  return names || undefined;
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

/** The Chord Context session the mock driver opened last, and the bass pitches it was asked to play. */
function lastSession() {
  return playback.sessions[playback.sessions.length - 1]!;
}
function bassPitchesOfLastSession(): (number | undefined)[] {
  return lastSession().events.filter((event) => event.layer === "bass").map((event) => event.pitch);
}
