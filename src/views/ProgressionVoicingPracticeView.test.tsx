// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { parseChordLabel } from "../domain/chords";
import { rankCyclicFingerings } from "../domain/progressionFingering";
import { assignPracticeHandsAcrossProgression } from "../voicingPractice/fingeringDisplay";
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
import type { SavedProgressionBlock } from "../domain/types";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { connectionController } from "../liveMidi/connectionController";
import { closeMidiPanel } from "../liveMidi/midiPanel";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { MetronomeProvider } from "../components/MetronomeProvider";
import { GlobalMetronomeButton } from "../components/GlobalMetronomeButton";
import { saveMetronomeEnabled } from "../audio/metronomePreference";
import { GlobalBpmProvider, useGlobalBpm } from "../components/GlobalBpmProvider";
import { loadGlobalBpm, saveGlobalBpm } from "../audio/globalBpmPreference";
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
  it("shows bulk 元MIDI counts before one explicit Vault action", async () => {
    const onBulkSourceApply = vi.fn(() => true);
    const container = await renderView(new FakeTransport(), { "source-midi": snapshot("source-midi") }, "source-midi", false, {
      onSelectProgression: vi.fn(() => true),
      onEnterText: vi.fn(),
      bulkSourcePreview: { eligible: 3, changed: 2, skippedCustom: 1, skippedMissingSource: 1 },
      onBulkSourceApply,
    });
    await act(async () => button(container, "この進行を元MIDIに").click());
    expect(document.body.textContent).toContain("対象 3・変更 2・カスタムはそのまま 1・元の音なし 1");
    expect(onBulkSourceApply).not.toHaveBeenCalled();
    await act(async () => button(document.body, "切り替える").click());
    expect(onBulkSourceApply).toHaveBeenCalledOnce();
  });

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
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("休符");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    expect(cards).toHaveLength(3);
    expect(cards[1]!.disabled).toBe(true);
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(6.5, 1e6));
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("休符");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")).toBeNull();
    expect(container.querySelector("svg[role='img']")?.getAttribute("aria-label")).toContain("お手本0音");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("休符");
    expect(container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")?.style.transform).toBe("translateX(300px)");
    await act(async () => cards[2]!.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dm7");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("休符");
    await act(async () => runtime.options?.onTransportBeat(8, 1e6));
    expect(container.querySelector("[data-testid='voicing-loop-position-metric']")?.textContent).toContain("2 / 2");
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
    await act(async () => runtime.options?.onTransportBeat(70, 1e6));
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(0);
    expect(container.querySelector("[data-testid='voicing-loop-position-metric']")?.textContent).toContain("0 / 0");
    expect(runtime.audition).not.toHaveBeenCalled();
    await act(async () => runtime.options?.onTransportBeat(132, 1e6));
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

      // P23-29 L2: the picker names itself on the list itself (`aria-label`), not with a heading.
      expect(container.querySelector("[aria-label='練習する進行']")).not.toBeNull();
      expect(container.textContent).toContain("まだ進行がありません");
      expect(container.querySelector("#voicing-loop-progression-search")).not.toBeNull();
      expect(container.textContent).not.toContain("元MIDI");
      expect(container.querySelector("fieldset")).toBeNull();
      expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
      expect(activate).not.toHaveBeenCalled();

      await act(async () => button(container, "テキストで入力").click());
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

  it("shows the persisted playback choice and low SourceSnapshot confidence separately in Current metadata", async () => {
    const base = snapshot("source-midi");
    const source = { ...base, events: base.events.map((event, index) => index === 0
      ? { ...event, playbackChoice: "SOURCE" as const, sourceNeedsReview: true }
      : event) };
    const container = await renderView(new FakeTransport(), { "source-midi": source }, "source-midi");
    expect(container.querySelector("[data-testid='voicing-loop-playback-choice']")?.textContent).toBe("元MIDI");
    expect(container.querySelector("[data-testid='voicing-loop-review-badge']")?.textContent).toBe("要確認");
    expect(container.querySelector("[data-testid='voicing-loop-current-panel']")?.textContent).not.toContain("Source MIDI");
  });

  it("lists every eligible progression at once, then searches all of them", async () => {
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

    // VL-15: no "すべての進行を見る" step — the whole list is on the screen.
    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']")).toHaveLength(6);
    expect(container.textContent).not.toContain("すべての進行を見る");

    const search = container.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(search, "F# major");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']")).toHaveLength(1);
    // P23-29 L6/L6b: the one visible row is picked already, so one press starts the practice.
    await act(async () => container.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-row']")!.click());
    expect(onSelectProgression).toHaveBeenCalledWith(candidates[5]!.sourceReference);
    expect(loadRecentVoicingLoopProgressions()).toEqual([candidates[5]!.sourceReference]);
  });

  it("offers a supported 64-card Vault progression as one selectable source", async () => {
    const long = { ...vaultCandidate(0), chordLabels: Array.from({ length: 64 }, (_, index) => index % 2 ? "Dm7" : "Cmaj7") };
    const onSelectProgression = vi.fn(() => true);
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn() }, [long]);
    const row = container.querySelector("[data-testid='voicing-loop-progression-row']")!;
    // P23-29 L7: the one main practice button lives in the chosen progression's column now.
    const practice = container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-preview-practice']")!;
    expect(row.getAttribute("aria-disabled")).toBeNull();
    await act(async () => practice.click());
    expect(onSelectProgression).toHaveBeenCalledWith(long.sourceReference);
  });

  it("shows over-capacity Vault progressions as disabled with a clear reason", async () => {
    const unavailable = { ...vaultCandidate(0), unavailableReason: "resource-budget" as const };
    const onSelectProgression = vi.fn(() => true);
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn() }, [unavailable]);
    const choice = container.querySelector("[data-testid='voicing-loop-progression-choice']")!;
    const row = choice.closest("[data-testid='voicing-loop-progression-row']")!;
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector("[data-testid='voicing-loop-progression-practice']")).toBeNull();
    expect(rowText(choice)).toContain("再生時間・拍数・イベント数の安全上限");
    await act(async () => (row as HTMLElement).click());
    expect(onSelectProgression).not.toHaveBeenCalled();
  });

  it("shows unspecific legacy playback as automatic without changing stored intent", async () => {
    const container = await renderView(new FakeTransport(), { "basic-full": snapshot("basic-full") }, "basic-full");
    expect(container.querySelector("[data-testid='voicing-loop-playback-choice']")?.textContent).toBe("未設定（自動）");
    expect(container.querySelector("[data-testid='voicing-loop-playback-choice']")?.getAttribute("title"))
      .toContain("保存時に再生方法");
  });

  it("shows missing BPM and unsupported meter reasons on disabled Vault entries", async () => {
    const candidates = [
      { ...vaultCandidate(0), unavailableReason: "invalid-bpm" as const },
      { ...vaultCandidate(1), unavailableReason: "unsupported-meter" as const },
    ];
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, candidates);
    const choices = Array.from(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']"));
    expect(choices).toHaveLength(2);
    expect(choices.every((choice) => choice.closest("[data-testid='voicing-loop-progression-row']")?.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(choices.map((choice) => rowText(choice)).join(" ")).toContain("BPMが対応範囲外");
    expect(choices.map((choice) => rowText(choice)).join(" ")).toContain("この拍子");
  });

  it("shows the BPM number only in the picker and explains a provisional tempo on hover", async () => {
    const candidates = [
      { ...vaultCandidate(0), bpm: 120, tempoOrigin: "SMF_DEFAULT" as const },
      { ...vaultCandidate(1), bpm: 120, tempoOrigin: "PRACTICE_INITIAL" as const },
      { ...vaultCandidate(2), bpm: 96, tempoOrigin: "SAVED_BPM" as const },
    ];
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, candidates);
    const choices = Array.from(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']"));
    expect(choices).toHaveLength(3);
    expect(choices.every((choice) => choice.closest("[data-testid='voicing-loop-progression-row']")?.getAttribute("aria-disabled") === null)).toBe(true);
    // P23-29 L6: a row has no practice button of its own; the main one is in the right column.
    expect(container.querySelectorAll("[data-testid='voicing-loop-progression-practice']")).toHaveLength(0);
    expect(container.querySelectorAll("[data-testid='voicing-loop-preview-practice']")).toHaveLength(1);
    // The picker does not name the origin ("SMF既定" / "練習初期値"); since P23-06 the practice screen does not either.
    expect(container.textContent).not.toContain("SMF既定");
    expect(container.textContent).not.toContain("練習初期値");
    const tempos = Array.from(container.querySelectorAll<HTMLElement>("[data-tempo-origin]"));
    expect(tempos.map((element) => element.textContent).sort()).toEqual(["120 BPM", "120 BPM", "96 BPM"]);
    const tempoOf = (origin: string) => tempos.find((element) => element.dataset.tempoOrigin === origin)!;
    expect(tempoOf("SMF_DEFAULT").className).toContain("text-[var(--lv-text-muted)]");
    expect(tempoOf("SMF_DEFAULT").getAttribute("title")).toBe("MIDIにテンポが無いため、仮の 120 BPM です");
    expect(tempoOf("PRACTICE_INITIAL").className).toContain("text-[var(--lv-text-muted)]");
    expect(tempoOf("PRACTICE_INITIAL").getAttribute("title")).toBe("BPMが保存されていないため、仮の 120 BPM です");
    expect(tempoOf("SAVED_BPM").className).not.toContain("text-[var(--lv-text-muted)]");
    expect(tempoOf("SAVED_BPM").getAttribute("title")).toBeNull();
  });

  it("shows the one-line favourite hint only while the list has no favourites", async () => {
    const plain = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [vaultCandidate(0), vaultCandidate(1)]);
    expect(plain.querySelector("[data-testid='voicing-loop-favorite-hint']")?.textContent)
      .toBe("を押すと、お気に入りが一番上に並びます");
    await act(async () => root?.unmount());
    root = undefined;
    const withFavorite = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() },
      [{ ...vaultCandidate(0), favorite: true }, vaultCandidate(1)]);
    expect(withFavorite.querySelector("[data-testid='voicing-loop-favorite-hint']")).toBeNull();
  });

  it("adds a favourite without moving the row, and the next open puts it in the top section", async () => {
    const candidates = [vaultCandidate(0), vaultCandidate(1), vaultCandidate(2)];
    const onToggleFavorite = vi.fn(() => true);
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn(), onToggleFavorite }, candidates);
    const titles = () => Array.from(container.querySelectorAll("[data-testid='voicing-loop-progression-choice']"))
      .map((choice) => choice.querySelector("span[title]")?.textContent?.trim());
    expect(titles()).toEqual(["Progression 2", "Progression 1", "Progression 0"]);

    const star = container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-favorite']")!;
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.getAttribute("aria-label")).toBe("お気に入りに追加");
    await act(async () => star.click());

    expect(onToggleFavorite).toHaveBeenCalledWith(candidates[2]!.sourceReference, true);
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.getAttribute("aria-label")).toBe("お気に入りから外す");
    // The row stays where it was until the picker is opened again.
    expect(titles()).toEqual(["Progression 2", "Progression 1", "Progression 0"]);
    expect(container.querySelector("[data-testid='voicing-loop-section-favorites']")).toBeNull();

    await act(async () => root?.unmount());
    root = undefined;
    const reopened = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn(), onToggleFavorite },
      [{ ...candidates[2]!, favorite: true }, candidates[1]!, candidates[0]!]);
    const favorites = reopened.querySelector("[data-testid='voicing-loop-section-favorites']");
    expect(favorites?.querySelector("h3")?.textContent).toBe("お気に入り");
    expect(favorites?.querySelector("[data-testid='voicing-loop-progression-choice']")?.textContent)
      .toContain("Progression 2");
  });

  it("puts the star back and tells the user when the Vault cannot store the favourite", async () => {
    const onToggleFavorite = vi.fn(() => false);
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn(), onToggleFavorite }, [vaultCandidate(0)]);
    const star = container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-favorite']")!;
    await act(async () => star.click());
    expect(onToggleFavorite).toHaveBeenCalledWith(vaultCandidate(0).sourceReference, true);
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[data-testid='voicing-loop-favorite-notice']")?.textContent)
      .toBe("お気に入りを保存できませんでした。");
  });

  it("starts practice from the row but never from the star", async () => {
    const onSelectProgression = vi.fn(() => true);
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn(), onToggleFavorite: vi.fn(() => true) }, [vaultCandidate(0)]);
    const star = container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-favorite']")!;
    await act(async () => star.click());
    expect(onSelectProgression).not.toHaveBeenCalled();

    const row = container.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-row']")!;
    await act(async () => row.click());
    expect(onSelectProgression).toHaveBeenCalledWith(vaultCandidate(0).sourceReference);
  });

  it("P23-06: shows no tempo-origin mark after a Vault progression with the SMF default tempo is loaded", async () => {
    const loaded = snapshot("source-midi");
    const candidate = {
      ...vaultCandidate(0),
      sourceReference: loaded.source.reference,
      bpm: 120,
      tempoOrigin: "SMF_DEFAULT" as const,
    };
    const container = await renderView(new FakeTransport(), { "source-midi": loaded }, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [candidate]);
    // P23-32 K4: the practice has no BPM field of its own (the header's 共通 BPM is the one).
    expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-tempo-origin']")).toBeNull();
    expect(container.textContent).not.toContain("SMF既定");
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
    // P23-29 L6b: the only row is picked already, so one press starts the practice.
    await act(async () => container.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-row']")!.click());
    expect(loadRecentVoicingLoopProgressions()).toEqual([]);
  });

  it("clears the recent progression and stops playback when it becomes direct-entry empty", async () => {
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
          snapshots={snapshots}
          initialSelection="basic-full"
          vaultProgressions={vaultProgressions}
          onSelectProgression={onSelectProgression}
          onEnterText={vi.fn()}
          transportFactory={() => runtime}
        />,
      ));

      await render({ "basic-full": snapshot("basic-full") });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(loadRecentVoicingLoopProgressions()).toEqual([retainedReference]);
      await act(async () => button(container, "開始").click());
      const stopsBeforeSelector = runtime.stop.mock.calls.length;

      const nextCandidate = vaultCandidate(2);
      const onSelectProgression = vi.fn(() => true);
      await render(undefined, [nextCandidate], onSelectProgression);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(container.querySelector("[data-testid='voicing-loop-progression-row']")).not.toBeNull();
      expect(loadRecentVoicingLoopProgressions()).toEqual([]);
      expect(runtime.stop.mock.calls.length).toBeGreaterThan(stopsBeforeSelector);
      await act(async () => container.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-row']")!.click());
      expect(onSelectProgression).toHaveBeenCalledWith(nextCandidate.sourceReference);
    } finally {
      await act(async () => root?.unmount());
      root = undefined;
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

    await act(async () => runtime.options?.onTransportBeat(8.5, 1e6));
    expect(container.textContent).toContain("1 周完了");
    expect(container.querySelector("[data-testid='voicing-loop-status']")?.textContent).toContain("コード");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(0);
    expect(container.textContent).not.toContain("25%");
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Cmaj7");

    await act(async () => runtime.options?.onTransportBeat(10.5, 1e6));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
    expect(container.textContent).toContain("G3");
    expect(container.textContent).toContain("b7");
  });

  it("uses chord index as the sole primary position metric", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const positionMetric = container.querySelector("[data-testid='voicing-loop-position-metric']")!;
    expect(positionMetric.textContent).toContain("コード");
    expect(positionMetric.textContent).toContain("1 / 2");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(0);
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(6.5, 1e6));
    expect(positionMetric.textContent).toContain("2 / 2");
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
    expect(sections[1]!.querySelector("[data-testid='voicing-loop-next-move']")).not.toBeNull();
    const playhead = container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")!;
    expect(playhead.style.transform).toBe("translateX(0px)");
    expect(playhead.style.transitionTimingFunction).toBe("");
    expect(container.querySelector("[data-testid='voicing-loop-playhead-marker']")).not.toBeNull();
    await act(async () => button(container, "開始").click());
    for (const [transportBeat, expectedX] of [[6, 240], [9, 600], [10.5, 780]]) {
      await act(async () => runtime.options?.onTransportBeat(transportBeat!, 1e6));
      expect(playhead.style.transform).toBe(`translateX(${expectedX}px)`);
    }
    await act(async () => button(container, "一時停止").click());
    expect(playhead.style.transform).toBe("translateX(780px)");
    await act(async () => button(container, "再開").click());
    await act(async () => runtime.options?.onTransportBeat(11, 1e6));
    expect(playhead.style.transform).toBe("translateX(840px)");
    await act(async () => runtime.options?.onTransportBeat(12, 1e6));
    expect(playhead.style.transform).toBe("translateX(0px)");
    expect(container.textContent).toContain("1 周完了");
    expect(Array.from(container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-event']"))
      .map((card) => card.style.width)).toEqual(["480px", "240px", "120px", "120px"]);
    expect(container.querySelectorAll("[data-testid='voicing-loop-event-beat-rail']")).toHaveLength(0);
  });

  it("renders exact playhead projection values with linear interpolation instead of rounded steps", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(4.013, 1e6));

    const playhead = container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")!;
    const offset = Number(playhead.style.transform.match(/translateX\((.+)px\)/)?.[1]);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeCloseTo(3.12, 2);
    expect(playhead.style.transitionTimingFunction).toBe("");
    expect(playhead.className).not.toContain("transition");
  });

  it("keeps Learn/Recall explicit, provides accessible controls, and never gates Start on MIDI", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    expect(button(container, "開始").disabled).toBe(false);
    // P23-32 K4: the MIDI state row is gone (the top band shows the same thing once).
    expect(container.querySelector("[data-testid='voicing-loop-midi-status']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-transport-midi-row']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-beat-progress-fill']")).toBeNull();
    expect(container.querySelector("[data-keyboard-layout='wide-88']")).not.toBeNull();
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(88);
    expect(container.querySelector("[data-midi-note='9']")).not.toBeNull();
    expect(container.querySelector("[data-midi-note='96']")).not.toBeNull();
    expect(container.querySelector("[data-c-label='C1']")).not.toBeNull();
    expect(container.querySelector("[data-c-label='C8']")).not.toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-current-degree']")?.textContent).toBe("Ⅰmaj7");
    expect(container.querySelector("[data-testid='voicing-loop-next-degree']")?.textContent).toBe("Ⅱm7");
    // P23-20 L3: the role in the key colours the degree and keeps its badge.
    expect(container.querySelector("[data-testid='voicing-loop-current-degree-wrap']")?.getAttribute("data-fn")).toBe("T");
    expect(container.querySelector("[data-testid='voicing-loop-next-degree-wrap']")?.getAttribute("data-fn")).toBe("SD");
    expect(container.querySelector("[data-testid='voicing-loop-current-role']")?.textContent).toBe("Tトニック");
    expect(Array.from(container.querySelectorAll("[data-testid='voicing-loop-event-degree']")).map((node) => node.textContent)).toEqual(["Ⅰ", "Ⅱ"]);
    expect(container.querySelector("[data-testid='voicing-loop-position-metric']")?.textContent)
      .toContain("1 / 2");
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("Dm7");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .toContain("左手");
    // P23-20 L1: the hand panel is five slot cards; the chord tone sits in each used card.
    expect(container.querySelectorAll("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-degree").length)
      .toBeGreaterThan(0);
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
      .toContain("あと2拍");
    expect(container.querySelectorAll("[role='progressbar']")).toHaveLength(0);
    expect(container.textContent).not.toContain("コード 0%");
    expect(container.textContent).not.toContain("進行 0%");

    const recall = button(container, "思い出す（コード名のみ）");
    await act(async () => recall.click());
    expect(recall.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent ?? "").not.toContain("構成音");
    // …and no note is shown in the hand cards (recall hides the answer).
    expect(container.querySelectorAll("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-pitch")).toHaveLength(0);
    expect(container.querySelector("svg[role='img']")?.getAttribute("aria-label")).toContain("お手本0音");
  });

  it("P23-32 C4: the head shows the title and the facts, and the back button calls onBackToPicker once", async () => {
    const onBackToPicker = vi.fn();
    const candidate = { ...vaultCandidate(0), sourceReference: snapshot("basic-full").source.reference };
    const container = await renderView(new FakeTransport(), { "basic-full": snapshot("basic-full") }, "basic-full",
      false, { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn(), onBackToPicker }, [candidate]);
    const head = container.querySelector("[data-testid='voicing-loop-head']")!;
    expect(head.querySelector(".lv-vl-head-title")?.textContent).toBe("Progression 0");
    expect(head.querySelector(".lv-vl-head-facts")?.textContent).toBe("Cメジャー ・ 1 小節");
    const back = head.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-back']")!;
    expect(back.getAttribute("aria-label")).toBe("練習する進行へ戻る");
    expect(back.textContent).toContain("練習する進行");
    await act(async () => back.click());
    expect(onBackToPicker).toHaveBeenCalledTimes(1);
  });

  it("P23-32 C4: without a matching Vault candidate the head keeps the facts and draws no title", async () => {
    const onBackToPicker = vi.fn();
    const container = await renderView(new FakeTransport(), { "basic-full": snapshot("basic-full") }, "basic-full",
      false, { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn(), onBackToPicker }, []);
    const head = container.querySelector("[data-testid='voicing-loop-head']")!;
    expect(head.querySelector(".lv-vl-head-title")).toBeNull();
    expect(head.querySelector(".lv-vl-head-facts")?.textContent).toBe("Cメジャー ・ 1 小節");
    await act(async () => head.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-back']")!.click());
    expect(onBackToPicker).toHaveBeenCalledTimes(1);
  });

  it("P23-32 C4: without onBackToPicker the head draws no back button", async () => {
    const container = await renderView(new FakeTransport(), { "basic-full": snapshot("basic-full") }, "basic-full");
    expect(container.querySelector("[data-testid='voicing-loop-head']")).not.toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-back']")).toBeNull();
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
    expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent).toContain("Cmaj7");
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
    expect(container.querySelector("[data-testid='voicing-loop-current-degree']")?.textContent).toBe("Ⅰmaj7");
    expect(container.querySelector("[data-testid='voicing-loop-next-degree']")?.textContent).toBe("Ⅱm7");
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
    expect(primary.textContent).toContain("キー");
    expect(primary.textContent).toContain("オクターブ元");
    // P23-32 K3/K4: the bar is one row — no BPM field (the header's 共通 BPM), no MIDI status row, no MIDI 設定.
    expect(primary.textContent).not.toContain("BPM");
    expect(primary.textContent).toContain("お手本の音");
    expect(container.querySelector("[data-testid='voicing-loop-transport-midi-row']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-midi-status']")).toBeNull();
    expect(container.querySelector("#voicing-loop-bpm")).toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ上げる']")?.click());
    expect(primary.textContent).toContain("オクターブ+1");
    expect(container.querySelector("[data-midi-note='60']")?.getAttribute("data-visual-state")).toBe("guide");
    expect(container.querySelector("[data-midi-note='48']")?.getAttribute("data-visual-state")).toBe("idle");
    await act(async () => button(container, "現在のコードを試聴").click());
    expect(runtime.audition).toHaveBeenLastCalledWith([60, 67, 71], "piano");
    expect(source.events[0]?.voicing?.midiNotes).toEqual([48, 55, 59]);
  });

  it("plays at the app-wide BPM after the practice's own BPM field was removed (P23-32 K4)", async () => {
    const runtime = new FakeTransport();
    // P23-06: the practice starts at the app-wide BPM; the header's 共通 BPM is the only field now.
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 88 });
    expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-bpm-drag']")).toBeNull();
    await act(async () => button(container, "開始").click());
    expect(runtime.start.mock.calls[0]?.[0].bpm).toBe(88);
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
      "音の出どころ", "表示",
    ]);
    expect(["保存した音", "元MIDI", "カスタム", "自動生成"]
      .every((label) => Array.from(toolbar.querySelectorAll("button")).some((entry) => entry.getAttribute("aria-label") === label)))
      .toBe(true);
    expect(toolbar.textContent).toContain("Colorを加える");
    expect(toolbar.textContent).toContain("Open配置");
    // P23-20 L2: the two checks always show a short name; the full sentence is their accessible name.
    // P23-20 L2 + P23-32 T4: the two settings are switches that keep the short name and the full accessible name.
    expect(controlSwitch(toolbar, "進行に合わせて最適化").getAttribute("aria-label")).toBe("進行に合わせて最適化");
    expect(toolbar.textContent).not.toContain("SHELL TYPE");
    expect(button(container, "元MIDI").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='生成タイプ']")?.disabled).toBe(true);
    for (const label of ["Colorを加える", "Open配置"]) {
      expect(controlCheckbox(toolbar, label).disabled).toBe(true);
    }
    expect(controlSwitch(toolbar, "進行に合わせて最適化").disabled).toBe(true);

    await act(async () => button(container, "自動生成").click());
    expect(container.querySelector<HTMLButtonElement>("[aria-label='生成タイプ']")?.value).toBe("teacher");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='生成タイプ']")?.disabled).toBe(false);
    expect(controlCheckbox(toolbar, "Colorを加える").checked).toBe(false);
    expect(controlCheckbox(toolbar, "Open配置").checked).toBe(false);
    expect(controlSwitch(toolbar, "進行に合わせて最適化").getAttribute("aria-checked")).toBe("true");
    const explanation = container.querySelector("[data-testid='voicing-loop-current-explanation']")!;
    expect(explanation.textContent).toContain("Teacher Style");
    expect(explanation.textContent).toContain("候補");
    // P23-32 P4: the rule's internal names move into the i's accessible name, not the visible words.
    expect(explanation.textContent).not.toContain("P5.33-GEN");
    expect(explanation.querySelector(".lv-vl-rule-info")?.getAttribute("aria-label"))
      .toContain("ルール P5.33-GEN-TEACHER-MAJ7");
    expect(explanation.textContent).toContain("トップトップ候補");

    await act(async () => button(container, "カスタム").click());
    expect(container.querySelector<HTMLButtonElement>("[aria-label='生成タイプ']")?.disabled).toBe(true);
    expect(container.querySelector("[data-testid='voicing-loop-current-explanation']")).toBeNull();
  });

  it("hot-swaps lesson modifiers and OCT without stopping the running or paused clock", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    const toolbar = container.querySelector("[data-testid='voicing-loop-controls']")!;
    const checkbox = (label: string) => controlCheckbox(toolbar, label);
    const toggle = (label: string) => controlSwitch(toolbar, label);

    expect(checkbox("Colorを加える").checked).toBe(false);
    expect(checkbox("Open配置").checked).toBe(false);
    expect(toggle("進行に合わせて最適化").getAttribute("aria-checked")).toBe("true");

    await act(async () => button(container, "開始").click());
    runtime.stop.mockClear();
    runtime.pause.mockClear();
    runtime.updatePlan.mockClear();

    for (const label of ["Colorを加える", "Open配置"]) {
      await act(async () => checkbox(label).click());
      expect(button(container, "一時停止")).not.toBeNull();
    }
    await act(async () => toggle("進行に合わせて最適化").click());
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.updatePlan).toHaveBeenCalledTimes(3);

    const beforeOctave = runtime.options!.plan.events.map((entry) =>
      entry.status === "SUPPORTED" ? [...entry.voicing.midiNotes] : []);
    const octaveUp = container.querySelector<HTMLButtonElement>("[aria-label='1オクターブ上げる']")!;
    expect(octaveUp.disabled).toBe(false);
    await act(async () => octaveUp.click());
    expect(container.querySelector("[data-testid='voicing-loop-transport-primary']")?.textContent).toContain("オクターブ+1");
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
    await act(async () => runtime.options?.onTransportBeat(1.5, 1e6));
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
    expect(container.querySelector("[data-testid='voicing-loop-current-explanation']")?.textContent).toContain("候補");
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
    expect(navigation.textContent).toContain("候補 1/1");
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
    await selectStudy(container, "core");
    const next = container.querySelector("[data-testid='voicing-loop-next-voicing']")!;
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Eadd9/F♯");
    expect(usedCells(container, "voicing-loop-left-hand", "degree")).toEqual(["9"]);
    expect(usedCells(container, "voicing-loop-right-hand", "degree")).toEqual(["1", "3", "5"]);
    // P23-20 L1: the slot card carries the finger name alone.
    expect(usedCells(container, "voicing-loop-left-hand", "finger")).toContain("L5");
    expect(usedCells(container, "voicing-loop-right-hand", "finger")[0]).toBe("R1");
    expect(next.textContent).toContain("左手");
    expect(container.querySelector("[data-testid='voicing-loop-next-left-hand']")?.textContent)
      .toContain("左手");
    expect(container.querySelector("[data-testid='voicing-loop-next-right-hand']")?.textContent)
      .toContain("右手");
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
      "音の出どころ", "表示",
    ]);
    expect(["保存した音", "元MIDI", "カスタム", "自動生成"]
      .every((label) => Array.from(toolbar.querySelectorAll("button")).some((entry) => entry.getAttribute("aria-label") === label)))
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
    expect(button(container, "自動生成").getAttribute("aria-pressed")).toBe("true");
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

    await act(async () => runtime.options?.onTransportBeat(6.5, 1e6));
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
    // P23-32 K3: the reference sound is a switch with the visible name 「お手本の音」.
    const referenceSound = controlSwitch(container, "お手本の音");
    expect(referenceSound.getAttribute("aria-checked")).toBe("true");
    await act(async () => referenceSound.click());
    expect(referenceSound.getAttribute("aria-checked")).toBe("false");
    expect(runtime.setReferenceSoundEnabled).toHaveBeenCalledWith(false);

    await act(async () => button(container, "開始").click());
    expect(runtime.options?.referenceSoundEnabled).toBe(false);
    expect(runtime.options?.sound).toBe("piano");
    await act(async () => runtime.options?.onTransportBeat(6.5, 1e6));
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

  it("keeps the shared MIDI state out of the transport row (the top band owns it)", async () => {
    const original = defaultLiveMidiStore.getState();
    const intent = connectionController.state.getState().intent;
    connectionController.state.setState({ intent: "on" });
    defaultLiveMidiStore.setState({
      active: true,
      status: "connected",
      selected: { backendId: "keyboard", name: "Studio Keyboard", index: 0 },
    });
    try {
      const container = await renderView(
        new FakeTransport(),
        { "basic-full": snapshot("basic-full") },
        "basic-full",
      );
      // P23-32 K4: the band repeated the top band's 「MIDI 機器がありません」, so the state row and its
      // settings button are gone from this screen; the top band's MIDI button opens the same shared panel.
      expect(container.querySelector("[data-testid='voicing-loop-transport-midi-row']")).toBeNull();
      expect(container.querySelector("[data-testid='voicing-loop-midi-status']")).toBeNull();
      expect(container.querySelector("[data-testid='voicing-loop-current-next']")?.textContent)
        .not.toContain("MIDI");
    } finally {
      closeMidiPanel();
      connectionController.state.setState({ intent });
      await act(async () => defaultLiveMidiStore.setState({ active: original.active, status: original.status, selected: original.selected }));
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
    expect(button(container, "自動生成").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "元MIDI").disabled).toBe(true);

    await act(async () => button(container, "自動生成").click());
    expect(container.textContent).toContain("このコードにはこの生成タイプの形がありません。");
    expect(button(container, "開始").disabled).toBe(true);
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it("keeps missing Custom disabled without a persistent banner", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    await act(async () => button(container, "カスタム").click());
    expect(button(container, "カスタム").disabled).toBe(true);
    expect(button(container, "カスタム").title).toContain("カスタムのVoicingがありません");
    expect(container.querySelector("[data-testid='voicing-loop-source-info']")).toBeNull();
    expect(button(container, "元MIDI").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).not.toContain("練習する進行を選択してください");
  });

  it.each(["saved", "source-midi", "custom"] as const)("recovers stale unavailable %s and leaves 0/N disabled without a banner", async missing => {
    const empty = { ...snapshot("source-midi"), selection: missing, events: snapshot("source-midi").events.map(event => ({ ...event, voicing: undefined })) };
    const container = await renderView(new FakeTransport(), { [missing]: empty, "basic-full": snapshot("basic-full") }, missing);
    const label = missing === "saved" ? "保存した音" : missing === "source-midi" ? "元MIDI" : "カスタム";
    expect(button(container, label).disabled).toBe(true);
    expect(container.querySelector(`[data-testid='voicing-loop-${missing}-availability']`)?.textContent).toBe("0/2");
    expect(button(container, "自動生成").getAttribute("aria-pressed")).toBe("true");
    await act(async () => button(container, label).click());
    expect(container.querySelector("[data-testid='voicing-loop-source-info']")).toBeNull();
    expect(button(container, "自動生成").getAttribute("aria-pressed")).toBe("true");
  });

  it("disables absent Source MIDI without affecting a saved Custom progression", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { custom: snapshot("custom") }, "custom");
    expect(button(container, "元MIDI").getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector("[data-testid='voicing-loop-source-info']")).toBeNull();
    await act(async () => button(container, "元MIDI").click());
    expect(button(container, "元MIDI").disabled).toBe(true);
    expect(button(container, "元MIDI").title).toContain("元MIDIのVoicingがありません");
    expect(button(container, "カスタム").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-testid='voicing-loop-source-info']")).toBeNull();
    expect(button(container, "カスタム").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "開始").disabled).toBe(false);
    await act(async () => button(container, "開始").click());
    expect(runtime.start).toHaveBeenCalledOnce();
  });

  it("shows partial coverage and explicitly fills only missing cards", async () => {
    const runtime = new FakeTransport();
    const partial = snapshot("source-midi");
    delete (partial.events[1] as { voicing?: unknown }).voicing;
    const container = await renderView(runtime, {
      "source-midi": partial,
      "basic-full": snapshot("basic-full"),
    }, "basic-full");
    expect(button(container, "元MIDI").disabled).toBe(false);
    expect(container.querySelector("[data-testid='voicing-loop-source-midi-availability']")?.textContent).toContain("1/2");
    await act(async () => button(container, "元MIDI").click());
    expect(container.querySelectorAll("[data-testid='voicing-loop-auto-fallback']")).toHaveLength(1);
    expect(button(container, "開始").disabled).toBe(false);
    await act(async () => button(container, "開始").click());
    const started = runtime.start.mock.calls[0]![0].plan;
    expect(started.events[0]?.voicing?.midiNotes).toEqual(partial.events[0]?.voicing?.midiNotes);
    expect(started.events[1]).toMatchObject({ status: "SUPPORTED", fallbackFrom: "source-midi" });
  });

  it("keeps complete Source MIDI available without a partial-count warning", async () => {
    const container = await renderView(new FakeTransport(), {
      "source-midi": snapshot("source-midi"),
    }, "source-midi");
    expect(button(container, "元MIDI").disabled).toBe(false);
    expect(container.querySelector("[data-testid='voicing-loop-source-midi-availability']")).toBeNull();
  });

  it("requires every event to resolve before Start and lists every unresolved chord", async () => {
    const runtime = new FakeTransport();
    const partial = snapshot("source-midi");
    delete (partial.events[1] as { voicing?: unknown }).voicing;
    delete (partial.events[0] as { voicing?: unknown }).voicing;
    const container = await renderView(runtime, { "source-midi": partial }, "source-midi");
    expect(container.textContent).toContain("2個のコードを再生できません");
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
    // Both the legacy upper rule and the explicit substitute must fail here.
    const container = await renderView(runtime, { "left-hand": slash }, "left-hand", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [], { maxRightHandSpanSemitones: 0 });
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
    await act(async () => button(container, "思い出す").click());
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
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 96, extra: <BpmProbe /> });
    await act(async () => button(container, "開始").click());
    await act(async () => {
      button(container, "bpm-132").click();
      button(container, "メトロノーム").click();
    });
    expect(loadGlobalBpm()).toBe(132);
    expect(runtime.setBpm).toHaveBeenCalledWith(132);
    expect(runtime.setMetronomeEnabled).toHaveBeenCalledWith(false);
    expect(button(container, "メトロノーム").getAttribute("aria-label")).toContain("OFF");
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
    await act(async () => sync(6.5, 1e6));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");

    await act(async () => button(container, "最初から").click());
    await act(async () => sync(6.75, 1e6));
    expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
  });

  it("returns the playhead to the start position when stopped (VL-07)", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full");
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(6, 1e6));
    const playhead = container.querySelector<HTMLElement>("[data-testid='voicing-loop-playhead']")!;
    expect(playhead.style.transform).toBe("translateX(480px)");
    await act(async () => button(container, "停止").click());
    expect(playhead.style.transform).toBe("translateX(0px)");
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
    // P23-32 K5: the stopped state reads 「停止中」.
    expect(container.textContent).toContain("停止中");
  });

  it("applies BPM to the latest synchronized transport position", async () => {
    const runtime = new FakeTransport();
    // P23-06 / P23-32 K4: the app-wide BPM (the header's field) is the one the practice follows.
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 80, extra: <BpmProbe value={120} /> });
    await act(async () => button(container, "開始").click());
    await act(async () => {
      runtime.options?.onTransportBeat(6.5, 1e6);
      button(container, "bpm-120").click();
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

      await act(async () => sync(5, 1e6));
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
      await act(async () => sync(6.5, 1e6));
      expect(container.querySelector("[aria-current='step']")?.textContent).toContain("Dm7");
      expect(container.textContent).not.toMatch(/正解|不正解|スコア|accuracy|streak|mastery/i);

      await act(async () => {
        defaultLiveMidiStore.setState({
          notes: { held: new Map(), sustained: new Set(), pedalByChannel: new Map() },
        });
      });
      await act(async () => sync(8, 1e6));
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

    await act(async () => button(container, "カスタム").click());
    expect(runtime.stop.mock.calls.length).toBeGreaterThan(stopsBeforeSwitch);
    await act(async () => staleSync(8, 1e6));
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
      .toContain("A3");
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

    expect(usedCells(container, "voicing-loop-left-hand", "finger")).toContain("L5");
    expect(usedCells(container, "voicing-loop-right-hand", "finger")).toEqual(["R1", "R5"]);
    expect(container.querySelector("[data-finger-label='L5']")).not.toBeNull();
    expect(container.querySelector("[data-finger-label='R1']")).not.toBeNull();

    for (const label of ["カスタム", "自動生成"]) {
      await act(async () => button(container, label).click());
      expect(container.querySelectorAll("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-finger").length).toBeGreaterThan(0);
    }
    expect(usedCells(container, "voicing-loop-left-hand", "finger")[0]).toBe("L5");
    expect(usedCells(container, "voicing-loop-right-hand", "finger")[0]).toBe("R1");
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
    expect(usedCells(container, "voicing-loop-right-hand", "finger")).toEqual(["R2", "R5"]);
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent).toContain("自分の運指");
    expect(window.localStorage.getItem("loop-vault:voicing-loop-fingering-preferences:v1"))
      .toContain("R:55,59");

    await act(async () => button(container, "運指を編集").click());
    await act(async () => button(document.body, "おすすめに戻す").click());
    expect(usedCells(container, "voicing-loop-right-hand", "finger")).toEqual(["R1", "R5"]);
    expect(container.querySelector("[data-testid='voicing-loop-right-hand']")?.textContent).toContain("おすすめ");
    await act(async () => button(document.body, "キャンセル").click());

    const toggle = controlSwitch(container, "おすすめ運指を表示");
    await act(async () => toggle.click());
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing']")?.textContent)
      .not.toContain("FINGER");
    // P23-20 L1: with the fingering hidden the notes stay (the finger names go away).
    expect(container.querySelectorAll("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-pitch").length)
      .toBeGreaterThan(0);
    expect(container.querySelector("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-finger")?.textContent)
      .toBe("");
    // P23-20 L1: the chord tone is in each used slot card.
    expect(container.querySelectorAll("[data-testid='voicing-loop-current-voicing'] .voicing-hand-slot-degree").length)
      .toBeGreaterThan(0);
    expect(container.querySelector("[data-finger-label]")).toBeNull();
  });
  it("restores the previous usable source without changing the Vault snapshot", async () => {
    const values = { "source-midi": snapshot("source-midi"), custom: snapshot("custom"), "basic-full": snapshot("basic-full") };
    const before = JSON.stringify(values);
    const container = await renderView(new FakeTransport(), values, "source-midi");
    await act(async () => button(container, "カスタム").click());
    await act(async () => root?.unmount()); root = undefined;
    const reopened = await renderView(new FakeTransport(), values, "source-midi");
    expect(button(reopened, "カスタム").getAttribute("aria-pressed")).toBe("true");
    expect(JSON.stringify(values)).toBe(before);
  });

  it("retains every legacy generated family as an explicit detailed choice", async () => {
    const values = Object.fromEntries(["basic-full", "basic-shell", "rootless-shell", "full-shell", "left-hand"].map(mode => [mode, snapshot(mode as ProgressionVoicingSelection)]));
    const runtime = new FakeTransport();
    const container = await renderView(runtime, values, "basic-full");
    const chooser = container.querySelector<HTMLSelectElement>("[aria-label='既存の形']")!;
    expect(Array.from(chooser.options, option => option.value)).toEqual(["basic-full", "basic-shell", "rootless-shell", "full-shell", "left-hand"]);
    await act(async () => { chooser.value = "rootless-shell"; chooser.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.plan.selection).toBe("rootless-shell");
    expect(runtime.options?.plan.events.every(event => event.status === "SUPPORTED")).toBe(true);
  });

  it("selects A/B by context menu, preserves the old range while A is pending, and keeps outside clicks selection-only", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    const rightClick = async (index: number, shiftKey = false) => act(async () => {
      cards[index]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey }));
    });
    await rightClick(0);
    expect(cards[0]!.dataset.range).toBe("pending-a");
    await rightClick(1);
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")?.textContent).toContain("1〜2");
    expect(cards[0]!.dataset.range).toBe("a");
    expect(cards[1]!.dataset.range).toBe("b");
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.loopBounds).toEqual({ startBeat: 0, endBeat: 4 });
    // P23-66: right-clicking inside the active range clears it.
    await rightClick(1);
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")).toBeNull();
    expect(cards[0]!.dataset.range).toBe("none");
    expect(cards[1]!.dataset.range).toBe("none");
    expect(runtime.setLoopBounds).toHaveBeenCalledWith(undefined);
    await rightClick(1, true);
    expect(runtime.setLoopBounds).toHaveBeenCalledWith({ startBeat: 2, endBeat: 4 });
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")?.textContent).toContain("2〜2");
    // P23-66: amber band above the cards and amber bottom marker without cyan fill/ring on non-current range cards.
    const rangeBand = container.querySelector<HTMLElement>("[data-testid='voicing-loop-range-band']");
    expect(rangeBand).not.toBeNull();
    expect(Number.parseFloat(rangeBand!.style.width)).toBeGreaterThan(0);
    expect(rangeBand!.className).toContain("bg-[var(--lv-vl-range)]");
    expect(cards[1]!.dataset.range).toBe("a-b");
    expect(cards[1]!.className).not.toContain("ring-2");
    const beforeSeek = runtime.seek.mock.calls.length;
    await act(async () => cards[0]!.click());
    expect(runtime.seek).toHaveBeenCalledTimes(beforeSeek);
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Cmaj7");
    await act(async () => runtime.activateRange());
    expect(container.querySelector("[data-testid='voicing-loop-position-metric']")?.textContent).toContain("2 / 2");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-range-chip']")!.click());
    expect(runtime.setLoopBounds).toHaveBeenLastCalledWith(undefined);
    // P23-20 L5: × on the chip clears the colour with the loop.
    expect(container.querySelector("[data-testid='voicing-loop-range-band']")).toBeNull();
    expect(cards[1]!.dataset.range).toBe("none");
  });

  it("uses Shift+F10/Menu for the same range action and supports one-card selection", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    await act(async () => cards[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true })));
    expect(cards[1]!.dataset.range).toBe("pending-a");
    await act(async () => cards[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true })));
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")?.textContent).toContain("2〜2");
  });

  it("dismisses native details on Source/type changes, outside pointer and Escape without stopping transport", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full"), "source-midi": snapshot("source-midi") }, "basic-full");
    const details = container.querySelector<HTMLDetailsElement>("[data-testid='voicing-loop-generated-details']")!;
    details.open = true;
    await act(async () => button(container, "元MIDI").click());
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => button(container, "自動生成").click());
    details.open = true;
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(details.open).toBe(false);
    details.open = true;
    await act(async () => details.querySelector("select")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(details.open).toBe(true);
    const stops = runtime.stop.mock.calls.length;
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => details.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(details.open).toBe(false);
    expect(runtime.stop).toHaveBeenCalledTimes(stops);
    expect(document.activeElement).toBe(details.querySelector("summary"));
    await act(async () => button(container, "自動生成").click());
    for (const value of ["core", "teacher"] as const) {
      details.open = true;
      await selectStudy(container, value);
      expect(details.open).toBe(false);
    }
  });

  it("movement follows the resolved current/next pitches and updates after Source, generated type and card changes", async () => {
    const source = snapshot("source-midi");
    const container = await renderView(new SeekingTransport(), { "source-midi": source, "basic-full": snapshot("basic-full") }, "source-midi");
    const hints = () => Array.from(container.querySelectorAll("[data-testid='voicing-loop-finger-slot']"), node => node.getAttribute("title")).join(";");
    const original = hints();
    for (const pitch of ["C4", "G4", "B4", "D4", "A4", "C5"]) expect(original).toContain(pitch);
    await act(async () => button(container, "自動生成").click());
    const generated = hints();
    expect(generated).not.toBe(original);
    await selectStudy(container, "core");
    expect(hints()).not.toBe(generated);
    await act(async () => button(container, "元MIDI").click());
    expect(hints()).toBe(original);
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    await act(async () => cards[1]!.click());
    expect(hints()).not.toBe(original);
    expect(container.querySelector("[data-testid='voicing-loop-next-move']")?.textContent).toContain("ループ先");
    expect(JSON.stringify(source)).toBe(JSON.stringify(snapshot("source-midi")));
  });

  it("current panel restores compact Next Move, preserving hand facts and generated explanation", async () => {
    const container = await renderView(new SeekingTransport(), { "basic-full": snapshot("basic-full") }, "basic-full");
    const panel = container.querySelector("[data-testid='voicing-loop-current-panel']")!;
    expect(panel.querySelectorAll("[data-testid='voicing-loop-finger-slot']")).toHaveLength(10);
    expect(panel.textContent).toContain("次への動き");
    for (const hand of ["left", "right"]) {
      const card = panel.querySelector(`[data-testid='voicing-loop-${hand}-hand']`)!;
      expect(card).not.toBeNull();
      // P23-20 L1: five fixed slot cards, each with its finger; the used ones carry the note and the tone.
      expect(card.querySelectorAll("[data-testid='voicing-loop-hand-slot']")).toHaveLength(5);
      expect(card.textContent).toContain("おすすめ");
      expect(card.querySelectorAll(".voicing-hand-slot-finger").length).toBe(5);
      expect(card.querySelectorAll(".voicing-hand-slot-pitch").length).toBeGreaterThan(0);
      expect(card.querySelectorAll(".voicing-hand-slot-degree").length).toBeGreaterThan(0);
    }
    const info = panel.querySelector("[data-testid='voicing-loop-current-explanation']")!;
    for (const label of ["Teacher Style", "Literal", "候補", "省略", "トップ"]) expect(info.textContent).toContain(label);
    // P23-32 P4: 「ルール …」 is no longer visible; the i carries it as its accessible name.
    expect(info.textContent).not.toContain("ルール");
    expect(info.querySelector(".lv-vl-rule-info")?.getAttribute("aria-label")).toContain("ルール P5.33");
    expect(button(container, "運指を編集").disabled).toBe(false);
  });

  it.each(["none", "both", "one"] as const)("Space shares transport start/pause/resume/stop commands for %s range", async mode => {
    const runtime = new SeekingTransport();
    const value = snapshot("source-midi");
    const original = JSON.stringify(value);
    const container = await renderView(runtime, { "source-midi": value }, "source-midi");
    const viewport = container.querySelector<HTMLElement>("[data-testid='voicing-loop-timeline-viewport']")!;
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    if (mode !== "none") {
      await contextRange(cards[mode === "both" ? 0 : 1]!);
      if (mode === "both") await contextRange(cards[1]!);
      else await contextRange(cards[1]!);
    } else viewport.focus();
    const space = async () => act(async () => {
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      viewport.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
    await space();
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(runtime.options?.startBeat).toBe(mode === "one" ? 2 : 0);
    expect(runtime.options?.loopBounds).toEqual(mode === "none" ? undefined
      : { startBeat: mode === "one" ? 2 : 0, endBeat: 4 });
    expect(runtime.options?.countInBars).toBe(1);
    await act(async () => runtime.options?.onTransportBeat(4.5, 1e6));
    await space();
    expect(runtime.pause).toHaveBeenCalledOnce();
    await space();
    expect(runtime.resume).toHaveBeenCalledOnce();
    expect(runtime.start).toHaveBeenCalledOnce();
    await act(async () => button(container, "停止").click());
    await space();
    expect(runtime.start).toHaveBeenCalledTimes(2);
    expect(runtime.options?.startBeat).toBe(mode === "one" ? 2 : 0);
    expect(JSON.stringify(value)).toBe(original);
  });

  it("range contextmenu releases card focus, but unrelated native buttons and input Space remain untouched", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    cards[0]!.scrollIntoView = vi.fn();
    cards[0]!.focus();
    await contextRange(cards[0]!);
    await contextRange(cards[1]!);
    const viewport = container.querySelector<HTMLElement>("[data-testid='voicing-loop-timeline-viewport']")!;
    expect(document.activeElement).toBe(viewport);
    for (const target of [button(container, "元MIDI"), container.querySelector<HTMLSelectElement>("#voicing-loop-count-in")!, cards[0]!]) {
      target.focus();
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      await act(async () => target.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(runtime.start).not.toHaveBeenCalled();
    }
    viewport.focus();
    await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
    expect(runtime.start).toHaveBeenCalledOnce();
  });

  it("the range's × clears pending/active/highlights and returns to full playback with reset count", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    // P23-32 L1/K4: the × beside 「ここから n」 appears only while a start is pending (the bar's 区間解除 is gone).
    expect(container.querySelector("[data-testid='voicing-loop-range-clear']")).toBeNull();
    await contextRange(cards[1]!);
    const clear = container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-range-clear']")!;
    expect(clear).not.toBeNull();
    await act(async () => clear.click());
    expect(container.querySelector("[data-testid='voicing-loop-range-clear']")).toBeNull();
    expect(cards[1]!.dataset.range).toBe("none");
    await contextRange(cards[0]!, true);
    await act(async () => button(container, "開始").click());
    await act(async () => runtime.options?.onTransportBeat(8, 1e6));
    expect(container.textContent).toContain("2 周完了");
    await contextRange(cards[1]!);
    expect(cards[0]!.dataset.range).toBe("a-b");
    // An active range is cleared by the chip's own ×.
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-range-chip']")!.click());
    expect(runtime.setLoopBounds).toHaveBeenLastCalledWith(undefined);
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-range-pending']")).toBeNull();
    expect(cards[0]!.dataset.range).toBe("none");
    await act(async () => runtime.activateRange());
    expect(container.textContent).not.toContain("2 周完了");
    await act(async () => button(container, "停止").click());
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.loopBounds).toBeUndefined();
    expect(runtime.options?.startBeat).toBe(0);
  });

  it("overview/ruler pointer snaps to cards including scroll, preserves old pending range and keeps left seek independent", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const overview = container.querySelector<HTMLElement>("[data-testid='voicing-loop-overview']")!;
    const ruler = container.querySelector<HTMLElement>("[data-testid='voicing-loop-ruler']")!;
    const viewport = container.querySelector<HTMLElement>("[data-testid='voicing-loop-timeline-viewport']")!;
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    overview.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect;
    viewport.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
    const ppb = parseFloat(cards[0]!.style.width) / 2;
    viewport.scrollLeft = 2 * ppb;
    await contextRange(ruler, false, 100 + ppb / 2);
    expect(cards[1]!.dataset.range).toBe("pending-a");
    await contextRange(overview, false, 150);
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")?.textContent).toContain("1〜2");
    await contextRange(overview, true, 450);
    expect(container.querySelector("[data-testid='voicing-loop-range-chip']")?.textContent).toContain("2〜2");
    await contextRange(overview, false, 100);
    expect(cards[0]!.dataset.range).toBe("pending-a");
    expect(cards[1]!.dataset.range).toBe("a-b");
    await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(cards[1]!.dataset.range).toBe("a-b");
    expect(cards[0]!.dataset.range).toBe("outside");
    // P23-32 L1/K4: the active range's chip clears both the range and the pending start.
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-range-chip']")!.click());
    await act(async () => button(container, "開始").click());
    await act(async () => ruler.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100 + ppb / 2 })));
    expect(runtime.seek).toHaveBeenLastCalledWith(1);
  });

  it("v2 card click seeks, preview stays separate, and keyboard moves by chord", async () => {
    const runtime = new SeekingTransport();
    const container = await renderView(runtime, { "source-midi": snapshot("source-midi") }, "source-midi");
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
    const previews = container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event-preview']");
    await act(async () => previews[1]!.click());
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(runtime.seek).not.toHaveBeenCalled();
    const afterPreview = runtime.audition.mock.calls.length;
    await act(async () => cards[1]!.click());
    expect(runtime.audition.mock.calls.length).toBe(afterPreview + 1);
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Dm7");
    await act(async () => button(container, "開始").click());
    expect(runtime.options?.startBeat).toBe(2);
    const beforePlayingSeek = runtime.audition.mock.calls.length;
    await act(async () => cards[0]!.click());
    expect(runtime.audition.mock.calls.length).toBe(beforePlayingSeek);
    expect(runtime.seek).toHaveBeenLastCalledWith(0);
    expect(container.querySelector("[data-testid='voicing-loop-current-next'] h2")?.textContent).toBe("Cmaj7");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(runtime.seek).toHaveBeenLastCalledWith(1);
    expect(previews[1]!.disabled).toBe(true);
    await act(async () => button(container, "一時停止").click());
    const beforePausedSeek = runtime.audition.mock.calls.length;
    await act(async () => cards[1]!.click());
    expect(runtime.seek).toHaveBeenLastCalledWith(1);
    expect(runtime.audition.mock.calls.length).toBe(beforePausedSeek + 1);
    expect(runtime.audition).toHaveBeenLastCalledWith([50, 57, 60], "piano");
    expect(button(container, "再開").disabled).toBe(false);
  });
});

