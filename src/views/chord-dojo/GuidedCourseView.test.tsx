// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedCourseView } from "./GuidedCourseView";
import { playbackController } from "../../audio/playbackController";
import { courseItemById, delayIds, itemLabel, sameDayIds, sameDayNameIds } from "../../domain/chordDojo/guidedCourse/bank";
import { clearActiveAttempt } from "../../domain/chordDojo/guidedCourse/review";
import { createCourseStore, createCourseTrial } from "../../domain/chordDojo/guidedCourse/store";
import type { ActiveAttempt, CourseStore, CourseTrial } from "../../domain/chordDojo/guidedCourse/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "loop-vault:guided-course-v1:data";
const AT = new Date().toISOString();
const OLD = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

function trial(attempt: ActiveAttempt, id: string, result: CourseTrial["result"], at: string): CourseTrial {
  const item = courseItemById(id)!;
  const midi = attempt.mode === "midi";
  return createCourseTrial({
    attempt,
    itemId: id,
    quality: item.quality,
    root: item.root,
    result,
    sealedNotes: result === "correct" ? item.referenceNotes : [],
    ...(result === "correct" ? { speedMs: 1200 } : {}),
    midiConfirmed: midi,
    selfConfirmed: !midi,
    startedAt: at,
    sealedAt: at,
  });
}

function sameDayAttempt(level: 1 | 2 | 3, mode: "midi" | "self", at: string): ActiveAttempt {
  return { level, block: "sameDay", attemptId: `seed-${level}-d`, startedAt: at, mode };
}

function seed(store: CourseStore | undefined): void {
  window.localStorage.clear();
  if (store !== undefined) {
    window.localStorage.setItem(KEY, JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store }));
  }
}

async function settle(container: HTMLElement): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (container.querySelector('[data-testid="course-prompt-name"]')
      ?? container.querySelector('[data-testid="course-demo"]')
      ?? container.querySelector('[data-testid="course-result"]')
      ?? container.querySelector('[data-testid="course-delay-wait"]')
      ?? container.querySelector('[data-testid="course-unreadable"]')
      ?? container.querySelector('[data-testid="course-practice"]')) return;
  }
}

async function settleMap(container: HTMLElement): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (container.querySelector('[data-testid="course-map"]') ?? container.querySelector('[data-testid="course-unreadable"]')) return;
  }
}

async function enterFromMap(container: HTMLElement): Promise<void> {
  await settleMap(container);
  const go = container.querySelector('[data-testid="course-map-go"]') as HTMLButtonElement | null;
  if (go !== null) {
    await act(async () => { go.click(); });
  }
  await settle(container);
}

function mount(): { container: HTMLDivElement; root: ReturnType<typeof createRoot>; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<GuidedCourseView settleMs={60} onExit={() => undefined} />); });
  return { container, root, unmount: () => act(() => root.unmount()) };
}

