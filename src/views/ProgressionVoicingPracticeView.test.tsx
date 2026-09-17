// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ProgressionPracticeVoicingPlan,
  ProgressionPracticeSourceReference,
  ProgressionVoicingPracticeSnapshot,
  ProgressionVoicingSelection,
  ResolveProgressionPracticeVoicingsOptions,
  VoicingLoopVaultCandidate,
} from "../domain/progressionVoicingPractice";
import type {
  ProgressionVoicingTransportPort,
  ProgressionVoicingTransportStartOptions,
} from "../practice/ProgressionVoicingTransport";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { savePreviewSound } from "../audio/previewSoundPreference";
import { ProgressionVoicingPracticeView } from "./ProgressionVoicingPracticeView";
import {
  progressionPracticePlaybackNotes,
  resolveProgressionPracticeVoicings,
} from "../domain/progressionVoicingPractice";
import {
  loadRecentVoicingLoopProgressions,
  recordRecentVoicingLoopProgression,
  saveRecentVoicingLoopProgressions,
} from "../voicingPractice/recentProgressions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("ProgressionVoicingPracticeView", () => {
  it("shows Rest as Current/Next without a keyboard target while one clock crosses silent spans", async () => {
    const runtime = new FakeTransport();
    const base = snapshot("source-midi");
    const value: ProgressionVoicingPracticeSnapshot = {
      ...base,
      lengthBeats: 8,
      events: [base.events[0]!, { ...base.events[1]!, startBeat: 4, durationBeats: 4 }],
      spans: [
        { kind: "chord", eventIndex: 0, startBeat: 0, durationBeats: 2 },
        { kind: "rest", startBeat: 2, durationBeats: 2 },
        { kind: "chord", eventIndex: 1, startBeat: 4, durationBeats: 4 },
      ],
    };
    const container = await renderView(runtime, { "source-midi": value }, "source-midi");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("次休符");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    expect(cards).toHaveLength(3);
    expect(cards[1]!.disabled).toBe(true);
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(6.5));
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("休符");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")).toBeNull();
    expect(container.querySelector("svg[role='img']")?.getAttribute("aria-label")).toContain("お手本0音");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("休符");
    expect(container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")?.style.transform).toBe("translateX(121px)");
    await act(async () => cards[2]!.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dm7");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("休符");
    await act(async () => runtime.options?.onTransportBeat(8));
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("位置2 / 2 小節");
  });

  it("can run a 32-bar all-rest score with bounded progress indicators and no fake chord or audition", async () => {
    const runtime = new FakeTransport();
    const value: ProgressionVoicingPracticeSnapshot = {
      ...snapshot("basic-full"), lengthBeats: 128, events: [], spans: [{ kind: "rest", startBeat: 0, durationBeats: 128 }],
    };
    const container = await renderView(runtime, { "basic-full": value }, "basic-full");
    expect(button(container, "開始").disabled).toBe(false);
    expect(button(container, "現在のコードを試聴").disabled).toBe(true);
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(70));
    const beatIndicator = container.querySelector("[role='progressbar'][aria-label='拍']")!;
    const positionIndicator = container.querySelector("[role='progressbar'][aria-label='位置']")!;
    expect(beatIndicator.getAttribute("aria-valuenow")).toBe("52");
    expect(positionIndicator.getAttribute("aria-valuenow")).toBe("53");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("位置17 / 32 小節");
    expect(runtime.audition).not.toHaveBeenCalled();
    await act(async () => runtime.options?.onTransportBeat(132));
    expect(container.textContent).toContain("1 周完了");
  });
  it("shows an inline source-less Vault list without Source controls or a MIDI lease", async () => {
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => defaultLiveMidiStore.setState({ active: true }));
    const deactivate = vi.fn(async () => defaultLiveMidiStore.setState({ active: false }));
    const onSelectProgression = vi.fn(() => true);
    const onEnterText = vi.fn();
    defaultLiveMidiStore.setState({ active: false, activate, deactivate });
    try {
      const container = await renderView(
        new FakeTransport(),
        undefined,
        "source-midi",
        true,
        { onSelectProgression, onEnterText },
      );
      await act(async () => { await Promise.resolve(); });

      expect(container.querySelector("h2")?.textContent).toBe("Voicing Loop");
      expect(container.textContent).toContain("練習する進行");
      expect(container.textContent).toContain("練習できる保存済み進行はまだありません。");
      expect(container.querySelector("#voicing-loop-progression-search")).not.toBeNull();
      expect(container.textContent).not.toContain("Source MIDI");
      expect(container.querySelector("fieldset")).toBeNull();
      expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
      expect(activate).not.toHaveBeenCalled();

      await act(async () => button(container, "Textで新しい進行を入力").click());
      expect(onSelectProgression).not.toHaveBeenCalled();
      expect(onEnterText).toHaveBeenCalledOnce();
    } finally {
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
      });
    }
  });

  it("searches all eligible progressions, expands in place, and records only a successful one-click choice", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => vaultCandidate(index));
    const onSelectProgression = vi.fn((reference: ProgressionPracticeSourceReference) => {
      saveRecentVoicingLoopProgressions(recordRecentVoicingLoopProgression(
        loadRecentVoicingLoopProgressions(),
        reference,
      ));
      return true;
    });
    const container = await renderView(
      new FakeTransport(),
      undefined,
      "source-midi",
      false,
      { onSelectProgression, onEnterText: vi.fn() },
      candidates,
    );

    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']")).toHaveLength(5);
    await act(async () => button(container, "すべての進行を見る").click());
    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']")).toHaveLength(6);

    const search = container.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(search, "F# major");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']")).toHaveLength(1);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-progression-choice']")!.click());
    expect(onSelectProgression).toHaveBeenCalledWith(candidates[5]!.sourceReference);
    expect(loadRecentVoicingLoopProgressions()).toEqual([candidates[5]!.sourceReference]);
  });

  it("does not record an invalid or deleted source when click-time validation fails", async () => {
    const candidate = vaultCandidate(0);
    const container = await renderView(
      new FakeTransport(),
      undefined,
      "source-midi",
      false,
      { onSelectProgression: vi.fn(() => false), onEnterText: vi.fn() },
      [candidate],
    );
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-progression-choice']")!.click());
    expect(loadRecentVoicingLoopProgressions()).toEqual([]);
  });

  it("releases a loaded session MIDI lease once when it becomes direct-entry empty and does not reacquire", async () => {
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => defaultLiveMidiStore.setState({ active: true }));
    const deactivate = vi.fn(async () => defaultLiveMidiStore.setState({ active: false }));
    defaultLiveMidiStore.setState({ active: false, activate, deactivate });
    const retainedReference = { ideaId: "idea", blockId: "block" };
    saveRecentVoicingLoopProgressions([retainedReference]);
    try {
      const runtime = new FakeTransport();
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      const render = async (
        snapshots?: Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>>,
        vaultProgressions: readonly VoicingLoopVaultCandidate[] = [],
        onSelectProgression = vi.fn(() => true),
      ) => act(async () => root?.render(
        <ProgressionVoicingPracticeView
          language="ja"
          snapshots={snapshots}
          initialSelection="basic-full"
          monitorMidi
          vaultProgressions={vaultProgressions}
          onSelectProgression={onSelectProgression}
          onEnterText={vi.fn()}
          transportFactory={() => runtime}
        />,
      ));

      await render({ "basic-full": snapshot("basic-full") });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(activate).toHaveBeenCalledOnce();
      expect(loadRecentVoicingLoopProgressions()).toEqual([retainedReference]);
      await act(async () => button(container, "開始").click());
      const stopsBeforeSelector = runtime.stop.mock.calls.length;

      const nextCandidate = vaultCandidate(2);
      const onSelectProgression = vi.fn(() => true);
      await render(undefined, [nextCandidate], onSelectProgression);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(container.textContent).toContain("練習する進行");
      expect(deactivate).toHaveBeenCalledOnce();
      expect(activate).toHaveBeenCalledOnce();
      expect(loadRecentVoicingLoopProgressions()).toEqual([]);
      expect(runtime.stop.mock.calls.length).toBeGreaterThan(stopsBeforeSelector);
      await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-progression-choice']")!.click());
      expect(onSelectProgression).toHaveBeenCalledWith(nextCandidate.sourceReference);
    } finally {
      await act(async () => root?.unmount());
      root = undefined;
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
      });
    }
  });

  it("projects Current, Next, Beat, Position progress, and Loop from one clock", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, {
      "basic-full": snapshot("basic-full"),
    }, "basic-full");

    expect(container.textContent).toContain("Cmaj7");
    expect(container.textContent).toContain("Dm7");
    expect(container.textContent).toContain("0 周完了");
    expect(Array.from(container.querySelectorAll("[data-testid='voicing-loop-event-timing']"))
      .map((element) => element.textContent)).toEqual([
      "2拍",
      "2拍",
    ]);
    const start = button(container, "開始");
    await act(async () => start.click());
    expect(runtime.start).toHaveBeenCalledTimes(1);

    await act(async () => runtime.options?.onTransportBeat(8.5));
    expect(container.textContent).toContain("1 周完了");
    expect(container.querySelector("[data-testid='voicing-loop-status']")?.textContent).toContain("位置");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll("[role='progressbar']")).map((element) => element.getAttribute("aria-label")))
      .toEqual(["拍", "位置"]);
    expect(container.textContent).not.toContain("25%");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Cmaj7");

    await act(async () => runtime.options?.onTransportBeat(10.5));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    expect(container.textContent).toContain("G3");
    expect(container.textContent).toContain("b7");
  });

  it("places both indicators between label and value, smooths beats, and steps position by bar", async () => {
    const runtime = new FakeTransport();
    const base = snapshot("basic-full");
    const events = [
      { ...base.events[0]!, id: "bar-1-a", startBeat: 0, durationBeats: 2 },
      { ...base.events[1]!, id: "bar-1-b", startBeat: 2, durationBeats: 2 },
      { ...base.events[0]!, id: "bar-2-a", startBeat: 4, durationBeats: 2 },
      { ...base.events[1]!, id: "bar-2-b", startBeat: 6, durationBeats: 2 },
    ];
    const value: ProgressionVoicingPracticeSnapshot = {
      ...base,
      lengthBeats: 8,
      events,
      spans: events.map((event, eventIndex) => ({
        kind: "chord" as const,
        eventIndex,
        startBeat: event.startBeat,
        durationBeats: event.durationBeats,
      })),
    };
    const container = await renderView(runtime, { "basic-full": value }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(4.5));

    const beatMetric = container.querySelector("[data-testid='voicing-loop-beat-metric']")!;
    const positionMetric = container.querySelector("[data-testid='voicing-loop-position-metric']")!;
    expect(beatMetric.children[0]?.textContent).toBe("拍");
    expect(beatMetric.children[1]?.querySelector("[role='progressbar']")).not.toBeNull();
    expect(beatMetric.children[2]?.textContent).toBe("1 / 2 拍");
    expect(positionMetric.children[0]?.textContent).toBe("位置");
    expect(positionMetric.children[1]?.querySelector("[role='progressbar']")).not.toBeNull();
    expect(positionMetric.children[2]?.textContent).toBe("1 / 2 小節");

    const beatFill = container.querySelector<HTMLElement>("[data-testid='voicing-loop-beat-progress-fill']")!;
    const positionFill = container.querySelector<HTMLElement>("[data-testid='voicing-loop-position-progress-fill']")!;
    expect(beatFill.style.transform).toBe("scaleX(0.25)");
    expect(beatFill.style.transitionTimingFunction).toBe("linear");
    expect(positionFill.style.transform).toBe("scaleX(0.5)");
    expect(positionFill.style.transitionDuration).toBe("0ms");

    await act(async () => runtime.options?.onTransportBeat(5));
    expect(beatFill.style.transform).toBe("scaleX(0.5)");
    expect(positionFill.style.transform).toBe("scaleX(0.5)");
    await act(async () => runtime.options?.onTransportBeat(8));
    expect(positionMetric.children[2]?.textContent).toBe("2 / 2 小節");
    expect(positionFill.style.transform).toBe("scaleX(1)");
  });

  it("orders the compact workspace and traverses fixed cards using each clock duration", async () => {
    const runtime = new FakeTransport();
    const mixed = snapshot("basic-full");
    const durations = [4, 2, 1, 1];
    let startBeat = 0;
    const events = durations.map((durationBeats, index) => {
      const event = {
        ...mixed.events[index % mixed.events.length]!,
        id: `mixed-${index}`,
        startBeat,
        durationBeats,
      };
      startBeat += durationBeats;
      return event;
    });
    const container = await renderView(runtime, {
      "basic-full": { ...mixed, events, spans: events.map((event, eventIndex) => ({ kind: "chord", eventIndex, startBeat: event.startBeat, durationBeats: event.durationBeats })), lengthBeats: startBeat },
    }, "basic-full");
    const sections = ["controls", "current-next", "timeline", "detail", "transport"]
      .map((id) => container.querySelector(`[data-testid='voicing-loop-${id}']`)!);
    for (let index = 1; index < sections.length; index += 1) {
      expect(sections[index - 1]!.compareDocumentPosition(sections[index]!)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(sections[1]!.querySelector("[role='group']")).toBeNull();
    const playhead = container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")!;
    expect(playhead.style.transform).toBe("translateX(0px)");
    expect(playhead.style.transitionTimingFunction).toBe("linear");
    expect(container.querySelector("[data-testid='voicing-loop-playhead-marker']")).not.toBeNull();
    await act(async () => button(container, "開始").click());
    for (const [transportBeat, expectedX] of [[6, 46], [9, 144], [10.5, 242]]) {
      await act(async () => runtime.options?.onTransportBeat(transportBeat!));
      expect(playhead.style.transform).toBe(`translateX(${expectedX}px)`);
    }
    await act(async () => button(container, "一時停止").click());
    expect(playhead.style.transform).toBe("translateX(242px)");
    await act(async () => button(container, "再開").click());
    await act(async () => runtime.options?.onTransportBeat(11));
    expect(playhead.style.transform).toBe("translateX(294px)");
    await act(async () => runtime.options?.onTransportBeat(12));
    expect(playhead.style.transform).toBe("translateX(0px)");
    expect(container.textContent).toContain("1 周完了");
    for (const card of container.querySelectorAll("[data-testid='voicing-loop-event']")) {
      expect(card.className).toContain("h-[46px]");
      expect(card.className).toContain("min-h-[46px]");
      expect(card.className).toContain("max-h-[46px]");
      expect(card.className).toContain("w-[92px]");
      expect(card.className).toContain("min-w-[92px]");
      expect(card.className).toContain("max-w-[92px]");
    }
    expect(Array.from(container.querySelectorAll("[data-testid='voicing-loop-event-beat-rail']"))
      .map((rail) => rail.children.length)).toEqual([4, 2, 1, 1]);
  });

  it("renders exact playhead projection values with linear interpolation instead of rounded steps", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(4.013));

    const playhead = container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")!;
    const offset = Number(playhead.style.transform.match(/translateX\((.+)px\)/)?.[1]);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(1);
    expect(playhead.style.transitionTimingFunction).toBe("linear");
    expect(playhead.className).toContain("motion-reduce:transition-none");
  });

  it("keeps Learn/Recall explicit, provides accessible controls, and never gates Start on MIDI", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    expect(button(container, "開始").disabled).toBe(false);
    expect(container.querySelector("[data-testid='voicing-loop-midi-status']")?.textContent)
      .toContain("MIDI入力未接続");
    expect(container.querySelector("[data-testid='voicing-loop-beat-progress-fill']")).not.toBeNull();
    expect(container.querySelector("[data-keyboard-layout='wide-88']")).not.toBeNull();
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(88);
    expect(container.querySelector("[data-midi-note='9']")).not.toBeNull();
    expect(container.querySelector("[data-midi-note='96']")).not.toBeNull();
    expect(container.querySelector("[data-c-label='C1']")).not.toBeNull();
    expect(container.querySelector("[data-c-label='C8']")).not.toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-current-degree']")?.textContent).toBe("Ⅰ");
    expect(container.querySelector("[data-testid='voicing-loop-next-degree']")?.textContent).toBe("Ⅱ");
    expect(Array.from(container.querySelectorAll("[data-testid='voicing-loop-event-degree']")).map((node) => node.textContent)).toEqual(["Ⅰ", "Ⅱ"]);
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("位置1 / 1 小節");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("次Dm7");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .toContain("LEFT HAND");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .toContain("CHORD TONE");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("2拍後に切り替わります");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(2);
    expect(container.textContent).not.toContain("コード 0%");
    expect(container.textContent).not.toContain("進行 0%");

    const recall = button(container, "Recall（コード名のみ）");
    await act(async () => recall.click());
    expect(recall.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).not.toContain("CHORD TONE");
    expect(container.querySelector("svg[role='img']")?.getAttribute("aria-label")).toContain("お手本0音");
  });

  it("auditions any playable timeline card without seeking or changing the practice clock", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const timelineCards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    expect(timelineCards).toHaveLength(2);
    expect(timelineCards[1]?.getAttribute("aria-label")).toContain("2/2: Dm7");

    await act(async () => timelineCards[1]?.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(timelineCards[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Cmaj7");
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dm7");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("次Cmaj7");
    expect(container.textContent).toContain("0 周完了");
    expect(container.querySelector("[data-keyboard-event-index='1']")).not.toBeNull();
    expect(container.querySelector("[data-midi-note='50']")?.getAttribute("data-visual-state")).toBe("guide");
    expect(container.querySelector("[data-midi-note='48']")?.getAttribute("data-visual-state")).toBe("idle");

    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(timelineCards[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it("transposes labels, exact voicings, keyboard guidance, playback, and degrees from the original key", async () => {
    const runtime = new FakeTransport();
    const source = snapshot("source-midi");
    const container = await renderView(runtime, { "source-midi": source }, "source-midi");
    const key = container.querySelector<HTMLSelectElement>("#voicing-loop-key")!;
    expect(key.value).toBe("0");
    expect(key.options[key.selectedIndex]?.textContent).toContain("元");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(key, "2");
      key.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dmaj7");
    expect(container.querySelector("[data-testid='voicing-loop-current-degree']")?.textContent).toBe("Ⅰ");
    expect(container.querySelector("[data-testid='voicing-loop-next-degree']")?.textContent).toBe("Ⅱ");
    expect(source.events[0]?.chord.label).toBe("Cmaj7");
    expect(source.events[0]?.voicing?.midiNotes).toEqual([48, 55, 59]);

    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    await act(async () => cards[1]?.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([52, 59, 62], "piano");
    expect(container.querySelector("[data-midi-note='52']")?.getAttribute("data-visual-state")).toBe("guide");
    expect(container.querySelector("[data-midi-note='50']")?.getAttribute("data-visual-state")).toBe("idle");
    expect(runtime.stop).toHaveBeenCalled();
  });

  it("shifts the detached practice plan by octave from the Key-adjacent control", async () => {
    const runtime = new FakeTransport();
    const source = snapshot("source-midi");
    const container = await renderView(runtime, { "source-midi": source }, "source-midi");
    const primary = container.querySelector("[data-testid='voicing-loop-transport-primary']")!;
    const midiRow = container.querySelector("[data-testid='voicing-loop-transport-midi-row']")!;
    expect(primary.textContent).toContain("BPM");
    expect(primary.textContent).toContain("KEY");
    expect(primary.textContent).toContain("OCT元");
    expect(midiRow.textContent).toContain("MIDI入力");
    expect(midiRow.textContent).toContain("再接続");
    expect(midiRow.textContent).toContain("設定");
    expect(midiRow.textContent).not.toContain("BPM");

    await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ上げる']")?.click());
    expect(primary.textContent).toContain("OCT+1");
    expect(container.querySelector("[data-midi-note='60']")?.getAttribute("data-visual-state")).toBe("guide");
    expect(container.querySelector("[data-midi-note='48']")?.getAttribute("data-visual-state")).toBe("idle");
    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith([60, 67, 71], "piano");
    expect(source.events[0]?.voicing?.midiNotes).toEqual([48, 55, 59]);
  });

  it("changes BPM by dragging vertically while retaining direct number input", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const drag = container.querySelector<HTMLElement>("[data-testid='voicing-loop-bpm-drag']")!;
    await act(async () => {
      dispatchPointer(drag, "pointerdown", { button: 0, clientY: 100, pointerId: 7 });
      dispatchPointer(drag, "pointermove", { button: 0, clientY: 70, pointerId: 7 });
      dispatchPointer(drag, "pointerup", { button: 0, clientY: 70, pointerId: 7 });
    });
    expect(container.querySelector<HTMLInputElement>("#voicing-loop-bpm")?.value).toBe("90");
    expect(runtime.setBpm).toHaveBeenLastCalledWith(90);
  });

  it("separates SOURCE, STUDY, and DISPLAY while keeping exact sources independent from study", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, {
      "source-midi": snapshot("source-midi"),
      custom: snapshot("custom"),
      "basic-full": snapshot("basic-full"),
    }, "source-midi");

    const toolbar = container.querySelector("[data-testid='voicing-loop-controls']")!;
    expect(Array.from(toolbar.querySelectorAll("legend"), (entry) => entry.textContent)).toEqual([
      "SOURCE", "STUDY", "DISPLAY",
    ]);
    expect(["Lesson Rules", "Source MIDI", "Custom", "Teacher", "Core"]
      .every((label) => Array.from(toolbar.querySelectorAll("button")).some((entry) => entry.textContent === label)))
      .toBe(true);
    expect(toolbar.textContent).toContain("Colorを加える");
    expect(toolbar.textContent).toContain("Open配置");
    expect(toolbar.textContent).toContain("進行に合わせて最適化");
    expect(toolbar.textContent).not.toContain("SHELL TYPE");
    expect(button(container, "Source MIDI").getAttribute("aria-pressed")).toBe("true");
    for (const label of ["Teacher", "Core"]) {
      expect(button(container, label).disabled).toBe(true);
    }
    const sourceCheckboxes = Array.from(toolbar.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
    for (const label of ["Colorを加える", "Open配置", "進行に合わせて最適化"]) {
      expect(sourceCheckboxes.find((input) => input.parentElement?.textContent?.includes(label))?.disabled).toBe(true);
    }

    await act(async () => button(container, "Lesson Rules").click());
    expect(button(container, "Teacher").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "Core").disabled).toBe(false);
    expect(button(container, "Core").getAttribute("aria-pressed")).toBe("false");
    const lessonCheckboxes = Array.from(toolbar.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
    expect(lessonCheckboxes.find((input) => input.parentElement?.textContent?.includes("Colorを加える"))?.checked).toBe(false);
    expect(lessonCheckboxes.find((input) => input.parentElement?.textContent?.includes("Open配置"))?.checked).toBe(false);
    expect(lessonCheckboxes.find((input) => input.parentElement?.textContent?.includes("進行に合わせて最適化"))?.checked).toBe(true);
    const explanation = container.querySelector("[data-testid='voicing-loop-current-explanation']")!;
    expect(explanation.textContent).toContain("Teacher Style");
    expect(explanation.textContent).toContain("Candidate");
    expect(explanation.textContent).toContain("RULEP5.33-GEN-TEACHER-MAJ7");
    expect(explanation.textContent).toContain("TOPTop Candidate");

    await act(async () => button(container, "Custom").click());
    expect(button(container, "Core").disabled).toBe(true);
    expect(container.querySelector("[data-testid='voicing-loop-current-explanation']")?.textContent)
      .toBe("Custom");
  });

  it("hot-swaps lesson modifiers and OCT without stopping the running or paused clock", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const toolbar = container.querySelector("[data-testid='voicing-loop-controls']")!;
    const checkbox = (label: string) => Array.from(
      toolbar.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
    ).find((input) => input.parentElement?.textContent?.includes(label))!;

    expect(checkbox("Colorを加える").checked).toBe(false);
    expect(checkbox("Open配置").checked).toBe(false);
    expect(checkbox("進行に合わせて最適化").checked).toBe(true);

    await act(async () => button(container, "開始").click());
    runtime.stop.mockClear();
    runtime.pause.mockClear();
    runtime.updatePlan.mockClear();

    for (const label of ["Colorを加える", "Open配置", "進行に合わせて最適化"]) {
      await act(async () => checkbox(label).click());
      expect(button(container, "一時停止")).not.toBeNull();
    }
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.updatePlan).toHaveBeenCalledTimes(3);

    const beforeOctave = runtime.options!.plan.events.map((entry) =>
      entry.status === "SUPPORTED" ? [...entry.voicing.midiNotes] : []);
    const octaveUp = container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ上げる']")!;
    expect(octaveUp.disabled).toBe(false);
    await act(async () => octaveUp.click());
    expect(container.querySelector("[data-testid='voicing-loop-transport-primary']")?.textContent).toContain("OCT+1");
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.options!.plan.events.map((entry) =>
      entry.status === "SUPPORTED" ? entry.voicing.midiNotes : [])).toEqual(
      beforeOctave.map((notes) => notes.map((note) => note + 12)),
    );

    await act(async () => button(container, "一時停止").click());
    expect(button(container, "再開")).not.toBeNull();
    const octaveDown = container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ下げる']")!;
    expect(octaveDown.disabled).toBe(false);
    await act(async () => octaveDown.click());
    expect(button(container, "再開")).not.toBeNull();
    expect(runtime.stop).not.toHaveBeenCalled();
  });

  it("queues KEY and OCT for the next bar while playback keeps running", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(1.5));
    runtime.updatePlan.mockClear();
    runtime.stop.mockClear();

    const key = container.querySelector<HTMLSelectElement>("#voicing-loop-key")!;
    expect(key.disabled).toBe(false);
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(key, "2");
      key.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button(container, "一時停止")).not.toBeNull();
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.updatePlan).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ applyAtBeat: 4, snapshot: expect.objectContaining({ key: "D major" }) }),
    );

    await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ上げる']")!.click());
    expect(button(container, "一時停止")).not.toBeNull();
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.updatePlan).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ applyAtBeat: 4 }),
    );
  });

  it("starts immediately without a silent count-in when the metronome is off", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    expect((container.querySelector<HTMLSelectElement>("#voicing-loop-count-in"))?.value).toBe("1");
    await act(async () => button(container, "メトロノーム").click());
    await act(async () => button(container, "開始").click());
    expect(runtime.start).toHaveBeenLastCalledWith(expect.objectContaining({ countInBars: 0 }));
    expect(container.querySelector("[data-testid='voicing-loop-status']")?.textContent).not.toContain("カウントイン");
    expect(button(container, "一時停止")).not.toBeNull();
  });

  it("switches the displayed candidate and hot-swaps pitches, fingering, keyboard, coverage, and audition without moving the clock", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const navigation = container.querySelector("[data-testid='voicing-loop-candidate-navigation']")!;
    const next = navigation.querySelector<HTMLButtonElement>("[aria-label='次のVoicing候補']")!;
    await act(async () => button(container, "開始").click());
    const beforeClock = container.querySelector("[data-testid='voicing-loop-status']")?.textContent;
    const beforePlan = runtime.options!.plan.events[0];
    const beforeText = container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent;
    runtime.updatePlan.mockClear();
    runtime.stop.mockClear();
    runtime.pause.mockClear();

    expect(next.disabled).toBe(false);
    await act(async () => next.click());

    const afterPlan = runtime.options!.plan.events[0];
    expect(afterPlan).not.toEqual(beforePlan);
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent).not.toBe(beforeText);
    expect(container.querySelector("[data-testid='voicing-loop-status']")?.textContent).toBe(beforeClock);
    expect(runtime.updatePlan).toHaveBeenCalledTimes(1);
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='voicing-loop-current-explanation']")?.textContent).toContain("Candidate");
    if (afterPlan?.status === "SUPPORTED") {
      for (const note of afterPlan.voicing.midiNotes) {
        expect(container.querySelector(`[data-midi-note='${note}']`)).not.toBeNull();
      }
    }

    const previous = navigation.querySelector<HTMLButtonElement>("[aria-label='前のVoicing候補']")!;
    await act(async () => previous.click());
    expect(runtime.options!.plan.events[0]).toEqual(beforePlan);
    await act(async () => next.click());
    expect(runtime.options!.plan.events[0]).toEqual(afterPlan);
    expect(runtime.updatePlan).toHaveBeenCalledTimes(3);

    await act(async () => button(container, "一時停止").click());
    await act(async () => button(container, "現在のコードを試聴").click());
    if (afterPlan?.status === "SUPPORTED") {
      expect(runtime.audition).toHaveBeenLastCalledWith(
        progressionPracticePlaybackNotes(afterPlan.voicing),
        expect.any(String),
      );
    }
  });

  it("disables candidate navigation when a fixed top leaves one valid voicing", async () => {
    const base = snapshot("basic-full");
    const fixed: ProgressionVoicingPracticeSnapshot = {
      ...base,
      events: base.events.map((event) => ({
        ...event,
        chord: { root: 4, quality: "add9", tensions: [], bass: 6, label: "Eadd9/F#" },
      })),
    };
    const container = await renderView(
      new FakeTransport(),
      { "basic-full": fixed },
      "basic-full",
      false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() },
      [],
      { lessonContext: { bass: "self-played", top: "fixed-melody", fixedMelodyMidiNote: 71 } },
    );
    const navigation = container.querySelector("[data-testid='voicing-loop-candidate-navigation']")!;
    expect(navigation.textContent).toContain("Candidate 1/1");
    expect(navigation.querySelector<HTMLButtonElement>("[aria-label='前のVoicing候補']")?.disabled).toBe(true);
    expect(navigation.querySelector<HTMLButtonElement>("[aria-label='次のVoicing候補']")?.disabled).toBe(true);
  });

  it("renders slash add9 Shell as an exact two-hand lesson with fingerprints and compact toolbar", async () => {
    const runtime = new FakeTransport();
    const base = snapshot("basic-full");
    const slash: ProgressionVoicingPracticeSnapshot = {
      ...base,
      events: base.events.map((event, index) => index === 0 ? {
        ...event,
        chord: { root: 4, quality: "add9", tensions: [], bass: 6, label: "Eadd9/F#" },
      } : {
        ...event,
        chord: { root: 2, quality: "add9", tensions: [], bass: 4, label: "Dadd9/E" },
      }),
    };
    const container = await renderView(runtime, { "basic-full": slash }, "basic-full");
    await act(async () => button(container, "Core").click());
    const current = container.querySelector("[data-testid='voicing-loop-current-voicing']")!;
    const next = container.querySelector("[data-testid='voicing-loop-next-voicing']")!;
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Eadd9/F#");
    expect(container.querySelector("[data-testid='voicing-loop-left-hand']")?.textContent)
      .toContain("CHORD TONE9");
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("CHORD TONE1 · 3 · 5");
    expect(current.textContent).toContain("FINGERL5");
    expect(current.textContent).toContain("FINGERR");
    expect(next.textContent).toContain("LEFT HAND");
    expect(container.querySelector("[data-testid='voicing-loop-next-left-hand']")?.textContent)
      .toContain("LEFT HAND");
    expect(container.querySelector("[data-testid='voicing-loop-next-right-hand']")?.textContent)
      .toContain("RIGHT HAND");
    const plan = resolveProgressionPracticeVoicings(slash, {
      lessonStudyCategory: "core",
      lessonProgressionOptimization: false,
      lessonContext: { bass: "self-played", top: "normal-voicing-top" },
    });
    const currentResolution = plan.events[0]!;
    expect(currentResolution.status).toBe("SUPPORTED");
    if (currentResolution.status !== "SUPPORTED") return;
    const bass = currentResolution.voicing.bassNote!;
    expect(container.querySelector(`[data-midi-note='${bass}'] [data-finger-label='L5']`)).not.toBeNull();
    for (const pitch of currentResolution.voicing.rightHandNotes ?? []) {
      expect(container.querySelector(`[data-midi-note='${pitch}'] [data-finger-label^='R']`)).not.toBeNull();
    }
    const toolbar = container.querySelector("[data-testid='voicing-loop-controls']")!;
    expect(toolbar.textContent).not.toMatch(/\bMY\b|\bLESSON\b|SHELL TYPE/);
    expect(Array.from(toolbar.querySelectorAll("legend"), (entry) => entry.textContent)).toEqual([
      "SOURCE", "STUDY", "DISPLAY",
    ]);
    expect(["Lesson Rules", "Source MIDI", "Custom", "Teacher", "Core"]
      .every((label) => Array.from(toolbar.querySelectorAll("button")).some((entry) => entry.textContent === label)))
      .toBe(true);
    expect(toolbar.textContent).toContain("Colorを加える");
    expect(toolbar.textContent).toContain("Open配置");
    expect(container.querySelector("[data-testid='voicing-loop-shell-type']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-current-explanation']")?.textContent)
      .toContain("Family Core");
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.plan.events.every((entry) => entry.status === "SUPPORTED")).toBe(true);
  });
  it("loads legacy Shell IDs without exposing them as new top-level choices or rewriting their plan", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "full-shell": snapshot("full-shell") }, "full-shell");

    expect(container.textContent).not.toContain("Legacy Full-chord Shell");
    expect(container.textContent).not.toContain("Full Shell Voicing");
    expect(button(container, "Lesson Rules").getAttribute("aria-pressed")).toBe("true");
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.plan.selection).toBe("full-shell");
    expect(runtime.options?.plan.events.every((event) => event.status === "SUPPORTED")).toBe(true);
  });

  it("keeps timeline audition available during playback and current audition available while paused", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const timelineCards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");

    await act(async () => button(container, "開始").click());
    expect(timelineCards[1]?.disabled).toBe(false);
    await act(async () => timelineCards[1]?.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");

    await act(async () => runtime.options?.onTransportBeat(6.5));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");

    await act(async () => button(container, "一時停止").click());
    const currentAudition = button(container, "現在のコードを試聴");
    expect(currentAudition.disabled).toBe(false);
    await act(async () => currentAudition.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");

    await act(async () => timelineCards[0]?.click());
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Cmaj7");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    await act(async () => button(container, "再開").click());
    expect(runtime.resume).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dm7");
  });

  it("defaults reference sound on, passes session state to Start, and keeps visual transport available off", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const referenceSound = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("お手本音"))!;
    expect(referenceSound.checked).toBe(true);
    await act(async () => referenceSound.click());
    expect(referenceSound.checked).toBe(false);
    expect(runtime.setReferenceSoundEnabled).toHaveBeenCalledWith(false);

    await act(async () => button(container, "開始").click());
    expect(runtime.options?.referenceSoundEnabled).toBe(false);
    expect(runtime.options?.sound).toBe("piano");
    await act(async () => runtime.options?.onTransportBeat(6.5));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    expect(button(container, "一時停止")).not.toBeNull();
  });

  it("uses the shared Electric Piano selection for full playback and card audition", async () => {
    savePreviewSound("electric-piano");
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.sound).toBe("electric-piano");
    await act(async () => Array.from(container.querySelectorAll("button"))
      .find((entry) => entry.textContent === "停止")?.click());
    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith([48, 55, 59], "electric-piano");
  });

  it("shows the real MIDI device beside transport controls and opens its settings", async () => {
    const original = defaultLiveMidiStore.getState();
    const openMidiSettings = vi.fn();
    defaultLiveMidiStore.setState({
      status: "connected",
      selected: { backendId: "keyboard", name: "Studio Keyboard", index: 0 },
    });
    try {
      const container = await renderView(
        new FakeTransport(),
        { "basic-full": snapshot("basic-full") },
        "basic-full",
        false,
        { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn(), openMidiSettings },
      );
      expect(container.querySelector("[data-testid='voicing-loop-midi-status']")?.textContent)
        .toContain("MIDI入力接続済み · Studio Keyboard");
      expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
        .not.toContain("MIDI");
      await act(async () => button(container, "設定").click());
      expect(openMidiSettings).toHaveBeenCalledOnce();
    } finally {
      await act(async () => defaultLiveMidiStore.setState({ status: original.status, selected: original.selected }));
    }
  });

  it("keeps optional monitoring non-blocking after activation failure and retries on remount", async () => {
    const original = defaultLiveMidiStore.getState();
    let attempts = 0;
    const activate = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("monitor unavailable");
      defaultLiveMidiStore.setState({ active: true });
    });
    const deactivate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: false }); });
    defaultLiveMidiStore.setState({ active: false, activate, deactivate });
    try {
      const runtime = new FakeTransport();
      const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full", true);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(button(container, "開始").disabled).toBe(false);
      expect(container.textContent).not.toContain("再生できませんでした");

      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();
      await act(async () => { await Promise.resolve(); });
      await renderView(new FakeTransport(), { "basic-full": snapshot("basic-full") }, "basic-full", true);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(activate).toHaveBeenCalledTimes(2);
      expect(defaultLiveMidiStore.getState().active).toBe(true);
    } finally {
      await act(async () => root?.unmount());
      root = undefined;
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
      });
    }
  });

  it("shows unavailable and unsupported states without silent fallback", async () => {
    const runtime = new FakeTransport();
    const source = snapshot("source-midi", false);
    const unsupported = snapshot("basic-full", false, "dim");
    const container = await renderView(runtime, {
      "source-midi": source,
      "basic-full": unsupported,
    }, "source-midi", false, undefined, [], {
      maxLeftHandSpanSemitones: 0,
      maxRightHandSpanSemitones: 0,
    });
    expect(container.textContent).toContain("選択したVoicingを利用できません");
    expect(button(container, "開始").disabled).toBe(true);

    await act(async () => button(container, "Lesson Rules").click());
    expect(container.textContent).toContain("選択中Lesson Voicingの規則がありません");
    expect(button(container, "開始").disabled).toBe(true);
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it("shows explicit unavailable when Custom is missing from a loaded Source MIDI progression", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    await act(async () => button(container, "Custom").click());
    expect(container.textContent).toContain("選択したVoicingを利用できません");
    expect(container.textContent).not.toContain("練習する進行を選択してください");
  });

  it("shows explicit unavailable when Source MIDI is missing from a loaded Custom progression", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { custom: snapshot("custom") }, "custom");
    await act(async () => button(container, "Source MIDI").click());
    expect(container.textContent).toContain("選択したVoicingを利用できません");
    expect(container.textContent).not.toContain("練習する進行を選択してください");
  });

  it("requires every event to resolve before Start and lists every unresolved chord", async () => {
    const runtime = new FakeTransport();
    const partial = snapshot("source-midi");
    delete (partial.events[1] as { voicing?: unknown }).voicing;
    const container = await renderView(runtime, { "source-midi": partial }, "source-midi");
    expect(container.textContent).toContain("1個のコードを再生できません");
    expect(container.textContent).toContain("Dm7: 利用不可");
    expect(button(container, "開始").disabled).toBe(true);
  });

  it("groups repeated unsupported upper structures without dropping slash identity", async () => {
    const runtime = new FakeTransport();
    const base = snapshot("left-hand");
    const slash = {
      ...base,
      events: base.events.map((event) => ({
        ...event,
        chord: { root: 0, quality: "dim" as const, tensions: [], bass: 2, label: "Cdim/D" },
      })),
    };
    const container = await renderView(runtime, { "left-hand": slash }, "left-hand");
    expect(container.textContent).toContain("2個のコードを再生できません");
    expect(container.textContent).toContain("Cdim/D ×2: 上部コードに対応するLeft-hand規則がありません");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(button(container, "開始").disabled).toBe(true);
  });

  it("separates slash bass from LH targets, combines both auditions, and conceals all guidance in Recall", async () => {
    const runtime = new FakeTransport();
    const base = snapshot("left-hand");
    const value: ProgressionVoicingPracticeSnapshot = { ...base, events: base.events.map((event, index) => ({
      ...event, chord: { root: 9, quality: index === 0 ? "min11" : "min9", tensions: [], bass: index === 0 ? 11 : 0, label: index === 0 ? "Am11/B" : "Am9/C" },
    })) };
    const resolution = resolveProgressionPracticeVoicings(value).events[0]!;
    if (resolution.status !== "SUPPORTED") throw new Error("Approved upper rule expected");
    const bass = resolution.voicing.referenceBassNote!;
    const playback = [bass, ...resolution.voicing.midiNotes];
    const container = await renderView(runtime, { "left-hand": value }, "left-hand");
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Am11/B");
    expect(container.querySelector("[data-testid='slash-bass-reference']")?.textContent).toContain("練習対象外");
    const bassKey = container.querySelector(`[data-midi-note='${bass}']`)!;
    expect(Array.from(bassKey.querySelectorAll("text")).some((node) => node.textContent === "BASS")).toBe(false);
    expect(bassKey.querySelector("[data-bass-reference='guide']")).not.toBeNull();
    expect(bassKey.getAttribute("data-guide-hand")).toBeNull();
    expect(container.querySelectorAll("[data-guide-hand='left']")).toHaveLength(resolution.voicing.midiNotes.length);
    expect(container.querySelectorAll("[data-guide-hand='right']")).toHaveLength(0);
    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith(playback, "piano");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-event']")!.click());
    expect(runtime.audition).toHaveBeenLastCalledWith(playback, "piano");
    await act(async () => button(container, "開始").click());
    expect(runtime.options!.plan.events[0]).toEqual(resolution);
    await act(async () => button(container, "Recall").click());
    expect(container.querySelector("[data-testid='slash-bass-reference']")).toBeNull();
    expect(container.querySelectorAll("[data-guide-hand]")).toHaveLength(0);
    expect(container.querySelector("svg[role='img']")?.getAttribute("aria-label")).toContain("お手本0音");
  });

  it("cancels a pending Start on Pause and resumes from the retained musical position", async () => {
    const runtime = new PendingTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => button(container, "一時停止").click());
    runtime.releaseFirstStart();
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("一時停止中");

    await act(async () => button(container, "再開").click());
    expect(runtime.start).toHaveBeenCalledTimes(2);
    expect(runtime.start.mock.calls[1]?.[0].startBeat).toBe(0);
  });

  it("keeps BPM and metronome UI aligned with changes made during pending Start", async () => {
    const runtime = new PendingTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    const bpm = container.querySelector<HTMLInputElement>("#voicing-loop-bpm")!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(bpm, "132");
      bpm.dispatchEvent(new Event("input", { bubbles: true }));
      button(container, "メトロノーム").click();
    });
    expect(bpm.value).toBe("132");
    expect(runtime.setBpm).toHaveBeenCalledWith(132);
    expect(runtime.setMetronomeEnabled).toHaveBeenCalledWith(false);
    expect(button(container, "メトロノーム").textContent).toContain("OFF");
    runtime.releaseFirstStart();
    await act(async () => Promise.resolve());
  });

  it("keeps the saved transport callback active across Pause/Resume and Restart", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    const sync = runtime.options!.onTransportBeat;

    await act(async () => button(container, "一時停止").click());
    await act(async () => button(container, "再開").click());
    await act(async () => sync(6.5));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");

    await act(async () => button(container, "最初から").click());
    await act(async () => sync(6.75));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
  });

  it("does not relaunch a stale resume after Stop", async () => {
    const runtime = new FakeTransport();
    let release!: (result: boolean) => void;
    runtime.resume.mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => button(container, "一時停止").click());
    await act(async () => button(container, "再開").click());
    await act(async () => button(container, "停止").click());
    await act(async () => release(false));
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("停止しました");
  });

  it("applies BPM to the latest synchronized transport position", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    const bpm = container.querySelector<HTMLInputElement>("#voicing-loop-bpm")!;
    await act(async () => {
      runtime.options?.onTransportBeat(6.5);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(bpm, "120");
      bpm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    expect(runtime.setBpm).toHaveBeenCalledWith(120);
  });

  it("catches reference audition rejection and returns to a localized safe state", async () => {
    const runtime = new RejectingAuditionTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "現在のコードを試聴").click());
    expect(container.textContent).toContain("再生できませんでした");
    expect(container.textContent).toContain("音声を安全に停止しました。もう一度お試しください。");
    expect(container.textContent).not.toContain("private runtime detail");
    expect(container.textContent).toContain("停止しました");
    expect(runtime.stop).toHaveBeenCalled();
  });

  it("advances only from the practice clock with no, wrong, or extra MIDI notes", async () => {
    const originalNotes = defaultLiveMidiStore.getState().notes;
    try {
      const runtime = new FakeTransport();
      const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
      await act(async () => button(container, "開始").click());
      const sync = runtime.options!.onTransportBeat;

      await act(async () => sync(5));
      expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Cmaj7");

      await act(async () => {
        defaultLiveMidiStore.setState({
          notes: {
            held: new Map([
              ["0:61", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
              ["0:70", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
            ]),
            sustained: new Set(),
            pedalByChannel: new Map(),
          },
        });
      });
      await act(async () => sync(6.5));
      expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
      expect(container.textContent).not.toMatch(/正解|不正解|スコア|accuracy|streak|mastery/i);

      await act(async () => {
        defaultLiveMidiStore.setState({
          notes: { held: new Map(), sustained: new Set(), pedalByChannel: new Map() },
        });
      });
      await act(async () => sync(8));
      expect(container.textContent).toContain("1 周完了");
    } finally {
      await act(async () => defaultLiveMidiStore.setState({ notes: originalNotes }));
    }
  });

  it("invalidates the old clock and stops runtime on source switch and route exit", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, {
      "source-midi": snapshot("source-midi"),
      custom: snapshot("custom"),
    }, "source-midi");
    await act(async () => button(container, "開始").click());
    const staleSync = runtime.options!.onTransportBeat;
    const stopsBeforeSwitch = runtime.stop.mock.calls.length;

    await act(async () => button(container, "Custom").click());
    expect(runtime.stop.mock.calls.length).toBeGreaterThan(stopsBeforeSwitch);
    await act(async () => staleSync(8));
    expect(container.textContent).toContain("0 周完了");

    await act(async () => button(container, "開始").click());
    const stopsBeforeExit = runtime.stop.mock.calls.length;
    await act(async () => root?.unmount());
    root = undefined;
    expect(runtime.stop.mock.calls.length).toBeGreaterThan(stopsBeforeExit);
  });

  it("keeps slash identity and key-aware sharp spelling in a two-hand Source plan", async () => {
    const base = snapshot("source-midi");
    const value: ProgressionVoicingPracticeSnapshot = {
      ...base,
      key: "G major",
      events: base.events.map((event, index) => index === 0 ? {
        ...event,
        chord: { root: 7, quality: "maj9", tensions: [], bass: 9, label: "Gmaj9/A" },
        voicing: { kind: "source-midi", midiNotes: [45, 54, 59, 62, 66], bassNote: 45 },
      } : event),
    };
    const container = await renderView(
      new FakeTransport(),
      { "source-midi": value },
      "source-midi",
    );
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent)
      .toBe("Gmaj9/A");
    expect(container.querySelector("[data-testid='voicing-loop-left-hand']")?.textContent)
      .toContain("PITCHA3");
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("F#4");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .not.toContain("Gb4");
  });

  it("shows Suggested Fingering for every product voicing choice without changing playback pitches", async () => {
    const runtime = new FakeTransport();
    const allSnapshots = Object.fromEntries([
      "source-midi", "custom", "basic-full", "rootless-shell", "left-hand",
    ].map((selection) => [selection, snapshot(selection as ProgressionVoicingSelection)]));
    const container = await renderView(runtime, allSnapshots, "source-midi");

    expect(container.querySelector("[data-testid='voicing-loop-left-hand']")?.textContent)
      .toContain("FINGERL5");
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("FINGERR1 · R5");
    expect(container.querySelector("[data-finger-label='L5']")).not.toBeNull();
    expect(container.querySelector("[data-finger-label='R1']")).not.toBeNull();

    for (const label of ["Custom", "Lesson Rules"]) {
      await act(async () => button(container, label).click());
      expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
        .toContain("FINGER");
    }
    expect(container.querySelector("[data-testid='voicing-loop-left-hand']")?.textContent)
      .toContain("FINGERL");
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("FINGERR");
  });

  it("can hide, save, and reset a personal fingering by exact physical pitch signature", async () => {
    const container = await renderView(
      new FakeTransport(),
      { "source-midi": snapshot("source-midi") },
      "source-midi",
    );
    await act(async () => button(container, "運指を編集").click());
    const selects = document.body.querySelectorAll<HTMLSelectElement>("[data-testid='voicing-loop-fingering-editor'] select");
    expect(selects).toHaveLength(3);
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(selects[1], "2");
      selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(document.body, "保存").click());
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("R2 · R5 (自分の運指)");
    expect(window.localStorage.getItem("loop-vault:voicing-loop-fingering-preferences:v1"))
      .toContain("R:55,59");

    await act(async () => button(container, "運指を編集").click());
    await act(async () => button(document.body, "おすすめに戻す").click());
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent)
      .toContain("R1 · R5 (おすすめ)");
    await act(async () => button(document.body, "キャンセル").click());

    const toggle = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("おすすめ運指を表示"));
    await act(async () => toggle?.click());
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .not.toContain("FINGER");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .toContain("PITCH");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .toContain("CHORD TONE");
    expect(container.querySelector("[data-finger-label]")).toBeNull();
  });
});