describe("P11 generated substitute and fingering acceptance", () => {
  it.each([1, 2, 3, 4])("renders internal recommended note/finger mapping for %i-note public hand fixtures", async count => {
    const base = snapshot("source-midi");
    const pitches = [43, 47, 50, 53].slice(0, count);
    const value = { ...base, events: base.events.map(event => ({ ...event, voicing: { kind: "source-midi" as const, midiNotes: pitches } })) };
    const plan = resolveProgressionPracticeVoicings(value);
    const hands = assignPracticeHandsAcrossProgression("source-midi", plan.events.map(e => e.status === "SUPPORTED" ? e.voicing : undefined));
    const container = await renderView(new FakeTransport(), { "source-midi": value }, "source-midi");
    for (const hand of ["left", "right"] as const) {
      const targets = hands[0]![hand];
      const card = container.querySelector(`[data-testid="voicing-loop-${hand}-hand"]`);
      // P5.26.2-02: a hand without notes is still a panel (five empty slots), so the layout never depends on the chord.
      if (!targets.length) { expect(card).not.toBeNull(); expect(usedCells(container, `voicing-loop-${hand}-hand`, "pitch")).toEqual([]); continue; }
      const internal = rankCyclicFingerings(value.events.map(event => ({ id: event.id, hand, midiPitches: targets, chord: event.chord, family: "source-midi" })))[0]!;
      expect(internal.status).toBe("supported"); if (internal.status !== "supported") continue;
      const expected = internal.fingers.map(f => `${hand === "left" ? "L" : "R"}${f}`);
      expect([...usedCells(container, `voicing-loop-${hand}-hand`, "finger")].sort()).toEqual([...expected].sort());
      expect(new Set(internal.fingers).size).toBe(targets.length);
    }
  });

  it.each(["teacher", "core"] as const)("shows the selected %s substitute on only unsupported detailed cards", async study => {
    const base = snapshot("basic-full");
    const chords = ["Ebmaj7", "Cm7", "Ebadd9/G", "Ebadd9/G"].map(label => ({ ...base.events[0]!.chord, ...parseChordLabel(label)! }));
    const snapshots = Object.fromEntries(["basic-full", "basic-shell", "rootless-shell", "full-shell", "left-hand"].map(selection => [selection, {
      ...base, selection, fingerprint: `public-${selection}`, lengthBeats: 16,
      events: chords.map((chord, index) => ({ id: `public-${index}`, chord, startBeat: index * 4, durationBeats: 4 })),
      spans: chords.map((_, index) => ({ kind: "chord", eventIndex: index, startBeat: index * 4, durationBeats: 4 })),
    }])) as Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>>;
    const container = await renderView(new SeekingTransport(), snapshots, "basic-full");
    await selectStudy(container, study);
    const shape = container.querySelector<HTMLSelectElement>('[aria-label="既存の形"]')!;
    for (const value of ["basic-shell", "full-shell", "rootless-shell", "left-hand"]) {
      await act(async () => { shape.value = value; shape.dispatchEvent(new Event("change", { bubbles: true })); });
      const markers = container.querySelectorAll('[data-testid="voicing-loop-auto-fallback"]');
      expect(markers).toHaveLength(2);
      const label = study === "teacher" ? "基本" : "骨組み";
      expect(markers[0]?.getAttribute("title")).toBe(`この形では作れないため「${label}」で鳴らしています`);
      expect(container.querySelector('[data-testid="voicing-loop-shape-fallback-summary"]')?.textContent).toContain(`2コードは${label}で代替`);
      expect(container.textContent).not.toContain("個のコードを再生できません");
    }
  });
});