describe("P23-40 guided course screen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(playbackController, "play").mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("shows C → Cm → F → Fm examples before the first confirmation and records nothing", async () => {
    seed(undefined);
    const view = mount();
    await enterFromMap(view.container);
    const ids = ["lv1-n-001", "lv1-n-004", "lv1-n-013", "lv1-n-016"] as const;
    for (const [index, id] of ids.entries()) {
      expect(view.container.querySelector('[data-testid="course-demo-name"]')!.textContent).toBe(itemLabel(courseItemById(id)!));
      expect(view.container.querySelector('[data-testid="course-progress"]')!.textContent).toBe(`見本 ${index + 1} / 4`);
      expect(view.container.querySelector('[data-testid="course-demo-notes"]')!.textContent).toContain("C");
      if (index < ids.length - 1) {
        await act(async () => { (view.container.querySelector('[data-testid="course-demo-next"]') as HTMLButtonElement).click(); });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      }
    }
    expect(view.container.querySelector('[data-testid="course-demo-start"]')).not.toBeNull();
    const before = window.localStorage.getItem(KEY);
    expect(before === null || JSON.parse(before).trials.length === 0).toBe(true);
    await act(async () => { (view.container.querySelector('[data-testid="course-demo-again"]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-testid="course-demo-name"]')!.textContent).toBe("C");
    for (let index = 0; index < 3; index += 1) {
      await act(async () => { (view.container.querySelector('[data-testid="course-demo-next"]') as HTMLButtonElement).click(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    await act(async () => { (view.container.querySelector('[data-testid="course-demo-start"]') as HTMLButtonElement).click(); });
    await settle(view.container);
    expect(view.container.querySelector('[data-testid="course-prompt-name"]')).not.toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.active).toBeTruthy();
    expect(stored.trials).toEqual([]);
    view.unmount();
  });

  it("skips the examples from any step and starts the same confirmation", async () => {
    seed(undefined);
    const view = mount();
    await enterFromMap(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="course-demo-next"]') as HTMLButtonElement).click(); });
    await act(async () => { (view.container.querySelector('[data-testid="course-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container);
    expect(view.container.querySelector('[data-testid="course-prompt-name"]')).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY)!).trials).toEqual([]);
    view.unmount();
  });

  it("starts at Lv1 with the first frozen question, records a self-confirmation and resumes", async () => {
    seed({ ...createCourseStore(), trials: [], active: sameDayAttempt(1, "self", AT) });
    const first = mount();
    await enterFromMap(first.container);
    const firstId = sameDayNameIds(1)[0]!;
    expect(first.container.querySelector('[data-testid="course-prompt-name"]')!.textContent).toBe(itemLabel(courseItemById(firstId)!));
    expect(first.container.querySelector('[data-testid="course-level"]')!.textContent).toBe("Lv1");
    expect(first.container.querySelector(".gc-head")!.textContent).not.toContain(itemLabel(courseItemById(firstId)!));
    expect(first.container.querySelector('[data-testid="course-feedback-text"]')!.textContent).toBe("演奏を待っています");
    expect(first.container.querySelector('[data-testid="course-self-note"]')!.textContent).toContain("自己確認です。進級判定には含まれません");
    expect(first.container.querySelector('[data-testid="course-end"]')).toBeNull();
    expect(first.container.querySelector('[data-testid="dojo-back"]')).not.toBeNull();
    expect(first.container.querySelector('[data-testid="course-next"]')!.hasAttribute("disabled")).toBe(true);

    await act(async () => { (first.container.querySelector('[data-testid="course-self-ok"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(first.container.querySelector('[data-testid="course-feedback-text"]')!.textContent).toContain("弾けた（自己確認）");
    expect(first.container.querySelector('[data-testid="course-example-label"]')).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.trials).toHaveLength(1);
    expect(stored.trials[0].result).toBe("correct");
    expect(stored.trials[0].midiConfirmed).toBe(false);
    expect(window.localStorage.getItem("loop-vault:chord-dojo-txt-jazz-v1:data")).toBeNull();

    await act(async () => { (first.container.querySelector('[data-testid="course-next"]') as HTMLButtonElement).click(); });
    await settle(first.container);
    const secondId = sameDayNameIds(1)[1]!;
    expect(first.container.querySelector('[data-testid="course-prompt-name"]')!.textContent).toBe(itemLabel(courseItemById(secondId)!));
    first.unmount();

    const resumed = mount();
    await enterFromMap(resumed.container);
    expect(resumed.container.querySelector('[data-testid="course-prompt-name"]')!.textContent).toBe(itemLabel(courseItemById(secondId)!));
    resumed.unmount();
  });

  it("does not initialise over unreadable data and offers an explicit quarantine", async () => {
    window.localStorage.setItem(KEY, "{damaged");
    const view = mount();
    await settle(view.container);
    expect(view.container.querySelector('[data-testid="course-unreadable"]')).not.toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe("{damaged");
    view.unmount();
  });

  it("shows a failed same-day summary with a retry instead of a pass", async () => {
    const attempt = sameDayAttempt(1, "self", AT);
    const trials = sameDayIds(1).map((id) => trial(attempt, id, "wrong", AT));
    seed({ ...createCourseStore(), trials, active: attempt });
    const view = mount();
    await enterFromMap(view.container);
    expect(view.container.querySelector('[data-testid="course-result"]')!.getAttribute("data-ok")).toBe("false");
    expect(view.container.querySelector(".gc-sheet h2")!.textContent).toContain("20問中 0問");
    expect(view.container.querySelector("details")!.hasAttribute("open")).toBe(false);
    expect(view.container.querySelector('[data-testid="course-retry"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="course-start-delay"]')).toBeNull();
    view.unmount();
  });

  it("shows Lv1 waiting on the course map after a same-day pass and opens Lv2 while delayed waits", async () => {
    const attempt = sameDayAttempt(1, "midi", AT);
    const trials = sameDayIds(1).map((id) => trial(attempt, id, "correct", AT));
    seed(clearActiveAttempt({ ...createCourseStore(), trials, active: attempt }));
    const view = mount();
    await settleMap(view.container);
    expect(view.container.querySelector('[data-testid="course-station-1"]')!.getAttribute("data-state")).toBe("waiting");
    expect(view.container.querySelector('[data-testid="course-station-2"]')!.getAttribute("data-state")).toBe("now");
    await act(async () => { (view.container.querySelector('[data-testid="course-station-1"]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-testid="course-map-detail"]')!.textContent).toContain("から別の日の確認ができます");
    expect(view.container.querySelector('[data-testid="course-map-go"]')).toBeNull();
    view.unmount();
  });

  it("shows a completed delayed pass with the next-level action", async () => {
    const sameDay = sameDayAttempt(1, "midi", OLD);
    const delay: ActiveAttempt = { level: 1, block: "delay", attemptId: "seed-1-l", startedAt: AT, mode: "midi" };
    const trials = [
      ...sameDayIds(1).map((id) => trial(sameDay, id, "correct", OLD)),
      ...delayIds(1).map((id) => trial(delay, id, "correct", AT)),
    ];
    seed({ ...createCourseStore(), trials, active: delay });
    const view = mount();
    await enterFromMap(view.container);
    expect(view.container.querySelector('[data-testid="course-result"]')!.getAttribute("data-ok")).toBe("true");
    expect(view.container.querySelector('[data-testid="course-result"]')!.getAttribute("data-formal")).toBe("true");
    expect(view.container.querySelector(".gc-sheet h2")!.textContent).toContain("10問中 10問で合格");
    expect(view.container.querySelector('[data-testid="course-next-level"]')).not.toBeNull();
    view.unmount();
  });

  it("shows the example automatically after a wrong self-confirmation and keeps the result", async () => {
    seed({ ...createCourseStore(), trials: [], active: sameDayAttempt(1, "self", AT) });
    const view = mount();
    await enterFromMap(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="course-self-miss"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.container.querySelector('[data-testid="course-feedback-text"]')!.textContent).toBe("まだ難しい");
    expect(view.container.querySelector('[data-testid="course-example-label"]')!.textContent).toContain("弾き方の例");
    await act(async () => { (view.container.querySelector('[data-testid="course-chord-card"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.trials).toHaveLength(1);
    expect(stored.trials[0].result).toBe("wrong");
    view.unmount();
  });

  it("shows a hint as assisted and records it without making it an independent answer", async () => {
    seed({ ...createCourseStore(), trials: [], active: sameDayAttempt(1, "self", AT) });
    const view = mount();
    await enterFromMap(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="course-chord-card"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.container.querySelector('[data-testid="course-chord-card-hint"]')!.textContent).toContain("ヒントを聴きました");
    await act(async () => { (view.container.querySelector('[data-testid="course-self-ok"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.trials[0].hintUsed).toBe(true);
    expect(stored.trials[0].midiConfirmed).toBe(false);
    view.unmount();
  });

  it("shows an invalid attempt as not recorded and offers もう一度 without storing an answer", async () => {
    seed({ ...createCourseStore(), trials: [], active: sameDayAttempt(1, "self", AT) });
    const view = mount();
    await enterFromMap(view.container);
    try {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(view.container.querySelector('[data-testid="course-feedback-text"]')!.textContent).toBe("この回答は記録していません。もう一度弾いてください");
      expect(view.container.querySelector('[data-testid="course-next"]')!.textContent).toBe("もう一度");
      const stored = JSON.parse(window.localStorage.getItem(KEY)!);
      expect(stored.trials).toHaveLength(1);
      expect(stored.trials[0].result).toBe("invalid");
      expect(stored.trials[0].invalidReason).toBe("hidden");
      await act(async () => { (view.container.querySelector('[data-testid="course-next"]') as HTMLButtonElement).click(); });
      expect(view.container.querySelector('[data-testid="course-feedback-text"]')!.textContent).toBe("演奏を待っています");
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      view.unmount();
    }
  });

  it("confirms a level restart, cancels back to the same question and returns to Lv1's examples", async () => {
    const attempt: ActiveAttempt = { level: 1, block: "sameDay", attemptId: "restart-1", startedAt: AT, mode: "self" };
    const trials = sameDayNameIds(1).slice(0, 4).map((id) => trial(attempt, id, "correct", AT));
    seed({ ...createCourseStore(), trials, active: attempt });
    const first = mount();
    await enterFromMap(first.container);
    expect(first.container.querySelector('[data-testid="course-progress"]')!.textContent).toBe("コード名 5 / 20");

    await act(async () => { (first.container.querySelector('[data-testid="course-restart"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')!.textContent).toBe("Lv1を最初からやり直しますか？");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("5 / 20問目");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("最初の見本");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("合格記録は残ります");
    expect(document.activeElement).toBe(document.querySelector('[data-testid="level-restart-cancel"]'));
    expect(document.querySelector('[data-testid="level-restart-cancel"]')!.textContent).toBe("5問目から続ける");
    expect(document.querySelector('[data-testid="level-restart-confirm"]')!.textContent).toBe("Lv1を最初から");
    await act(async () => { (document.querySelector('[data-testid="level-restart-cancel"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')).toBeNull();
    expect(first.container.querySelector('[data-testid="course-progress"]')!.textContent).toBe("コード名 5 / 20");

    await act(async () => { (first.container.querySelector('[data-testid="course-restart"]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-testid="level-restart-confirm"]') as HTMLButtonElement).click(); });
    await settle(first.container);
    expect(first.container.querySelector('[data-testid="course-demo"]')).not.toBeNull();
    expect(first.container.querySelector('[data-testid="course-demo-name"]')!.textContent).toBe("C");
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.rounds["1"]).toBeTruthy();
    expect(stored.trials).toHaveLength(4);
    first.unmount();

    // Reopening the course keeps the new round: the examples, not the old fifth question.
    const resumed = mount();
    await enterFromMap(resumed.container);
    expect(resumed.container.querySelector('[data-testid="course-demo"]')).not.toBeNull();
    expect(resumed.container.querySelector('[data-testid="course-prompt-name"]')).toBeNull();
    resumed.unmount();
  });

  it("keeps the focus on the restart dialog when the question's late focus frame comes after it opened", async () => {
    // P23-49: under load the question's requestAnimationFrame can run after the dialog has opened and focused
    // 「5問目から続ける」. Hold the frames, open the dialog, then let them run: the focus must stay in the dialog.
    const attempt: ActiveAttempt = { level: 1, block: "sameDay", attemptId: "restart-late-frame", startedAt: AT, mode: "self" };
    seed({ ...createCourseStore(), trials: sameDayNameIds(1).slice(0, 4).map((id) => trial(attempt, id, "correct", AT)), active: attempt });
    const held: FrameRequestCallback[] = [];
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { held.push(callback); return held.length; });
    const view = mount();
    try {
      await enterFromMap(view.container);
      expect(view.container.querySelector('[data-testid="course-prompt-name"]')).not.toBeNull();
      expect(held.length).toBeGreaterThan(0);
      await act(async () => { (view.container.querySelector('[data-testid="course-restart"]') as HTMLButtonElement).click(); });
      const cancel = document.querySelector('[data-testid="level-restart-cancel"]');
      expect(document.activeElement).toBe(cancel);
      await act(async () => { for (const callback of held.splice(0)) callback(performance.now()); });
      expect(document.activeElement).toBe(cancel);
      await act(async () => { (cancel as HTMLButtonElement).click(); });
    } finally {
      frame.mockRestore();
      view.unmount();
    }
  });

  it("restarts basic free practice to the first item", async () => {
    seed({ ...createCourseStore(), trials: [], active: undefined });
    const view = mount();
    await settleMap(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="course-station-2"]') as HTMLButtonElement).click(); });
    await act(async () => { (view.container.querySelector('[data-testid="course-map-practice"]') as HTMLButtonElement).click(); });
    await settle(view.container);
    expect(view.container.querySelector('[data-testid="course-practice"]')).not.toBeNull();
    await act(async () => { (view.container.querySelector('[data-testid="course-practice-ok"]') as HTMLButtonElement).click(); });
    await act(async () => { (view.container.querySelector('[data-testid="course-next"]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-testid="course-progress"]')!.textContent).toBe("練習 2 / 20");
    await act(async () => { (view.container.querySelector('[data-testid="course-restart"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')!.textContent).toBe("Lv2の自由練習を最初からやり直しますか？");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toBe("最初の教材に戻ります。正式確認の続きは保存されます。");
    expect(document.querySelector('[data-testid="level-restart-cancel"]')!.textContent).toBe("キャンセル");
    expect(document.querySelector('[data-testid="level-restart-confirm"]')!.textContent).toBe("Lv2の自由練習を最初から");
    await act(async () => { (document.querySelector('[data-testid="level-restart-confirm"]') as HTMLButtonElement).click(); });
    await settle(view.container);
    expect(view.container.querySelector('[data-testid="course-progress"]')!.textContent).toBe("練習 1 / 20");
    view.unmount();
  });
});
