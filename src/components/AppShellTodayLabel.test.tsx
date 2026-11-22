// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { AppShell } from "./AppShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mockNarrow(narrow: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: narrow && query.includes("max-width"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { document.body.innerHTML = ""; });

async function renderShell(narrow: boolean) {
  mockNarrow(narrow);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AppShell
      view="home"
      setView={vi.fn()}
      openLiveMidi={vi.fn()}
      openMidiSettings={vi.fn()}
      openVoicingLoop={vi.fn()}
      openSettings={vi.fn()}
      copy={appCopy.ja}
      saveStatus="saved"
      masterVolume={100}
      onMasterVolumeChange={vi.fn()}
      bassPracticeAvailable
      pageTitle="ホーム"
    >
      <main>Content</main>
    </AppShell>,
  ));
  return container;
}

const label = (container: HTMLElement, nav: string) => container.querySelector(`[data-nav="${nav}"]`)!.getAttribute("aria-label");

// P23-61 §7: the side menu's 今日弾きました dot is gone (the Home's records say it); the narrow rows are named by
// their label alone.
describe("P23-61 §7: the side menu has no 今日弾きました mark", () => {
  it("the narrow rows read their label, and nothing in the menu says 今日弾きました", async () => {
    const container = await renderShell(true);
    expect(label(container, "voicing-loop")).toBe("Voicing Loop");
    expect(label(container, "bass-practice")).toBe("Bass Practice");
    expect(label(container, "chord-dojo")).toBe("Chord Dojo");
    expect(container.querySelectorAll('[data-testid="nav-today-dot"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("今日弾きました");
  });

  it("the wide menu keeps no aria-label (the visible name is read)", async () => {
    const container = await renderShell(false);
    expect(label(container, "voicing-loop")).toBeNull();
    expect(container.querySelector('[data-nav="voicing-loop"]')!.textContent).toContain("Voicing Loop");
    expect(container.textContent).not.toContain("今日弾きました");
  });
});