describe("P23-06 the app-wide BPM", () => {
  /** Changes the app-wide BPM from outside the practice screen, as the header does. */
  function HeaderProbe() {
    const { setBpm, songBpm } = useGlobalBpm();
    return <button type="button" data-song-bpm={songBpm ?? ""} onClick={() => setBpm(132)}>header-132</button>;
  }
  const songBpm = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-song-bpm]")!.dataset.songBpm;

  it("plays at the app-wide BPM, not the progression's", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 96 });
    expect(snapshot("basic-full").bpm).toBe(80);
    await act(async () => button(container, "開始").click());
    expect(runtime.start.mock.calls[0]?.[0].bpm).toBe(96);
  });

  it("has no BPM field of its own; the header's field is the one that writes the app-wide BPM", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 96, extra: <BpmProbe value={104} /> });
    expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
    await act(async () => button(container, "bpm-104").click());
    expect(loadGlobalBpm()).toBe(104);
    expect(runtime.setBpm).toHaveBeenCalledWith(104);
  });

  it("a change from outside (the header) reaches the transport without stopping the playback", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, undefined, [], undefined, { globalBpm: 96, extra: <HeaderProbe /> });
    await act(async () => button(container, "開始").click());
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(runtime.start.mock.calls[0]?.[0].bpm).toBe(96);
    const stops = runtime.stop.mock.calls.length;
    await act(async () => button(container, "header-132").click());
    expect(runtime.setBpm).toHaveBeenCalledWith(132);
    expect(runtime.stop.mock.calls.length).toBe(stops);
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(button(container, "一時停止")).toBeTruthy();
  });

  it("changing the voicing source keeps the app-wide BPM", async () => {
    const runtime = new FakeTransport();
    const container = await renderView(runtime, {
      "source-midi": snapshot("source-midi"),
      "basic-full": snapshot("basic-full"),
    }, "source-midi", false, undefined, [], undefined, { globalBpm: 96 });
    expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
    await act(async () => button(container, "自動生成").click());
    expect(button(container, "自動生成").getAttribute("aria-pressed")).toBe("true");
    await act(async () => button(container, "元MIDI").click());
    await act(async () => button(container, "開始").click());
    expect(runtime.start.mock.calls[0]?.[0].bpm).toBe(96);
  });

  it("announces a saved BPM as the song's BPM, never a stand-in", async () => {
    const loaded = { ...snapshot("source-midi"), bpm: 96 };
    const candidateOf = (tempoOrigin: "SAVED_BPM" | "SMF_DEFAULT" | "PRACTICE_INITIAL") => ({
      ...vaultCandidate(0), sourceReference: loaded.source.reference, bpm: 96, tempoOrigin,
    });
    for (const [origin, expected] of [["SAVED_BPM", "96"], ["SMF_DEFAULT", ""], ["PRACTICE_INITIAL", ""]] as const) {
      const container = await renderView(new FakeTransport(), { "source-midi": loaded }, "source-midi", false,
        { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [candidateOf(origin)], undefined,
        { globalBpm: 120, extra: <HeaderProbe /> });
      expect(songBpm(container), origin).toBe(expected);
      expect(container.querySelector("#voicing-loop-bpm"), origin).toBeNull();
      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();
    }
  });

  it("the picker announces no song BPM", async () => {
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() },
      [{ ...vaultCandidate(0), bpm: 96, tempoOrigin: "SAVED_BPM" as const }], undefined,
      { globalBpm: 120, extra: <HeaderProbe /> });
    expect(container.querySelector("[data-testid='voicing-loop-progression-row']")).not.toBeNull();
    expect(songBpm(container)).toBe("");
  });

  it("shows no tempo-origin mark (V3)", async () => {
    const loaded = snapshot("source-midi");
    for (const tempoOrigin of ["SMF_DEFAULT", "PRACTICE_INITIAL"] as const) {
      const container = await renderView(new FakeTransport(), { "source-midi": loaded }, "source-midi", false,
        { onSelectProgression: vi.fn(), onEnterText: vi.fn() },
        [{ ...vaultCandidate(0), sourceReference: loaded.source.reference, bpm: 120, tempoOrigin }], undefined,
        { globalBpm: 120 });
      expect(container.querySelector("#voicing-loop-bpm")).toBeNull();
      expect(container.querySelector("[data-testid='voicing-loop-tempo-origin']"), tempoOrigin).toBeNull();
      expect(container.textContent).not.toContain(tempoOrigin === "SMF_DEFAULT" ? "SMF既定" : "練習初期値");
      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();
    }
  });

  it("explains a provisional tempo in the picker as a stand-in (V4)", async () => {
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(), onEnterText: vi.fn() },
      [{ ...vaultCandidate(0), bpm: 120, tempoOrigin: "SMF_DEFAULT" as const },
        { ...vaultCandidate(1), bpm: 120, tempoOrigin: "PRACTICE_INITIAL" as const }],
      undefined, { globalBpm: 100 });
    const titleOf = (origin: string) => container.querySelector(`[data-tempo-origin='${origin}']`)?.getAttribute("title");
    expect(titleOf("SMF_DEFAULT")).toBe("MIDIにテンポが無いため、仮の 120 BPM です");
    expect(titleOf("PRACTICE_INITIAL")).toBe("BPMが保存されていないため、仮の 120 BPM です");
  });
  it("P23-29 C2: the first press picks, the picked row starts, and the star never starts", async () => {
    const runtime = new FakeTransport();
    const candidates = [vaultCandidate(0), vaultCandidate(1), vaultCandidate(2)];
    const onSelectProgression = vi.fn(() => true);
    const container = await renderView(runtime, undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn(), onToggleFavorite: vi.fn(() => true) }, candidates);
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progression-row']"));
    const referenceOf = (row: HTMLElement) => candidates.find((candidate) => row.textContent?.includes(candidate.title))!.sourceReference;

    // L8: the first playable row is picked when the picker opens — exactly one.
    expect(rows().filter((row) => row.getAttribute("data-selected") === "true")).toHaveLength(1);
    const pick = (row: HTMLElement) => act(async () => row.click());
    const selected = () => rows().find((row) => row.getAttribute("data-selected") === "true")!;

    // L6: pressing a row that is not picked only picks it.
    const other = rows().find((row) => row !== selected())!;
    await pick(other);
    expect(onSelectProgression).not.toHaveBeenCalled();
    expect(other.getAttribute("data-selected")).toBe("true");
    expect(rows().filter((row) => row.getAttribute("data-selected") === "true")).toHaveLength(1);

    // L6b: pressing the picked row starts it.
    const second = referenceOf(other);
    await pick(other);
    expect(onSelectProgression).toHaveBeenCalledTimes(1);
    expect(onSelectProgression).toHaveBeenLastCalledWith(second);

    // L6: the star never starts the practice.
    await act(async () => other.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-favorite']")!.click());
    expect(onSelectProgression).toHaveBeenCalledTimes(1);

    // L6b: a search that hides the picked row picks the first playable row of what is left.
    const search = container.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
    const target = rows().find((row) => row !== other)!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(search, target.textContent?.match(/Progression \d/)?.[0] ?? "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.getAttribute("data-selected")).toBe("true");
  });
  it("P23-29 C2: Enter, the right column's button and a list where nothing can be practiced", async () => {
    const onSelectProgression = vi.fn(() => true);
    const candidates = [vaultCandidate(0), vaultCandidate(1)];
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn() }, candidates);
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progression-row']"));
    const selected = () => rows().find((row) => row.getAttribute("data-selected") === "true");
    const referenceOf = (row: HTMLElement) => candidates
      .find((candidate) => row.textContent?.includes(candidate.title))!.sourceReference;

    // L8/L6b: the list's first playable row is picked at open, and pressing it (the pick is already made) starts it.
    const top = selected()!;
    expect(top).toBe(rows()[0]);
    await act(async () => top.click());
    expect(onSelectProgression).toHaveBeenCalledTimes(1);
    expect(onSelectProgression).toHaveBeenLastCalledWith(referenceOf(top));

    // A different row is picked by its first press only …
    const other = rows()[1]!;
    await act(async () => other.click());
    expect(onSelectProgression).toHaveBeenCalledTimes(1);
    expect(selected()).toBe(other);
    // … then Enter (with no control focused) starts the picked row.
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { document.body.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(true);
    expect(onSelectProgression).toHaveBeenCalledTimes(2);
    expect(onSelectProgression).toHaveBeenLastCalledWith(referenceOf(other));
    // The right column's main button starts the same picked row.
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-preview-practice']")!.click());
    expect(onSelectProgression).toHaveBeenCalledTimes(3);
    expect(onSelectProgression).toHaveBeenLastCalledWith(referenceOf(other));

    // L6b: a list with nothing playable has no picked row, and Enter starts nothing.
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    const nothing = vi.fn(() => true);
    const blocked = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: nothing, onEnterText: vi.fn() },
      [{ ...vaultCandidate(0), unavailableReason: "practice-capacity" as const }]);
    expect(blocked.querySelectorAll("[data-testid='voicing-loop-progression-row']")).toHaveLength(1);
    expect(blocked.querySelector("[data-testid='voicing-loop-progression-row'][data-selected='true']")).toBeNull();
    expect(blocked.querySelector("[data-testid='voicing-loop-preview-empty']")?.textContent).toBe("進行を選んでください");
    const enterNothing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { document.body.dispatchEvent(enterNothing); });
    expect(nothing).not.toHaveBeenCalled();
  });
  it("P23-29 C4: the 続きから band only appears while that progression can still be practiced", async () => {
    const record = new Date().toISOString();
    window.localStorage.setItem("loop-vault:voicing-loop-last:v1",
      JSON.stringify({ version: 1, reference: { ideaId: "idea-1", blockId: "block-1" }, at: record }));
    try {
      const shown = await renderView(new FakeTransport(), undefined, "source-midi", false,
        { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [vaultCandidate(0), vaultCandidate(1)]);
      const band = shown.querySelector("[data-testid='voicing-loop-resume']");
      expect(band?.textContent).toContain("続きから");
      expect(band?.textContent).toContain("Progression 1");
      // L8: the 続きから progression is the one picked at open.
      expect(shown.querySelector("[data-testid='voicing-loop-progression-row'][data-selected='true']")?.textContent)
        .toContain("Progression 1");
      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();

      // The progression is gone from the Vault.
      const missing = await renderView(new FakeTransport(), undefined, "source-midi", false,
        { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [vaultCandidate(0)]);
      expect(missing.querySelector("[data-testid='voicing-loop-resume']")).toBeNull();
      await act(async () => root?.unmount());
      root = undefined;
      document.body.replaceChildren();

      // It is still there but cannot be practiced any more.
      const unavailable = await renderView(new FakeTransport(), undefined, "source-midi", false,
        { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() },
        [vaultCandidate(0), { ...vaultCandidate(1), unavailableReason: "resource-budget" as const }]);
      expect(unavailable.querySelector("[data-testid='voicing-loop-resume']")).toBeNull();
    } finally {
      window.localStorage.removeItem("loop-vault:voicing-loop-last:v1");
    }
  });
  it("P23-31 C9: the picker's degrees and role colours follow the key and the 「度数を表示」 setting", async () => {
    const candidate = {
      ...vaultCandidate(0), chordDegrees: ["Ⅰmaj7", "Ⅴ7"], chordRoles: ["T", "D"],
      chordCount: 2, savedVoiceCount: 0, hasSourceMidi: true, block: savedBlock(),
    };
    const shown = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [candidate], undefined, { globalBpm: 120 });
    const rowChips = () => Array.from(shown.querySelectorAll<HTMLElement>(".lv-vl-row-chord"));
    expect(rowChips().map((chip) => chip.dataset.fn)).toEqual(["T", "D"]);
    expect(rowChips().map((chip) => chip.querySelector("small")?.textContent)).toEqual(["Ⅰmaj7", "Ⅴ7"]);
    const boxChips = () => Array.from(shown.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-preview-chord']"));
    expect(boxChips().map((chip) => chip.dataset.fn)).toEqual(["T", "D"]);
    expect(boxChips().map((chip) => chip.querySelector("small")?.textContent)).toEqual(["Ⅰmaj7", "Ⅴ7"]);
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    // The setting off: the degrees go, the role colours stay.
    const hidden = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [candidate], undefined,
      { globalBpm: 120, showDegrees: false });
    const hiddenRows = Array.from(hidden.querySelectorAll<HTMLElement>(".lv-vl-row-chord"));
    expect(hiddenRows.map((chip) => chip.dataset.fn)).toEqual(["T", "D"]);
    expect(hiddenRows.filter((chip) => chip.querySelector("small"))).toHaveLength(0);
    const hiddenBoxes = Array.from(hidden.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-preview-chord']"));
    expect(hiddenBoxes.map((chip) => chip.dataset.fn)).toEqual(["T", "D"]);
    expect(hiddenBoxes.every((chip) => (chip.querySelector("small")?.textContent ?? "").trim() === "")).toBe(true);
  });

  it("P23-29 C3: the right column counts the saved voicings and draws no degree without a key", async () => {
    const candidate = {
      ...vaultCandidate(0),
      chordLabels: ["Cmaj7", "Dm7"],
      chordCount: 8,
      savedVoiceCount: 3,
      // No key → no degrees; the chords keep their names.
      chordDegrees: [undefined, undefined],
      hasSourceMidi: true,
    };
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [candidate]);
    const usable = container.querySelector("[data-testid='voicing-loop-preview-usable']")?.textContent ?? "";
    expect(usable).toContain("保存した音 3/8");
    expect(usable).toContain("元の MIDI");
    expect(usable).toContain("自動生成");
    const degrees = Array.from(container.querySelectorAll("[data-testid='voicing-loop-preview-chords'] small"));
    expect(degrees).toHaveLength(2);
    expect(degrees.every((element) => (element.textContent ?? "").trim() === "")).toBe(true);
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    const noMidi = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, [{ ...candidate, hasSourceMidi: false }]);
    expect(noMidi.querySelector("[data-testid='voicing-loop-preview-usable']")?.textContent ?? "")
      .not.toContain("元の MIDI");
  });
  it("P23-20 C3: the degree and its role colour follow the key and the 「度数を表示」 setting", async () => {
    const runtime = new FakeTransport();
    const keyed = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [], undefined, { globalBpm: 100 });
    // キーがある進行: 度数は Ⅱm7 の形で、役割の色(T / SD…)が付く
    expect(keyed.querySelector("[data-testid='voicing-loop-current-degree']")?.textContent).toBe("Ⅰmaj7");
    expect(keyed.querySelector("[data-testid='voicing-loop-next-degree']")?.textContent).toBe("Ⅱm7");
    expect(keyed.querySelector("[data-testid='voicing-loop-then-next-degree']")?.textContent).toBe("Ⅰmaj7");
    expect(keyed.querySelector("[data-testid='voicing-loop-current-degree-wrap']")?.getAttribute("data-fn")).toBe("T");
    expect(keyed.querySelector("[data-testid='voicing-loop-next-degree-wrap']")?.getAttribute("data-fn")).toBe("SD");
    expect(keyed.querySelector("[data-testid='voicing-loop-current-role']")?.textContent).toBe("Tトニック");
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    // 「度数を表示」が切: 度数だけ消え、役割の色(札)は残る
    const hidden = await renderView(runtime, { "basic-full": snapshot("basic-full") }, "basic-full",
      false, { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [], undefined, { globalBpm: 100, showDegrees: false });
    expect(hidden.querySelector("[data-testid='voicing-loop-current-degree']")).toBeNull();
    expect(hidden.querySelector("[data-testid='voicing-loop-current-degree-wrap']")?.getAttribute("data-fn")).toBe("T");
    expect(hidden.querySelector("[data-testid='voicing-loop-current-role']")?.textContent).toBe("Tトニック");
    expect(hidden.querySelector("[data-testid='voicing-loop-event-degree']")).toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();

    // キーの無い進行: 度数も役割の色も出ない
    const noKey = await renderView(runtime, { "basic-full": { ...snapshot("basic-full"), key: undefined } }, "basic-full",
      false, { onSelectProgression: vi.fn(), onEnterText: vi.fn() }, [], undefined, { globalBpm: 100 });
    expect(noKey.querySelector("[data-testid='voicing-loop-current-degree']")).toBeNull();
    expect(noKey.querySelector("[data-testid='voicing-loop-current-degree-wrap']")).toBeNull();
    expect(noKey.querySelector("[data-testid='voicing-loop-event-degree']")).toBeNull();
  });

  it("P23-29 C1: L1-L5 — 続きから, the tool row, the sections, the two columns and the row", async () => {
    window.localStorage.setItem("loop-vault:voicing-loop-last:v1",
      JSON.stringify({ version: 1, reference: { ideaId: "idea-0", blockId: "block-0" }, at: new Date().toISOString() }));
    saveRecentVoicingLoopProgressions([{ ideaId: "idea-1", blockId: "block-1" }]);
    const candidates = [
      { ...vaultCandidate(0), favorite: true, lengthBars: 4, chordCount: 2, savedVoiceCount: 0, hasSourceMidi: true,
        chordRoles: ["T", "D"], chordDegrees: ["Ⅰmaj7", "Ⅴ7"], block: savedBlock() },
      vaultCandidate(1),
      { ...vaultCandidate(2), unavailableReason: "practice-capacity" as const },
    ];
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, candidates);
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progression-row']"));
    const sectionIds = () => Array.from(container.querySelectorAll<HTMLElement>("[data-testid^='voicing-loop-section-']"))
      .map((section) => section.dataset.testid);
    const filter = (kind: string) => container.querySelector<HTMLElement>(`[data-testid='voicing-loop-filter-${kind}']`)!;

    // L1: the 続きから band: the VL mark, the words, the title, the key/bars/day and the main 「続ける」+ Enter.
    const band = container.querySelector<HTMLElement>("[data-testid='voicing-loop-resume']")!;
    expect(band).not.toBeNull();
    expect(band.querySelector("[aria-hidden='true']")?.textContent).toBe("VL");
    expect(band.textContent).toContain("続きから");
    expect(band.textContent).toContain("Progression 0");
    expect(band.textContent).toContain("Cメジャー ・ 4 小節 ・ きょう練習");
    expect(band.querySelector("[data-testid='voicing-loop-resume-go']")?.textContent).toBe("続けるEnter");

    // L2: the tool row — the radiogroup of three, the old search field in the middle, the text entry at the right.
    const tools = container.querySelector<HTMLElement>("[data-testid='voicing-loop-picker-tools']")!;
    const group = tools.querySelector<HTMLElement>("[role='radiogroup']")!;
    expect(group.getAttribute("aria-label")).toBe("一覧の切り替え");
    const radios = Array.from(group.querySelectorAll<HTMLElement>("[role='radio']"));
    expect(radios.map((radio) => radio.dataset.testid)).toEqual([
      "voicing-loop-filter-all", "voicing-loop-filter-favorites", "voicing-loop-filter-recent"]);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios.map((radio) => radio.textContent)).toEqual(["すべて3", "お気に入り1", "最近使った1"]);
    const search = tools.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
    expect(search.getAttribute("placeholder")).toBe("タイトル、コード、Keyで検索");
    // P23-61 §3: with progressions the picker has no text entry; the search keeps the row's width.
    expect(Array.from(tools.querySelectorAll("button"))
      .some((button) => (button.getAttribute("aria-label") ?? "").includes("テキストで新しい進行"))).toBe(false);
    expect(tools.lastElementChild).toBe(search.closest("div"));
    expect(search.closest("div")?.className).toContain("flex-1");

    // L5: the row — the star, the title with one line of facts, the role-coloured chord chips, the day.
    expect(rows()).toHaveLength(3);
    const first = rows()[0]!;
    expect(first.firstElementChild?.getAttribute("data-testid")).toBe("voicing-loop-favorite");
    expect(first.lastElementChild?.getAttribute("data-testid")).toBe("voicing-loop-progression-day");
    expect(first.querySelector("[data-testid='voicing-loop-progression-day']")?.textContent).toBe("きょう");
    expect(rows()[1]!.querySelector("[data-testid='voicing-loop-progression-day']")?.textContent).toBe("—");
    const facts = first.querySelector(".lv-vl-row-facts")?.textContent ?? "";
    expect(facts).toContain("Cメジャー");
    expect(facts).toContain("80 BPM");
    expect(facts).toContain("4 小節");
    // The three separate badges are gone; the chips replace them.
    expect(first.querySelector(".lv-vl-picker-tags")).toBeNull();
    const chips = Array.from(first.querySelectorAll<HTMLElement>(".lv-vl-row-chord"));
    expect(chips.map((chip) => chip.dataset.fn)).toEqual(["T", "D"]);
    expect(chips.map((chip) => chip.textContent)).toEqual(["Ⅰmaj7Cmaj7", "Ⅴ7G7"]);
    const unavailable = rows()[2]!;
    expect(unavailable.getAttribute("data-unavailable")).toBe("true");
    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(unavailable.querySelector("[data-testid='voicing-loop-progression-chords']")).toBeNull();
    expect(unavailable.querySelector("[data-testid='voicing-loop-progression-reason']")?.textContent)
      .toBe("長すぎるため、ここでは練習できません(範囲を分けて保存してください)");
    expect(container.querySelector("[data-testid='voicing-loop-progression-practice']")).toBeNull();

    // L4: the list and the chosen progression are the two columns, in that order, inside the grid.
    const grid = container.querySelector<HTMLElement>(".lv-vl-picker-grid")!;
    const list = grid.querySelector("[data-testid='voicing-loop-progression-list']")!;
    const preview = grid.querySelector("[data-testid='voicing-loop-preview']")!;
    expect([...grid.children]).toEqual([list, preview]);
    expect(preview.getAttribute("aria-label")).toBe("進行を選んでください");

    // L3: すべて draws the three sections; each filter draws only its own; a search draws the 検索結果.
    expect(sectionIds()).toEqual([
      "voicing-loop-section-favorites", "voicing-loop-section-recent", "voicing-loop-section-others"]);
    await act(async () => filter("favorites").click());
    expect(sectionIds()).toEqual(["voicing-loop-section-favorites"]);
    expect(rows()).toHaveLength(1);
    await act(async () => filter("recent").click());
    expect(sectionIds()).toEqual(["voicing-loop-section-recent"]);
    expect(rows()).toHaveLength(1);
    await act(async () => filter("all").click());
    expect(sectionIds()).toHaveLength(3);
    await typeSearch(container, "Progression 2");
    expect(sectionIds()).toEqual(["voicing-loop-section-results"]);
    expect(rows()).toHaveLength(1);
    await typeSearch(container, "");
    expect(sectionIds()).toHaveLength(3);
  });

  it("P23-29 C1: L7-L9 — the chosen column, the first pick and the search box", async () => {
    const onOpenInVault = vi.fn();
    const onSelectProgression = vi.fn(() => true);
    const candidate = {
      ...vaultCandidate(0), lengthBars: 3, chordCount: 2, savedVoiceCount: 0, hasSourceMidi: true,
      chordRoles: ["T", "D"], chordDegrees: ["Ⅰmaj7", "Ⅴ7"], block: savedBlock(),
    };
    const container = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression, onEnterText: vi.fn(), onOpenInVault }, [candidate, vaultCandidate(1)]);

    // L8: without a 続きから record the list's first playable row is picked at open.
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progression-row']"));
    const selected = () => container.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-row'][data-selected='true']");
    expect(selected()).toBe(rows()[0]);
    // L6: one press on another row only picks it (the right column follows).
    const target = rows().find((row) => row.textContent?.includes("Progression 0"))!;
    await act(async () => target.click());
    expect(selected()).toBe(target);
    expect(onSelectProgression).not.toHaveBeenCalled();

    // L7: the chosen progression — title, chips, the four-column chord cards with degrees and role colours,
    // the small roll, ▶ 試聴, the three fact lines and the two buttons.
    const preview = container.querySelector<HTMLElement>("[data-testid='voicing-loop-preview']")!;
    expect(preview.querySelector("[data-testid='voicing-loop-preview-title']")?.textContent).toBe("Progression 0");
    expect(Array.from(preview.querySelectorAll(".lv-vl-preview-chip")).map((chip) => chip.textContent))
      .toEqual(["Cメジャー", "80 BPM", "3 小節", "2 コード"]);
    const chordCards = Array.from(preview.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-preview-chord']"));
    expect(chordCards).toHaveLength(2);
    expect(chordCards.map((card) => card.dataset.fn)).toEqual(["T", "D"]);
    expect(chordCards.map((card) => card.querySelector("small")?.textContent)).toEqual(["Ⅰmaj7", "Ⅴ7"]);
    expect(chordCards.map((card) => card.querySelector("b")?.textContent)).toEqual(["Cmaj7", "G7"]);
    expect(chordCards.every((card) => !card.disabled)).toBe(true);
    expect(chordCards[0]!.getAttribute("aria-label")).toBe("Cmaj7 試聴");
    expect(preview.querySelector("[data-testid='voicing-loop-preview-roll'] [data-testid='home-loop-roll']")).not.toBeNull();
    const audition = preview.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-preview-audition']")!;
    expect(audition.disabled).toBe(false);
    expect(audition.querySelector("kbd")?.textContent).toBe("Space");
    const facts = preview.querySelector("[data-testid='voicing-loop-preview-facts']")!;
    expect(facts.textContent).toContain("最後に練習");
    expect(facts.textContent).toContain("まだ");
    expect(facts.textContent).toContain("使える音");
    expect(facts.querySelector("[data-testid='voicing-loop-preview-usable']")?.textContent)
      .toBe("元の MIDI ・ 保存した音 0/2 ・ 自動生成");
    expect(facts.textContent).toContain("保存した日");
    expect(facts.textContent).toContain("1/1");
    const practice = preview.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-preview-practice']")!;
    expect(practice.textContent).toBe("この進行で練習するEnter");
    expect(practice.className).toContain("lv-button-primary");
    await act(async () => practice.click());
    expect(onSelectProgression).toHaveBeenCalledWith(candidate.sourceReference);
    await act(async () => preview.querySelector<HTMLButtonElement>("[data-testid='voicing-loop-preview-open']")!.click());
    expect(onOpenInVault).toHaveBeenCalledWith(candidate.sourceReference);

    // L9: Space, Enter and the arrows inside the search box belong to the box, not to the picker.
    const search = container.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
    search.focus();
    for (const key of [" ", "Enter", "ArrowDown"] as const) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(async () => { search.dispatchEvent(event); });
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(onSelectProgression).toHaveBeenCalledTimes(1);
    expect(selected()?.textContent).toContain("Progression 0");

    // L8: no progression at all keeps the old 「まだ進行がありません」 screen and draws no right column.
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    const empty = await renderView(new FakeTransport(), undefined, "source-midi", false,
      { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() }, []);
    expect(empty.querySelector("[data-testid='voicing-loop-progression-row']")).toBeNull();
    expect(empty.querySelector("[data-testid='voicing-loop-preview']")).toBeNull();
    expect(empty.textContent).toContain("まだ進行がありません");
  });
});

