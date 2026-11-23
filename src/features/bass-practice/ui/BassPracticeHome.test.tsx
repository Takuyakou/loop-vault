// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BassPracticeHome, type BassHomeMode, type BassPracticeHomeProps } from "./BassPracticeHome";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

const WEEK = ["水", "木", "金", "土", "日", "月", "今日"] as const;
const COUNTS = [2, 4, 0, 1, 6, 3, 2];

function props(overrides: Partial<BassPracticeHomeProps> = {}): BassPracticeHomeProps {
  return {
    modes: ["degree", "rhythm", "bassline", "root-motion", "midi"],
    instrument: { stringCount: 4, handedness: "right", fretRange: { min: 0, max: 12 } },
    week: WEEK.map((label, index) => ({ label, count: COUNTS[index]! })),
    onInstrumentChange: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  };
}

async function mount(overrides: Partial<BassPracticeHomeProps> = {}) {
  const merged = props(overrides);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<BassPracticeHome {...merged} />));
  return { container: host, props: merged };
}

const cards = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-testid='bass-home-card']")];
const card = (container: HTMLElement, mode: BassHomeMode) => container.querySelector<HTMLElement>(`[data-testid='bass-home-card'][data-mode='${mode}']`)!;
const group = (container: HTMLElement, label: string) => container.querySelector<HTMLElement>(`[role='group'][aria-label='${label}']`)!;
const groupButtons = (container: HTMLElement, label: string) => [...group(container, label).querySelectorAll<HTMLButtonElement>("button")];

