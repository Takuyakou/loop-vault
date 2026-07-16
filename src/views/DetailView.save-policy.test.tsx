// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeIdea } from "../domain/testFactory";
import type { SongIdea } from "../domain/types";
import { appCopy } from "../i18n";
import { DetailView } from "./DetailView";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DetailView save policy", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps short fields local until blur or Enter and flashes for 600ms", async () => {
    const idea = makeIdea({ title: "Original" });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const title = field<HTMLInputElement>(mounted.container, "Edit title");

    await focus(title);
    await changeValue(title, "  Changed title  ");
    expect(updateIdea).not.toHaveBeenCalled();

    await blur(title);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { title: "Changed title" });
    expect(mounted.container.querySelector('[aria-label="Saved"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(599));
    expect(mounted.container.querySelector('[aria-label="Saved"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(mounted.container.querySelector('[aria-label="Saved"]')).toBeNull();

    updateIdea.mockClear();
    await focus(title);
    await blur(title);
    expect(updateIdea).not.toHaveBeenCalled();

    await focus(title);
    await changeValue(title, "Enter title");
    await keyDown(title, "Enter");
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { title: "Enter title" });
    expect(document.activeElement).not.toBe(title);
    await mounted.unmount();
  });

  it("does not save Enter or blur during IME composition", async () => {
    const idea = makeIdea({ title: "Original" });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const title = field<HTMLInputElement>(mounted.container, "Edit title");

    await focus(title);
    await act(async () => title.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await changeValue(title, "入力中");
    await keyDown(title, "Enter", { isComposing: true });
    await keyDown(title, "Enter", { keyCode: 229 });
    expect(updateIdea).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(title);

    await blur(title);
    expect(updateIdea).not.toHaveBeenCalled();
    await act(async () => title.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "入力中" })));
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { title: "入力中" });
    await mounted.unmount();
  });

  it("accepts an empty BPM, rejects invalid numbers, and does not emit no-op saves", async () => {
    const idea = makeIdea({ bpm: 120 });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const bpm = field<HTMLInputElement>(mounted.container, "Edit BPM");

    await focus(bpm);
    await changeValue(bpm, "");
    await blur(bpm);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { bpm: undefined });

    updateIdea.mockClear();
    await mounted.render({ ...idea, bpm: undefined });
    await focus(bpm);
    await changeValue(bpm, "39");
    await blur(bpm);
    expect(updateIdea).not.toHaveBeenCalled();
    expect(bpm.getAttribute("aria-invalid")).toBe("true");

    await focus(bpm);
    await changeValue(bpm, "140");
    await keyDown(bpm, "Enter");
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { bpm: 140 });
    await mounted.unmount();
  });

  it("syncs external changes while idle without overwriting an active draft", async () => {
    const idea = makeIdea({ title: "Original" });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const title = field<HTMLInputElement>(mounted.container, "Edit title");

    await focus(title);
    await changeValue(title, "Local draft");
    await mounted.render({ ...idea, title: "External update" });
    expect(title.value).toBe("Local draft");

    await blur(title);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { title: "Local draft" });
    await mounted.render({ ...idea, title: "Idle update" });
    expect(title.value).toBe("Idle update");

    await focus(title);
    await changeValue(title, "Discard on switch");
    const otherIdea = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Other idea",
    });
    await mounted.render(otherIdea);
    expect(title.value).toBe("Other idea");
    await mounted.unmount();
  });

  it("resets an active save flash and its timer when the idea changes", async () => {
    const idea = makeIdea({ title: "Original" });
    const mounted = await mountDetail(idea);
    const title = field<HTMLInputElement>(mounted.container, "Edit title");

    await focus(title);
    await changeValue(title, "Saved old title");
    await blur(title);
    expect(mounted.container.querySelector('[aria-label="Saved"]')).not.toBeNull();

    await mounted.render(makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Other idea",
    }));
    expect(mounted.container.querySelector('[aria-label="Saved"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(600));
    expect(mounted.container.querySelector('[aria-label="Saved"]')).toBeNull();
    await mounted.unmount();
  });

  it("debounces memo saves and flushes on blur, idea switch, and unmount", async () => {
    const idea = makeIdea({ chordMemo: "Original memo" });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const memo = field<HTMLTextAreaElement>(mounted.container, "Edit chord progression memo");

    await focus(memo);
    await changeValue(memo, "Debounced memo");
    await act(async () => vi.advanceTimersByTime(499));
    expect(updateIdea).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { chordMemo: "Debounced memo" });

    updateIdea.mockClear();
    await changeValue(memo, "Blurred memo");
    await blur(memo);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { chordMemo: "Blurred memo" });

    updateIdea.mockClear();
    await focus(memo);
    await changeValue(memo, "Flush old idea");
    const otherIdea = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      chordMemo: "Other memo",
    });
    await mounted.render(otherIdea);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { chordMemo: "Flush old idea" });
    expect(memo.value).toBe("Other memo");

    updateIdea.mockClear();
    await focus(memo);
    await changeValue(memo, "Flush unmount");
    await mounted.unmount();
    expect(updateIdea).toHaveBeenCalledWith(otherIdea.id, { chordMemo: "Flush unmount" });
  });

  it("force-flushes a composing memo to the old idea on switch and on unmount", async () => {
    const idea = makeIdea({ chordMemo: "Original memo" });
    const updateIdea = vi.fn();
    const mounted = await mountDetail(idea, { updateIdea });
    const memo = field<HTMLTextAreaElement>(mounted.container, "Edit chord progression memo");

    await focus(memo);
    await act(async () => memo.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await changeValue(memo, "Composing old idea");
    const otherIdea = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      chordMemo: "Other memo",
    });
    await mounted.render(otherIdea);
    expect(updateIdea).toHaveBeenCalledTimes(1);
    expect(updateIdea).toHaveBeenCalledWith(idea.id, { chordMemo: "Composing old idea" });
    expect(memo.value).toBe("Other memo");

    updateIdea.mockClear();
    await focus(memo);
    await act(async () => memo.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await changeValue(memo, "Composing before unmount");
    await mounted.unmount();
    expect(updateIdea).toHaveBeenCalledTimes(1);
    expect(updateIdea).toHaveBeenCalledWith(otherIdea.id, {
      chordMemo: "Composing before unmount",
    });
  });

  it("saves Next Action on Enter and completes it only with the explicit button", async () => {
    const idea = makeIdea({
      nextAction: { text: "Existing step", updatedAt: "2026-07-15T00:00:00.000Z" },
    });
    const updateNextAction = vi.fn();
    const mounted = await mountDetail(idea, { updateNextAction });
    const nextAction = field<HTMLTextAreaElement>(mounted.container, "Edit Next Action");

    await focus(nextAction);
    await blur(nextAction);
    expect(updateNextAction).not.toHaveBeenCalled();

    await focus(nextAction);
    await changeValue(nextAction, "New step");
    await keyDown(nextAction, "Enter");
    expect(updateNextAction).toHaveBeenCalledWith(idea.id, "New step", expect.any(Date));
    expect(document.activeElement).not.toBe(nextAction);

    updateNextAction.mockClear();
    await focus(nextAction);
    await changeValue(nextAction, "Dirty step to complete");
    const doneButton = getButton(mounted.container, appCopy.en.common.done);
    await focus(doneButton);
    expect(updateNextAction).not.toHaveBeenCalled();
    await act(async () => doneButton.click());
    expect(updateNextAction).toHaveBeenCalledTimes(1);
    expect(updateNextAction).toHaveBeenCalledWith(idea.id, "", expect.any(Date));
    await mounted.unmount();
  });
});

