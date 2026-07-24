// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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
  it("collects a Hold reason before requesting the transition", async () => {
    const idea = makeIdea({ chordMemo: "Keep this memo" });
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const updateIdea = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DetailView
          idea={idea}
          updateIdea={updateIdea}
          updateNextAction={vi.fn()}
          removeProgressionBlock={vi.fn()}
          analyzeMidiPath={vi.fn(async () => undefined)}
          transitionIdea={transitionIdea}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    await selectStatusAction(container, "保留");
    expect(transitionIdea).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("保留: 理由（任意）");

    const reason = document.querySelector<HTMLTextAreaElement>("#status-reason");
    expect(reason).not.toBeNull();
    if (reason) {
      await changeTextarea(reason, "Arrangement direction is undecided");
      expect(reason.value).toBe("Arrangement direction is undecided");
    }
    expect(document.body.textContent).toContain("34/500");
    await clickButton(document.body, "保留にする");

    expect(transitionIdea).toHaveBeenCalledWith(
      idea.id,
      "hold",
      expect.any(Date),
      { reason: "Arrangement direction is undecided" },
    );
    expect(updateIdea).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });

  it("offers an optional reason form for Abandoned", async () => {
    const idea = makeIdea();
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DetailView
          idea={idea}
          updateIdea={vi.fn()}
          updateNextAction={vi.fn()}
          removeProgressionBlock={vi.fn()}
          analyzeMidiPath={vi.fn(async () => undefined)}
          transitionIdea={transitionIdea}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    await selectStatusAction(container, "没");
    expect(document.body.textContent).toContain("没: 理由（任意）");
    await clickButton(document.body, "没にする");
    expect(transitionIdea).toHaveBeenCalledWith(
      idea.id,
      "abandoned",
      expect.any(Date),
      { reason: "" },
    );
    await act(async () => root.unmount());
    container.remove();
  });

  it.each([
    {
      status: "hold",
      prevStatus: "arrange",
      actionLabel: "展開へ復帰",
    },
    {
      status: "abandoned",
      prevStatus: "loop",
      actionLabel: "ループへ復帰",
    },
  ] as const)(
    "restores $status through moveStatus to prevStatus",
    async ({ status, prevStatus, actionLabel }) => {
      const idea = makeIdea({ status, prevStatus });
      const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <DetailView
            idea={idea}
            updateIdea={vi.fn()}
            updateNextAction={vi.fn()}
            removeProgressionBlock={vi.fn()}
            analyzeMidiPath={vi.fn(async () => undefined)}
            transitionIdea={transitionIdea}
            requestDelete={vi.fn()}
            setToast={vi.fn()}
            copy={appCopy.ja}
            language="ja"
          />,
        );
      });

      await selectStatusAction(container, actionLabel);
      expect(transitionIdea).not.toHaveBeenCalled();
      await clickButton(document.body, "持ち越して移動");

      expect(transitionIdea).toHaveBeenCalledWith(
        idea.id,
        prevStatus,
        expect.any(Date),
        {},
      );
      await act(async () => root.unmount());
      container.remove();
    },
  );

  it.each([
    { kind: "missing", prevStatus: undefined },
    { kind: "invalid", prevStatus: "abandoned" as const },
  ])("offers only the Idea repair for $kind prevStatus", async ({ prevStatus }) => {
    const idea = makeIdea({ status: "hold", prevStatus });
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const mounted = await renderDetail(idea, { transitionIdea });

    await clickButton(mounted.container, "その他");
    const menuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .map((item) => item.textContent);
    expect(menuItems).toEqual(["Ideaへ復帰"]);

    await clickButton(mounted.container, "Ideaへ復帰");
    expect(transitionIdea).not.toHaveBeenCalled();
    await clickButton(document.body, "持ち越して移動");
    expect(transitionIdea).toHaveBeenCalledWith(
      idea.id,
      "idea",
      expect.any(Date),
      {},
    );
    await mounted.unmount();
  });

  it("shows a saved reason in status history without changing the memo", () => {
    const markup = renderToStaticMarkup(
      <DetailView
        idea={makeIdea({
          chordMemo: "Original chord memo",
          statusHistory: [
            {
              status: "hold",
              at: "2026-07-16T00:00:00.000Z",
              reason: "Arrangement direction is undecided",
            },
          ],
        })}
        updateIdea={vi.fn()}
        updateNextAction={vi.fn()}
        removeProgressionBlock={vi.fn()}
        analyzeMidiPath={vi.fn(async () => undefined)}
        transitionIdea={vi.fn(() => ({ ok: false as const, error: { code: "invalid-jump" as const, message: "invalid" } }))}
        requestDelete={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
      />,
    );

    expect(markup).toContain("Arrangement direction is undecided");
    expect(markup).toContain("Original chord memo");
  });

  it("asks whether to carry the Next Action before a pipeline transition", async () => {
    const idea = makeIdea({ nextAction: { text: "Write the bass", updatedAt: "2026-07-15T00:00:00.000Z" } });
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const updateNextAction = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DetailView
          idea={idea}
          updateIdea={vi.fn()}
          updateNextAction={updateNextAction}
          removeProgressionBlock={vi.fn()}
          analyzeMidiPath={vi.fn(async () => undefined)}
          transitionIdea={transitionIdea}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    await clickButton(container, "ループへ進む");
    expect(transitionIdea).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain("移動後も次の一手を持ち越しますか？");
    expect(document.activeElement?.textContent).toBe(appCopy.ja.common.cancel);

    await clickButton(document.body, appCopy.ja.common.cancel);
    expect(transitionIdea).not.toHaveBeenCalled();
    expect(updateNextAction).not.toHaveBeenCalled();

    await clickButton(container, "ループへ進む");

    await clickButton(document.body, "空にして移動");
    expect(updateNextAction).toHaveBeenCalledWith(idea.id, "", expect.any(Date));
    expect(transitionIdea).toHaveBeenCalledWith(idea.id, "loop", expect.any(Date), {});
    expect(transitionIdea.mock.invocationCallOrder[0]).toBeLessThan(
      updateNextAction.mock.invocationCallOrder[0]!,
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the Next Action when carrying it into a valid transition", async () => {
    const idea = makeIdea({ nextAction: { text: "Write the bass", updatedAt: "2026-07-15T00:00:00.000Z" } });
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const updateNextAction = vi.fn();
    const mounted = await renderDetail(idea, { transitionIdea, updateNextAction });

    await clickButton(mounted.container, "ループへ進む");
    await clickButton(document.body, "持ち越して移動");

    expect(transitionIdea).toHaveBeenCalledWith(idea.id, "loop", expect.any(Date), {});
    expect(updateNextAction).not.toHaveBeenCalled();
    await mounted.unmount();
  });

  it("does not clear the Next Action when the requested transition fails", async () => {
    const idea = makeIdea({ nextAction: { text: "Write the bass", updatedAt: "2026-07-15T00:00:00.000Z" } });
    const transitionIdea = vi.fn(() => ({
      ok: false as const,
      error: { code: "invalid-jump" as const, message: "invalid" },
    }));
    const updateNextAction = vi.fn();
    const setToast = vi.fn();
    const mounted = await renderDetail(idea, { transitionIdea, updateNextAction, setToast });

    await clickButton(mounted.container, "ループへ進む");
    await clickButton(document.body, "空にして移動");

    expect(transitionIdea).toHaveBeenCalledTimes(1);
    expect(updateNextAction).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith("invalid");
    await mounted.unmount();
  });

  it("routes completion removal through the menu and Next Action confirmation", async () => {
    const idea = makeIdea({
      status: "done",
      completedAt: "2026-07-01T00:00:00.000Z",
      nextAction: {
        text: "Prepare the remaster",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    });
    const transitionIdea = vi.fn(() => ({ ok: true as const, idea }));
    const updateNextAction = vi.fn();
    const mounted = await renderDetail(idea, { transitionIdea, updateNextAction });

    expect([...mounted.container.querySelectorAll("button")]
      .some((button) => button.textContent === "完成を解除してミックスへ")).toBe(false);
    await selectStatusAction(mounted.container, "完成を解除してミックスへ");
    expect(transitionIdea).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain("移動後も次の一手を持ち越しますか？");

    await clickButton(document.body, "持ち越して移動");
    expect(transitionIdea).toHaveBeenCalledWith(
      idea.id,
      "mix",
      expect.any(Date),
      {},
    );
    expect(updateNextAction).not.toHaveBeenCalled();
    await mounted.unmount();
  });

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
    expect(appCopy.ja.detail.nextActionPlaceholders).toContain(
      japanese.container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${appCopy.ja.detail.fields.nextAction}"]`)?.placeholder,
    );
    await japanese.unmount();

    const english = await renderDetail(makeIdea(), { copy: appCopy.en, language: "en" });
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.genre}"]`)).not.toBeNull();
    expect(english.container.querySelector<HTMLInputElement>(`input[placeholder="${appCopy.en.detail.placeholders.mood}"]`)).not.toBeNull();
    expect(english.container.textContent).toContain(appCopy.en.detail.assets);
    expect(appCopy.en.detail.nextActionPlaceholders).toContain(
      english.container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${appCopy.en.detail.fields.nextAction}"]`)?.placeholder,
    );
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
        updateNextAction={vi.fn()}
        removeProgressionBlock={vi.fn()}
        analyzeMidiPath={vi.fn(async () => undefined)}
        transitionIdea={vi.fn(() => ({ ok: true as const, idea }))}
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

async function selectStatusAction(container: HTMLElement, label: string) {
  await clickButton(container, appCopy.ja.detail.statusControl.other);
  await clickButton(container, label);
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  expect(textarea.isConnected).toBe(true);
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  expect(valueSetter).toBeDefined();
  await act(async () => {
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }));
  });
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
