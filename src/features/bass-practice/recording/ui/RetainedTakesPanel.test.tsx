// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { RetainedTakesPanel } from "./RetainedTakesPanel";
import { InMemoryRecordingStore, PersistentRecordingTakeRepository } from "../application/recordingStore";
import { FakePlayer } from "../application/playback";
import type { KeepContext, RecordingTake } from "../application/ports";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXT: KeepContext = {
  practiceSessionId: "s1",
  exerciseSignature: "degree:x",
  mode: "degree",
  inputDeviceName: "Input",
  playedBackBeforeReview: true,
};

function take(bytes = 800): RecordingTake {
  return {
    data: new Uint8Array(bytes),
    metadata: { mimeType: "audio/webm;codecs=opus", durationMs: 2_500, byteSize: bytes, channelMode: "mono-sum", resolvedChannel: "mono-sum", startOffsetMs: 0 },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); await flush(); });
  return { container, root };
}

async function click(container: HTMLElement, testId: string) {
  const button = container.querySelector(`[data-testid=${testId}]`) as HTMLButtonElement | null;
  await act(async () => { button?.click(); await flush(); });
}

describe("RetainedTakesPanel", () => {
  test("renders nothing when empty (additive) and when the flag is off", async () => {
    const empty = new PersistentRecordingTakeRepository(new InMemoryRecordingStore());
    const { container, root } = await render(<RetainedTakesPanel repository={empty} enabledOverride />);
    expect(container.textContent).toBe("");
    await act(async () => root.unmount());

    const store = new InMemoryRecordingStore();
    const repo = new PersistentRecordingTakeRepository(store);
    await repo.keep(take(), CONTEXT);
    const off = await render(<RetainedTakesPanel repository={repo} enabledOverride={false} />);
    expect(off.container.textContent).toBe("");
    await act(async () => off.root.unmount());
    document.body.replaceChildren();
  });

  test("lists a kept take with honest facts, plays and deletes it", async () => {
    const store = new InMemoryRecordingStore();
    const repo = new PersistentRecordingTakeRepository(store);
    const id = await repo.keep(take(), CONTEXT);
    const player = new FakePlayer();
    const { container, root } = await render(<RetainedTakesPanel repository={repo} takePlayer={player} enabledOverride />);

    expect(container.querySelector("[data-testid=retained-take]")).not.toBeNull();
    expect(container.textContent).toContain("Degree Echo");
    expect(container.textContent).not.toContain("Accuracy");
    expect(container.textContent).not.toContain("Score");
    expect(container.querySelector("[data-testid=retained-capacity]")?.textContent).toContain("MB");

    await click(container, "retained-take-play");
    expect(player.playing).toBe(true);

    await click(container, "retained-take-delete");
    await click(container, "retained-take-confirm-delete");
    expect(container.querySelector("[data-testid=retained-take]")).toBeNull();
    expect(await repo.list()).toHaveLength(0);
    void id;
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("shows 'Recording unavailable' when the binary is missing", async () => {
    const store = new InMemoryRecordingStore();
    const repo = new PersistentRecordingTakeRepository(store);
    const id = await repo.keep(take(), CONTEXT);
    store.dropBinary(id);
    const { container, root } = await render(<RetainedTakesPanel repository={repo} enabledOverride />);
    await click(container, "retained-take-play");
    expect(container.querySelector("[data-testid=retained-take-unavailable]")).not.toBeNull();
    // still deletable
    await click(container, "retained-take-delete");
    await click(container, "retained-take-confirm-delete");
    expect(await repo.listStored()).toHaveLength(0);
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });
});
