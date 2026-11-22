// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { playbackController } from "../../../audio/playbackController";
import type { PracticeAttempt } from "../domain";
import { generatedExercise } from "../domain/testFixtures";
import { BassPracticeView } from "./BassPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// P23-62: the stage owns every control; the headless recorder is the only part that needs the browser.
vi.mock("../recording/ui/RecordCompareSection", () => ({
  RecordCompareSection: ({ midiRecording }: { midiRecording?: { commands: { current: unknown } } }) => {
    if (midiRecording) midiRecording.commands.current = { start: () => {}, stop: () => {}, playTake: () => {}, playOverlay: () => {}, keep: () => {} };
    return null;
  },
}));

let root: Root | undefined;

beforeEach(() => {
  vi.spyOn(playbackController, "play").mockImplementation(async (_source, _request, lifecycle) => {
    lifecycle?.onStarted?.();
    lifecycle?.onEnded?.("completed");
  });
});

afterEach(async () => {
  playbackController.stop();
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BassPracticeView (P23-62 stage)", () => {
  test("shows only 度数 and the three steps, with one primary action", async () => {
    const container = await renderView();
    const frame = frameOf(container);
    expect(frame.getAttribute("data-stage-step")).toBe("0");
    expect(frame.getAttribute("data-practice-state")).toBe("ready");
    expect(steps(container)).toEqual(["1聴く", "2弾く", "3結果"]);
    expect(container.textContent).not.toContain("リズム");
    expect(container.textContent).not.toContain("ルートの動き");
    expect(container.textContent).not.toContain("コード進行のベース");
    // The one filled action of 聴く is 「● 録って弾く」; nothing else is primary.
    expect(container.querySelectorAll("[data-tone='primary']")).toHaveLength(1);
    expect(primary(container)?.textContent).toContain("録って弾く");
    // It waits for the first listen, and so does the take without a microphone.
    expect(byTestId(container, "degree-record")?.disabled).toBe(true);
    expect(byTestId(container, "degree-play-without-take")?.disabled).toBe(true);
    expect(container.textContent).toContain("まず ▶ でお手本を聴きます");
  });

  test("hides the notes until the hints are opened, and draws the fretboard with the last one", async () => {
    const container = await renderView();
    await listen(container);
    // Hint 0: the lane only says which note it is.
    expect(laneLabels(container)).toEqual(["1 音目", "2 音目", "3 音目", "4 音目"]);
    expect(container.querySelector("[data-testid='bp-fretboard']")).toBeNull();

    await openHint(container);
    expect(container.textContent).toContain("輪郭");
    expect(laneLabels(container)).toEqual(["1 音目", "2 音目", "3 音目", "4 音目"]);
    expect(container.querySelector("[data-testid='bp-fretboard']")).toBeNull();

    await openHint(container);
    // 度数: the degrees are shown, the names are still hidden.
    expect(laneLabels(container)[0]).toMatch(/^1 音目 1/);
    expect(laneLabels(container)[0]).not.toMatch(/[A-G]♭?\d/);
    expect(container.querySelector("[data-testid='bp-fretboard']")).toBeNull();

    await openHint(container);
    expect(laneLabels(container)[0]).toMatch(/^1 音目 1 [A-G]/);
    expect(container.querySelector("[data-testid='bp-fretboard']")).not.toBeNull();
    // The chips open one at a time and in order; each one is pressed once opened.
    expect(hintStates(container)).toEqual(["open", "open", "open"]);
  });

  test("shows the key and the tempo in the meta line (the stage has no tonal-context hint any more)", async () => {
    const container = await renderView();
    expect(container.querySelector(".bp-meta")?.textContent).toContain("C メジャー");
    expect(container.querySelector(".bp-meta")?.textContent).toMatch(/\d+ BPM/);
    expect(container.querySelector(".bp-meta")?.textContent).toMatch(/\d+ 拍/);
    // The practice no longer has a 「練習を準備」 screen: 聴く is where it opens.
    expect(container.textContent).not.toContain("練習を準備");
  });

  test("the singing reference is optional and the answer is reached without singing", async () => {
    const container = await renderView();
    await listen(container);
    const sing = byTestId(container, "degree-singing-reference");
    expect(sing?.textContent).toContain("歌う参考音");
    await act(async () => { sing?.click(); await Promise.resolve(); });
    // 歌う is a reference only: the step does not move.
    expect(frameOf(container).getAttribute("data-stage-step")).toBe("0");
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("recall");

    // Answering without singing passes 歌う・考える・弾く and lands on the result.
    await byTestId(container, "degree-play-without-take")!.click();
    expect(frameOf(container).getAttribute("data-stage-step")).toBe("1");
    await byTestId(container, "degree-show-answer")!.click();
    expect(frameOf(container).getAttribute("data-stage-step")).toBe("2");
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("review");
    expect(container.textContent).toContain("録音なし・自分で評価");
  });

  test("uses a real different-key Transfer exercise and resets the second review draft", async () => {
    const container = await renderView();
    const sourceDegrees = await answerWithoutRecording(container);
    await rate(container, "good");
    expect(byTestId(container, "degree-next")?.disabled).toBe(false);

    await act(async () => { byTestId(container, "degree-transfer")?.click(); await Promise.resolve(); });
    const relation = container.querySelector("[data-testid='degree-transfer-relation']");
    expect(relation?.textContent).toContain("C メジャー");
    expect(relation?.textContent).toContain("G メジャー");
    expect(container.querySelector(".bp-meta")?.textContent).toContain("G メジャー");
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("transfer");
    // 別のキーで: the same degrees, packed into the frets; the hints are gone and it can be heard any number of times.
    expect(container.querySelectorAll(".bp-hint")).toHaveLength(0);
    expect(container.textContent).toContain("何度でも聴けます");
    expect(byTestId(container, "degree-listen")?.disabled).toBe(false);
    // ▶ in the new key plays the same degrees on other pitches.
    await listen(container);

    await byTestId(container, "degree-play-without-take")!.click();
    await byTestId(container, "degree-show-answer")!.click();
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("review");
    // The second review starts empty: no rating is chosen and 次のフレーズ waits for one.
    expect(container.querySelector("[data-review-rating][aria-pressed='true']")).toBeNull();
    expect(byTestId(container, "degree-next")?.disabled).toBe(true);
    // Same degrees as the source (1 ♭3 4 5), not the same pitches.
    const transferDegrees = laneLabels(container).map((label) => label.split(" ")[3]);
    expect(transferDegrees).toEqual(sourceDegrees.degrees);

    const calls = vi.mocked(playbackController.play).mock.calls;
    const noteRequests = calls.map((call) => call[1]).filter((request) => request.type === "notes");
    expect(noteRequests.length).toBeGreaterThan(0);
    const pitches = noteRequests.map((request) => request.type === "notes" ? request.notes.map((note) => note.pitch) : []);
    expect(new Set(pitches.map((value) => value.join(","))).size).toBeGreaterThan(1);
  });

  test("does not steal shortcuts from form controls or key repeat", async () => {
    const container = await renderView();
    const select = container.querySelector("select");
    select?.focus();
    await act(async () => select?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("ready");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true })));
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("ready");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(frameOf(container).getAttribute("data-practice-state")).not.toBe("ready");
  });

  test("keeps the review available and prevents duplicate saves when persistence fails", async () => {
    let rejectSave!: (error: Error) => void;
    const onAttemptCompleted = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const container = await renderView(onAttemptCompleted);
    await answerWithoutRecording(container);
    await rate(container, "good");
    await act(async () => {
      byTestId(container, "degree-next")?.click();
      byTestId(container, "degree-next")?.click();
      await Promise.resolve();
    });
    expect(onAttemptCompleted).toHaveBeenCalledOnce();
    await act(async () => { rejectSave(new Error("Practice storage unavailable")); await Promise.resolve(); });
    expect(frameOf(container).getAttribute("data-practice-state")).toBe("review");
    expect(container.textContent).toContain("Practice storage unavailable");
  });

  test("restores a claimed exercise and persists its exact claim and transfer lineage", async () => {
    const onAttemptCompleted = vi.fn(async (_attempt: PracticeAttempt) => undefined);
    const claimedExercise = generatedExercise({ seed: "review-v1:easy-source:easy", key: "G" });
    const container = await renderView(onAttemptCompleted, {
      initialClaim: {
        claimId: "claim-v1:easy-source:easy",
        exercise: claimedExercise,
        sourceAttemptId: "easy-source",
        transferOfAttemptId: "easy-source",
        reason: "easy",
      },
      sessionId: "claimed-session",
    });
    expect(container.querySelector(".bp-meta")?.textContent).toContain("G メジャー");
    await answerWithoutRecording(container);
    await rate(container, "good");
    await act(async () => { byTestId(container, "degree-next")?.click(); await Promise.resolve(); });
    expect(onAttemptCompleted).toHaveBeenCalledOnce();
    expect(onAttemptCompleted.mock.calls[0][0]).toMatchObject({
      exerciseId: claimedExercise.id,
      reviewQueueClaimId: "claim-v1:easy-source:easy",
      transferOfAttemptId: "easy-source",
    });
  });

  test("reaches an honest 8 / 8 on the eighth saved exercise", async () => {
    const onSessionRestart = vi.fn(async () => undefined);
    const container = await renderView(async () => undefined, { initialRound: 8, onSessionRestart, sessionId: "session-eight", sessionTargetCount: 8 });
    await answerWithoutRecording(container);
    await rate(container, "good");
    // The stage says where the session stands and names the last button for it.
    expect(container.textContent).toContain("このセッション 8 / 8 問");
    expect(primaryText(container)).toContain("次の 8 問へ");
    await act(async () => { byTestId(container, "degree-next")?.click(); await Promise.resolve(); });
    // The next exercise is offered (the old summary screen is gone).
    expect(frameOf(container).getAttribute("data-stage-step")).toBe("0");
    expect(container.textContent).toContain("聴いて、同じフレーズを弾きます");
  });
});

