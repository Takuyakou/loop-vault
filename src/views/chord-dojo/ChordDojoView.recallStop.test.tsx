// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { dojoStore } from "../../domain/chordDojo/runtime";
import { ChordDojoView } from "./ChordDojoView";

/**
 * P23-59-fix-3: the ② end question (「もう一度 ② を弾く / 終わる」) is skipped only by the person on the question.
 * On a slow machine the automatic step calls `next` a second time with the answer that set the stop while the save of
 * the first call is still going; that second call must not go on to the finish screen. Two Enter presses in one tick
 * (the same `next`, the same result, before the screen is drawn again) are that second call. Played without MIDI
 * (the self-judged way: Space, Y, Enter), on 王道進行 begun from the list with 「この段階をくり返す」 off.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
const realSave = dojoStore.getState().save;
afterEach(async () => {
  dojoStore.setState({ save: realSave });
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  window.localStorage.clear();
});

const settle = (ms = 40) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const press = async (key: string) => {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  await settle();
};

it("a second call with the answer that stopped ② does not skip the question (the save still going)", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<ChordDojoView ideas={[]} />));
  await settle(200);
  const cursor = () => host.querySelector(".dojo")?.getAttribute("data-dojo-cursor");
  const screen = () => host.querySelector("[data-dojo-screen]")?.getAttribute("data-dojo-screen");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("定番の進行"))!.click());
  await settle(150);
  const card = [...host.querySelectorAll(".dojo-builtin-card")].find((element) => element.querySelector("h2,h3,h4")?.textContent === "王道進行")!;
  await act(async () => [...card.querySelectorAll("button")].find((button) => /を練習する$/.test(button.getAttribute("aria-label") ?? button.textContent ?? ""))!.click());
  await settle(150);
  expect(cursor()).toBe("0:see:0:0");

  const answer = async () => { await press(" "); await press("y"); await settle(80); };
  for (let i = 0; i < 4; i += 1) { await answer(); await press("Enter"); await settle(80); } // ①
  expect(cursor()).toBe("0:memorize:0:0");
  await press("Enter"); // ② へ
  for (let i = 0; i < 3; i += 1) { await answer(); await press("Enter"); await settle(80); }
  expect(cursor()).toBe("0:recall:0:3");
  await answer(); // the last chord of ② is right: a result on screen

  // The save of the first call is held; the second call comes with the same result before anything is drawn again.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  dojoStore.setState({ save: async (file) => { await gate; return realSave(file); } });
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await act(async () => { release(); await gate; });
  await settle(150);

  expect(screen()).toBe("practice");
  expect(host.querySelector('[data-testid="dojo-again-recall"]')).not.toBeNull();
  // The person on the question still goes on with Enter.
  await press("Enter");
  await settle(100);
  expect(screen()).toBe("finish");
}, 30_000);
