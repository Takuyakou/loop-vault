// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackRow } from "./PlaybackRow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function render(props: Partial<ComponentProps<typeof PlaybackRow>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const handlers = { onPrimary: vi.fn(), onStop: vi.fn(), onBeginning: vi.fn(), onLoop: vi.fn() };
  await act(async () => root!.render(<PlaybackRow label="再生" status="stopped" pausable={false} loop={false} {...handlers} {...props} />));
  const texts = () => [...host.querySelectorAll("button")].map((button) => button.textContent);
  return { host, handlers, texts, group: host.querySelector('[role="group"]')! };
}

describe("PlaybackRow (P23-16 W1)", () => {
  it("the workspace form: ▶ 再生 (■ 停止 while playing) · |◀ 最初から · ↻ ループ, then what the screen adds", async () => {
    const row = await render({ children: <span data-extra>追従</span> });
    expect(row.group.getAttribute("aria-label")).toBe("再生");
    expect(row.texts()).toEqual(["▶ 再生", "|◀ 最初から", "↻ ループ"]);
    expect(row.group.lastElementChild?.hasAttribute("data-extra")).toBe(true);
    await act(async () => row.host.querySelectorAll("button")[0]!.click());
    expect(row.handlers.onPrimary).toHaveBeenCalledOnce();
    await act(async () => root!.render(<PlaybackRow label="再生" status="playing" pausable={false} loop={false} {...row.handlers} />));
    expect(row.texts()).toEqual(["■ 停止", "|◀ 最初から", "↻ ループ"]);
  });

  it("the text form pauses: Ⅱ 一時停止 / ▶ 再開 and its own ■ 停止", async () => {
    const row = await render({ pausable: true, status: "playing" });
    expect(row.texts()).toEqual(["Ⅱ 一時停止", "■ 停止", "|◀ 最初から", "↻ ループ"]);
    await act(async () => row.host.querySelectorAll("button")[1]!.click());
    expect(row.handlers.onStop).toHaveBeenCalledOnce();
    await act(async () => root!.render(<PlaybackRow label="再生" status="paused" pausable loop={false} {...row.handlers} />));
    expect(row.texts()[0]).toBe("▶ 再開");
    await act(async () => root!.render(<PlaybackRow label="再生" status="stopped" pausable loop={false} {...row.handlers} />));
    expect(row.host.querySelectorAll("button")[1]!.disabled).toBe(true);
  });

  it("↻ ループ says its state, toggles, and can be held off; the screen's names and ids win", async () => {
    const row = await render({ loop: true, loopProps: { "data-testid": "loop", title: "範囲をくり返す" }, beginningProps: { "aria-label": "曲の先頭へ（Home）" } });
    const loop = row.host.querySelector<HTMLButtonElement>('[data-testid="loop"]')!;
    expect(loop.getAttribute("aria-pressed")).toBe("true");
    expect(loop.title).toBe("範囲をくり返す");
    await act(async () => loop.click());
    expect(row.handlers.onLoop).toHaveBeenCalledWith(false);
    expect(row.host.querySelectorAll("button")[1]!.getAttribute("aria-label")).toBe("曲の先頭へ（Home）");
    await act(async () => root!.render(<PlaybackRow label="再生" status="stopped" pausable={false} loop={false} loopDisabled {...row.handlers} />));
    expect(row.host.querySelectorAll("button")[2]!.disabled).toBe(true);
  });
});
