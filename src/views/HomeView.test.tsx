// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { createNotificationStore, NotificationProvider, type NotificationStore } from "../components/notifications";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { HomeView, type HomeViewProps } from "./HomeView";
import { TODAY_LOOP_STORAGE_KEY } from "./home/todayLoop";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
  window.localStorage.clear();
});

afterEach(async () => {
  playbackController.stop();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("HomeView", () => {
  it("shows the mock's cards in order with one primary button", async () => {
    const { container } = await renderHome(homeIdeas());
    const sections = Array.from(container.querySelectorAll("section"), (section) => section.getAttribute("aria-label"));
    expect(sections).toEqual(["続きから", "取り込む", "今日のループ", "今日の練習", "最近の進行"]);
    const primary = container.querySelectorAll(".lv-button-primary");
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toBe("続きをやる");
    expect(container.textContent).not.toContain("月間ゴール");
    expect(container.textContent).not.toContain("次の一手");
  });

  it("shows only the first-capture guide when the Vault has no progression", async () => {
    const openCapture = vi.fn();
    const { container } = await renderHome([makeIdea({ id: "empty", progressionBlocks: [] })], { openCapture });
    expect(container.querySelectorAll("section[aria-label]")).toHaveLength(0);
    expect(container.textContent).toContain("最初の進行を取り込む");
    await act(async () => findButton(container, "MIDI から取り込む").click());
    expect(openCapture).toHaveBeenCalledWith("midi");
    await act(async () => findButton(container, "テキストから取り込む").click());
    expect(openCapture).toHaveBeenCalledWith("text");
  });

  it("continues the latest Chord Dojo practice, else the latest edited progression", async () => {
    const openChordDojo = vi.fn();
    const ideas = homeIdeas();
    ideas[0].progressionBlocks![1].practice = { schemaVersion: 1, progressionFingerprint: "x", lastPracticedAt: new Date(2026, 8, 27, 22, 40).toISOString() };
    const { container } = await renderHome(ideas, { openChordDojo });
    const card = container.querySelector("[data-testid='home-continue']")!;
    expect(card.textContent).toContain("Chord Dojo · 昨日 22:40");
    expect(card.textContent).toContain("Idea · 2");
    await act(async () => findButton(card, "続きをやる").click());
    expect(openChordDojo).toHaveBeenCalledWith({ ideaId: "idea", blockId: "block-2" });

    const openProgression = vi.fn();
    const plain = await renderHome(homeIdeas(), { openProgression });
    const plainCard = plain.container.querySelectorAll("[data-testid='home-continue']")[0]!;
    expect(plainCard.textContent).toContain("最後に更新");
    await act(async () => findButton(plainCard, "続きをやる").click());
    expect(openProgression).toHaveBeenCalledWith("idea", "block-4");
  });

  it("keeps today's loop for the day in device storage and never writes it to the Vault", async () => {
    const updateProgressionBlock = vi.fn(() => true as const);
    const first = await renderHome(homeIdeas(), { updateProgressionBlock });
    const loopId = first.container.querySelector("[data-testid='home-today-loop']")?.getAttribute("data-progression-id");
    expect(loopId).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(TODAY_LOOP_STORAGE_KEY)!).picks["2026-09-28"]).toBe(loopId);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));

    const reopened = await renderHome(homeIdeas(), { updateProgressionBlock });
    expect(reopened.container.querySelector("[data-testid='home-today-loop']")?.getAttribute("data-progression-id")).toBe(loopId);
    expect(updateProgressionBlock).not.toHaveBeenCalled();
  });

  it("swaps today's loop with an undo toast", async () => {
    const notifications = createNotificationStore();
    const notify = vi.spyOn(notifications, "notify");
    const { container } = await renderHome(homeIdeas(), {}, notifications);
    const loop = () => container.querySelector("[data-testid='home-today-loop']")?.getAttribute("data-progression-id");
    const before = loop();
    await act(async () => findButton(container, "他のループ").click());
    expect(loop()).not.toBe(before);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: "今日のループを入れ替えました", tone: "info" }));
    const undo = notify.mock.calls[0][0].action!;
    expect(undo.label).toBe("元に戻す");
    await act(async () => undo.onClick());
    expect(loop()).toBe(before);
  });

  it("toggles the loop's favorite through the stored progression's pinned flag", async () => {
    const updateProgressionBlock = vi.fn(() => true as const);
    const { container } = await renderHome(homeIdeas(), { updateProgressionBlock });
    const card = container.querySelector("[data-testid='home-today-loop']")!;
    const [ideaId, blockId] = card.getAttribute("data-progression-id")!.split(":");
    await act(async () => card.querySelector<HTMLButtonElement>("[aria-label='お気に入りに追加']")!.click());
    expect(updateProgressionBlock).toHaveBeenCalledWith(ideaId, blockId, { pinned: true });
  });

  it("previews a loop chord with the shared sound and resolved voicing", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const { container } = await renderHome(homeIdeas());
    const chip = container.querySelector<HTMLButtonElement>("[data-home-loop-chord='0']");
    expect(chip?.getAttribute("aria-label")).toBe("試聴: Cmaj7");
    await act(async () => chip?.click());
    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "home" }),
      expect.objectContaining({ type: "chord", sound: "piano", explicitMidiNotes: expect.any(Array) }),
    );
  });

  it("lists recent progressions newest first, opening the progression page and Voicing Loop", async () => {
    const openProgression = vi.fn();
    const openVoicingLoop = vi.fn();
    const { container } = await renderHome(homeIdeas(6), { openProgression, openVoicingLoop });
    const rows = Array.from(container.querySelectorAll("[data-testid='home-recent-row']"));
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain("Idea · 6");
    await act(async () => (rows[0] as HTMLElement).click());
    expect(openProgression).toHaveBeenCalledWith("idea", "block-6");
    await act(async () => findButton(rows[1], "練習").click());
    expect(openVoicingLoop).toHaveBeenCalledWith({ ideaId: "idea", blockId: "block-5" });
  });

  it("shows today's practice count and streak from existing records only", async () => {
    const ideas = homeIdeas();
    ideas[0].progressionBlocks![0].practice = { schemaVersion: 1, progressionFingerprint: "x", lastPracticedAt: new Date(2026, 8, 28, 9).toISOString() };
    ideas[0].progressionBlocks![1].practice = { schemaVersion: 1, progressionFingerprint: "y", lastPracticedAt: new Date(2026, 8, 27, 9).toISOString() };
    const { container } = await renderHome(ideas);
    const card = container.querySelector("section[aria-label='今日の練習']")!;
    expect(card.textContent).toContain("今日 1進行");
    expect(card.querySelector("[data-testid='home-practice-streak']")?.textContent).toContain("2日連続");
    expect(card.querySelectorAll(".lv-home-dot[data-practiced='true']")).toHaveLength(2);
  });
});