async function renderView(
  runtime: FakeTransport,
  snapshots: Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>> | undefined,
  initialSelection: ProgressionVoicingSelection,
  monitorMidi = false,
  callbacks: {
    onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
    onEnterText: () => void;
    openMidiSettings?: () => void;
  } = { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() },
  vaultProgressions: readonly VoicingLoopVaultCandidate[] = [],
  resolutionOptions?: ResolveProgressionPracticeVoicingsOptions,
): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <PreviewSoundProvider>
      <ProgressionVoicingPracticeView
        language="ja"
        snapshots={snapshots}
        initialSelection={initialSelection}
        monitorMidi={monitorMidi}
        vaultProgressions={vaultProgressions}
        onSelectProgression={callbacks.onSelectProgression}
        onEnterText={callbacks.onEnterText}
        openMidiSettings={callbacks.openMidiSettings}
        transportFactory={() => runtime}
        resolutionOptions={resolutionOptions}
      />
    </PreviewSoundProvider>,
  ));
  return container;
}

function vaultCandidate(index: number): VoicingLoopVaultCandidate {
  return {
    id: JSON.stringify([`idea-${index}`, `block-${index}`]),
    sourceReference: { ideaId: `idea-${index}`, blockId: `block-${index}` },
    title: `Progression ${index}`,
    key: index === 5 ? "F# major" : "C major",
    bpm: 80 + index,
    chordLabels: index === 5 ? ["F#maj7", "C#7"] : ["Cmaj7", "G7"],
    capturedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button"))
    .find((entry) => entry.textContent?.includes(label));
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

function snapshot(
  selection: ProgressionVoicingSelection,
  withVoicing = true,
  quality: "maj7" | "dim" = "maj7",
): ProgressionVoicingPracticeSnapshot {
  const isMy = selection === "source-midi" || selection === "custom";
  return {
    version: 1,
    fingerprint: `fixture-${selection}-${quality}`,
    source: { kind: "vault", reference: { ideaId: "idea", blockId: "block" } },
    selection,
    key: "C major",
    bpm: 80,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    spans: [
      { kind: "chord", eventIndex: 0, startBeat: 0, durationBeats: 2 },
      { kind: "chord", eventIndex: 1, startBeat: 2, durationBeats: 2 },
    ],
    events: [
      {
        id: "one",
        startBeat: 0,
        durationBeats: 2,
        chord: { root: 0, quality, tensions: [], label: quality === "dim" ? "Cdim" : "Cmaj7" },
        ...(isMy && withVoicing ? { voicing: { kind: selection, midiNotes: [48, 55, 59], bassNote: 48 } } : {}),
      },
      {
        id: "two",
        startBeat: 2,
        durationBeats: 2,
        chord: { root: 2, quality: quality === "dim" ? "dim" : "min7", tensions: [], label: quality === "dim" ? "Ddim" : "Dm7" },
        ...(isMy && withVoicing ? { voicing: { kind: selection, midiNotes: [50, 57, 60], bassNote: 50 } } : {}),
      },
    ],
  };
}

function dispatchPointer(
  target: HTMLElement,
  type: string,
  values: { button: number; clientY: number; pointerId: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: values.button },
    clientY: { value: values.clientY },
    pointerId: { value: values.pointerId },
  });
  target.dispatchEvent(event);
}

