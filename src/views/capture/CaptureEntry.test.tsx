// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureEntry, captureEntryErrorText, type CaptureEntryProps } from "./CaptureEntry";

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

async function mount(overrides: Partial<CaptureEntryProps> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props: CaptureEntryProps = {
    state: "idle",
    onChooseMidi: vi.fn(),
    onOpenText: vi.fn(),
    ...overrides,
  };
  await act(async () => root?.render(<CaptureEntry {...props} />));
  return { container: host, props };
}

const statusText = (container: HTMLElement) => container.querySelector<HTMLElement>("[role='status']")?.textContent;

describe("the first screen of 取り込む (P23-11)", () => {
  it("U1 draws the title, the box and the file button while nothing is read", async () => {
    const { container, props } = await mount();
    const title = container.querySelector("#capture-empty-title")!.textContent ?? "";
    expect(title).toContain("MIDI から");
    expect(title).toContain("コード進行を拾う");
    const hero = container.querySelector<HTMLElement>(".lv-capture-hero")!;
    expect(hero.getAttribute("data-zone-state")).toBe("idle");
    expect(hero.getAttribute("data-drop-target-state")).toBe("idle");
    expect(statusText(container)).toBe("MIDIファイルをここにドロップ");
    await act(async () => container.querySelector<HTMLElement>("[data-testid='capture-choose-midi']")?.click());
    expect(props.onChooseMidi).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("U2 says the file would start reading when it is over the box", async () => {
    const { container } = await mount({ state: "over" });
    expect(statusText(container)).toBe("放すと読み込みます");
    expect(container.querySelector<HTMLElement>(".lv-capture-hero")?.getAttribute("data-drop-target-state")).toBe("active");
    expect(container.querySelector("[data-testid='capture-choose-midi']")).toBeNull();
  });

  it("U3 names the part of the reading that is running", async () => {
    const stages = [
      ["reading", "MIDI を読み込んでいます…"],
      ["analyzing", "コードを読み取っています…"],
      ["finalizing", "候補を準備しています…"],
      [undefined, "コードを読み取っています…"],
    ] as const;
    for (const [stage, text] of stages) {
      const { container } = await mount({ state: "loading", ...(stage ? { progressStage: stage } : {}) });
      expect(statusText(container)).toBe(text);
      const bar = container.querySelector("[role='progressbar']");
      expect(bar?.getAttribute("aria-label")).toBe("MIDI解析の進捗");
      expect(container.querySelector("[data-testid='capture-choose-midi']")).toBeNull();
      await act(async () => root?.unmount());
      root = undefined;
      host?.remove();
    }
  });

  it("U4 shows the reason and a new-file button when the reading failed", async () => {
    const { container, props } = await mount({ state: "error", error: "MIDI contains no note events." });
    const alerts = container.querySelectorAll("[role='alert']");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain("MIDI を読み込めませんでした");
    expect(alerts[0]?.textContent).toContain("この MIDI には音が入っていません");
    expect(container.querySelector("[role='status']")).toBeNull();
    await act(async () => container.querySelector<HTMLElement>("[data-testid='capture-retry-midi']")?.click());
    expect(props.onChooseMidi).toHaveBeenCalledTimes(1);
  });

  it("U5 turns the known reasons into Japanese and leaves written ones alone", () => {
    expect(captureEntryErrorText(undefined)).toBe("MIDI ファイルを読み込めませんでした。");
    expect(captureEntryErrorText("   ")).toBe("MIDI ファイルを読み込めませんでした。");
    expect(captureEntryErrorText("MIDI contains no note events.")).toBe("この MIDI には音が入っていません。");
    expect(captureEntryErrorText("The selected file exceeds Loop Vault's safe import limits.")).toBe("ファイルが大きすぎるため、読み込めません。");
    expect(captureEntryErrorText("MIDI could not be read.")).toBe("MIDI を読み込めませんでした。");
    expect(captureEntryErrorText("MIDIファイルを読み込めませんでした。")).toBe("MIDIファイルを読み込めませんでした。");
    expect(captureEntryErrorText("Unexpected end of file"))
      .toBe("MIDI として読めないファイルでした。別のファイルで試してください。");
  });

  it("U6 lists the three steps in order", async () => {
    const { container } = await mount();
    const steps = [...container.querySelectorAll("ol.lv-capture-flow > li")];
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.querySelector(".lv-capture-step-name")?.textContent))
      .toEqual(["MIDI をドロップ", "パートを確かめる", "選んで保存"]);
  });

  it("U7 opens the text entry, and closes it while a draft is open", async () => {
    const opened = await mount();
    await act(async () => opened.container.querySelector<HTMLElement>("[data-testid='capture-entry-text']")?.click());
    expect(opened.props.onOpenText).toHaveBeenCalledTimes(1);
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const disabled = await mount({ textDisabled: true });
    expect(disabled.container.querySelector<HTMLButtonElement>("[data-testid='capture-entry-text']")?.disabled).toBe(true);
  });

  it("U8 offers Live MIDI only where it can be opened", async () => {
    const without = await mount();
    expect(without.container.querySelector("[data-testid='capture-entry-live-midi']")).toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    const onOpenLiveMidi = vi.fn();
    const withLive = await mount({ onOpenLiveMidi });
    await act(async () => withLive.container.querySelector<HTMLElement>("[data-testid='capture-entry-live-midi']")?.click());
    expect(onOpenLiveMidi).toHaveBeenCalledTimes(1);
  });
});
