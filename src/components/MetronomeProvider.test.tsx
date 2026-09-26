// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { loadMetronomeEnabled, saveMetronomeEnabled } from "../audio/metronomePreference";
import { GlobalMetronomeButton } from "./GlobalMetronomeButton";
import { MetronomeProvider, useMetronome } from "./MetronomeProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => window.localStorage.clear());

function Consumer() {
  const { enabled } = useMetronome();
  return <output data-testid="metronome-consumer">{enabled ? "ON" : "OFF"}</output>;
}

it("defaults OFF, shares one header preference, and persists across remount", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<MetronomeProvider><GlobalMetronomeButton /><Consumer /></MetronomeProvider>));
  const button = host.querySelector<HTMLButtonElement>("[data-testid='global-metronome']")!;
  expect(button.getAttribute("aria-label")).toBe("メトロノーム：OFF");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(host.querySelector("output")?.textContent).toBe("OFF");
  await act(async () => button.click());
  expect(button.getAttribute("aria-label")).toBe("メトロノーム：ON");
  expect(host.querySelector("output")?.textContent).toBe("ON");
  expect(loadMetronomeEnabled()).toBe(true);
  await act(async () => root.unmount());

  const second = createRoot(host);
  await act(async () => second.render(<MetronomeProvider><GlobalMetronomeButton /><Consumer /></MetronomeProvider>));
  expect(host.querySelector("output")?.textContent).toBe("ON");
  await act(async () => second.unmount());
});

it("rejects malformed persistence and stores explicit OFF", () => {
  window.localStorage.setItem("loop-vault:metronome-enabled:v1", "broken");
  expect(loadMetronomeEnabled()).toBe(false);
  saveMetronomeEnabled(false);
  expect(loadMetronomeEnabled()).toBe(false);
});
