// @vitest-environment jsdom
import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_MOMENT_MS, ChordCardMark, cardResult, useCardMoment, type ChordCardResult } from "./ChordCardResult";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
beforeEach(() => { vi.useFakeTimers(); host = document.createElement("div"); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); root = undefined; host?.remove(); vi.useRealTimers(); });

function Moment({ value }: { value: ChordCardResult | undefined }) {
  const shown = useCardMoment(value);
  return <ChordCardMark result={shown} layer="moment" corner />;
}
const render = (value: ChordCardResult | undefined) => { root ??= createRoot(host!); act(() => root!.render(<Moment value={value} />)); };

describe("the moment layer", () => {
  it("shows a correct result and is gone after CARD_MOMENT_MS", () => {
    render(cardResult(true, false));
    expect(host!.querySelector(".lv-card-mark")?.getAttribute("data-state")).toBe("correct");
    act(() => { vi.advanceTimersByTime(CARD_MOMENT_MS - 1); });
    expect(host!.querySelector(".lv-card-mark")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(host!.querySelector(".lv-card-mark")).toBeNull();
  });

  it("a miss is brief too, and a new result starts a new moment", () => {
    render(cardResult(false, false));
    expect(host!.querySelector(".lv-card-mark")?.getAttribute("data-state")).toBe("miss");
    act(() => { vi.advanceTimersByTime(CARD_MOMENT_MS); });
    expect(host!.querySelector(".lv-card-mark")).toBeNull();
    render(cardResult(true, true));
    expect(host!.querySelector(".lv-card-mark")?.getAttribute("data-source")).toBe("self");
  });
});

describe("the mark's shape, not only its colour, carries the source", () => {
  it("keyboard and self reports are different marks with different words", () => {
    render(undefined);
    act(() => root!.render(<><ChordCardMark result={cardResult(true, false)} layer="set" /><ChordCardMark result={cardResult(true, true)} layer="set" /></>));
    const [midi, self] = Array.from(host!.querySelectorAll(".lv-card-mark"));
    expect(midi!.getAttribute("data-source")).toBe("midi");
    expect(self!.getAttribute("data-source")).toBe("self");
    expect(midi!.getAttribute("aria-label")).not.toBe(self!.getAttribute("aria-label"));
  });
});

describe("one implementation", () => {
  it.each(["Master251View", "ChordDojoView", "ChordDojoEndlessView"])("%s draws its result marks from the shared module", (name) => {
    const source = readFileSync(`src/views/chord-dojo/${name}.tsx`, "utf8");
    expect(source).toContain("components/practice/ChordCardResult");
    expect(source).toContain("ChordCardMark");
  });
});
