// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdvancedCourseView } from "./AdvancedCourseView";
import { GuidedCourseView } from "./GuidedCourseView";
import { playbackController } from "../../audio/playbackController";
import { advancedSetIds } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import {
  appendAdvancedTrial,
  clearAdvancedActive,
  createAdvancedStore,
  createAdvancedTrial,
  startAdvancedAttempt,
} from "../../domain/chordDojo/guidedCourse/advanced/store";
import type { AdvancedAttempt, AdvancedCourseLevel, AdvancedStore } from "../../domain/chordDojo/guidedCourse/advanced/types";
import { createCourseStore, createCourseTrial } from "../../domain/chordDojo/guidedCourse/store";
import { courseItemById, delayIds, sameDayIds } from "../../domain/chordDojo/guidedCourse/bank";
import type { ActiveAttempt, CourseLevel, CourseStore } from "../../domain/chordDojo/guidedCourse/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "loop-vault:guided-course-advanced-v1:data";
const BASIC_KEY = "loop-vault:guided-course-v1:data";
const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";

function seedAdvanced(store: AdvancedStore | undefined): void {
  window.localStorage.clear();
  if (store !== undefined) {
    window.localStorage.setItem(KEY, JSON.stringify({ app: "loopvault-guided-course-advanced", fileVersion: 1, ...store }));
  }
}

function seedBasicTrials(store: CourseStore): void {
  window.localStorage.setItem(BASIC_KEY, JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store }));
}

function basicTrial(attempt: ActiveAttempt, id: string, at: string) {
  const item = courseItemById(id)!;
  return createCourseTrial({
    attempt,
    itemId: id,
    quality: item.quality,
    root: item.root,
    result: "correct",
    sealedNotes: item.referenceNotes,
    speedMs: 1200,
    midiConfirmed: true,
    startedAt: at,
    sealedAt: at,
  });
}

function completedBasicCourse(): CourseStore {
  let store: CourseStore = { ...createCourseStore(), trials: [] };
  const trials = [];
  for (const level of [1, 2, 3] as CourseLevel[]) {
    const sameDay: ActiveAttempt = { level, block: "sameDay", attemptId: `basic-${level}-d`, startedAt: OLD, mode: "midi" };
    const delay: ActiveAttempt = { level, block: "delay", attemptId: `basic-${level}-l`, startedAt: AT, mode: "midi" };
    trials.push(...sameDayIds(level).map((id) => basicTrial(sameDay, id, OLD)));
    trials.push(...delayIds(level).map((id) => basicTrial(delay, id, AT)));
  }
  store = { ...store, trials };
  return store;
}

let sequence = 0;

function start(store: AdvancedStore, level: AdvancedCourseLevel, block: "sameDay" | "delay", at: string, group?: string, practice = false): { store: AdvancedStore; attempt: AdvancedAttempt } {
  sequence += 1;
  const attemptId = `seed-${level}-${block}-${sequence}`;
  const next = startAdvancedAttempt(store, {
    level,
    block,
    setId: level === 8 ? (group ?? "six") : block,
    itemIds: advancedSetIds(level, block, group),
    ...(group === undefined ? {} : { group }),
    practice,
  }, new Date(at), { attemptId });
  return { store: next, attempt: next.attempts.find((entry) => entry.attemptId === attemptId)! };
}

interface AnswerOptions {
  readonly correct?: (index: number) => boolean;
  readonly speedMs?: (index: number) => number | undefined;
}

function answer(store: AdvancedStore, attempt: AdvancedAttempt, at: string, options: AnswerOptions | ((index: number) => boolean) = {}): AdvancedStore {
  const correct = typeof options === "function" ? options : (options.correct ?? (() => true));
  const speedMs = typeof options === "function" ? undefined : options.speedMs;
  let next = store;
  for (const [index, id] of attempt.itemIds.entries()) {
    next = appendAdvancedTrial(next, createAdvancedTrial({
      attempt,
      itemId: id,
      result: correct(index) ? "correct" : "wrong",
      sealedNotes: [],
      ...(correct(index) && speedMs !== undefined ? { speedMs: speedMs(index) } : {}),
      ...(correct(index) && speedMs === undefined ? { speedMs: 1200 } : {}),
      startedAt: at,
      sealedAt: at,
    }));
  }
  return next;
}

