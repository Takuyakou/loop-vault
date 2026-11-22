// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalBpmField } from "./GlobalBpmField";
import { GlobalBpmProvider, useAnnounceSongBpm, useGlobalBpm } from "./GlobalBpmProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let setBpmFromOutside: (bpm: number) => void = () => undefined;

function Setter({ start }: { start?: number }) {
  const { setBpm } = useGlobalBpm();
  setBpmFromOutside = setBpm;
  useEffect(() => { if (start !== undefined) setBpm(start); }, [setBpm, start]);
  return null;
}
function Song({ bpm }: { bpm: number }) {
  useAnnounceSongBpm(bpm);
  return null;
}

async function render(options: { start?: number; song?: number } = {}) {
  await act(async () => root.render(
    <GlobalBpmProvider>
      <Setter start={options.start} />
      {options.song !== undefined ? <Song bpm={options.song} /> : null}
      <GlobalBpmField />
      <button type="button" data-testid="outside">outside</button>
    </GlobalBpmProvider>,
  ));
}

const q = <T extends Element = HTMLElement>(selector: string) => host.querySelector<T>(selector);
const value = () => q<HTMLDivElement>("[data-testid='global-bpm-value']")!;
const shown = () => Number(value().getAttribute("aria-valuenow"));
const popover = () => q("[data-testid='global-bpm-popover']");
const presetButton = (label: string) => Array.from(popover()!.querySelectorAll("button")).find(button => button.textContent === label)!;

function pointer(type: string, clientY: number, target: Element = value()) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}
async function press(y = 100) {
  await act(async () => { pointer("pointerdown", y); pointer("pointerup", y); });
}
async function drag(fromY: number, toY: number) {
  await act(async () => {
    pointer("pointerdown", fromY);
    pointer("pointermove", toY);
    pointer("pointerup", toY);
  });
}
async function wheel(deltaY: number, shiftKey = false) {
  const event = new WheelEvent("wheel", { deltaY, shiftKey, bubbles: true, cancelable: true });
  await act(async () => { value().dispatchEvent(event); });
  return event;
}
async function key(target: Element, keyName: string, shiftKey = false) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, shiftKey, bubbles: true, cancelable: true })); });
}
async function click(target: Element) {
  await act(async () => { (target as HTMLElement).click(); });
}
async function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function doubleClick() {
  await act(async () => { value().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
  await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(undefined))); });
}
const input = () => q<HTMLInputElement>("[data-testid='global-bpm-input']");
const nextFrame = () => act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(undefined))); });

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it("shows the value in aria-valuenow and as the number", async () => {
  await render();
  expect(shown()).toBe(120);
  expect(value().textContent).toContain("120");
  expect(value().getAttribute("role")).toBe("spinbutton");
  expect(value().getAttribute("aria-valuemin")).toBe("30");
  expect(value().getAttribute("aria-valuemax")).toBe("240");
});

it("wheel up/down is +1/−1, with Shift ±5, and the page does not scroll", async () => {
  await render();
  const up = await wheel(-100);
  expect(shown()).toBe(121);
  expect(up.defaultPrevented).toBe(true);
  await wheel(100);
  expect(shown()).toBe(120);
  await wheel(-100, true);
  expect(shown()).toBe(125);
  await wheel(100, true);
  expect(shown()).toBe(120);
});

it("the wheel stops at 30 and 240", async () => {
  await render({ start: 30 });
  await wheel(100);
  expect(shown()).toBe(30);
  await act(async () => setBpmFromOutside(240));
  await wheel(-100);
  expect(shown()).toBe(240);
});

it("dragging: nothing under 3px, then +1 per 4px up and −1 per 4px down from the start", async () => {
  await render();
  await act(async () => { pointer("pointerdown", 100); pointer("pointermove", 98); });
  expect(shown()).toBe(120);
  await act(async () => { pointer("pointermove", 80); });
  expect(shown()).toBe(125);
  await act(async () => { pointer("pointermove", 120); pointer("pointerup", 120); });
  expect(shown()).toBe(115);
});

it("a drag that moved the value does not open the list", async () => {
  await render();
  await drag(100, 60);
  expect(shown()).toBe(130);
  expect(popover()).toBeNull();
  expect(value().hasAttribute("data-open")).toBe(false);
});

it("a press without moving opens and closes the list", async () => {
  await render();
  await press();
  expect(popover()).not.toBeNull();
  expect(value().getAttribute("data-open")).toBe("true");
  expect(value().hasAttribute("aria-expanded")).toBe(false);
  expect(value().getAttribute("aria-haspopup")).toBe("dialog");
  await press();
  expect(popover()).toBeNull();
});