function homeIdeas(count = 4): SongIdea[] {
  return [makeIdea({
    id: "idea",
    title: "Idea",
    updatedAt: new Date(2026, 8, 1).toISOString(),
    progressionBlocks: Array.from({ length: count }, (_, index) => progressionBlock(index + 1)),
  })];
}

function progressionBlock(index: number): SavedProgressionBlock {
  return {
    id: `block-${index}`,
    summaryText: `Loop ${index}`,
    chords: [
      { bar: 1, beat: 1, durationBeats: 4, chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" }, confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 2, beat: 1, durationBeats: 4, chord: { root: 7, quality: "dom7", tensions: [], label: "G7" }, confidence: 0.9, alternatives: [], warnings: [] },
    ],
    detectedKey: "C",
    bpm: 90,
    tags: [],
    capturedAt: new Date(2026, 8, 10 + index).toISOString(),
    analyzerVersion: "home-test",
  };
}

async function renderHome(ideas: SongIdea[], overrides: Partial<HomeViewProps> = {}, notifications: NotificationStore = createNotificationStore()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <NotificationProvider store={notifications}>
        <HomeView
          ideas={ideas}
          bassPracticeAvailable={false}
          showRomanNumerals
          openProgression={vi.fn()}
          openCapture={vi.fn()}
          openVault={vi.fn()}
          openChordDojo={vi.fn()}
          openBassPractice={vi.fn()}
          openVoicingLoop={vi.fn()}
          updateProgressionBlock={vi.fn(() => true as const)}
          {...overrides}
        />
      </NotificationProvider>,
    );
  });
  return { container, notifications };
}

function findButton(scope: Element, text: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}