class FakeTransport implements ProgressionVoicingTransportPort {
  options?: ProgressionVoicingTransportStartOptions;
  start = vi.fn(async (options: ProgressionVoicingTransportStartOptions) => { this.options = options; });
  updatePlan = vi.fn((
    plan: ProgressionPracticeVoicingPlan,
    options: { readonly snapshot?: ProgressionVoicingPracticeSnapshot; readonly applyAtBeat?: number } = {},
  ) => {
    if (!this.options) return false;
    this.options = { ...this.options, snapshot: options.snapshot ?? this.options.snapshot, plan };
    return true;
  });
  pause = vi.fn(() => true);
  resume = vi.fn(async () => true);
  restart = vi.fn(async () => true);
  stop = vi.fn();
  setBpm = vi.fn();
  setMetronomeEnabled = vi.fn();
  setReferenceSoundEnabled = vi.fn();
  audition = vi.fn(async () => undefined);
}

class PendingTransport extends FakeTransport {
  private resolveFirst?: () => void;
  override start = vi.fn((options: ProgressionVoicingTransportStartOptions) => {
    this.options = options;
    if (this.start.mock.calls.length > 1) return Promise.resolve();
    return new Promise<void>((resolve) => { this.resolveFirst = resolve; });
  });
  override pause = vi.fn(() => false);
  override resume = vi.fn(async () => false);
  releaseFirstStart() { this.resolveFirst?.(); }
}

class RejectingAuditionTransport extends FakeTransport {
  override audition = vi.fn(async () => { throw new Error("private runtime detail"); });
}
