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
  name: parseChordLabel("Dm7")!,
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
      onPointerEnter={handlers.onPointerEnter}
      onContextMenu={handlers.onContextMenu}
      onKeyDown={handlers.onKeyDown}
      onClick={handlers.onClick}
      onDoubleClick={handlers.onDoubleClick}
      {...props}
    />,
  ));
  return { card: host.querySelector<HTMLElement>("[data-testid='correction-card']")!, sub: host.querySelector<HTMLElement>(".lv-cw-card-sub")! };
}

const harmony = { degree: "Ⅱm7", role: "SD" as const };

describe("the harmony mark on a card (P23-14)", () => {
  it("B1 draws nothing when the key is unknown", async () => {
    const { card } = await render();
    expect(card.querySelector("[data-testid='correction-card-harmony']")).toBeNull();
  });

  it("B2 draws the dot, the degree and the role colour", async () => {
    const { card } = await render({ harmony });
    const mark = card.querySelector<HTMLElement>("[data-testid='correction-card-harmony']")!;
    expect(mark.getAttribute("data-fn")).toBe("SD");
    expect(mark.querySelectorAll(".lv-cw-harmony-dot")).toHaveLength(1);
    expect(mark.querySelector(".lv-cw-harmony-degree")?.textContent).toBe("Ⅱm7");
    // The card's own labels do not change.
    const plain = (await (async () => {
      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();
      return render();
    })()).card;
    expect(card.getAttribute("aria-label")).toBe(plain.getAttribute("aria-label"));
    expect(card.getAttribute("title")).toBe(plain.getAttribute("title"));
  });

  it("B3 keeps the dot and hides the degree when degrees are off", async () => {
    const { card } = await render({ harmony, showDegree: false });
    expect(card.querySelectorAll(".lv-cw-harmony-dot")).toHaveLength(1);
    expect(card.querySelector(".lv-cw-harmony-degree")).toBeNull();
  });

  it("B4 draws only the degree when the role cannot be read", async () => {
    const { card } = await render({ harmony: { degree: "Ⅰ", role: "" } });
    const mark = card.querySelector<HTMLElement>("[data-testid='correction-card-harmony']")!;
    expect(mark.hasAttribute("data-fn")).toBe(false);
    expect(mark.querySelector(".lv-cw-harmony-dot")).toBeNull();
    expect(mark.querySelector(".lv-cw-harmony-degree")?.textContent).toBe("Ⅰ");
  });

  it("B5 puts the harmony at the start of the lower row", async () => {
    const { sub } = await render({ card: makeCard({ duration: 2, attacks: 2 }), pxPerBeat: 60, harmony });
    expect(sub.textContent).toBe("Ⅱm72拍×2");
  });

  it("B6 comes after the review flag", async () => {
    const reviewReasons: CorrectionCard["reviewReasons"] = [{ kind: "melody", noteIds: [], text: "メロディの可能性" }];
    const { sub } = await render({ card: makeCard({ reviewReasons }), harmony });
    expect(sub.children[0]?.className).toBe("lv-cw-flag");
    expect(sub.children[1]?.getAttribute("data-testid")).toBe("correction-card-harmony");
  });
});