async function renderView(
  runtime: FakeTransport,
  snapshots: Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>> | undefined,
  initialSelection: ProgressionVoicingSelection,
  _monitorMidi = false,
  callbacks: {
    onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
    onEnterText: () => void;
    bulkSourcePreview?: { eligible: number; changed: number; skippedCustom: number; skippedMissingSource: number };
    onBulkSourceApply?: () => boolean;
    onToggleFavorite?: (reference: ProgressionPracticeSourceReference, pinned: boolean) => boolean | "pending";
    /** P23-29 L7: the right column's 「Vault で開く」. */
    onOpenInVault?: (reference: ProgressionPracticeSourceReference) => void;
    /** P23-32 T1: the practice head's 「練習する進行」. */
    onBackToPicker?: () => void;
  } = { onSelectProgression: vi.fn(() => true), onEnterText: vi.fn() },
  vaultProgressions: readonly VoicingLoopVaultCandidate[] = [],
  resolutionOptions?: ResolveProgressionPracticeVoicingsOptions,
  /** P23-06: renders inside GlobalBpmProvider with this stored app-wide BPM, next to `extra`. */
  app?: { globalBpm: number; extra?: ReactNode; showDegrees?: boolean },
): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // Legacy timing scenarios explicitly start with click ON; production default is OFF.
  saveMetronomeEnabled(true);
  if (app) saveGlobalBpm(app.globalBpm);
  const view = (
    <PreviewSoundProvider>
      <ProgressionVoicingPracticeView
        snapshots={snapshots}
        initialSelection={initialSelection}
        vaultProgressions={vaultProgressions}
        onSelectProgression={callbacks.onSelectProgression}
        onEnterText={callbacks.onEnterText}
        bulkSourcePreview={callbacks.bulkSourcePreview}
        onBulkSourceApply={callbacks.onBulkSourceApply}
        onToggleFavorite={callbacks.onToggleFavorite}
        onOpenInVault={callbacks.onOpenInVault}
        onBackToPicker={callbacks.onBackToPicker}
        transportFactory={() => runtime}
        resolutionOptions={resolutionOptions}
        showDegrees={app?.showDegrees}
      />
    </PreviewSoundProvider>
  );
  await act(async () => root?.render(
    <MetronomeProvider>
      <GlobalMetronomeButton />
      {app ? <GlobalBpmProvider>{app.extra}{view}</GlobalBpmProvider> : view}
    </MetronomeProvider>,
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
    favorite: false,
  };
}

