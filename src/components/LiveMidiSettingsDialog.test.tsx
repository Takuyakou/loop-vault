// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { createLiveMidiStore, type LiveMidiServicePort } from "../liveMidi/liveMidiStore";
import { LiveMidiSettingsDialog } from "./LiveMidiSettingsDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("LiveMidiSettingsDialog", () => {
  it("shows only the Live MIDI settings in a dialog and closes without leaving the screen", async () => {
    const service: LiveMidiServicePort = {
      getSnapshot: () => ({ devices: [], status: "idle" }),
      subscribe: () => () => undefined,
      subscribeBatches: () => () => undefined,
      refreshDevices: vi.fn(async () => []),
      start: vi.fn(async () => true),
      stop: vi.fn(async () => undefined),
    };
    const store = createLiveMidiStore({ service, loadPreferences: () => ({}), savePreferences: vi.fn() });
    const practice = document.createElement("div");
    practice.dataset.testid = "practice-screen";
    const host = document.createElement("div");
    document.body.append(practice, host);
    const onClose = vi.fn();
    const root = createRoot(host);
    await act(async () => root.render(<LiveMidiSettingsDialog copy={appCopy.ja.settingsUi} onClose={onClose} store={store} />));

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Live MIDI の設定");
    expect(dialog.querySelector("#settings-live-midi-device")).not.toBeNull();
    expect(dialog.querySelector("#settings-data, #settings-general")).toBeNull();
    expect(document.body.contains(practice)).toBe(true);

    const close = [...dialog.querySelectorAll("button")].find((button) => button.textContent === appCopy.ja.settingsUi.close)!;
    expect(document.activeElement).toBe(close);
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
