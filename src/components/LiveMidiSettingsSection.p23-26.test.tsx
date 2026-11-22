// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { loadLiveMidiPreferences, type LiveMidiPreferences } from "../liveMidi/preferences";
import { createLiveMidiStore, type LiveMidiServicePort } from "../liveMidi/liveMidiStore";
import type { LiveMidiDevice } from "../liveMidi/types";
import { LiveMidiSettingsSection } from "./LiveMidiSettingsSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const device: LiveMidiDevice = { backendId: "roland", name: "Roland Digital Piano", index: 2 };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
});

/** P23-26 C4: the three faces of 「今の様子」, and S7's new switch (C3). */
describe("the MIDI input section (P23-26)", () => {
  it("C4: no device, connected and failed-to-open each say their own thing", async () => {
    const mounted = await mountSection();
    const text = () => document.body.textContent ?? "";

    await act(async () => mounted.store.setState({ devices: [], status: "idle", selected: undefined }));
    expect(text()).toContain("MIDI 機器がつながっていません");
    expect(text()).toContain("鍵盤をつなぐと、自動で見つけます。");
    expect(text()).toContain("つながると、弾いた鍵がここで光ります。");
    expect(document.querySelector("[data-state='none']")).not.toBeNull();

    await act(async () => mounted.store.setState({ devices: [device], status: "connected", selected: device }));
    expect(text()).toContain("Roland Digital Piano");
    expect(text()).toContain("つながっています");
    expect(document.querySelector("[data-state='ok']")).not.toBeNull();

    await act(async () => mounted.store.setState({ status: "error", selected: undefined, error: "Could not open the input." }));
    expect(text()).toContain("MIDI 機器につなげませんでした");
    expect(text()).toContain("つなげませんでした：Could not open the input.");
    expect(document.querySelector("[data-state='error']")).not.toBeNull();

    await mounted.unmount();
  });

  it("S5: the 88 keys light while a note is held and the last note is written with its octave", async () => {
    const mounted = await mountSection();
    await act(async () => mounted.store.setState({ devices: [device], status: "connected", selected: device }));

    const keys = document.querySelectorAll("[data-testid='settings-midi-keys'] [data-midi]");
    expect(keys.length).toBe(88);
    expect(document.querySelector("[data-testid='settings-midi-keys'] [data-key-state]")).toBeNull();

    await act(async () => {
      const instant = mounted.store.getState().instant;
      mounted.store.setState({ instant: { ...instant, notes: [60, 64, 67] } });
    });
    const lit = [...document.querySelectorAll("[data-testid='settings-midi-keys'] [data-key-state]")]
      .map((element) => element.getAttribute("data-midi"));
    expect(lit).toEqual(["60", "64", "67"]);
    expect(document.querySelector("[data-testid='settings-midi-keys'] [data-midi='60']")?.getAttribute("data-key-state")).toBe("bass");
    expect(document.querySelector("[data-testid='settings-midi-last-note']")?.textContent).toContain("最後に届いた音");
    expect(document.querySelector("[data-testid='settings-midi-last-note']")?.textContent).toContain("G4");

    await mounted.unmount();
  });

  it("C3: the always-on-top switch writes the preference and it stays off after a reload", async () => {
    const saved: LiveMidiPreferences[] = [];
    const storage = new Map<string, string>();
    const mounted = await mountSection({
      savePreferences: (preferences) => saved.push(preferences),
    });

    const toggle = document.querySelector<HTMLButtonElement>("[data-testid='settings-live-midi-always-on-top']")!;
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(mounted.store.getState().preferences.alwaysOnTop).toBe(true);

    await act(async () => toggle.click());
    expect(mounted.store.getState().preferences.alwaysOnTop).toBe(false);
    expect(saved[saved.length - 1]?.alwaysOnTop).toBe(false);

    // The record itself: a saved false loads as false (the small window asks for it each time it opens).
    storage.set("loop-vault:live-midi-preferences:v1", JSON.stringify({ alwaysOnTop: false, showHistory: true }));
    expect(loadLiveMidiPreferences({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
    }).alwaysOnTop).toBe(false);

    await mounted.unmount();
  });
});

async function mountSection(overrides: { savePreferences?: (preferences: LiveMidiPreferences) => void } = {}) {
  const service: LiveMidiServicePort = {
    getSnapshot: () => ({ devices: [], status: "idle" }),
    subscribe: () => () => undefined,
    subscribeBatches: () => () => undefined,
    refreshDevices: vi.fn(async () => []),
    start: vi.fn(async () => true),
    stop: vi.fn(async () => undefined),
  };
  const store = createLiveMidiStore({
    service,
    loadPreferences: () => ({ alwaysOnTop: true, showHistory: true }),
    savePreferences: overrides.savePreferences ?? vi.fn(),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<LiveMidiSettingsSection copy={appCopy.ja.settingsUi} store={store} />);
    await Promise.resolve();
  });
  return {
    store,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
