// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { loadGlobalBpm, saveGlobalBpm } from "../audio/globalBpmPreference";
import { GlobalBpmProvider, useAnnounceSongBpm, useGlobalBpm, type GlobalBpmValue } from "./GlobalBpmProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

let latest: GlobalBpmValue;
function Probe() {
  const value = useGlobalBpm();
  latest = value;
  return null;
}
function Announce({ bpm }: { bpm: number | undefined }) {
  useAnnounceSongBpm(bpm);
  return null;
}

async function mount(node: ReactNode): Promise<Root> {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(node));
  return root;
}

it("starts at the stored value", async () => {
  saveGlobalBpm(96);
  const root = await mount(<GlobalBpmProvider><Probe /></GlobalBpmProvider>);
  expect(latest.bpm).toBe(96);
  await act(async () => root.unmount());
});

it("clamps, stores and nudges", async () => {
  const root = await mount(<GlobalBpmProvider><Probe /></GlobalBpmProvider>);
  expect(latest.bpm).toBe(120);
  await act(async () => latest.setBpm(500));
  expect(latest.bpm).toBe(240);
  expect(loadGlobalBpm()).toBe(240);
  await act(async () => latest.nudgeBpm(-5));
  expect(latest.bpm).toBe(235);
  expect(loadGlobalBpm()).toBe(235);
  await act(async () => root.unmount());
});

it("does not store the same value again", async () => {
  const root = await mount(<GlobalBpmProvider><Probe /></GlobalBpmProvider>);
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => latest.setBpm(120));
  expect(setItem).not.toHaveBeenCalled();
  await act(async () => latest.setBpm(100));
  await act(async () => latest.setBpm(100));
  expect(setItem).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it("a mounted screen announces its song BPM and takes it back when removed", async () => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<GlobalBpmProvider><Probe /><Announce bpm={100} /></GlobalBpmProvider>));
  expect(latest.songBpm).toBe(100);
  await act(async () => root.render(<GlobalBpmProvider><Probe /></GlobalBpmProvider>));
  expect(latest.songBpm).toBeUndefined();
  await act(async () => root.unmount());
});

it("two announcements: the later one wins, and removing it brings the earlier one back", async () => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<GlobalBpmProvider><Probe /><Announce bpm={100} /></GlobalBpmProvider>));
  await act(async () => root.render(<GlobalBpmProvider><Probe /><Announce bpm={100} /><Announce bpm={90} /></GlobalBpmProvider>));
  expect(latest.songBpm).toBe(90);
  await act(async () => root.render(<GlobalBpmProvider><Probe /><Announce bpm={100} /></GlobalBpmProvider>));
  expect(latest.songBpm).toBe(100);
  await act(async () => root.unmount());
});

it("outside the provider it starts at 120 and changes without storing", async () => {
  saveGlobalBpm(96);
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  const root = await mount(<Probe />);
  expect(latest.bpm).toBe(120);
  await act(async () => latest.setBpm(80));
  expect(latest.bpm).toBe(80);
  expect(latest.songBpm).toBeUndefined();
  expect(setItem).not.toHaveBeenCalled();
  expect(loadGlobalBpm()).toBe(96);
  await act(async () => root.unmount());
});
