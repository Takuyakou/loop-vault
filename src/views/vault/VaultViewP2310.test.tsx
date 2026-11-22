// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../../audio/playbackController";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock } from "../../domain/types";
import { appCopy } from "../../i18n";
import { VaultView } from "../VaultView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block = (id: string, capturedAt: string, extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock => ({
  id,
  summaryText: "",
  chords: [{ bar: 1, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" } }],
  tags: [],
  capturedAt,
  analyzerVersion: "test",
  ...extra,
});

async function renderVault(props: Partial<ComponentProps<typeof VaultView>>) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <VaultView
      ideas={[]}
      openDetail={vi.fn()}
      openCapture={vi.fn()}
      updateIdea={vi.fn()}
      updateProgressionBlock={vi.fn()}
      setToast={vi.fn()}
      copy={appCopy.ja}
      showRomanNumerals={false}
      {...props}
    />,
  ));
  return { container, unmount: () => act(async () => root.unmount()) };
}

afterEach(() => {
  playbackController.stop();
  window.sessionStorage.clear();
  document.body.replaceChildren();
});

describe("P23-10 Vault list", () => {
  it("C2: 200 progressions draw only the rows in view", async () => {
    const now = Date.now();
    const blocks = Array.from({ length: 200 }, (_, index) =>
      block(`b${index}`, new Date(now - index * 3 * 24 * 60 * 60 * 1000).toISOString(), { detectedKey: "C major" }));
    const started = performance.now();
    const view = await renderVault({ ideas: [makeIdea({ id: "many", progressionBlocks: blocks })] });
    const took = performance.now() - started;
    expect(view.container.querySelector("[data-virtualized='true']")).not.toBeNull();
    expect(view.container.querySelectorAll(".lv-vault-row").length).toBeLessThan(40);
    expect(view.container.querySelector("[data-testid='vault-date-heading']")).toBeNull();
    expect(view.container.textContent).toContain("200件");
    expect(took).toBeLessThan(3000);
    await view.unmount();
  });

  it("V12: a key request chooses that key band cell and is reported done", async () => {
    const done = vi.fn();
    const view = await renderVault({
      ideas: [
        makeIdea({ id: "c", progressionBlocks: [block("c", "2026-07-15T00:00:00.000Z", { detectedKey: "C major" })] }),
        makeIdea({ id: "f", progressionBlocks: [block("f", "2026-07-14T00:00:00.000Z", { detectedKey: "F major" })] }),
      ],
      keyRequest: "major:0",
      onKeyRequestDone: done,
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("[data-key-cell='major:0']")?.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    await view.unmount();
  });

  it("V9: the folded 「進行のない曲」 stays at the bottom while nothing is filtered", async () => {
    const view = await renderVault({
      ideas: [
        makeIdea({ id: "with", progressionBlocks: [block("w", "2026-07-15T00:00:00.000Z", { detectedKey: "C major" })] }),
        makeIdea({ id: "without", title: "メモだけの曲", progressionBlocks: [] }),
      ],
    });
    const orphans = view.container.querySelector("[data-testid='vault-orphan-ideas']")!;
    expect(orphans.textContent).toContain("進行のない曲（1件）");
    expect(orphans.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => view.container.querySelector<HTMLButtonElement>("[data-key-cell='major:0']")!.click());
    expect(view.container.querySelector("[data-testid='vault-orphan-ideas']")).toBeNull();
    await view.unmount();
  });
});