/**
 * P23-29 L7: the saved block the picker's right column draws (the roll) and auditions (▶ 試聴, the chord
 * cards). The real candidates carry the Vault block; the synthetic ones in this file get one only when the
 * test looks at that column's roll and audition.
 */
function savedBlock(chords: readonly string[] = ["Cmaj7", "G7"]): SavedProgressionBlock {
  return {
    id: "block-0",
    summaryText: "Cmaj7 G7",
    chords: chords.map((label, index) => ({
      eventId: `event-${index}`,
      bar: 1 + index,
      beat: 1,
      durationBeats: 4,
      chord: parseChordLabel(label)!,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    detectedKey: "C major",
    bpm: 80,
    timeSignature: "4/4",
    lengthBars: chords.length,
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

async function selectStudy(container: HTMLElement, value: "teacher" | "core") {
  const select = container.querySelector<HTMLButtonElement>("[aria-label='生成タイプ']")!;
  await act(async () => {
    select.click();
  });
  await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=option]")).find(option => option.textContent === (value === "teacher" ? "基本" : "骨組み"))!.click());
}

/** One row of a hand panel's five slots (P5.26.2-02): "finger" labels, note names ("pitch") or degrees. */
function handCells(container: ParentNode, testId: string, row: "finger" | "pitch" | "degree"): { text: string; used: boolean }[] {
  // P23-20 L1: one hand is five slot cards now; the finger / note / chord tone are read from each card.
  return Array.from(container.querySelectorAll<HTMLElement>(`[data-testid='${testId}'] [data-testid='voicing-loop-hand-slot']`))
    .map((slot) => {
      const text = row === "finger"
        ? slot.querySelector(".voicing-hand-slot-finger")?.textContent ?? ""
        : row === "pitch"
          ? slot.querySelector(".voicing-hand-slot-pitch")?.textContent ?? ""
          : slot.querySelector(".voicing-hand-slot-degree")?.textContent ?? "";
      return { text, used: slot.getAttribute("data-used") === "true" };
    });
}
/** The slots in use, in screen order. */
function usedCells(container: ParentNode, testId: string, row: "finger" | "pitch" | "degree"): string[] {
  return handCells(container, testId, row).filter((cell) => cell.used).map((cell) => cell.text);
}

/**
 * P23-20 L2: a checkbox is found by its accessible name (`aria-label`) or by the text of its label —
 * the two always-visible short names (最適化 / 運指) keep the full sentence as the accessible name.
 */
function controlCheckbox(container: ParentNode, label: string): HTMLInputElement {
  const found = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
    .find((input) => input.getAttribute("aria-label") === label || input.parentElement?.textContent?.includes(label));
  if (!found) throw new Error(`Checkbox not found: ${label}`);
  return found;
}

/** P23-32 T4/K3: the two named settings and the reference sound are switches (a button with `role="switch"`). */
function controlSwitch(container: ParentNode, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>("button[role='switch']"))
    .find((entry) => entry.getAttribute("aria-label") === label || entry.parentElement?.textContent?.includes(label));
  if (!found) throw new Error(`Switch not found: ${label}`);
  return found;
}

/** A header-side stand-in for the app-wide BPM field (P23-32 K4 removed the practice's own field). */
function BpmProbe({ value = 132 }: { readonly value?: number }) {
  const { setBpm } = useGlobalBpm();
  return <button type="button" onClick={() => setBpm(value)}>{`bpm-${value}`}</button>;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find(entry => entry.textContent === label || entry.getAttribute("aria-label") === label)
    ?? buttons.find(entry => entry.textContent?.includes(label) || entry.getAttribute("aria-label")?.includes(label));
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

/** P23-29: types into the picker's search box the way the field does (a value write, then an input event). */
async function typeSearch(container: HTMLElement, value: string): Promise<HTMLInputElement> {
  const search = container.querySelector<HTMLInputElement>("#voicing-loop-progression-search")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, value);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return search;
}

/** The whole row of a picker entry (title, facts, chords, star and the practice button or the short reason). */
function rowText(choice: Element): string {
  return choice.closest("[data-testid='voicing-loop-progression-row']")?.textContent ?? choice.textContent ?? "";
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

class SeekingTransport extends FakeTransport {
  readonly supportsSeek = true;
  private pendingBounds?: { readonly startBeat: number; readonly endBeat: number };
  setLoopBounds = vi.fn((bounds: { readonly startBeat: number; readonly endBeat: number } | undefined) => {
    this.pendingBounds = bounds;
    return true;
  });
  activateRange() { this.options?.onLoopBoundsActivated?.(this.pendingBounds, this.pendingBounds?.startBeat ?? 0); }

  private isPaused = false;
  override pause = vi.fn(() => { this.isPaused = true; return true; });
  override resume = vi.fn(async () => { this.isPaused = false; return true; });
  seek = vi.fn((eventIndex: number) => this.options ? {
    status: this.isPaused ? "paused" as const : "running" as const,
    absoluteBeat: (this.options.countInBars * (this.options.snapshot.practiceGroupBeats ?? this.options.snapshot.meter.numerator))
      + this.options.snapshot.events[eventIndex]!.startBeat,
  } : undefined);
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

async function contextRange(target: HTMLElement, shiftKey = false, clientX = 0) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey, clientX });
  await act(async () => target.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
}
