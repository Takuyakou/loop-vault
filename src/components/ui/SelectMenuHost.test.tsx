// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectMenuHost } from "./SelectMenuHost";

/**
 * P25 V34: one host takes the opening of every `<select>` and draws the app's own list. These checks are the
 * design's (a)–(g); the real placement and the look are checked by `e2e/p25-v34-select-menu.spec.ts`.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.getElementById("lv-select-menu")?.remove();
});

async function mount(ui: ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

function field(): HTMLSelectElement {
  const element = container.querySelector("select");
  expect(element).not.toBeNull();
  return element!;
}

function menu(): HTMLElement | null {
  return document.getElementById("lv-select-menu");
}

/** P25 V35: a closed list is drawn for its leaving motion, so 「gone」 means after that (Presence's fallback). */
async function closed(timeoutMs = 900) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (menu() === null) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  expect(menu()).toBeNull();
}

function options(): HTMLElement[] {
  return [...(menu()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
}

async function mouseDown(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
}

async function press(key: string, target: Element = document.activeElement ?? document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

async function click(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The design's four-option field: its third option cannot be used. */
function Field({ onChange, from = "a" }: { readonly onChange: (value: string) => void; readonly from?: string }) {
  return (
    <>
      <SelectMenuHost />
      <select data-testid="field" aria-label="テスト" defaultValue={from} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
        <option value="c" disabled>Charlie</option>
        <option value="d">Delta</option>
      </select>
    </>
  );
}

describe("P25 V34 the in-app list of every select", () => {
  it("(a) opens on mousedown with every option and the chosen one marked", async () => {
    const onChange = vi.fn();
    await mount(<Field onChange={onChange} from="b" />);
    expect(menu()).toBeNull();
    await mouseDown(field());
    expect(menu()).not.toBeNull();
    expect(menu()!.getAttribute("role")).toBe("listbox");
    expect(menu()!.getAttribute("aria-label")).toBe("テスト");
    expect(options()).toHaveLength(4);
    expect(options().map((option) => option.textContent)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    expect(options().find((option) => option.dataset.value === "b")?.getAttribute("aria-selected")).toBe("true");
    expect(options().find((option) => option.dataset.value === "c")?.getAttribute("aria-disabled")).toBe("true");
    expect(field().getAttribute("aria-expanded")).toBe("true");
    expect(field().getAttribute("aria-controls")).toBe("lv-select-menu");
    // A second press on the same field closes the list again.
    await mouseDown(field());
    expect(field().getAttribute("aria-expanded")).toBeNull();
    await closed();
  });

  it("(b) chooses the pressed option once and closes", async () => {
    const onChange = vi.fn();
    await mount(<Field onChange={onChange} />);
    await mouseDown(field());
    await click(options()[1]!);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("b");
    expect(field().value).toBe("b");
    expect(field().getAttribute("aria-expanded")).toBeNull();
    await closed();
  });

  it("(c) opens with Enter, steps over the unusable option and takes Enter's choice", async () => {
    const onChange = vi.fn();
    await mount(<Field onChange={onChange} />);
    field().focus();
    await press("Enter", field());
    expect(menu()).not.toBeNull();
    await press("ArrowDown");
    await press("ArrowDown");
    expect(menu()!.getAttribute("aria-activedescendant")).toBe("lv-select-menu-option-3");
    await press("Enter");
    expect(onChange).toHaveBeenCalledWith("d");
    expect(field().value).toBe("d");
    await closed();
  });

  it("(d) Escape closes the list and the page's own keydown never hears it", async () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      await mount(<Field onChange={onChange} />);
      await mouseDown(field());
      expect(menu()).not.toBeNull();
      await press("Escape");
      expect(menu()?.getAttribute("data-presence")).toBe("exit");
      expect(outer).not.toHaveBeenCalled();
      await closed();
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("(e) Space never reaches the page while the list is open", async () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      await mount(<Field onChange={onChange} />);
      await mouseDown(field());
      await press(" ");
      expect(outer).not.toHaveBeenCalled();
      // Space takes the active option (Voice Loop's playback never starts).
      expect(field().value).toBe("a");
      await closed();
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("(f) leaves a multiple select alone", async () => {
    await mount(
      <>
        <SelectMenuHost />
        <select data-testid="many" aria-label="複数" multiple defaultValue={["a"]}>
          <option value="a">Alpha</option>
          <option value="b">Bravo</option>
        </select>
      </>,
    );
    await mouseDown(field());
    expect(menu()).toBeNull();
  });

  it("(g) closes on a pointer press outside the list", async () => {
    const onChange = vi.fn();
    await mount(<Field onChange={onChange} />);
    await mouseDown(field());
    expect(menu()).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    await closed();
  });
});
