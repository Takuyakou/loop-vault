// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificationStore, NotificationProvider, useNotify, type NotificationStore } from "./index";
import { Modal } from "../Modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: NotificationStore;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  store = createNotificationStore();
  act(() => root.render(<NotificationProvider store={store} closeLabel="閉じる" />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const toasts = () => [...container.querySelectorAll<HTMLElement>("[data-toast-tone]")];
const notify = (input: Parameters<NotificationStore["notify"]>[0]) => act(() => { store.notify(input); });

describe("P8.9 notifications", () => {
  it("announces normal feedback politely inside the bottom-right stack and closes on demand", () => {
    notify({ message: "保存しました", tone: "success" });
    const stack = container.querySelector("[data-notification-stack]")!;
    expect(stack.className).toContain("lv-toast-stack");
    const [toast] = toasts();
    expect(toast.dataset.toastTone).toBe("success");
    expect(toast.closest('[aria-live="polite"]')).not.toBeNull();
    expect(toast.getAttribute("role")).toBeNull();
    act(() => toast.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]')!.click());
    expect(toasts()).toHaveLength(0);
  });

  it("announces errors assertively, keeps them until closed, and runs the one action", () => {
    const retry = vi.fn();
    notify({ message: "保存できませんでした", tone: "error", action: { label: "もう一度", onClick: retry } });
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.querySelector(".lv-toast-bar")).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(toasts()).toHaveLength(1);
    act(() => [...alert.querySelectorAll("button")].find((button) => button.textContent === "もう一度")!.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(toasts()).toHaveLength(0);
  });

  it("keeps at most three and drops the oldest first", () => {
    for (const message of ["1", "2", "3", "4"]) notify({ message });
    expect(toasts().map((toast) => toast.textContent?.trim().charAt(0))).toEqual(["2", "3", "4"]);
  });

  it("disappears after about four seconds and pauses while hovered or focused", () => {
    notify({ message: "試聴しました" });
    act(() => vi.advanceTimersByTime(3000));
    const [toast] = toasts();
    act(() => { toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })); });
    expect(toast.dataset.paused).toBe("true");
    act(() => vi.advanceTimersByTime(10_000));
    expect(toasts()).toHaveLength(1);
    act(() => { toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); });
    act(() => toast.querySelector<HTMLButtonElement>("button")!.focus());
    expect(toast.dataset.paused).toBe("true");
    act(() => toast.querySelector<HTMLButtonElement>("button")!.blur());
    act(() => vi.advanceTimersByTime(999));
    expect(toasts()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2));
    expect(toasts()).toHaveLength(0);
  });

  it("moves the stack to the top center while a dialog is open", () => {
    const stack = () => container.querySelector("[data-notification-stack]")!;
    act(() => root.render(<NotificationProvider store={store}><Modal ariaLabel="設定" onClose={() => undefined}><button type="button">ok</button></Modal></NotificationProvider>));
    expect(stack().className).toContain("lv-toast-stack-dialog");
    act(() => root.render(<NotificationProvider store={store} />));
    expect(stack().className).not.toContain("lv-toast-stack-dialog");
  });

  it("lets any component under the provider notify", () => {
    function Child() {
      const send = useNotify();
      return <button type="button" onClick={() => send({ message: "開きます" })}>send</button>;
    }
    act(() => root.render(<NotificationProvider store={store}><Child /></NotificationProvider>));
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(toasts()[0].textContent).toContain("開きます");
  });
});
