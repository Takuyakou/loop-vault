// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ProgressionPracticeSourceReference,
  ProgressionVoicingPracticeSnapshot,
  ProgressionVoicingSelection,
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

  it("projects Current, Next, Beat, progress, and Loop from the runtime transport callback", async () => {
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
    expect(container.textContent).toContain("25%");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Cmaj7");

    await act(async () => runtime.options?.onTransportBeat(10.5));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    expect(container.textContent).toContain("G3");
    expect(container.textContent).toContain("b7");
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
      "basic-full": { ...mixed, events, lengthBeats: startBeat },
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

  it("renders exact clock projection values with linear interpolation instead of rounded progress steps", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(4.013));

    const fills = container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progress-fill']");
    const chordScale = Number(fills[0]?.style.transform.match(/scaleX\((.+)\)/)?.[1]);
    const progressionScale = Number(fills[1]?.style.transform.match(/scaleX\((.+)\)/)?.[1]);
    expect(chordScale).toBeGreaterThan(0);
    expect(chordScale).toBeLessThan(0.01);
    expect(progressionScale).toBeGreaterThan(0);
    expect(progressionScale).toBeLessThan(chordScale);
    expect(fills[0]?.style.transitionTimingFunction).toBe("linear");
    expect(fills[0]?.className).toContain("motion-reduce:transition-none");
  });

  it("keeps Learn/Recall explicit, provides accessible controls, and never gates Start on MIDI", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    expect(button(container, "開始").disabled).toBe(false);
    expect(container.querySelector("[data-testid='voicing-loop-midi-status']")?.textContent)
      .toContain("MIDI入力未接続");
    expect(container.querySelector("[data-testid='voicing-loop-beat-indicator']")).not.toBeNull();
    expect(container.querySelector("[data-keyboard-alignment='center-when-fitted']")).not.toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("位置1 / 1 小節");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("次Dm7構成音: D4 · C5 · F5");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("2拍後に切り替わります");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(2);

    const recall = button(container, "Recall（コード名のみ）");
    await act(async () => recall.click());
    expect(recall.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).not.toContain("構成音:");
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
    expect(container.textContent).toContain("0 周完了");

    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith([48, 55, 59], "piano");
    expect(timelineCards[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(runtime.start).not.toHaveBeenCalled();
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
  });

  it("defaults reference sound on, passes session state to Start, and keeps visual transport available off", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const referenceSound = container.querySelector<HTMLInputElement>("input[type='checkbox']")!;
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
    }, "source-midi");
    expect(container.textContent).toContain("選択したVoicingを利用できません");
    expect(button(container, "開始").disabled).toBe(true);

    await act(async () => button(container, "Basic Full 1–7–3").click());
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
    bpm: 80,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    events: [
      {
        id: "one",
        startBeat: 0,
        durationBeats: 2,
        chord: { root: 0, quality, tensions: [], label: quality === "dim" ? "Cdim" : "Cmaj7" },
        ...(isMy && withVoicing ? { voicing: { kind: selection, midiNotes: [48, 55, 59] } } : {}),
      },
      {
        id: "two",
        startBeat: 2,
        durationBeats: 2,
        chord: { root: 2, quality: quality === "dim" ? "dim" : "min7", tensions: [], label: quality === "dim" ? "Ddim" : "Dm7" },
        ...(isMy && withVoicing ? { voicing: { kind: selection, midiNotes: [50, 57, 60] } } : {}),
      },
    ],
  };
}

class FakeTransport implements ProgressionVoicingTransportPort {
  options?: ProgressionVoicingTransportStartOptions;
  start = vi.fn(async (options: ProgressionVoicingTransportStartOptions) => { this.options = options; });
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
