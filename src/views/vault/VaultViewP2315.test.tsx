// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../../audio/playbackController";
import { parseChordLabel } from "../../domain/chords";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock } from "../../domain/types";
import { appCopy } from "../../i18n";
import { VaultView } from "../VaultView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block = (id: string, key: string, labels: string[]): SavedProgressionBlock => ({
  id,
  summaryText: "",
  chords: labels.map((label, index) => ({
    eventId: `${id}-${index}`, bar: index + 1, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: parseChordLabel(label)!,
  })),
  tags: [],
  detectedKey: key,
  capturedAt: "2026-11-13T00:00:00.000Z",
  analyzerVersion: "test",
});

async function renderVault(blocks: SavedProgressionBlock[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <VaultView
      ideas={blocks.map((entry) => makeIdea({ id: `idea-${entry.id}`, title: `曲 ${entry.id}`, progressionBlocks: [entry] }))}
      openDetail={vi.fn()}
      openCapture={vi.fn()}
      updateIdea={vi.fn()}
      updateProgressionBlock={vi.fn()}
      setToast={vi.fn()}
      copy={appCopy.ja}
      showRomanNumerals={false}
    />,
  ));
  return { container, unmount: () => act(async () => root.unmount()) };
}

afterEach(() => {
  playbackController.stop();
  window.sessionStorage.clear();
  document.body.replaceChildren();
});

describe("P23-15 Vault", () => {
  it("Z2: the row and the preview name the key with ♯ ♭ (E♭メジャー, F♯マイナー)", async () => {
    const view = await renderVault([block("eb", "Eb major", ["Ebmaj7", "Cm7"]), block("fs", "F#m", ["F#m7", "Bm7"])]);
    const rows = [...view.container.querySelectorAll(".lv-vault-row")].map((row) => row.textContent ?? "");
    expect(rows.some((text) => text.includes("E♭メジャー"))).toBe(true);
    expect(rows.some((text) => text.includes("F♯マイナー"))).toBe(true);
    expect(view.container.textContent).not.toMatch(/[A-G][#b](メジャー|マイナー)/);
    const preview = view.container.querySelector("[data-testid='vault-preview']")!;
    expect(preview.querySelector(".lv-vault-preview-meta")?.textContent).toMatch(/[EF][♭♯](メジャー|マイナー)/);
    await view.unmount();
  });

  it("Z1: the preview has the loop roll right under its chord boxes, one cell per box, with the notes ▶ plays", async () => {
    const labels = ["Ebmaj7", "Cm7", "Fm7", "Bb7", "Gm7", "C7", "Fm7", "Bb7", "Ebmaj7"];
    const view = await renderVault([block("long", "Eb major", labels)]);
    const preview = view.container.querySelector("[data-testid='vault-preview']")!;
    const chords = preview.querySelector(".lv-vault-preview-chords")!;
    const roll = preview.querySelector(".lv-vault-preview-roll [data-testid='home-loop-roll']")!;
    expect(roll).not.toBeNull();
    expect(chords.nextElementSibling?.contains(roll)).toBe(true);
    expect(roll.querySelectorAll("[data-roll-chord]")).toHaveLength(chords.querySelectorAll("button").length);
    expect(roll.querySelectorAll(".lv-home-roll-note").length).toBeGreaterThanOrEqual(labels.length * 3);
    await view.unmount();
  });
});
