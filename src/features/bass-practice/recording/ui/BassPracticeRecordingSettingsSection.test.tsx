// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { BassPracticeRecordingSettingsSection } from "./BassPracticeRecordingSettingsSection";
import {
  DEFAULT_RECORD_CHANNEL,
  getRecordChannel,
  setRecordChannel,
} from "../application/recordChannelStore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

describe("record channel store", () => {
  test("defaults to auto, persists, and notifies subscribers", () => {
    expect(getRecordChannel()).toBe(DEFAULT_RECORD_CHANNEL);
    let notified = 0;
    const unsub = subscribe(() => { notified += 1; });
    setRecordChannel("right");
    expect(getRecordChannel()).toBe("right");
    expect(notified).toBeGreaterThan(0);
    unsub();
  });

  function subscribe(listener: () => void) {
    window.addEventListener("loop-vault:bass-practice-record-channel-change", listener);
    return () => window.removeEventListener("loop-vault:bass-practice-record-channel-change", listener);
  }
});

describe("BassPracticeRecordingSettingsSection", () => {
  test("reflects and updates the shared channel, and hides when flag is off", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    // flag off -> nothing
    await act(async () => { root.render(<BassPracticeRecordingSettingsSection enabledOverride={false} />); await flush(); });
    expect(container.textContent).toBe("");

    // flag on -> select reflects the store and writing it syncs back
    await act(async () => {
      setRecordChannel("left");
      await flush();
    });
    await act(async () => { root.render(<BassPracticeRecordingSettingsSection enabledOverride />); await flush(); });
    const select = container.querySelector("[data-testid=settings-record-channel]") as HTMLSelectElement;
    expect(select.value).toBe("left");

    await act(async () => {
      select.value = "mono-sum";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    });
    expect(getRecordChannel()).toBe("mono-sum");
    expect(select.value).toBe("mono-sum");

    await act(async () => root.unmount());
    document.body.replaceChildren();
  });
});
