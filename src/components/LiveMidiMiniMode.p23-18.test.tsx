// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { createLiveChordStabilizerState, createLiveNoteState, emptyLiveChordDetection, type LiveChordDetection, type LiveChordHistoryEntry } from "../domain/liveMidi";
import { appCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import type { LiveMidiWindowSnapshot } from "../liveMidi/windowProtocol";
import { LiveMidiMiniMode } from "./LiveMidiMiniMode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  defaultLiveMidiStore.setState({
    devices: [],
    selected: undefined,
    status: "idle",
    error: undefined,
    notes: createLiveNoteState(),
    stabilizer: createLiveChordStabilizerState(),
    instant: emptyLiveChordDetection(),
    provisionalChord: undefined,
    confirmedChord: emptyLiveChordDetection(),
    history: [],
  });
  document.body.replaceChildren();
});

const device = { backendId: "a", name: "Test Piano", index: 0 };
const dm7: LiveChordDetection = {
  kind: "chord",
  chord: makeChordSymbol(2, "min7"),
  alternatives: [],
  label: "Dm7",
  notes: [50, 57, 60, 65],
  noteNames: ["D", "A", "C", "F"],
  bass: 2,
};
const historyEntry = (index: number): LiveChordHistoryEntry => ({
  id: `entry-${index}`,
  chord: makeChordSymbol(0, "maj"),
  label: `C${index}`,
  notes: [60, 64, 67],
  startedAtMs: index,
  committedAtMs: index,
});

function snapshotOf(overrides: Partial<LiveMidiWindowSnapshot> = {}): LiveMidiWindowSnapshot {
  return {
    devices: [device],
    selected: device,
    status: "connected",
    kind: "connected",
    label: "Test Piano に接続しました",
    instant: emptyLiveChordDetection(),
    confirmedChord: emptyLiveChordDetection(),
    history: [],
    showHistory: true,
    ...overrides,
  };
}

async function mount(props: Parameters<typeof LiveMidiMiniMode>[0]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<LiveMidiMiniMode {...props} />));
  return host;
}

const label = (container: HTMLElement) => container.querySelector<HTMLElement>(".lv-live-mini-label");
const badge = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-detection-state]");
const keys = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-testid='live-midi-mini-keys'] [data-midi]")];