async function mountDetail(
  initialIdea: SongIdea,
  overrides: Partial<React.ComponentProps<typeof DetailView>> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (idea: SongIdea) => {
    await act(async () => root.render(
      <DetailView
        idea={idea}
        updateIdea={vi.fn()}
        updateNextAction={vi.fn()}
        removeProgressionBlock={vi.fn()}
        analyzeMidiPath={vi.fn(async () => undefined)}
        transitionIdea={vi.fn(() => ({ ok: true as const, idea }))}
        requestDelete={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.en}
        language="en"
        {...overrides}
      />,
    ));
  };
  await render(initialIdea);
  return {
    container,
    render,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function field<T extends HTMLInputElement | HTMLTextAreaElement>(container: HTMLElement, label: string): T {
  const element = container.querySelector<T>(`[aria-label="${label}"]`);
  expect(element).not.toBeNull();
  return element!;
}

async function focus(element: HTMLElement) {
  await act(async () => element.focus());
}

async function blur(element: HTMLElement) {
  await act(async () => element.blur());
}

async function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}

async function keyDown(
  element: HTMLElement,
  key: string,
  options: { isComposing?: boolean; keyCode?: number } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    isComposing: options.isComposing,
  });
  if (options.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: options.keyCode });
  }
  await act(async () => element.dispatchEvent(event));
}

function getButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  return button!;
}
