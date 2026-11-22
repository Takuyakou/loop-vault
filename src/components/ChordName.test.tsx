// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ChordName } from "./ChordName";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(label: string) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<ChordName label={label} />));
  return host.querySelector<HTMLElement>(".lv-chordname")!;
}

describe("ChordName (P23-04)", () => {
  it("draws the root large and the kind apart, with the shown name as its text", () => {
    const name = render("F#m7b5");
    expect(name.textContent).toBe("F♯m7♭5");
    expect(name.querySelector(".lv-chordname-root")?.textContent).toBe("F♯");
    expect(name.querySelector(".lv-chordname-acc")?.textContent).toBe("♯");
    expect(name.querySelector(".lv-chordname-kind")?.textContent).toBe("m7♭5");
    expect(name.dataset.chordLabel).toBe("F#m7b5");
  });

  it("has no accidental or kind for a bare root", () => {
    const name = render("C");
    expect(name.querySelector(".lv-chordname-acc")).toBeNull();
    expect(name.querySelector(".lv-chordname-kind")).toBeNull();
    expect(name.textContent).toBe("C");
  });

  it.each(["?", "休み"])("draws %s as it is", (label) => {
    const name = render(label);
    expect(name.querySelector(".lv-chordname-root")).toBeNull();
    expect(name.textContent).toBe(label);
  });
});
