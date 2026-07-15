// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../domain/chords";
import type { ChordSymbol } from "../../domain/types";
import { ChordStructureEditor } from "./ChordStructureEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ChordStructureEditor", () => {
  it("rebuilds a structured chord after root, quality, and bass changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    await changeSelect(container, "Root", "2");
    expect(container.querySelector("output")?.textContent).toBe("Dmaj7");

    await changeSelect(container, "Quality", "min7");
    expect(container.querySelector("output")?.textContent).toBe("Dm7");

    await changeSelect(container, "Bass", "6");
    expect(container.querySelector("output")?.textContent).toBe("Dm7/F#");

    await act(async () => root.unmount());
  });
});

function Harness() {
  const [chord, setChord] = useState<ChordSymbol>(makeChordSymbol(0, "maj7"));
  return (
    <>
      <ChordStructureEditor chord={chord} onChange={setChord} language="ja" />
      <output>{chord.label}</output>
    </>
  );
}

async function changeSelect(container: HTMLElement, label: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) {
    throw new Error(`Missing ${label} select`);
  }
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