describe("the Bass Practice home (P23-25a)", () => {
  it("H1 lists the five practices in the order the screen shows them", async () => {
    const { container } = await mount();
    expect(cards(container)).toHaveLength(5);
    expect(cards(container).map((element) => element.getAttribute("data-mode")))
      .toEqual(["degree", "rhythm", "root-motion", "bassline", "midi"]);
    expect(cards(container).map((element) => element.querySelector(".lv-bh-card-name")?.textContent))
      .toEqual(["度数", "リズム", "ルートの動き", "コード進行のベース", "MIDI のベースライン"]);
  });

  it("H2 opens the practice whose card was pressed", async () => {
    const onOpen = vi.fn();
    const { container } = await mount({ onOpen });
    for (const mode of ["degree", "rhythm", "root-motion", "bassline", "midi"] as const) {
      await act(async () => card(container, mode).click());
    }
    expect(onOpen.mock.calls.map((call) => call[0]))
      .toEqual(["degree", "rhythm", "root-motion", "bassline", "midi"]);
    expect(onOpen).toHaveBeenCalledTimes(5);
  });

  it("H3 draws only the practices that are switched on", async () => {
    const two = await mount({ modes: ["degree", "rhythm"] });
    expect(cards(two.container)).toHaveLength(2);
    expect(two.container.textContent).not.toContain("弾いて確かめる");
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const midiOnly = await mount({ modes: ["midi"] });
    expect(cards(midiOnly.container)).toHaveLength(1);
    expect(midiOnly.container.textContent).not.toContain("聴いてまねる");
  });

  it("H3b has no 「聴いてまねる」 heading and no empty top box; 「弾いて確かめる」 stays, with every practice on", async () => {
    const { container } = await mount({ modes: ["degree", "rhythm", "root-motion", "bassline", "midi"] });
    expect(cards(container)).toHaveLength(5);
    expect(container.textContent).not.toContain("聴いてまねる");
    expect(container.querySelectorAll(".lv-bh-top, .lv-bh-heading")).toHaveLength(0);
    expect([...container.querySelectorAll(".lv-bh-group")].map((element) => element.textContent)).toEqual(["弾いて確かめる"]);
  });

  it("H4 shows the last seven days and the last time for a practice", async () => {
    const { container } = await mount({
      info: { degree: { week: [false, true, true, false, true, false, true], lastLabel: "今日" } },
    });
    const days = [...card(container, "degree").querySelectorAll("[data-testid='bass-home-card-week'] i")];
    expect(days).toHaveLength(7);
    expect(days.flatMap((day, index) => (day.hasAttribute("data-on") ? [index + 1] : []))).toEqual([2, 3, 5, 7]);
    expect(card(container, "degree").querySelector("[data-testid='bass-home-card-week']")?.getAttribute("aria-label"))
      .toBe("この 7 日のうち 4 日");
    expect(card(container, "degree").textContent).toContain("最後: 今日");
  });

  it("H5 says a practice was never played", async () => {
    const { container } = await mount();
    const days = [...card(container, "degree").querySelectorAll("[data-testid='bass-home-card-week'] i")];
    expect(days.filter((day) => day.hasAttribute("data-on"))).toHaveLength(0);
    expect(card(container, "degree").textContent).toContain("まだ弾いていません");
  });

  it("H6 offers the practice that was played last", async () => {
    const onOpen = vi.fn();
    const { container } = await mount({ resume: { mode: "bassline", whenLabel: "きのう 21:40" }, onOpen });
    const resume = container.querySelector("[data-testid='bass-home-resume']");
    expect(resume?.textContent).toContain("コード進行のベース");
    expect(resume?.textContent).toContain("きのう 21:40 に弾きました");
    await act(async () => container.querySelector<HTMLElement>("[data-testid='bass-home-resume-open']")?.click());
    expect(onOpen).toHaveBeenCalledWith("bassline");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("H7 shows no resume line when there is nothing to resume", async () => {
    const first = await mount();
    expect(first.container.querySelector("[data-testid='bass-home-resume']")).toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const hidden = await mount({ modes: ["degree"], resume: { mode: "bassline", whenLabel: "きのう 21:40" } });
    expect(hidden.container.querySelector("[data-testid='bass-home-resume']")).toBeNull();
  });

  it("H8 changes the number of strings", async () => {
    const onInstrumentChange = vi.fn();
    const { container } = await mount({ onInstrumentChange });
    const buttons = groupButtons(container, "弦");
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    await act(async () => buttons[1]?.click());
    expect(onInstrumentChange).toHaveBeenCalledWith({ stringCount: 5, handedness: "right", fretRange: { min: 0, max: 12 } });
    expect(onInstrumentChange).toHaveBeenCalledTimes(1);
  });

  it("H9 changes the hand and the fret range", async () => {
    const onInstrumentChange = vi.fn();
    const { container } = await mount({ onInstrumentChange });
    await act(async () => groupButtons(container, "利き手")[1]?.click());
    expect(onInstrumentChange).toHaveBeenLastCalledWith({ stringCount: 4, handedness: "left", fretRange: { min: 0, max: 12 } });
    const frets = groupButtons(container, "フレット");
    expect(frets).toHaveLength(3);
    expect(frets.map((button) => button.textContent)).toEqual(["0〜7", "0〜12", "5〜17"]);
    expect(frets.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    await act(async () => frets[2]?.click());
    expect(onInstrumentChange).toHaveBeenLastCalledWith({ stringCount: 4, handedness: "right", fretRange: { min: 5, max: 17 } });
  });

  it("H10 draws the fretboard for the instrument", async () => {
    const { container } = await mount();
    expect(container.querySelectorAll(".lv-bh-string")).toHaveLength(4);
    expect(container.querySelector(".lv-bh-fretboard")?.getAttribute("data-handedness")).toBe("right");
    expect([...container.querySelectorAll(".lv-bh-fret-number")].map((node) => node.textContent)).toEqual(["0", "12"]);
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const five = await mount({ instrument: { stringCount: 5, handedness: "right", fretRange: { min: 0, max: 12 } } });
    expect(five.container.querySelectorAll(".lv-bh-string")).toHaveLength(5);
  });

  it("H11 draws the week as bars", async () => {
    const { container } = await mount();
    const days = [...container.querySelectorAll(".lv-bh-week-day")];
    expect(days).toHaveLength(7);
    expect(days.filter((day) => day.hasAttribute("data-today"))).toHaveLength(1);
    expect(days[6]?.hasAttribute("data-today")).toBe(true);
    const height = (index: number) => (days[index]?.querySelector("i") as HTMLElement).style.height;
    expect(height(4)).toBe("100%");
    expect(height(2)).toBe("0%");
    expect(height(5)).toBe("50%");
    expect(container.querySelector("[data-testid='bass-home-week-sum']")?.textContent).toContain("この 7 日で");
    expect(container.querySelector("[data-testid='bass-home-week-sum']")?.textContent).toContain("18");
  });

  it("H12 says the week is empty", async () => {
    const { container } = await mount({ week: WEEK.map((label) => ({ label, count: 0 })) });
    expect(container.querySelector("[data-testid='bass-home-week-sum']")?.textContent).toBe("この 7 日は、まだ弾いていません");
  });

  it("H13 has no key help 「?」 button on the Bass Practice home (help lives on each practice screen)", async () => {
    const { container } = await mount();
    expect(container.querySelector("button[aria-label='キー操作']")).toBeNull();
    expect(container.querySelector(".lv-bh-help")).toBeNull();
    expect(container.querySelector("[data-testid='bass-home-help']")).toBeNull();
  });

  it("H14 counts the MIDI songs when the number is known", async () => {
    // The card's picture has the drawn word 「お手本」, so this looks at the tags, which is where the count is written.
    const tagsOf = (scope: HTMLElement) => [...scope.querySelectorAll(".lv-bh-tags > span")].map((tag) => tag.textContent);
    const { container } = await mount({ midiSongCount: 3 });
    expect(tagsOf(card(container, "midi"))).toEqual(["お手本 3 曲", "MIDI を読み込める"]);
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const unknown = await mount();
    expect(tagsOf(card(unknown.container, "midi"))).toEqual(["MIDI を読み込める"]);
  });

  it("H15 draws every picture as decoration", async () => {
    const { container } = await mount();
    const pictures = [...container.querySelectorAll("[data-testid='bass-home-card'] svg")];
    expect(pictures.length).toBeGreaterThan(0);
    expect(pictures.every((picture) => picture.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("the Bass Practice home keys (P23-36)", () => {
  const enter = (init: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
  const pressOnWindow = async (init: KeyboardEventInit = {}) => {
    let handled = true;
    await act(async () => { handled = window.dispatchEvent(enter(init)); });
    return handled;
  };

  it("H16 Enter opens the last practice once, and the button opens the same mode", async () => {
    const onOpen = vi.fn();
    const { container } = await mount({ resume: { mode: "bassline", whenLabel: "きのう 21:40" }, onOpen });
    expect(await pressOnWindow()).toBe(false);
    expect(onOpen.mock.calls).toEqual([["bassline"]]);
    await act(async () => container.querySelector<HTMLElement>("[data-testid='bass-home-resume-open']")?.click());
    expect(onOpen.mock.calls).toEqual([["bassline"], ["bassline"]]);
  });

  it("H17 Enter does nothing without a resume or when the home is behind a practice", async () => {
    const nothing = vi.fn();
    await mount({ onOpen: nothing });
    expect(await pressOnWindow()).toBe(true);
    expect(nothing).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const behind = await mount({ resume: { mode: "degree", whenLabel: "今日 10:00" }, onOpen: nothing, active: false });
    expect(await pressOnWindow()).toBe(true);
    expect(nothing).not.toHaveBeenCalled();
    expect(behind.container.querySelector("[data-testid='bass-home-resume']")).not.toBeNull();
  });

  it("H18 Enter is left to inputs, selects, buttons, dialogs, IME and a held key", async () => {
    const onOpen = vi.fn();
    const { container } = await mount({ resume: { mode: "rhythm", whenLabel: "今日 10:00" }, onOpen });
    expect(await pressOnWindow({ repeat: true })).toBe(true);
    expect(await pressOnWindow({ isComposing: true })).toBe(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(await pressOnWindow()).toBe(true);
    dialog.remove();

    const input = document.createElement("input");
    const select = document.createElement("select");
    container.append(input, select);
    for (const control of [input, select]) {
      await act(async () => { control.dispatchEvent(enter()); });
      control.focus();
      expect(await pressOnWindow()).toBe(true);
    }
    const button = container.querySelector<HTMLButtonElement>("[data-testid='bass-home-resume-open']")!;
    button.focus();
    expect(await pressOnWindow()).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("H19 the 続ける button carries the Enter hint, hidden from the accessible name", async () => {
    const { container } = await mount({ resume: { mode: "degree", whenLabel: "今日 10:00" } });
    const button = container.querySelector<HTMLElement>("[data-testid='bass-home-resume-open']")!;
    expect(button.textContent).toBe("続けるEnter");
    // P24-02 I-1: the hint is the shared component's badge.
    const hint = button.querySelector(".lv-resume-go-key");
    expect(hint?.textContent).toBe("Enter");
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
  });

  it("H20 the Enter listener is removed when the home leaves", async () => {
    const onOpen = vi.fn();
    await mount({ resume: { mode: "degree", whenLabel: "今日 10:00" }, onOpen });
    await act(async () => root?.unmount());
    root = undefined;
    expect(await pressOnWindow()).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