function block(store: AdvancedStore, level: AdvancedCourseLevel, which: "sameDay" | "delay", at: string, options: AnswerOptions = {}, group?: string): AdvancedStore {
  const started = start(store, level, which, at, group);
  return answer(started.store, started.attempt, at, options);
}

async function settle(container: HTMLElement, selectors: readonly string[] = []): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (selectors.length === 0) return;
    if (selectors.some((selector) => container.querySelector(selector) !== null)) return;
  }
}

function mountAdvanced(props: Partial<{ initialLevel: AdvancedCourseLevel; basicsPassed: boolean; initialMode: "official" | "practice" | "demo" }> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSelectBasic = vi.fn();
  act(() => {
    root.render(<AdvancedCourseView
      onExit={() => undefined}
      onSelectBasic={onSelectBasic}
      settleMs={60}
      basicsPassed={props.basicsPassed ?? true}
      initialLevel={props.initialLevel ?? 4}
      initialLevelChosen={props.initialLevel !== undefined && props.initialLevel !== 4}
      {...(props.initialMode === undefined ? {} : { initialMode: props.initialMode })}
      playbackGapMs={0}
    />);
  });
  return { container, root, onSelectBasic, unmount: () => act(() => root.unmount()) };
}

describe("P23-45 advanced course screen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(playbackController, "play").mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("shows the Lv4 examples first and starts the 20-question confirmation only on demand", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-demo-name"]')!.textContent).toBe("Cm");
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("見本 1 / 4");
    for (let index = 0; index < 3; index += 1) {
      await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-next"]') as HTMLButtonElement).click(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    expect(view.container.querySelector('[data-testid="advanced-demo-start"]')).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{"trials":[]}').trials).toEqual([]);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-start"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-start-panel"]']);
    expect(view.container.querySelector('[data-testid="advanced-start-panel"]')!.textContent).toContain("20 問");
    expect(view.container.querySelector('[data-testid="advanced-level"]')!.textContent).toBe("Lv4");
    view.unmount();
  });

  it("starts an official attempt explicitly and records a self-confirmation without writing the basic store", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-start"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-start"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-prompt-name"]')!.textContent).toBe("C/E");
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("1 / 20");
    // A single chord is the big label; no duplicate one-card row.
    expect(view.container.querySelector('[data-testid="advanced-cards"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="advanced-self-choices"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="advanced-self-note"]')!.textContent).toContain("進級判定には含まれません");

    await act(async () => { (view.container.querySelector('[data-testid="advanced-self-ok"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.container.querySelector('[data-testid="advanced-feedback-text"]')!.textContent).toContain("弾けた（自己確認）");
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.trials).toHaveLength(1);
    expect(stored.trials[0]).toMatchObject({ result: "correct", selfConfirmed: true, midiConfirmed: false, practice: false });
    expect(window.localStorage.getItem(BASIC_KEY)).toBeNull();

    await act(async () => { (view.container.querySelector('[data-testid="advanced-next"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    view.unmount();
  });

  it("resumes the official attempt at the same position after a reload", async () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    const partial = appendAdvancedTrial(started.store, createAdvancedTrial({
      attempt: started.attempt,
      itemId: started.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    seedAdvanced(partial);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    view.unmount();
  });

  it("shows the delay wait after a passing same-day block", async () => {
    const recent = new Date().toISOString();
    const started = start(createAdvancedStore(), 4, "sameDay", recent);
    const answered = answer(started.store, started.attempt, recent, () => true);
    seedAdvanced(clearAdvancedActive(answered));
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-delay-wait"]']);
    expect(view.container.querySelector('[data-testid="advanced-delay-wait"]')!.textContent).toContain("12 時間以上");
    view.unmount();
  });

  it("shows a failed same-day summary with a retry instead of a pass", async () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    const answered = answer(started.store, started.attempt, OLD, (index) => index < 17);
    seedAdvanced(answered);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-result"]']);
    expect(view.container.querySelector('[data-testid="advanced-result"]')!.getAttribute("data-ok")).toBe("false");
    expect(view.container.querySelector(".gc-sheet h2")!.textContent).toContain("20問中 17問");
    expect(view.container.querySelector('[data-testid="advanced-retry"]')).not.toBeNull();
    view.unmount();
  });

  it("keeps free practice out of the formal counts and lets the learner return to the same position", async () => {
    const official = start(createAdvancedStore(), 4, "sameDay", OLD);
    const partial = appendAdvancedTrial(official.store, createAdvancedTrial({
      attempt: official.attempt,
      itemId: official.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    const practice = start(partial, 4, "sameDay", OLD, undefined, true);
    const practiceDone = answer(practice.store, practice.attempt, OLD, () => true);
    seedAdvanced(practiceDone);
    const view = mountAdvanced();
    // The official position is untouched: the practice attempt is neither active nor evidence.
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    expect(view.container.querySelector('[data-testid="advanced-feedback-text"]')!.textContent).toBe("自己確認できます");
    view.unmount();

    // Reaching the practice summary from the start screen shows that practice is not a pass.
    const emptyOfficial = clearAdvancedActive(practiceDone);
    seedAdvanced(emptyOfficial);
    const second = mountAdvanced();
    await settle(second.container, ['[data-testid="advanced-start-panel"]']);
    await act(async () => { (second.container.querySelector('[data-testid="advanced-practice-here"]') as HTMLButtonElement).click(); });
    await settle(second.container, ['[data-testid="advanced-practice-result"]']);
    expect(second.container.querySelector('[data-testid="advanced-practice-result"]')!.textContent).toContain("数えません");
    second.unmount();
  });

  it("offers the next level after a passing same-day block when the delayed day is not yet available", async () => {
    const recent = new Date().toISOString();
    const started = start(createAdvancedStore(), 4, "sameDay", recent);
    const answered = answer(started.store, started.attempt, recent, () => true);
    seedAdvanced(answered);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-result"]']);
    expect(view.container.querySelector('[data-testid="advanced-start-delay"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="advanced-next-level"]')!.textContent).toContain("Lv5 を始める");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-next-level"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-demo"]', '[data-testid="advanced-start-panel"]']);
    expect(view.container.querySelector('[data-testid="advanced-level"]')!.textContent).toBe("Lv5");
    view.unmount();
  });

  it("moves to free practice from a confirmation question and returns to the same position", async () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    const partial = appendAdvancedTrial(started.store, createAdvancedTrial({
      attempt: started.attempt,
      itemId: started.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    seedAdvanced(partial);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-header-practice"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-start-panel"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-start"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-header-return"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("1 / 1");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-header-return"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.active).toBe(started.attempt.attemptId);
    expect(stored.free).toBeTruthy();
    view.unmount();
  });

  it("lists the confirmed abilities on the course completion screen", async () => {
    let store = createAdvancedStore();
    for (const level of [4, 5, 6, 7] as AdvancedCourseLevel[]) {
      store = block(store, level, "sameDay", OLD, { correct: () => true });
      store = block(store, level, "delay", AT, { correct: () => true });
    }
    for (const group of ["six", "nine", "thirteen"]) {
      store = block(store, 8, "sameDay", OLD, { correct: () => true }, group);
      store = block(store, 8, "delay", AT, { correct: () => true }, group);
    }
    store = block(store, "capstone", "sameDay", OLD, { correct: () => true, speedMs: () => 1200 });
    store = block(store, "capstone", "delay", AT, { correct: () => true });
    seedAdvanced(clearAdvancedActive(store));
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-finished"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-abilities"] li')).toHaveLength(6);
    expect(view.container.querySelector('[data-testid="advanced-abilities"]')!.textContent).toContain("配置を選ぶ");
    expect(view.container.querySelector('[data-testid="advanced-abilities"]')!.textContent).toContain("覚えた響きを取り出す");
    view.unmount();
  });

  it("waits for the standard ear presentation before answering and opens the answer afterwards", async () => {
    const started = start(createAdvancedStore(), 7, "sameDay", OLD);
    seedAdvanced(started.store);
    const view = mountAdvanced({ initialLevel: 7 });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    // The first ear question starts with a standard presentation and no self-confirm yet.
    expect(view.container.querySelector('[data-testid="advanced-feedback-text"]')!.textContent).toContain("再生中・終わったら弾いてください");
    expect(view.container.querySelector('[data-testid="advanced-self-choices"]')).toBeNull();
    await settle(view.container, ['[data-testid="advanced-self-choices"]']);
    expect(view.container.querySelector('[data-testid="advanced-feedback-text"]')!.textContent).toBe("1枚目を弾いてください");
    expect(view.container.querySelector('[data-testid="advanced-card-0"] b')!.textContent).toBe("1");
    expect(view.container.querySelector('[data-testid="advanced-card-0"] b')!.textContent).not.toContain("C");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-self-miss"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    // After the answer the cards and the keyboard open.
    expect(view.container.querySelector('[data-testid="advanced-card-0"] b')!.textContent).toContain("C");
    expect(view.container.querySelector(".gc-keyboard-head")!.textContent).toContain("見本の音名");
    expect(view.container.querySelector('[data-testid="advanced-hidden-note"]')!.textContent).toContain("答えは表示していません");
    view.unmount();
  });

  it("shows the Lv4 common-tone and bass-motion examples in the practice hub", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-practice-materials"] button')).toHaveLength(2);
    expect(view.container.querySelector('[data-testid="advanced-practice-title"]')!.textContent).toBe("Cmaj7 → Am7");
    expect(view.container.querySelector('[data-testid="advanced-practice-common"]')!.textContent).toContain("残す音");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-material-lv4-prac-bass"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-bass"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-title"]')!.textContent).toBe("C/E → F");
    expect(view.container.querySelector('[data-testid="advanced-practice-bass"]')!.textContent).toContain("最低音");
    view.unmount();
  });

  it("lists all six Lv5 families and starts a one-progression practice from the material", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced({ initialLevel: 5 });
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-materials"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-practice-materials"] button')).toHaveLength(6);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-material-lv5-prac-major-ii-v-i"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-title"]')!.textContent).toBe("ii–V–I（長調）");
    expect(view.container.querySelectorAll('[data-testid="advanced-practice-cards"] li')).toHaveLength(3);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-run"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("1 / 1");
    expect(view.container.querySelector('[data-testid="advanced-prompt-name"]')!.textContent).toBe("Dm7 → G7 → Cmaj7");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-self-miss"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => { (view.container.querySelector('[data-testid="advanced-next"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-result"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-result"]')!.textContent).toContain("数えません");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-again"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    const free = stored.attempts.filter((attempt: { practice: boolean }) => attempt.practice);
    expect(free).toHaveLength(2);
    expect(free[1].itemIds).toEqual(["lv5-sd-01"]);
    view.unmount();
  });

  it("changes the Lv6 key and keeps the same family in the chosen key", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced({ initialLevel: 6 });
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-materials"]']);
    await act(async () => {
      const select = view.container.querySelector('[data-testid="advanced-practice-lv6-key"]') as HTMLSelectElement;
      select.value = "4";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { (view.container.querySelector('[data-testid="advanced-material-lv6-prac-i-v-vi-iv"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-card-0"]')!.textContent).toContain("E");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-run"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-prompt-name"]')!.textContent).toContain("キー E");
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.attempts.find((attempt: { practice: boolean }) => attempt.practice).itemIds).toEqual(["lv6-prac-i-v-vi-iv-4"]);
    view.unmount();
  });

  it("shows the selected Lv8 group's vocabulary materials", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced({ initialLevel: 8 });
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-materials"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-practice-materials"] button')).toHaveLength(5);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-group-nine"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-title"]')!.textContent).toBe("Dm7 → Dm9");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-group-thirteen"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-practice-title"]')!.textContent).toBe("G7 → G13");
    view.unmount();
  });

  it("runs a guided tempo pass over the selected material", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-demo"]']);
    await act(async () => {
      const select = view.container.querySelector('[data-testid="advanced-practice-tempo"]') as HTMLSelectElement;
      select.value = "120";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-tempo-run"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    expect(view.container.querySelector('[data-testid="advanced-practice-phase"]')!.textContent).toContain("拍");
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-stop"]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-testid="advanced-practice-phase"]')!.textContent).toContain("見本を聴いて");
    view.unmount();
  });

  it("asks before restarting the level, cancels back to the same question, then returns to Lv4's first example", async () => {
    const started = start(createAdvancedStore(), 4, "sameDay", OLD);
    let store = started.store;
    for (const id of started.attempt.itemIds.slice(0, 4)) {
      store = appendAdvancedTrial(store, createAdvancedTrial({
        attempt: started.attempt,
        itemId: id,
        result: "correct",
        sealedNotes: [],
        startedAt: OLD,
        sealedAt: OLD,
      }));
    }
    seedAdvanced(store);
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("5 / 20");

    await act(async () => { (view.container.querySelector('[data-testid="advanced-restart"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')!.textContent).toBe("Lv4を最初からやり直しますか？");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("5 / 20問目");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("最初の見本");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toContain("合格記録は残ります");
    expect(document.activeElement).toBe(document.querySelector('[data-testid="level-restart-cancel"]'));
    expect(document.querySelector('[data-testid="level-restart-cancel"]')!.textContent).toBe("5問目から続ける");
    expect(document.querySelector('[data-testid="level-restart-confirm"]')!.textContent).toBe("Lv4を最初から");
    await act(async () => { (document.querySelector('[data-testid="level-restart-cancel"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("5 / 20");

    // Escape also cancels without changing anything.
    await act(async () => { (view.container.querySelector('[data-testid="advanced-restart"]') as HTMLButtonElement).click(); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector('[data-testid="level-restart-title"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("5 / 20");

    await act(async () => { (view.container.querySelector('[data-testid="advanced-restart"]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-testid="level-restart-confirm"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    expect(view.container.querySelector('[data-testid="advanced-demo-name"]')!.textContent).toBe("Cm");
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.rounds["4"]).toBeTruthy();
    expect(stored.trials).toHaveLength(4);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-start-panel"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-start"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("1 / 20");
    view.unmount();
  });

  it("restarts free practice to the first material and keeps the official position", async () => {
    const official = start(createAdvancedStore(), 4, "sameDay", OLD);
    const store = appendAdvancedTrial(official.store, createAdvancedTrial({
      attempt: official.attempt,
      itemId: official.attempt.itemIds[0]!,
      result: "correct",
      sealedNotes: [],
      startedAt: OLD,
      sealedAt: OLD,
    }));
    seedAdvanced(store);
    // Open Lv5 free practice (as chosen from the course map) while Lv4 official is mid-attempt.
    const view = mountAdvanced({ initialLevel: 5, initialMode: "practice" });
    await settle(view.container, ['[data-testid="advanced-practice-panel"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-practice-run"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-restart"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-testid="level-restart-title"]')!.textContent).toBe("Lv5の自由練習を最初からやり直しますか？");
    expect(document.querySelector('[data-testid="level-restart-body"]')!.textContent).toBe("最初の教材に戻ります。正式確認の続きは保存されます。");
    expect(document.querySelector('[data-testid="level-restart-cancel"]')!.textContent).toBe("キャンセル");
    expect(document.querySelector('[data-testid="level-restart-confirm"]')!.textContent).toBe("Lv5の自由練習を最初から");
    await act(async () => { (document.querySelector('[data-testid="level-restart-confirm"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-practice-panel"]']);
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.free).toBeUndefined();
    expect(stored.active).toBe(official.attempt.attemptId);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-return-official"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-prompt-name"]']);
    expect(view.container.querySelector('[data-testid="advanced-progress"]')!.textContent).toBe("2 / 20");
    view.unmount();
  });

  it("shows the Lv6 recheck screen for the keys without correct evidence", async () => {
    let store = createAdvancedStore();
    const same = start(store, 6, "sameDay", OLD);
    store = answer(same.store, same.attempt, OLD, (index) => index < 11);
    const later = start(store, 6, "delay", AT);
    store = clearAdvancedActive(answer(later.store, later.attempt, AT, (index) => index < 5));
    seedAdvanced(store);
    const view = mountAdvanced({ initialLevel: 6 });
    await settle(view.container, ['[data-testid="advanced-recheck"]']);
    expect(view.container.querySelector('[data-testid="advanced-recheck"]')!.textContent).toContain("未確認のキー: B");
    expect(view.container.querySelector('[data-testid="advanced-recheck-start"]')).not.toBeNull();
    view.unmount();
  });

  it("shows the three Lv8 groups and their separate progress", async () => {
    seedAdvanced(undefined);
    const view = mountAdvanced({ initialLevel: 8 });
    await settle(view.container, ['[data-testid="advanced-demo"]']);
    await act(async () => { (view.container.querySelector('[data-testid="advanced-demo-skip"]') as HTMLButtonElement).click(); });
    await settle(view.container, ['[data-testid="advanced-groups"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-groups"] .ac-group')).toHaveLength(3);
    expect(view.container.querySelector('[data-testid="advanced-groups"]')!.textContent).toContain("6・add9・sus");
    expect(view.container.querySelector('[data-testid="advanced-groups"]')!.textContent).toContain("13・ルートレス");
    // P23-56: a group is 12 names, 4 recolours and 6 ear questions.
    expect(view.container.querySelector('[data-testid="advanced-start-panel"]')!.textContent).toContain("22 問");
    view.unmount();
  });

  it("offers the capstone sight chart as the third part of the same-day confirmation", async () => {
    const same = start(createAdvancedStore(), "capstone", "sameDay", OLD);
    let store = same.store;
    // Only the 24 name and 5 progression questions are answered; the sight charts are still open.
    for (const id of same.attempt.itemIds.slice(0, 29)) {
      store = appendAdvancedTrial(store, createAdvancedTrial({
        attempt: same.attempt,
        itemId: id,
        result: "correct",
        sealedNotes: [],
        speedMs: 1200,
        startedAt: OLD,
        sealedAt: OLD,
      }));
    }
    seedAdvanced({ ...store, active: same.attempt.attemptId });
    const view = mountAdvanced({ initialLevel: "capstone" });
    await settle(view.container, ['[data-testid="advanced-sight-chart"]']);
    expect(view.container.querySelectorAll('[data-testid="advanced-sight-chart"] li')).toHaveLength(8);
    expect(view.container.querySelector('[data-testid="advanced-sight-start"]')!.textContent).toContain("拍の練習を始める");
    expect(view.container.querySelector('[data-testid="advanced-sight-connection"]')!.textContent).toContain("MIDI 未接続");
    expect(view.container.querySelector('[data-testid="advanced-feedback-text"]')!.textContent).toContain("開始を押すと拍が進みます");
    await act(async () => {
      const select = view.container.querySelector('[data-testid="advanced-sight-tempo"]') as HTMLSelectElement;
      select.value = "90";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="advanced-beat"]')!.textContent).toContain("90 BPM");
    view.unmount();
  });

  it("does not initialise over unreadable advanced data and offers an explicit quarantine", async () => {
    window.localStorage.setItem(KEY, "{damaged");
    const view = mountAdvanced();
    await settle(view.container, ['[data-testid="advanced-unreadable"]']);
    expect(window.localStorage.getItem(KEY)).toBe("{damaged");
    expect(view.container.querySelector('[data-testid="advanced-unreadable"]')).not.toBeNull();
    view.unmount();
  });

  it("routes Lv4+ to the advanced course after the basic course is finished", async () => {
    window.localStorage.clear();
    seedBasicTrials(completedBasicCourse());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<GuidedCourseView settleMs={60} onExit={() => undefined} />); });
    await settle(container, ['[data-testid="course-map"]']);
    expect(container.querySelector('[data-testid="course-station-4"]')!.getAttribute("data-state")).toBe("now");
    await act(async () => { (container.querySelector('[data-testid="course-map-go"]') as HTMLButtonElement).click(); });
    await settle(container, ['[data-testid="advanced-demo"]']);
    expect(container.querySelector('[data-testid="advanced-level"]')!.textContent).toBe("Lv4");
    expect(container.querySelector('[data-testid="advanced-demo-name"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("opens basic free practice when Lv1–3 is chosen on the course map", async () => {
    window.localStorage.clear();
    seedBasicTrials(completedBasicCourse());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<GuidedCourseView settleMs={60} onExit={() => undefined} />); });
    await settle(container, ['[data-testid="course-map"]']);
    await act(async () => { (container.querySelector('[data-testid="course-station-2"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector('[data-testid="course-map-practice"]') as HTMLButtonElement).click(); });
    await settle(container, ['[data-testid="course-practice"]']);
    expect(container.querySelector('[data-testid="course-practice"]')).not.toBeNull();
    expect(container.querySelector(".gc-head")!.textContent).toContain("記録しません");
    act(() => root.unmount());
  });
});