describe("the small Live MIDI window (P23-18)", () => {
  it("N1 shows the chord, its state and the keyboard picture", async () => {
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ instant: dm7, confirmedChord: dm7 }),
    });
    expect(label(container)?.textContent).toBe("Dm7");
    expect(badge(container)?.textContent).toBe(appCopy.ja.liveMidi.confirmed);
    expect(container.querySelector(".lv-live-mini-piano")).not.toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.querySelector("[data-testid='live-midi-mini-no-device']")).toBeNull();
  });

  it("N2 lights the sounding keys and keeps the lowest one white", async () => {
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ instant: dm7, confirmedChord: dm7 }),
    });
    const all = keys(container);
    expect(all).toHaveLength(88);
    expect(all.filter((key) => key.hasAttribute("data-black"))).toHaveLength(36);
    expect(all.filter((key) => !key.hasAttribute("data-black"))).toHaveLength(52);
    const state = (midi: number) => container.querySelector<HTMLElement>(`[data-midi='${midi}']`)?.getAttribute("data-key-state");
    expect(state(50)).toBe("bass");
    expect([57, 60, 65].map(state)).toEqual(["on", "on", "on"]);
    expect(all.filter((key) => key.hasAttribute("data-key-state"))).toHaveLength(4);
  });

  it("N3 names a provisional chord as such", async () => {
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ instant: dm7, provisionalChord: dm7, confirmedChord: dm7 }),
    });
    expect(badge(container)?.textContent).toBe(appCopy.ja.liveMidi.provisional);
  });

  it("N4 waits for a chord without losing the keyboard picture", async () => {
    const container = await mount({ copy: appCopy.ja.liveMidi, snapshot: snapshotOf() });
    expect(label(container)?.hasAttribute("data-waiting")).toBe(true);
    expect(label(container)?.textContent).toBe("—");
    expect(container.querySelector(".lv-live-mini-piano")).not.toBeNull();
    expect(container.querySelector("[data-testid='live-midi-mini-hint']")?.textContent).toBe("鍵盤を弾くと、コード名が出ます。");
    expect(badge(container)?.textContent).toBe(appCopy.ja.liveMidi.waitingForChord);
  });

  it("N5 says the hand is off the keyboard once the chord is confirmed", async () => {
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ confirmedChord: dm7 }),
    });
    expect(container.querySelector("[data-testid='live-midi-mini-hint']")?.textContent).toBe("鍵盤から手を離しています。");
  });

  it("N6 asks to connect a keyboard when there is none", async () => {
    const onRefreshDevices = vi.fn();
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ devices: [], selected: undefined }),
      onRefreshDevices,
    });
    expect(container.querySelector("[data-testid='live-midi-mini-no-device']")?.textContent)
      .toContain("MIDI 機器がつながっていません");
    expect(container.querySelector(".lv-live-mini-piano")).toBeNull();
    expect(label(container)).toBeNull();
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "探し直す");
    await act(async () => retry?.click());
    expect(onRefreshDevices).toHaveBeenCalledTimes(1);
  });

  it("N7 keeps the failure message and hides the chord", async () => {
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ error: "Device is busy." }),
    });
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(container.querySelector(".lv-live-mini-piano")).toBeNull();
    expect(container.querySelector("[data-testid='live-midi-mini-no-device']")).toBeNull();
  });

  it("N8 shows the last nine chords, their count, the clear button and save", async () => {
    const onClearHistory = vi.fn();
    const onSave = vi.fn();
    const container = await mount({
      copy: appCopy.ja.liveMidi,
      snapshot: snapshotOf({ history: Array.from({ length: 11 }, (_, index) => historyEntry(index + 1)) }),
      onClearHistory,
      onSave,
    });
    const chips = [...container.querySelectorAll<HTMLElement>("[data-testid='live-midi-mini-trail'] .lv-live-mini-history-chip")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"]);
    expect(chips.filter((chip) => chip.hasAttribute("data-last"))).toHaveLength(1);
    expect(chips[chips.length - 1]?.hasAttribute("data-last")).toBe(true);
    expect(container.querySelector("[data-testid='live-midi-mini-count']")?.textContent).toBe("11 個");
    const clear = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "弾いた並びを消す");
    await act(async () => clear?.click());
    expect(onClearHistory).toHaveBeenCalledTimes(1);
    const save = container.querySelector<HTMLButtonElement>("[data-testid='live-midi-mini-save']")!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("N9 starts with an empty trail and a disabled save", async () => {
    const container = await mount({ copy: appCopy.ja.liveMidi, snapshot: snapshotOf() });
    expect(container.querySelector("[data-testid='live-midi-mini-trail']")?.textContent).toBe("弾いたコードが、ここに並びます。");
    expect(container.querySelector("[data-testid='live-midi-mini-count']")).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.getAttribute("aria-label") === "弾いた並びを消す")).toBe(false);
    expect(container.querySelector<HTMLButtonElement>("[data-testid='live-midi-mini-save']")?.disabled).toBe(true);
  });

  it("N10 has no history toggle and one status line", async () => {
    const container = await mount({ copy: appCopy.ja.liveMidi, snapshot: snapshotOf({ history: [historyEntry(1)] }) });
    expect(container.querySelectorAll("[aria-pressed]")).toHaveLength(0);
    const statuses = container.querySelectorAll("[role='status']");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.textContent).toBe("Test Piano に接続しました");
  });

  it("N11 goes back to the main screen", async () => {
    const onShowMain = vi.fn();
    const container = await mount({ copy: appCopy.ja.liveMidi, snapshot: snapshotOf(), onShowMain });
    const back = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === appCopy.ja.liveMidi.showMain);
    await act(async () => back?.click());
    expect(onShowMain).toHaveBeenCalledTimes(1);
  });

  it("N12 shows the connection state and the devices", async () => {
    const container = await mount({ copy: appCopy.ja.liveMidi, snapshot: snapshotOf() });
    expect(container.querySelector(".lv-live-mini-device")?.getAttribute("data-status")).toBe("connected");
    const options = [...container.querySelectorAll<HTMLOptionElement>(".lv-live-mini-device select option")];
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.textContent)).toEqual([appCopy.ja.liveMidi.chooseDevice, "Test Piano"]);
  });

  it("N13 empties this window's own store when no clear handler is given", async () => {
    defaultLiveMidiStore.setState({ history: [historyEntry(1), historyEntry(2)] });
    const container = await mount({ copy: appCopy.ja.liveMidi });
    const clear = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "弾いた並びを消す");
    expect(clear).toBeDefined();
    await act(async () => clear?.click());
    expect(defaultLiveMidiStore.getState().history).toHaveLength(0);
  });
});
