// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { DetailView } from "./DetailView";

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

    await clickButton(container, "保留");
    expect(transitionIdea).not.toHaveBeenCalled();
    expect(container.textContent).toContain("保留: 理由（任意）");

    const reason = container.querySelector<HTMLTextAreaElement>("#status-reason");
    expect(reason).not.toBeNull();
    if (reason) {
      await changeTextarea(reason, "Arrangement direction is undecided");
      expect(reason.value).toBe("Arrangement direction is undecided");
    }
    expect(container.textContent).toContain("34/500");
    await clickButton(container, "保留にする");

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

    await clickButton(container, "没");
    expect(container.textContent).toContain("没: 理由（任意）");
    await clickButton(container, "没にする");
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
    { status: "hold", label: "保留" },
    { status: "abandoned", label: "没" },
  ] as const)(
    "ignores the current $status status button",
    async ({ status, label }) => {
      const idea = makeIdea({ status });
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

      await clickButton(container, label);

      expect(container.querySelector("#status-reason")).toBeNull();
      expect(transitionIdea).not.toHaveBeenCalled();
      await act(async () => root.unmount());
      container.remove();
    },
  );

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
});

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
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
