// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BassPracticeModeView } from "./BassPracticeModeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
/** P23-25 P1: a practice is opened from the home's card, and « ‹ Bass Practice » comes back to it. */
async function openFromHome(container: HTMLElement, mode: string): Promise<void> {
  await act(async () => {
    (container.querySelector(`[data-testid='bass-home-card'][data-mode='${mode}']`) as HTMLElement | null)?.click();
  });
}
async function backHome(container: HTMLElement): Promise<void> {
  await act(async () => {
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "‹ Bass Practice")?.click();
  });
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; localStorage.clear(); document.body.replaceChildren(); });

describe("Bass Practice production modes", () => {
  test("ships all five practices and keeps an active 度数 session mounted while changing tabs", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    const degree = container.querySelector("[data-testid='degree-echo-view']");
    expect(degree).not.toBeNull();
    // P23-62: the old 5-step degree progress nav is gone; the shared stage draws 聴く → 弾く → 結果.
    const degreeStage = degree?.querySelector("[aria-label='練習の段階']")?.textContent ?? "";
    expect(degreeStage).toContain("聴く");
    expect(degreeStage).toContain("弾く");
    expect(degreeStage).toContain("結果");
    // P23-25 P1/P2: the 5-button bar became the home; all five are still reached from it.
    const home = container.querySelector("[data-testid='bass-practice-home']");
    expect(home).not.toBeNull();
    expect(Array.from(home!.querySelectorAll("[data-testid='bass-home-card']")).map((card) => card.getAttribute("data-mode")))
      .toEqual(["degree", "rhythm", "root-motion", "bassline", "midi"]);

    await openFromHome(container, "rhythm");
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).not.toBeNull();
    expect(container.querySelector("[data-testid='degree-echo-view']")).toBe(degree);
    expect((degree?.closest(".bass-mode-panel") as HTMLDivElement).hidden).toBe(true);

    expect(container.querySelector(".bass-mode-name")?.textContent).toBe("リズム");
    await backHome(container);
    await openFromHome(container, "degree");
    expect((degree?.closest(".bass-mode-panel") as HTMLDivElement).hidden).toBe(false);
    expect(container.querySelector(".bass-mode-name")?.textContent).toBe("度数");
  });

  test("keeps リズム available independently and hides its notes behind the hint chips", async () => {
    localStorage.setItem("loop-vault:bass-practice-degree-echo-enabled:v1", "false");
    localStorage.setItem("loop-vault:bass-practice-bassline-echo-enabled:v1", "false");
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    const rhythm = container.querySelector("[data-testid='rhythm-echo-view']");
    expect(rhythm).not.toBeNull();
    // P23-62: the 16-cell grid became the shared lane. The lane draws the beat ruler but no note before the
    // hints (「音の数」→「最初の音」→「リズムの形」), and those hints stay locked until the rhythm has been heard.
    const laneNotes = () => rhythm?.querySelectorAll("[data-testid='bp-lane'] [role='img']") ?? [];
    expect(laneNotes()).toHaveLength(0);
    // No capture device exists under jsdom, so the stage starts on 2 弾く; choosing the difficulty opens a
    // fresh rhythm on 1 聴く, where the hint chips are drawn.
    await openFromHome(container, "rhythm");
    await act(async () => (container.querySelector("[data-testid='rhythm-conditions']") as HTMLElement | null)?.click());
    const level = container.querySelector("[aria-label='リズムの難しさ']") as HTMLSelectElement;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setValue?.call(level, "1");
      level.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(rhythm?.getAttribute("data-stage-step")).toBe("0");
    const hintButtons = Array.from(rhythm?.querySelectorAll<HTMLButtonElement>("[aria-label='ヒント'] button") ?? []);
    expect(hintButtons.map((button) => button.textContent)).toEqual(["音の数", "最初の音", "リズムの形"]);
    expect(hintButtons.every((button) => button.disabled)).toBe(true);
    expect(laneNotes()).toHaveLength(0);
  });
  test("uses the selected Japanese language for リズム and コード進行のベース controls", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    const degree = container.querySelector("[data-testid='degree-echo-view']");
    // P23-62: the old 5-step nav is gone; the stage's own Japanese steps and the Japanese key line remain.
    expect(degree?.querySelector("[aria-label='練習の段階']")?.textContent).toContain("聴く");
    expect(degree?.querySelector(".bp-meta")?.textContent).toContain("メジャー");
    expect(degree?.textContent).not.toContain("Listen");

    // The practice's own 条件 chip now sits in the top band, in Japanese.
    await openFromHome(container, "degree");
    expect(container.querySelector("[data-testid='degree-conditions']")?.textContent).toContain("歌う参考音");
    await backHome(container);

    await openFromHome(container, "rhythm");
    const rhythm = container.querySelector("[data-testid='rhythm-echo-view']");
    // P23-62: the purple badge and its sentence left the stage practices; the top band now names the practice in
    // Japanese and carries its own 条件 chip.
    expect(container.querySelector(".bass-mode-name")?.textContent).toBe("リズム");
    expect(container.querySelector(".bass-mode-badge")).toBeNull();
    expect(container.querySelector("[data-testid='rhythm-conditions']")?.textContent).toContain("カウント");
    expect(rhythm?.querySelector("[aria-label='お手本の段']")).not.toBeNull();
    // The per-rhythm tempo field is gone: the stage shows the app-wide BPM, and the 条件 popover explains it.
    expect(rhythm?.querySelector(".bp-meta")?.textContent).toMatch(/\d+ BPM/);
    await act(async () => (container.querySelector("[data-testid='rhythm-conditions']") as HTMLElement | null)?.click());
    expect(container.querySelector("[aria-label='リズムの条件']")?.textContent).toContain("テンポは上の BPM です");
    expect(container.querySelector("[aria-label='リズムの拍子']")).not.toBeNull();
    expect(rhythm?.textContent).not.toContain("Self-rated practice only");

    await backHome(container);
    await openFromHome(container, "bassline");
    const bassline = container.querySelector("[data-testid='bassline-echo-view']");
    expect(container.querySelector(".bass-mode-name")?.textContent).toBe("コード進行のベース");
    // P23-63: コード進行のベース is on the stage too — no badge, and its settings live in the band's 条件 chip.
    expect(container.querySelector(".bass-mode-badge")).toBeNull();
    expect(container.querySelector(".bass-modebar")?.textContent).not.toContain("自己評価 · 自動採点ではありません");
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent).toContain("レベル 1");
    // jsdom has no capture device, so the take the stage mounts reports itself unavailable and the stage says so in
    // Japanese (the same reason リズム opens on its 弾く step here).
    expect(bassline?.textContent).toContain("うまく録れませんでした");
    expect(bassline?.textContent).not.toContain("Session tempo");
    expect(bassline?.textContent).not.toContain("Listen layers");
    await act(async () => (container.querySelector("[data-testid='bassline-conditions']") as HTMLElement | null)?.click());
    const basslineConditions = container.querySelector("[aria-label='コード進行のベースの条件']");
    expect(basslineConditions?.textContent).toContain("聴く時に鳴らす");
    expect(basslineConditions?.textContent).toContain("弾く時に鳴らす");
    expect(basslineConditions?.textContent).toContain("テンポ");
   });

  test("passes the persisted ルートの動き note count through the mode boundary", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    const onRootMotionNoteCountChange = vi.fn(async () => undefined);
    const initialSettings = { version: 1 as const, singEnabled: true, singingReferenceMode: "auto" as const, stringCount: 4 as const, handedness: "right" as const, fretRange: { min: 0, max: 12 }, sessionTargetCount: 8, rootMotionNoteCount: 2 as const };
    await act(async () => root?.render(<BassPracticeModeView initialSettings={initialSettings} onRootMotionNoteCountChange={onRootMotionNoteCountChange} />));
    await openFromHome(container, "root-motion");
    // P23-62: the note count moved into the top band's 条件 popover; its chip shows the persisted value.
    const conditions = container.querySelector("[data-testid='root-motion-conditions']");
    expect(conditions?.textContent).toContain("2 音");
    await act(async () => (conditions as HTMLElement | null)?.click());
    const noteCount = container.querySelector("[data-testid='root-motion-note-count']") as HTMLSelectElement;
    expect(noteCount).not.toBeNull();
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setValue?.call(noteCount, "8");
      noteCount.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onRootMotionNoteCountChange).toHaveBeenCalledWith(8);
  });
  test("opens the tab the Home's 続きから names (P22-03 §1)", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView initialMode="rhythm" />));
    const selected = () => container.querySelector(".bass-mode-name")?.textContent;
    expect(selected()).toBe("リズム");
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).not.toBeNull();
    expect((container.querySelector("[data-testid='degree-echo-view']")?.closest(".bass-mode-panel") as HTMLDivElement).hidden).toBe(true);
  });

  test("shows the home when the Home names no practice (P23-25 P1)", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    expect(container.querySelector("[data-testid='bass-practice-home']")).not.toBeNull();
    // The workspace is drawn inside a hidden box, so its header and the Degree session stay mounted.
    expect(container.querySelector(".bass-mode-name")?.closest("[hidden]")).not.toBeNull();
    expect(container.querySelector("[data-testid='degree-echo-view']")?.closest("[hidden]")).not.toBeNull();
  });

  test("falls back to today's first tab when the named practice is switched off", async () => {
    localStorage.setItem("loop-vault:bass-practice-rhythm-echo-enabled:v1", "false");
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView initialMode="rhythm" />));
    expect(container.querySelector("[data-testid='bass-practice-home']")).not.toBeNull();
    expect(container.querySelector(".bass-mode-name")?.closest("[hidden]")).not.toBeNull();
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).toBeNull();
  });
});
