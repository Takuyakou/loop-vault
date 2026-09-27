// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { DetailView } from "./DetailView";

const tauriMocks = vi.hoisted(() => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => tauriMocks);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DetailView status reasons", () => {
  it("routes block, reference, and asset deletion through the shared undo queue", async () => {
    const block = {
      id: "block-2",
      summaryText: "Saved block",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const reference = { title: "Reference 2", url: "https://example.com" };
    const asset = { id: "asset-2", type: "midi" as const, path: "D:/song.mid" };
    const idea = makeIdea({
      id: "idea-1",
      progressionBlocks: [block],
      references: [reference],
      assets: [asset],
    });
    const removeProgressionBlock = vi.fn(() => true);
    const removeReference = vi.fn(() => true);
    const unlinkAsset = vi.fn(() => true);
    const enqueueUndo = vi.fn((request: { payload: unknown; undo(): boolean | void; commit?(): boolean | void }) => {
      void request;
      return "undo-id";
    });
    const getState = vi.spyOn(playbackController, "getState").mockReturnValue({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-1:block:block-2" },
      startedAt: 0,
    });
    const stop = vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const mounted = await renderDetail(idea, {
      removeProgressionBlock,
      removeReference,
      unlinkAsset,
      enqueueUndo,
      vaultEpoch: 7,
      copy: appCopy.en,
      language: "en",
    });

    const deleteButtons = [...mounted.container.querySelectorAll("button")]
      .filter((button) => button.textContent === "Delete");
    expect(deleteButtons).toHaveLength(4);
    await act(async () => deleteButtons[1]?.click());
    await act(async () => deleteButtons[2]?.click());
    await act(async () => deleteButtons[3]?.click());

    expect(stop).toHaveBeenCalledTimes(3);
    expect(enqueueUndo.mock.calls.map(([request]) => request.payload)).toEqual([
      expect.objectContaining({ kind: "progressionBlock", vaultEpoch: 7 }),
      expect.objectContaining({ kind: "reference", vaultEpoch: 7 }),
      expect.objectContaining({ kind: "asset", vaultEpoch: 7 }),
    ]);
    for (const [request] of enqueueUndo.mock.calls) expect(request.undo()).toBe(true);
    expect(removeProgressionBlock).not.toHaveBeenCalled();
    expect(removeReference).not.toHaveBeenCalled();
    expect(unlinkAsset).not.toHaveBeenCalled();

    for (const [request] of enqueueUndo.mock.calls) request.commit?.();
    expect(removeProgressionBlock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "progressionBlock", vaultEpoch: 7 }),
    );
    expect(removeReference).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "reference", vaultEpoch: 7 }),
    );
    expect(unlinkAsset).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "asset", vaultEpoch: 7 }),
    );

    await mounted.unmount();
    getState.mockRestore();
    stop.mockRestore();
  });

  it("adds references and assets from the stored arrays while deletions are pending", async () => {
    const pendingReference = { title: "Pending reference" };
    const visibleReference = { title: "Visible reference" };
    const pendingAsset = { id: "pending-asset", type: "midi" as const, path: "D:/pending.mid" };
    const visibleAsset = { id: "visible-asset", type: "midi" as const, path: "D:/visible.mid" };
    const visibleIdea = makeIdea({
      references: [visibleReference],
      assets: [visibleAsset],
    });
    const storedIdea = makeIdea({
      id: visibleIdea.id,
      references: [pendingReference, visibleReference],
      assets: [pendingAsset, visibleAsset],
    });
    const updateIdea = vi.fn();
    const mounted = await renderDetail(visibleIdea, {
      storedIdea,
      updateIdea,
      copy: appCopy.en,
      language: "en",
    });

    await changeInput(
      mounted.container.querySelector<HTMLInputElement>('input[placeholder="Title"]')!,
      "New reference",
    );
    await clickButton(mounted.container, appCopy.en.detail.addReference);
    expect(updateIdea).toHaveBeenLastCalledWith(visibleIdea.id, {
      references: [
        pendingReference,
        visibleReference,
        { title: "New reference", url: "", memo: "" },
      ],
    });

    await changeInput(
      mounted.container.querySelector<HTMLInputElement>(
        `input[placeholder="${appCopy.en.detail.absolutePath}"]`,
      )!,
      "D:/new.mid",
    );
    await clickButton(mounted.container, appCopy.en.detail.addAsset);
    const lastUpdate = updateIdea.mock.calls[updateIdea.mock.calls.length - 1];
    expect(lastUpdate?.[1].assets).toEqual([
      pendingAsset,
      visibleAsset,
      expect.objectContaining({ type: "flp", path: "D:/new.mid" }),
    ]);

    await mounted.unmount();
  });

  it("edits an asset from the stored array while another asset is pending deletion", async () => {
    const pendingAsset = { id: "pending-asset", type: "midi" as const, path: "D:/pending.mid" };
    const visibleAsset = { id: "visible-asset", type: "midi" as const, path: "D:/visible.mid" };
    const visibleIdea = makeIdea({ assets: [visibleAsset] });
    const storedIdea = makeIdea({
      id: visibleIdea.id,
      assets: [pendingAsset, visibleAsset],
    });
    const updateIdea = vi.fn();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    tauriMocks.openPath.mockRejectedValueOnce(new Error("missing"));
    const mounted = await renderDetail(visibleIdea, {
      storedIdea,
      updateIdea,
      copy: appCopy.en,
      language: "en",
    });

    await clickButton(mounted.container, appCopy.en.common.open);
    await act(async () => Promise.resolve());

    expect(updateIdea).toHaveBeenCalledWith(visibleIdea.id, {
      assets: [pendingAsset, { ...visibleAsset, missing: true }],
    });
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    await mounted.unmount();
  });

  it("switches field placeholders and section labels with the selected language", async () => {
    const japanese = await renderDetail(makeIdea());
    expect(japanese.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.ja.detail.placeholders.genre}"]`)).not.toBeNull();
    expect(japanese.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.ja.detail.placeholders.mood}"]`)).not.toBeNull();
    expect(japanese.container.textContent).toContain(appCopy.ja.detail.assets);
    expect(japanese.container.querySelector(`textarea[aria-label="${appCopy.ja.detail.fields.nextAction}"]`)).toBeNull();
    await japanese.unmount();

    const english = await renderDetail(makeIdea(), { copy: appCopy.en, language: "en" });
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.genre}"]`)).not.toBeNull();
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.mood}"]`)).not.toBeNull();
    expect(english.container.textContent).toContain(appCopy.en.detail.assets);
    await english.unmount();
  });

  it("localizes the saved MIDI fallback and clipboard-unavailable toast", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const block = {
      id: "localized-block",
      summaryText: "Test progression",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
      startBar: 2,
      endBar: 5,
    };
    const idea = makeIdea({ progressionBlocks: [block] });
    const setToast = vi.fn();
    const japanese = await renderDetail(idea, { setToast });
    expect(japanese.container.textContent).toContain("採集したMIDI · 2–5小節");
    await clickButton(japanese.container, appCopy.ja.capture.copyProgression);
    expect(setToast).toHaveBeenLastCalledWith(appCopy.ja.detail.copyFailed);
    await japanese.unmount();

    const english = await renderDetail(idea, { copy: appCopy.en, language: "en" });
    expect(english.container.textContent).toContain("Captured MIDI · Bars 2–5");
    await english.unmount();
  });

  it("uses the Idea fallback key for progression practice state", async () => {
    const source: SavedProgressionBlock = {
      id: "effective-key-block",
      summaryText: "Fallback key practice",
      chords: [],
      tags: [],
      capturedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const practiced: SavedProgressionBlock = {
      ...source,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint(source, "C major"),
        confirmedLevel: 3,
      },
    };
    const mounted = await renderDetail(makeIdea({
      key: "C major",
      progressionBlocks: [practiced],
    }), {
      copy: appCopy.en,
      language: "en",
    });

    const badge = mounted.container.querySelector<HTMLElement>(
      "[data-practice-state]",
    );
    expect(badge?.getAttribute("data-practice-state")).toBe("confirmed");
    expect(badge?.textContent).toContain("L3");
    await mounted.unmount();
  });
  it.each([false, "pending"] as const)(
    "keeps add-form input intact for %s persistence",
    async (outcome) => {
      const updateIdea = vi.fn(() => outcome);
      const mounted = await renderDetail(makeIdea(), { updateIdea });

      const referenceTitle = mounted.container.querySelector<HTMLInputElement>(
        `input[placeholder="${appCopy.ja.detail.placeholders.title}"]`,
      )!;
      await changeInput(referenceTitle, "Keep reference draft");
      await clickButton(mounted.container, appCopy.ja.detail.addReference);
      expect(referenceTitle.value).toBe("Keep reference draft");

      const assetPath = mounted.container.querySelector<HTMLInputElement>(
        `input[placeholder="${appCopy.ja.detail.absolutePath}"]`,
      )!;
      await changeInput(assetPath, "D:/synthetic.mid");
      await clickButton(mounted.container, appCopy.ja.detail.addAsset);
      expect(assetPath.value).toBe("D:/synthetic.mid");
      await mounted.unmount();
    },
  );
});

async function renderDetail(
  idea: ReturnType<typeof makeIdea>,
  overrides: Partial<React.ComponentProps<typeof DetailView>> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailView
        idea={idea}
        updateIdea={vi.fn()}
        removeProgressionBlock={vi.fn()}
        analyzeMidiPath={vi.fn(async () => undefined)}
        requestDelete={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
        {...overrides}
      />,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

async function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  expect(valueSetter).toBeDefined();
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }));
  });
}
