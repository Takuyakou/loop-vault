// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import { buildVaultChordContextSnapshot, type VaultChordContextSnapshot } from "../domain";
import type { VaultPickerCandidateView } from "../application/vaultPickerCandidates";
import { VaultProgressionPicker } from "./VaultProgressionPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("VaultProgressionPicker", () => {
  it("keeps the active source unchanged until confirmation and supports cancel", async () => {
    const snapshots = [snapshot("d-major", "D major", "Dmaj7"), snapshot("g-major", "G major", "Gmaj7")];
    const candidates = snapshots.map((safeSnapshot, index) => candidate(safeSnapshot, `Candidate ${index + 1}`));
    const onConfirm = vi.fn();
    const container = await renderPicker({ candidates, activeSignature: snapshots[0]!.signature, onConfirm });

    await click(container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Choose a progression from Vault");
    expect(onConfirm).not.toHaveBeenCalled();

    const candidateButtons = document.querySelectorAll<HTMLButtonElement>("[data-testid='vault-progression-picker-candidate']");
    await click(candidateButtons[1]);
    expect(document.querySelector("[data-testid='vault-progression-picker-preview']")?.textContent).toContain("G major");
    expect(onConfirm).not.toHaveBeenCalled();

    await click(findButton(document.body, "Cancel"));
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    await click(container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    await click(document.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-confirm']"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(snapshots[0]!.signature);
  });

  it("searches safe snapshot facts and supports arrow-key selection", async () => {
    const snapshots = [snapshot("d-major", "D major", "Dmaj7"), snapshot("g-major", "G major", "Gmaj7")];
    const candidates = snapshots.map((safeSnapshot, index) => candidate(safeSnapshot, index === 0 ? "Night Groove" : "Sunny section"));
    const container = await renderPicker({ candidates, onConfirm: vi.fn() });

    await click(container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    const search = document.querySelector<HTMLInputElement>("[data-testid='vault-progression-picker-search']")!;
    await act(async () => {
      setInputValue(search, "Gmaj7");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(document.querySelectorAll("[data-testid='vault-progression-picker-candidate']")).toHaveLength(1);
    expect(document.body.textContent).toContain("Gmaj7");

    await act(async () => {
      setInputValue(search, "SUNNY");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(document.querySelectorAll("[data-testid='vault-progression-picker-candidate']")).toHaveLength(1);
    expect(JSON.stringify(candidates[1]!.safeSnapshot)).not.toContain("Sunny section");

    await act(async () => {
      setInputValue(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    const candidateButtons = document.querySelectorAll<HTMLButtonElement>("[data-testid='vault-progression-picker-candidate']");
    candidateButtons[0]!.focus();
    await act(async () => {
      candidateButtons[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
      await Promise.resolve();
    });
    expect(candidateButtons[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders loading, empty, error, and bounded large-list states", async () => {
    const container = await renderPicker({ candidates: [], loading: true, onConfirm: vi.fn() });
    await click(container.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    expect(document.querySelector("[role='status']")?.textContent).toContain("Loading Vault progressions");
    expect(document.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-confirm']")?.disabled).toBe(true);

    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    const many = Array.from({ length: 51 }, (_, index) => ({
      ...snapshot(`candidate-${index}`, "C major", "Cmaj7"),
      signature: `test-candidate-${index}`,
    }));
    const manyCandidates = many.map((safeSnapshot, index) => candidate(safeSnapshot, `Candidate ${index + 1}`));
    const errorContainer = await renderPicker({ candidates: manyCandidates, error: "Vault unavailable", onConfirm: vi.fn() });
    await click(errorContainer.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    expect(document.querySelector("[role='alert']")?.textContent).toContain("Vault unavailable");

    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    const largeContainer = await renderPicker({ candidates: manyCandidates, onConfirm: vi.fn() });
    await click(largeContainer.querySelector<HTMLButtonElement>("[data-testid='vault-progression-picker-open']"));
    expect(document.querySelectorAll("[data-testid='vault-progression-picker-candidate']")).toHaveLength(50);
    expect(document.querySelector("[role='status']")?.textContent).toContain("Showing the first 50 matches");
  });
});

async function renderPicker(props: Partial<Parameters<typeof VaultProgressionPicker>[0]>) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<VaultProgressionPicker language="en" candidates={[]} onConfirm={vi.fn()} {...props} />);
  });
  return container;
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

function findButton(container: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.includes(text));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing HTMLInputElement value setter.");
  setter.call(input, value);
}

function snapshot(id: string, key: string, _label: string): VaultChordContextSnapshot {
  const block = {
    id: `${id}-block`,
    summaryText: "not exposed",
    detectedKey: key,
    bpm: 96,
    timeSignature: "4/4",
    chords: [
      { bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(key === "D major" ? 2 : key === "G major" ? 7 : 0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
    ],
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
  } as SavedProgressionBlock;
  const result = buildVaultChordContextSnapshot({
    sourceReference: { ideaId: `${id}-idea`, blockId: block.id },
    block,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.snapshot;
}
function candidate(safeSnapshot: VaultChordContextSnapshot, displayTitle: string): VaultPickerCandidateView {
  return Object.freeze({
    displayTitle,
    searchableTitle: displayTitle.normalize("NFC").trim().toLocaleLowerCase(),
    safeSnapshot,
  });
}
