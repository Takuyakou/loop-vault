// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { bottomSpaceFor, createNotificationStore, NotificationProvider, useReserveBottomSpace } from "./index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function BottomBar({ top }: { top: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useReserveBottomSpace(ref);
  return (
    <div
      ref={(element) => {
        (ref as { current: HTMLDivElement | null }).current = element;
        if (element) element.getBoundingClientRect = () => ({ top, bottom: window.innerHeight, height: window.innerHeight - top } as DOMRect);
      }}
    />
  );
}

describe("bottom space reservations", () => {
  it("measures only elements sitting on the bottom edge", () => {
    expect(bottomSpaceFor({ top: 800, bottom: 900, height: 100 }, 900)).toBe(100);
    expect(bottomSpaceFor({ top: 100, bottom: 200, height: 100 }, 900)).toBe(0);
    expect(bottomSpaceFor({ top: 900, bottom: 900, height: 0 }, 900)).toBe(0);
  });

  it("lifts the toast stack above a mounted bottom bar and drops the lift when it unmounts", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const store = createNotificationStore();
    const bottom = () => container.querySelector<HTMLElement>("[data-notification-stack]")!.style.bottom;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

    act(() => root.render(<NotificationProvider store={store}><BottomBar top={792} /></NotificationProvider>));
    expect(bottom()).toContain("+ 108px +");
    act(() => root.render(<NotificationProvider store={store} />));
    expect(bottom()).toContain("+ 0px +");
    act(() => root.unmount());
    container.remove();
  });
});
