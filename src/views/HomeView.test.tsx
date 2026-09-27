// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { appCopy, type AppLanguage } from "../i18n";
import { HomeView } from "./HomeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
});

afterEach(async () => {
  playbackController.stop();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HomeView hierarchy", () => {
  it("makes Today's Loop primary without a monthly goal summary", async () => {
    const ideas = dashboardIdeas();
    const container = await renderHome(ideas);

    expect(container.querySelector(".lv-section-kicker")?.textContent).toBe(appCopy.ja.home.today);
    expect(container.querySelector("[data-testid='home-focus-chords']")).not.toBeNull();
    expect(container.querySelectorAll("[data-testid='home-focus-chords'] > button")).toHaveLength(1);
    expect(container.textContent).not.toContain(appCopy.ja.home.headline);
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(container.textContent).not.toContain("今月");
    expect(container.querySelector(".md\\:grid-cols-3")).toBeNull();

  });

  it("previews a focus chord card with the shared sound and resolved voicing", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const container = await renderHome(dashboardIdeas());
    const chordCard = container.querySelector<HTMLButtonElement>("[data-home-focus-chord='0']");

    expect(chordCard?.getAttribute("aria-label")).toBe(`${appCopy.ja.common.preview}: Cmaj7`);

    await act(async () => chordCard?.click());

    expect(toggle).toHaveBeenCalledWith(
      { kind: "home", id: "idea:focus:block:block-1:chord:1:1:0" },
      {
        type: "chord",
        chord: {
          root: 0,
          quality: "maj7",
          tensions: [],
          label: "Cmaj7",
        },
        sound: "piano",
        explicitMidiNotes: expect.any(Array),
      },
    );
  });

  it("shows at most three recent progressions and preserves their preview controls", async () => {
    const container = await renderHome(dashboardIdeas());
    const recentCards = Array.from(container.querySelectorAll("article"));

    expect(recentCards).toHaveLength(3);
    expect(recentCards.every((card) => card.querySelector(`[aria-label='${appCopy.ja.common.preview}']`))).toBe(true);
    expect(container.textContent).toContain("Recent 4");
    expect(container.textContent).not.toContain("Recent 1");
  });

  it("keeps the empty-state calls to action in Japanese", async () => {
    const container = await renderHome([]);

    expect(container.querySelector("h2")?.textContent).toBe("今日のLoop");
    expect(buttonTexts(container)).toEqual(expect.arrayContaining([
      appCopy.ja.home.startCapture,
      appCopy.ja.home.newIdea,
      appCopy.ja.home.openVault,
    ]));
  });

  it("renders the primary heading, summary, and empty actions in English", async () => {
    const container = await renderHome([], "en");

    expect(container.querySelector("h2")?.textContent).toBe("Today's Loop");
    expect(buttonTexts(container)).toEqual(expect.arrayContaining([
      appCopy.en.home.startCapture,
      appCopy.en.home.newIdea,
      appCopy.en.home.openVault,
    ]));
  });
  it.each([false, "pending"] as const)(
    "does not announce Next Action completion for %s persistence",
    async (outcome) => {
      const updateNextAction = vi.fn(() => outcome);
      const setToast = vi.fn();
      const container = await renderHome(dashboardIdeas(), "ja", { updateNextAction, setToast });
      const complete = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes(appCopy.ja.home.completeNextAction));
      await act(async () => complete?.click());
      expect(updateNextAction).toHaveBeenCalledWith("focus", "", expect.any(Date));
      expect(setToast).not.toHaveBeenCalledWith(appCopy.ja.toast.nextCompleted);
    },
  );
});

function dashboardIdeas(): SongIdea[] {
  const blocks = [1, 2, 3, 4].map((index) => progressionBlock(index));
  return [
    makeIdea({
      id: "focus",
      title: "Primary loop",
      status: "mix",
      updatedAt: "2026-07-15T00:00:00.000Z",
      statusHistory: [{ status: "mix", at: "2026-07-15T00:00:00.000Z" }],
      progressionBlocks: blocks,
    }),
    makeIdea({
      id: "missing-next",
      title: "Missing next",
      nextAction: { text: "", updatedAt: "2026-07-15T00:00:00.000Z" },
      updatedAt: "2026-07-15T00:00:00.000Z",
    }),
    makeIdea({
      id: "stale",
      title: "Stale loop",
      status: "idea",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
    makeIdea({
      id: "done",
      title: "Finished loop",
      status: "done",
      completedAt: "2026-07-10T00:00:00.000Z",
      statusHistory: [{ status: "done", at: "2026-07-10T00:00:00.000Z" }],
    }),
  ];
}

function progressionBlock(index: number): SavedProgressionBlock {
  return {
    id: `block-${index}`,
    summaryText: `Recent ${index}`,
    chords: [{
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      confidence: 0.9,
      alternatives: [],
      warnings: [],
    }],
    tags: [],
    capturedAt: `2026-07-${10 + index}T00:00:00.000Z`,
    analyzerVersion: "home-test",
  };
}

async function renderHome(
  ideas: SongIdea[],
  language: AppLanguage = "ja",
  overrides: {
    updateNextAction?: (id: string, text: string, now?: Date) => boolean | "pending";
    setToast?: (message: string) => void;
  } = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const copy = appCopy[language];
  await act(async () => {
    root.render(
      <HomeView
        ideas={ideas}
        copy={copy}
        language={language}
        showRomanNumerals={false}
        openDetail={vi.fn()}
        openCapture={vi.fn()}
        openCreate={vi.fn()}
        openVault={vi.fn()}
        updateNextAction={overrides.updateNextAction ?? vi.fn(() => true)}
        setToast={overrides.setToast ?? vi.fn()}
      />,
    );
  });

  return container;
}

function buttonTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button"), (button) => button.textContent ?? "");
}
