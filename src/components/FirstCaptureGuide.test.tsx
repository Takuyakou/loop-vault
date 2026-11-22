// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCaptureGuide } from "./FirstCaptureGuide";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}

const button = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === name);

describe("FirstCaptureGuide (P23-03)", () => {
  it("shows the title, the two ways in and the three steps in order", () => {
    const onMidi = vi.fn();
    const onText = vi.fn();
    render(<FirstCaptureGuide onMidi={onMidi} onText={onText} />);
    expect(host.querySelector("h3")?.textContent).toBe("最初の進行を取り込む");
    act(() => button("MIDI から取り込む")!.click());
    expect(onMidi).toHaveBeenCalledOnce();
    act(() => button("コード譜のテキストを貼り付け")!.click());
    expect(onText).toHaveBeenCalledOnce();
    const flow = host.querySelector('ol[aria-label="取り込みの流れ"]');
    expect([...flow!.querySelectorAll("li")].map((item) => item.textContent?.replace(/^\d/, ""))).toEqual([
      "MIDI を落とす",
      "パートを確かめる",
      "選んで保存",
    ]);
  });

  it("leaves out the text button when there is no onText", () => {
    render(<FirstCaptureGuide onMidi={vi.fn()} />);
    expect(button("MIDI から取り込む")).toBeDefined();
    expect(button("コード譜のテキストを貼り付け")).toBeUndefined();
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });
});