it("double-click: an input with the number selected; Enter sets it and the cursor goes back to the value", async () => {
  await render();
  await doubleClick();
  const field = input()!;
  expect(field).not.toBeNull();
  expect(field.value).toBe("120");
  expect(document.activeElement).toBe(field);
  expect(field.selectionStart).toBe(0);
  expect(field.selectionEnd).toBe(3);
  await typeInto(field, "97");
  await key(field, "Enter");
  await nextFrame();
  expect(shown()).toBe(97);
  expect(input()).toBeNull();
  expect(document.activeElement).toBe(value());
});

it("typing: blur sets the number, text that is not a number keeps the old value, Esc cancels", async () => {
  await render();
  await doubleClick();
  await typeInto(input()!, "88");
  await act(async () => { input()!.blur(); });
  await nextFrame();
  expect(shown()).toBe(88);

  await doubleClick();
  await typeInto(input()!, "abc");
  await key(input()!, "Enter");
  await nextFrame();
  expect(shown()).toBe(88);

  await doubleClick();
  await typeInto(input()!, "150");
  await key(input()!, "Escape");
  await nextFrame();
  expect(shown()).toBe(88);
  expect(input()).toBeNull();
  expect(document.activeElement).toBe(value());
});

it("while typing, the wheel, a drag and ↑↓ do not change the value", async () => {
  await render();
  await doubleClick();
  await wheel(-100);
  await drag(100, 40);
  await key(input()!, "ArrowUp");
  expect(shown()).toBe(120);
  expect(input()).not.toBeNull();
});

it("keys on the value: ↑↓ ±1, Shift ±5, PageUp/PageDown ±10, Home 30, End 240", async () => {
  await render();
  await key(value(), "ArrowUp");
  expect(shown()).toBe(121);
  await key(value(), "ArrowDown");
  expect(shown()).toBe(120);
  await key(value(), "ArrowUp", true);
  expect(shown()).toBe(125);
  await key(value(), "ArrowDown", true);
  expect(shown()).toBe(120);
  await key(value(), "PageUp");
  expect(shown()).toBe(130);
  await key(value(), "PageDown");
  expect(shown()).toBe(120);
  await key(value(), "Home");
  expect(shown()).toBe(30);
  await key(value(), "End");
  expect(shown()).toBe(240);
});

it("Enter and Space on the value open and close the list", async () => {
  await render();
  await key(value(), "Enter");
  expect(popover()).not.toBeNull();
  await key(value(), "Enter");
  expect(popover()).toBeNull();
  await key(value(), " ");
  expect(popover()).not.toBeNull();
  await key(value(), " ");
  expect(popover()).toBeNull();
});

it("a preset sets the value, closes the list and puts the cursor on the value; only the current one is pressed", async () => {
  await render();
  await press();
  const pressed = () => Array.from(popover()!.querySelectorAll("[aria-pressed='true']")).map(button => button.textContent);
  expect(pressed()).toEqual(["120"]);
  await click(presetButton("80"));
  expect(shown()).toBe(80);
  expect(popover()).toBeNull();
  expect(document.activeElement).toBe(value());
  await press();
  expect(pressed()).toEqual(["80"]);
  for (const preset of ["60", "100", "140"]) {
    await click(presetButton(preset));
    expect(shown()).toBe(Number(preset));
    await press();
  }
});

it("−5 and +5 change by 5 and keep the list open", async () => {
  await render();
  await press();
  await click(popover()!.querySelector("[aria-label='5 上げる']")!);
  expect(shown()).toBe(125);
  expect(popover()).not.toBeNull();
  await click(popover()!.querySelector("[aria-label='5 下げる']")!);
  await click(popover()!.querySelector("[aria-label='5 下げる']")!);
  expect(shown()).toBe(115);
  expect(popover()).not.toBeNull();
});

it("Esc closes the list, returns the cursor and does not reach the window", async () => {
  await render();
  const seen = vi.fn();
  window.addEventListener("keydown", seen);
  await press();
  await key(presetButton("60"), "Escape");
  window.removeEventListener("keydown", seen);
  expect(popover()).toBeNull();
  expect(document.activeElement).toBe(value());
  expect(seen).not.toHaveBeenCalled();
});

it("a press outside the field closes the list", async () => {
  await render();
  await press();
  await act(async () => { pointer("pointerdown", 0, q("[data-testid='outside']")!); });
  expect(popover()).toBeNull();
});

it("no song button without a song BPM, or when it equals the value", async () => {
  await render();
  expect(q("[data-testid='global-bpm-song']")).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  await render({ song: 120 });
  expect(q("[data-testid='global-bpm-song']")).toBeNull();
});

it("「曲 100」 sets the value to the song's and goes away", async () => {
  await render({ song: 100 });
  const song = q<HTMLButtonElement>("[data-testid='global-bpm-song']")!;
  expect(song.textContent).toBe("曲 100");
  expect(song.getAttribute("aria-label")).toBe("曲の BPM 100 に合わせる");
  await click(song);
  expect(shown()).toBe(100);
  expect(q("[data-testid='global-bpm-song']")).toBeNull();
});
