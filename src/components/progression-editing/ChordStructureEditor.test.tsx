// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { makeChordSymbol, parseTextChordLabel } from "../../domain/chords";
import type { ChordSymbol } from "../../domain/types";
import { ChordStructureEditor } from "./ChordStructureEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ChordStructureEditor", () => {
  it("keeps altered classification through root and bass edits until an explicit quality change", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness initialChord={parseTextChordLabel("G7alt")!} />));
    await changeSelect(container,"ルート","9");
    expect(container.querySelector("output")?.textContent).toBe("A7alt");
    await changeSelect(container,"ベース","1");
    expect(container.querySelector("output")?.textContent).toBe("A7alt/C#");
    await changeSelect(container,"種類","dom7");
    expect(container.querySelector("output")?.textContent).toBe("A7/C#");
    await changeSelect(container,"種類","alt");
    expect(container.querySelector("output")?.textContent).toBe("A7alt/C#");
    await act(async () => root.unmount());
  });
  it("retains text minor-major canonical spelling while keeping legacy display scoped", async () => {
    for (const [initialChord,expected] of [[parseTextChordLabel("Cm(maj9)")!,"Dm(maj9)"],[makeChordSymbol(0,"minMaj7",["9"]),"DmMaj7(9)"]] as const) {
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<Harness initialChord={initialChord} />));
      await changeSelect(container,"ルート","2");
      expect(container.querySelector("output")?.textContent).toBe(expected);
      await act(async () => root.unmount());
    }
  });
  it("rebuilds a structured chord after root, quality, and bass changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    await changeSelect(container, "ルート", "2");
    expect(container.querySelector("output")?.textContent).toBe("Dmaj7");

    await changeSelect(container, "種類", "min7");
    expect(container.querySelector("output")?.textContent).toBe("Dm7");

    await changeSelect(container, "ベース", "6");
    expect(container.querySelector("output")?.textContent).toBe("Dm7/F#");

    await act(async () => root.unmount());
  });
});

function Harness({initialChord=makeChordSymbol(0,"maj7")}: {initialChord?:ChordSymbol}) {
  const [chord, setChord] = useState<ChordSymbol>(initialChord);
  return (
    <>
      <ChordStructureEditor chord={chord} onChange={setChord} />
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
