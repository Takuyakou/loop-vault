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

describe("BassPracticeView", () => {
  test("shows only Degree Echo and one primary action per state", async () => {
    const container = await renderView();
    expect(container.textContent).toContain("Degree Echo");
    expect(container.textContent).toContain("自動採点ではありません");
    expect(container.textContent).not.toContain("Rhythm Echo");
    expect(container.textContent).not.toContain("Bassline Echo");
    expect(container.querySelectorAll("[data-primary-action]")).toHaveLength(1);

    await clickPrimary(container); // setup -> ready
    expect(primaryText(container)).toContain("フレーズを再生");
    await clickPrimary(container); // listen -> recall
    expect(primaryText(container)).toContain("歌唱へ");
    await clickPrimary(container); // recall -> singing
    expect(primaryText(container)).toContain("歌えた");
    expect(primary(container)?.disabled).toBe(true);

    const skip = findButton(container, "歌唱をスキップ");
    await act(async () => skip?.click());
    expect(primaryText(container)).toContain("ベースで演奏開始");
    await clickPrimary(container); // thinking -> playing
    await clickPrimary(container); // playing -> review
    expect(container.textContent).toContain("演奏の測定結果ではありません");
    expect(container.querySelector("[data-testid='degree-answer']")?.textContent).not.toContain("?");
    expect(container.querySelectorAll("[data-primary-action]")).toHaveLength(1);

    await act(async () => findButton(container, "Good 3")?.click());
    await clickPrimary(container); // review -> transfer offer
    expect(primaryText(container)).toContain("Transfer");
  });

  test("reveals fretboard markers only through sequential hints", async () => {
    const container = await renderView();
    await clickPrimary(container);
    await clickPrimary(container);
    expect(container.querySelector("[data-testid='degree-fretboard-summary']")?.textContent)
      .toContain("ヒント4まで非表示");

    for (let index = 0; index < 4; index += 1) {
      await act(async () => findButton(container, "Hint")?.click());
    }
    expect(container.textContent).toContain("Hint 4");
    expect(container.querySelector("[data-testid='degree-fretboard-summary']")?.textContent)
      .toContain("1番目");
  });

  test("keeps Hint 0 free of tonal context and note count, then discloses them in order", async () => {
    const container = await renderView();
    expect(container.querySelector("[data-testid='degree-tonal-context']")).toBeNull();
    expect(container.querySelector("[data-testid='degree-note-count']")).toBeNull();
    await clickPrimary(container);
    await clickPrimary(container);

    await act(async () => findButton(container, "Hint")?.click());
    expect(container.querySelector("[data-testid='degree-tonal-context']")?.textContent).toContain("C major");
    expect(container.querySelector("[data-testid='degree-note-count']")).toBeNull();

    await act(async () => findButton(container, "Hint")?.click());
    expect(container.querySelector("[data-testid='degree-note-count']")?.textContent).toContain("notes");
  });

  test("updates the singing CTA at the dwell deadline and completes without skip", async () => {
    vi.useFakeTimers();
    const container = await renderView();
    await clickPrimary(container);
    await clickPrimary(container);
    await clickPrimary(container);
    expect(primary(container)?.disabled).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(primary(container)?.disabled).toBe(false);
    await clickPrimary(container);
    expect(container.querySelector("[data-testid='degree-echo-view']")?.getAttribute("data-practice-state"))
      .toBe("thinking");
  });

  test("uses a real different-key Transfer exercise and resets the second review draft", async () => {
    vi.useFakeTimers();
    const container = await renderView();
    await clickPrimary(container);
    await clickPrimary(container);
    await clickPrimary(container);
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    await clickPrimary(container);
    await clickPrimary(container);
    await clickPrimary(container);
    const sourceDegrees = container.querySelector("[data-testid='degree-answer']")?.textContent;

    await act(async () => findButton(container, "Good 3")?.click());
    const issue = container.querySelector<HTMLSelectElement>("#degree-main-issue");
    await act(async () => {
      if (!issue) return;
      issue.value = "recall";
      issue.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clickPrimary(container);
    await clickPrimary(container);

    const relation = container.querySelector("[data-testid='degree-transfer-relation']");
    expect(relation?.textContent).toContain("C");
    expect(relation?.textContent).toContain("G");
    expect(relation?.textContent).toContain("同じ度数・同じリズム");
    expect(container.querySelector("[data-testid='degree-answer']")?.textContent).toBe(sourceDegrees);
    expect(primaryText(container)).toContain("Transfer演奏を完了");
    expect(container.querySelector("[data-testid='degree-status-announcement']")?.textContent)
      .toBe("Degree Echo: Transfer C → G。移調先はGです。");

    await act(async () => findButton(container, "移調後の音を聴く")?.click());
    expect(container.querySelector("[data-testid='degree-echo-view']")?.getAttribute("data-practice-state"))
      .toBe("transfer");
    await clickPrimary(container);
    expect(container.querySelector("[data-testid='degree-echo-view']")?.getAttribute("data-practice-state"))
      .toBe("review");
    expect(primary(container)?.disabled).toBe(true);
    expect(container.querySelector("[data-review-rating][aria-pressed='true']")).toBeNull();
    expect(container.querySelector<HTMLSelectElement>("#degree-main-issue")?.value).toBe("");

    const calls = vi.mocked(playbackController.play).mock.calls;
    const sourceRequest = calls[0]?.[1];
    const transferRequest = calls[calls.length - 1]?.[1];
    expect(sourceRequest?.type).toBe("notes");
    expect(transferRequest?.type).toBe("notes");
    if (sourceRequest?.type === "notes" && transferRequest?.type === "notes") {
      expect(transferRequest.notes.map((note) => note.pitch))
        .not.toEqual(sourceRequest.notes.map((note) => note.pitch));
    }
  });

  test("does not steal shortcuts from form controls or key repeat", async () => {
    const container = await renderView();
    const select = container.querySelector("select");
    select?.focus();
    await act(async () => select?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(primaryText(container)).toContain("練習を準備");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true })));
    expect(primaryText(container)).toContain("練習を準備");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(primaryText(container)).toContain("フレーズを再生");
  });

  test("keeps the review available and prevents duplicate saves when persistence fails", async () => {
    let rejectSave!: (error: Error) => void;
    const onAttemptCompleted = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const container = await renderView(onAttemptCompleted);
    await clickPrimary(container);
    await clickPrimary(container);
    await clickPrimary(container);
    await act(async () => findButton(container, "歌唱をスキップ")?.click());
    await clickPrimary(container);
    await clickPrimary(container);
    await act(async () => findButton(container, "Good 3")?.click());
    await act(async () => {
      primary(container)?.click();
      primary(container)?.click();
    });
    expect(onAttemptCompleted).toHaveBeenCalledOnce();
    await act(async () => rejectSave(new Error("Practice storage unavailable")));
    expect(container.querySelector("[data-testid='degree-echo-view']")?.getAttribute("data-practice-state")).toBe("review");
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
    await clickPrimary(container); await clickPrimary(container);
    await act(async () => findButton(container, "Hint")?.click());
    expect(container.textContent).toContain("G major");
    await clickPrimary(container);
    await act(async () => findButton(container, "歌唱をスキップ")?.click());
    await clickPrimary(container); await clickPrimary(container);
    await act(async () => findButton(container, "Good 3")?.click()); await clickPrimary(container);
    expect(onAttemptCompleted).toHaveBeenCalledOnce();
    expect(onAttemptCompleted.mock.calls[0][0]).toMatchObject({
      exerciseId: claimedExercise.id,
      reviewQueueClaimId: "claim-v1:easy-source:easy",
      transferOfAttemptId: "easy-source",
    });
  });

  test("reaches an honest summary on the eighth saved exercise", async () => {
    const onSessionRestart = vi.fn(async () => undefined);
    const container = await renderView(async () => undefined, { initialRound: 8, onSessionRestart, sessionId: "session-eight", sessionTargetCount: 8 });
    await clickPrimary(container); await clickPrimary(container); await clickPrimary(container);
    await act(async () => findButton(container, "歌唱をスキップ")?.click());
    await clickPrimary(container); await clickPrimary(container);
    await act(async () => findButton(container, "Good 3")?.click()); await clickPrimary(container);
    await act(async () => { await Promise.resolve(); });
    await act(async () => findButton(container, "今回は完了")?.click());
    expect(container.querySelector("[data-testid='degree-session-summary']")?.textContent).toContain("8 / 8 exercises completed");
    expect(container.textContent).toContain("not an automatic score");
    expect(primaryText(container)).toContain("次のセッション");
    await clickPrimary(container);
    expect(onSessionRestart).toHaveBeenCalledOnce();
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

function primary(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector("[data-primary-action]");
}

function primaryText(container: HTMLElement): string {
  return primary(container)?.textContent ?? "";
}

async function clickPrimary(container: HTMLElement) {
  await act(async () => primary(container)?.click());
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent?.includes(text));
}
