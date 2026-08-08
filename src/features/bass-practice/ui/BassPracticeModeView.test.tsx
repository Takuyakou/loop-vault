// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { BassPracticeModeView } from "./BassPracticeModeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; localStorage.clear(); document.body.replaceChildren(); });

describe("Bass Practice production modes", () => {
  test("ships all three modes and keeps an active Degree session mounted while changing tabs", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    const degree = container.querySelector("[data-testid='degree-echo-view']");
    expect(degree).not.toBeNull();
    expect(degree?.querySelector("[aria-label='Degree Echo progress']")?.textContent)
      .toContain("ListenSingThinkPlayReviewTransfer");
    expect(Array.from(container.querySelectorAll("[role='tab']")).map((tab) => tab.textContent)).toEqual([
      "Degree Echo", "Rhythm Echo", "Bassline Echo",
    ]);

    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Rhythm Echo")?.click());
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).not.toBeNull();
    expect(container.querySelector("[data-testid='degree-echo-view']")).toBe(degree);
    expect((degree?.parentElement as HTMLDivElement).hidden).toBe(true);

    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Degree Echo")?.click());
    expect((degree?.parentElement as HTMLDivElement).hidden).toBe(false);
  });

  test("keeps Rhythm Echo available independently and hides its visual grid until Hint 4", async () => {
    localStorage.setItem("loop-vault:bass-practice-degree-echo-enabled:v1", "false");
    localStorage.setItem("loop-vault:bass-practice-bassline-echo-enabled:v1", "false");
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView />));
    expect(container.querySelector("[data-testid='rhythm-echo-view']")).not.toBeNull();
    expect(container.querySelector("[data-testid='rhythm-grid']")?.textContent).toContain("hidden");
    for (let index = 0; index < 4; index += 1) await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Hint"))?.click());
    expect(container.querySelector("[data-testid='rhythm-grid']")?.textContent).toContain("0+");
  });
  test("uses the selected Japanese language for Rhythm Echo and Bassline Echo controls", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<BassPracticeModeView language="ja" />));
    const degree = container.querySelector("[data-testid='degree-echo-view']");
    expect(degree?.querySelector("[aria-label='Degree Echoの進行']")?.textContent)
      .toContain("聴く歌う考える演奏レビュー移調");
    expect(degree?.querySelector("[aria-label='Degree Echoの進行']")?.textContent)
      .not.toContain("Listen");

    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Rhythm Echo")?.click());
    const rhythm = container.querySelector("[data-testid='rhythm-echo-view']");
    expect(rhythm?.textContent).toContain("自己評価 · 自動採点ではありません");
    expect(rhythm?.textContent).toContain("まずお手本を聴きましょう");
    expect(rhythm?.querySelector("[aria-label='リズムのテンポ']")).not.toBeNull();
    expect(rhythm?.textContent).not.toContain("Self-rated practice only");

    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Bassline Echo")?.click());
    const bassline = container.querySelector("[data-testid='bassline-echo-view']");
    expect(bassline?.textContent).toContain("自己評価 · 自動採点ではありません");
    expect(bassline?.textContent).toContain("セッションテンポ");
    expect(bassline?.textContent).toContain("お手本のレイヤー");
    expect(bassline?.textContent).not.toContain("Session tempo");
    expect(bassline?.textContent).not.toContain("Listen layers");
   });
});