async function renderView(
  onAttemptCompleted?: Parameters<typeof BassPracticeView>[0]["onAttemptCompleted"],
  props: Partial<ComponentProps<typeof BassPracticeView>> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<BassPracticeView {...props} onAttemptCompleted={onAttemptCompleted} />));
  return container;
}

function frameOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-testid='degree-echo-view']")!;
}

function byTestId(container: HTMLElement, testId: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`);
}

function primary(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[data-tone='primary']");
}

function primaryText(container: HTMLElement): string {
  return primary(container)?.textContent ?? "";
}

function steps(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".bp-step")).map((step) => (step.textContent ?? "").replace(/\s+/g, " ").trim());
}

function laneLabels(container: HTMLElement): string[] {
  const row = container.querySelector(".bp-lane-row[aria-label='お手本の段']");
  return Array.from(row?.querySelectorAll(".bp-note") ?? []).map((note) => note.getAttribute("aria-label") ?? "");
}

function hintStates(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".bp-hint")).map((chip) => chip.dataset.state ?? "");
}

async function listen(container: HTMLElement) {
  await act(async () => { byTestId(container, "degree-listen")?.click(); await Promise.resolve(); });
}

async function openHint(container: HTMLElement) {
  const next = container.querySelector<HTMLButtonElement>(".bp-hint[data-state='next']");
  await act(async () => { next?.click(); await Promise.resolve(); });
}

async function rate(container: HTMLElement, rating: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-review-rating='${rating}']`);
  await act(async () => { button?.click(); await Promise.resolve(); });
}

/** 聴く → 録らずに弾く → 弾けた・答えを見る: the same path a PC without a microphone takes. */
async function answerWithoutRecording(container: HTMLElement) {
  await listen(container);
  await act(async () => { byTestId(container, "degree-play-without-take")?.click(); await Promise.resolve(); });
  await act(async () => { byTestId(container, "degree-show-answer")?.click(); await Promise.resolve(); });
  // The result lane: 「お手本 n 音目 <degree> <name>」.
  const degrees = laneLabels(container).map((label) => label.split(" ")[3]);
  return { degrees };
}
