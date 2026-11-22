// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import type { CorrectionCard } from "../../domain/correction/correctionModel";
import { ChordCard } from "./ChordCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeCard = (extra: Partial<CorrectionCard> = {}): CorrectionCard => ({
  id: "card-1",
  start: 4,
  duration: 4,
  bar: 2,
  beat: 1,
  name: parseChordLabel("F#m7b5")!,
  nameSource: "auto",
  alternatives: [],
  timelineIndex: 1,
  reviewReasons: [],
  reviewed: false,
  attacks: 1,
  edited: false,
  ...extra,
} as CorrectionCard);

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function render(props: Partial<ComponentProps<typeof ChordCard>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const handlers = {
    onPointerEnter: vi.fn(),
    onContextMenu: vi.fn(),
    onKeyDown: vi.fn(),
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
  };
  await act(async () => root!.render(
    <ChordCard
      card={makeCard()}
      pxPerBeat={30}
      meter={4}
      selected={false}
      progression={false}
      outOfRange={false}
      inRange={false}
      startCue={false}
      rangeFrom={false}
      {...handlers}
      {...props}
    />,
  ));
  return { button: host.querySelector<HTMLButtonElement>("button.lv-cw-card")!, handlers };
}

describe("ChordCard (P23-13)", () => {
  it("a plain card: full size, the whole name with ♯ ♭, placed by its beats, no marks", async () => {
    const { button } = await render();
    expect(button.getAttribute("data-size")).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("2小節1拍 F#m7b5");
    expect(button.title).toBe("F#m7b5");
    expect(button.getAttribute("data-card-id")).toBe("card-1");
    expect(button.style.left).toBe("121px");
    expect(button.style.width).toBe("118px");
    expect(button.querySelector(".lv-cw-card-name")?.textContent).toBe("F♯m7♭5");
    expect(button.querySelector(".lv-cw-card-name")?.getAttribute("data-full-name")).toBe("F#m7b5");
    expect(button.querySelector(".lv-cw-card-sub")?.textContent).toBe("");
    for (const attribute of ["data-review", "data-edited", "data-chord-card", "data-out-of-range", "data-in-range", "data-start-cue", "data-range-from"]) {
      expect(button.hasAttribute(attribute), attribute).toBe(false);
    }
  });

  it("the selected card is pressed and passes its clicks to the workspace", async () => {
    const { button, handlers } = await render({ selected: true });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => button.click());
    expect(handlers.onClick).toHaveBeenCalledTimes(1);
  });

  it("a card to review: the flag, 「（要確認）」 in its name, and an edited card says so", async () => {
    const { button } = await render({
      card: makeCard({ reviewReasons: [{ kind: "low-confidence" as never, noteIds: [], text: "x" }], edited: true, attacks: 3 }),
    });
    expect(button.getAttribute("data-review")).toBe("true");
    expect(button.getAttribute("data-edited")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("2小節1拍 F#m7b5（要確認）");
    expect(button.querySelector(".lv-cw-flag")).not.toBeNull();
    expect(button.querySelector(".lv-cw-x")?.textContent).toBe("×3");
  });

  it("a double click opens the name editor (the candidates); the menu key and right click reach the workspace", async () => {
    const { button, handlers } = await render();
    await act(async () => button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(handlers.onDoubleClick).toHaveBeenCalledTimes(1);
    await act(async () => button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(handlers.onContextMenu).toHaveBeenCalledTimes(1);
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true })));
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("a narrow card: `narrow` below 72px, the name shortened to the root with …, the beats when not one bar", async () => {
    const { button } = await render({ card: makeCard({ duration: 2 }) });
    expect(button.getAttribute("data-size")).toBe("narrow");
    expect(button.querySelector(".lv-cw-card-name")?.textContent).toBe("F♯…");
    expect(button.querySelector(".lv-cw-card-sub")?.textContent).toBe("2拍");
  });

  it("tiny and bare cards keep the old rule", async () => {
    const tiny = await render({ card: makeCard({ duration: 1 }) });
    expect(tiny.button.getAttribute("data-size")).toBe("tiny");
    await act(async () => root!.unmount());
    root = undefined;
    const bare = await render({ card: makeCard({ duration: 0.25 }) });
    expect(bare.button.getAttribute("data-size")).toBe("bare");
    expect(bare.button.querySelector(".lv-cw-card-name")?.textContent).toBe("");
    expect(bare.button.style.width).toBe("5.5px");
  });

  it("on the progression page: data-chord-card, the 変更 / 追加 mark and the save range marks", async () => {
    const { button } = await render({ progression: true, change: "追加", outOfRange: true, startCue: true, rangeFrom: true });
    expect(button.getAttribute("data-chord-card")).toBe("true");
    expect(button.querySelector(".lv-cw-change")?.textContent).toBe("追加");
    expect(button.getAttribute("data-out-of-range")).toBe("true");
    expect(button.getAttribute("data-start-cue")).toBe("true");
    expect(button.getAttribute("data-range-from")).toBe("true");
    expect(button.hasAttribute("data-in-range")).toBe(false);
  });
});
