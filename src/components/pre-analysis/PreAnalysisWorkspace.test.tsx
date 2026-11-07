// @vitest-environment jsdom

import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyAnalysisSessionPreset,
  buildSessionAnalysisRequest,
  createAnalysisSession,
  type AnalysisSession,
} from "../../domain/midi/preAnalysis";
import { PreAnalysisWorkspace } from "./PreAnalysisWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeCanvasContext() as unknown as CanvasRenderingContext2D,
  );
});

describe("PreAnalysisWorkspace (取り込み前の確認)", () => {
  it("draws the notes on canvases, not as DOM nodes, and says what the screen is", async () => {
    const { container, unmount } = await renderWorkspace(fixtureSession());

    expect(container.querySelector("[data-testid='pre-analysis-piano-roll']")).not.toBeNull();
    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(0);
    expect(container.querySelector("h2")?.textContent).toBe("取り込み前の確認");
    // The old wording is gone.
    for (const word of ["Voice", "和声コア", "プリセット", "読み込んだMIDI", "この構成で解析"]) {
      expect(container.textContent).not.toContain(word);
    }
    await unmount();
  });

  it("names a part by track name, then instrument name, then 「パート n」", async () => {
    const named = createAnalysisSession([{
      sourceId: "names",
      displayName: "names.mid",
      bytes: midi([0], { trackName: "Keys" }),
    }]).session!;
    const unnamed = createAnalysisSession([{
      sourceId: "plain",
      displayName: "plain.mid",
      bytes: midi([0, 9]),
    }]).session!;
    const noProgram: AnalysisSession = {
      ...unnamed,
      voices: unnamed.voices.map((voice) => ({ ...voice, gmProgramName: undefined })),
    };

    const first = await renderWorkspace(named);
    expect(first.container.querySelector("[data-voice-id] .lv-pa-pname")?.textContent).toBe("Keys");
    await first.unmount();

    const second = await renderWorkspace(unnamed);
    const names = [...second.container.querySelectorAll(".lv-pa-pname")].map((n) => n.textContent);
    expect(names).toEqual(["Acoustic Grand Piano", "ドラム"]);
    await second.unmount();

    const third = await renderWorkspace(noProgram);
    const fallback = [...third.container.querySelectorAll(".lv-pa-pname")].map((n) => n.textContent);
    expect(fallback[0]).toBe("パート 1");
    await third.unmount();
  });

  it("shows file facts and only a robust, real-time weighted tempo range", async () => {
    const base = fixtureSession();
    const master = base.sources[0]!;
    const session = {
      ...base,
      sources: base.sources.map((source) => source.id === master.id
        ? {
            ...source,
            tempoMap: [{ beat: 0, bpm: 161.29 }, { beat: 0.1, bpm: 108 }],
            representativeBpm: 108,
            tempoDiagnostics: {
              effectiveTempoEventCount: 2,
              effectiveTempoSegmentCount: 2,
              rawMinBpm: 108,
              rawMaxBpm: 161.29,
              weightedP05Bpm: 90,
              weightedMedianBpm: 108,
              weightedP95Bpm: 120,
            },
          }
        : source),
    };
    const { container, unmount } = await renderWorkspace(session);

    expect(container.textContent).toContain("♩108");
    expect(container.textContent).toContain("4/4");
    expect(container.textContent).toContain("テンポ変動あり 90〜120 BPM");
    expect(container.textContent).not.toContain("テンポ・拍子に問題なし");
    await unmount();
  });

  it("says 「問題なし」 only when tempo, meter and files agree", async () => {
    const single = createAnalysisSession([{
      sourceId: "ok",
      displayName: "ok.mid",
      bytes: midi([0]),
    }]).session!;
    const { container, unmount } = await renderWorkspace(single);
    expect(container.textContent).toContain("✓ テンポ・拍子に問題なし");
    await unmount();
  });

  it("lists every part of an all-in-one Type 0 MIDI, with the file name kept off the cards", async () => {
    const session = createAnalysisSession([{
      sourceId: "all-in-one",
      displayName: "all_instruments.mid",
      bytes: midi(Array.from({ length: 11 }, (_, channel) => channel)),
    }]).session!;
    const { container, unmount } = await renderWorkspace(session);

    expect(session.voices).toHaveLength(11);
    expect(container.querySelectorAll("[data-voice-id]")).toHaveLength(11);
    expect(container.querySelectorAll("[data-testid='pre-analysis-analyze']")).toHaveLength(1);
    expect(container.querySelector("[data-testid='pre-analysis-part-list']")
      ?.textContent).not.toContain("all_instruments.mid");
    expect(container.textContent).toContain("ch1");
    await unmount();
  });

  it("marks a part 「自動」 until it is changed, and explains the guess on hover", async () => {
    const base = fixtureSession();
    const voice = base.voices.find((entry) => !entry.isDrum && !entry.duplicateOf)!;
    const session = {
      ...base,
      voices: base.voices.map((entry) => entry.id === voice.id
        ? {
            ...entry,
            autoRoleConfidence: 0.9,
            autoRoleConfidenceBucket: "low" as const,
            autoRoleEvidenceKinds: ["high-pitch-center", "stepwise-motion"],
          }
        : entry),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const card = () => container.querySelector<HTMLElement>(`[data-voice-id="${voice.id}"]`)!;
    const badge = () => card().querySelector<HTMLElement>(".lv-pa-badge")!;

    expect(badge().textContent).toBe("自動");
    expect(badge().title).toContain("自信：低い");
    expect(badge().title).toContain("高い音域");
    expect(badge().title).toContain("順に動く");
    expect(badge().title).not.toContain("90%");

    const other = card().dataset.role === "bass" ? "melody" : "bass";
    await act(async () => {
      card().querySelector<HTMLButtonElement>(`[data-r="${other}"]`)!.click();
    });
    expect(badge().textContent).toBe("変更");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>(".lv-pa-link")]
        .find((button) => button.textContent?.includes("自動の見立てに戻す"))!.click();
    });
    expect(badge().textContent).toBe("自動");
    expect([...container.querySelectorAll(".lv-pa-badge")]
      .every((element) => element.textContent === "自動")).toBe(true);
    await unmount();
  });

  it("changes a role with one click, and each button is the old role value", async () => {
    const session = fixtureSession();
    const target = session.voices.find((voice) => !voice.isDrum && !voice.duplicateOf)!;
    const onSessionChange = vi.fn();
    const { container, unmount } = await renderWorkspace(session, { onSessionChange });
    const click = async (role: string) => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(
          `[data-voice-id="${target.id}"] [data-r="${role}"]`,
        )!.click();
      });
      return lastSession(onSessionChange).voices.find((voice) => voice.id === target.id)!;
    };

    expect(await click("chord")).toMatchObject({ assignedRole: "harmony", included: true });
    expect(await click("bass")).toMatchObject({ assignedRole: "bass", included: true });
    expect(await click("melody")).toMatchObject({ assignedRole: "melody-weak", included: true });
    expect(await click("off")).toMatchObject({ assignedRole: "exclude", included: false });
    expect(lastSession(onSessionChange).preset).toBe("custom");
    await unmount();
  });

  it("puts the one mixed-notes choice above the part list, and not in the cards", async () => {
    const { container, unmount } = await renderStatefulWorkspace(fixtureSession());
    const standard = container.querySelector<HTMLButtonElement>(
      "[data-analysis-contribution-preset='standard']",
    )!;
    const harmonicCore = container.querySelector<HTMLButtonElement>(
      "[data-analysis-contribution-preset='harmonic-core']",
    )!;
    const list = container.querySelector("[data-testid='pre-analysis-part-list']")!;

    expect(standard.textContent).toBe("分けない");
    expect(harmonicCore.textContent).toBe("アプリに任せる");
    expect(list.contains(standard)).toBe(false);
    expect(list.querySelectorAll("[role='radiogroup']")).toHaveLength(0);
    expect(standard.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(standard.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("#pre-analysis-voice-contribution")?.textContent)
      .toContain("全パート共通");

    document.body.append(container);
    standard.focus();
    await act(async () => {
      standard.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(harmonicCore);
    expect(harmonicCore.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("#pre-analysis-mix-note")?.textContent)
      .toBe("和音の名前の決め方を変えます。曲によっては結果が変わらないこともあります");
    expect(container.textContent).not.toContain("ベースを解析対象から除外");
    await act(async () => {
      harmonicCore.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(standard.getAttribute("aria-checked")).toBe("true");
    await unmount();
    container.remove();
  });

  it("offers the old presets under 「詳しい設定」, with the same result as before", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const { container, unmount } = await renderWorkspace(session, { onSessionChange });

    expect(container.querySelector("[data-analysis-preset]")).toBeNull();
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("詳しい設定"))!.click();
    });
    const options = [...container.querySelectorAll<HTMLElement>("[data-analysis-preset]")];
    expect(options.map((option) => option.dataset.analysisPreset))
      .toEqual(["auto", "harmony-bass", "accompaniment-only", "all-pitched"]);
    expect(container.querySelector('[data-analysis-preset="custom"]')).toBeNull();

    for (const preset of ["auto", "harmony-bass", "accompaniment-only", "all-pitched"] as const) {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`[data-analysis-preset="${preset}"]`)!.click();
      });
      expect(lastSession(onSessionChange)).toEqual(applyAnalysisSessionPreset(session, preset));
    }
    await unmount();
  });

  it("counts and lists what the analysis will really take", async () => {
    const base = fixtureSession();
    const target = base.voices.find((voice) => !voice.isDrum && !voice.duplicateOf)!;
    const session: AnalysisSession = {
      ...base,
      preset: "all-pitched",
      voices: base.voices.map((voice) => voice.id === target.id
        // included, but the role is 「使わない」: the analysis ignores such a part.
        ? { ...voice, assignedRole: "exclude" as const, included: true }
        : voice),
    };
    const really = buildSessionAnalysisRequest(session).selectedVoiceIds.length;
    expect(really).toBe(session.voices.filter((voice) =>
      !voice.isDrum && voice.included && voice.assignedRole !== "exclude").length);
    const { container, unmount } = await renderWorkspace(session);

    expect(container.querySelector("[data-testid=pre-analysis-part-count]")?.textContent)
      .toBe(`${session.voices.length}パート中 ${really}パートを解析します`);
    expect(container.querySelector("[data-testid=pre-analysis-summary]")?.textContent)
      .toContain("使わない:");
    await unmount();
  });

  it("explains why 「解析する」 is disabled when no part is used", async () => {
    const session = fixtureSession();
    const { container, unmount } = await renderWorkspace({
      ...session,
      preset: "custom",
      voices: session.voices.map((voice) => ({
        ...voice,
        included: false,
        assignedRole: "exclude",
      })),
    });
    const analyze = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-analyze']",
    )!;
    expect(analyze.disabled).toBe(true);
    expect(analyze.getAttribute("aria-describedby")).toBe("pre-analysis-disabled-reason");
    expect(container.querySelector("#pre-analysis-disabled-reason")?.textContent)
      .toContain("1つ以上選んでください");
    await unmount();
  });

  it("answers the keyboard, except while an input has the focus", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const onAnalyze = vi.fn();
    const onPlay = vi.fn();
    const { container, unmount } = await renderStatefulWorkspace(session, { onAnalyze, onPlay, onSessionChange });
    const press = async (key: string, target: EventTarget = window) => {
      await act(async () => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    };
    const selected = () => container.querySelector<HTMLElement>("[data-selected]")?.dataset.voiceId;
    // The newest file is selected when a session opens.
    const first = selected()!;
    const index = session.voices.findIndex((voice) => voice.id === first);
    const second = session.voices[(index + 1) % session.voices.length]!.id;
    const secondIsBelow = index + 1 < session.voices.length;
    const roleOf = (id: string) => container.querySelector<HTMLElement>(
      `[data-voice-id="${id}"]`,
    )!.dataset.role;

    if (secondIsBelow) {
      await press("ArrowDown");
      expect(selected()).toBe(second);
      await press("ArrowUp");
    } else {
      await press("ArrowUp");
      await press("ArrowDown");
    }
    expect(selected()).toBe(first);

    await press("3");
    expect(roleOf(first)).toBe("melody");
    await press("2");
    expect(roleOf(first)).toBe("bass");
    await press("0");
    expect(roleOf(first)).toBe("off");
    await press("1");
    expect(roleOf(first)).toBe("chord");

    await press("s");
    expect(container.querySelector(`[data-voice-id="${first}"] [aria-label$="をソロ"]`)
      ?.getAttribute("aria-pressed")).toBe("true");
    await press("m");
    expect(lastSession(onSessionChange).voices.find((voice) => voice.id === first)?.muted).toBe(true);

    await press(" ");
    expect(onPlay).toHaveBeenCalledOnce();
    await press("Enter");
    expect(onAnalyze).toHaveBeenCalledOnce();

    // An open select keeps its keys.
    const select = document.createElement("select");
    container.append(select);
    await press("0", select);
    expect(roleOf(first)).toBe("chord");
    await press("Enter", select);
    expect(onAnalyze).toHaveBeenCalledOnce();
    await unmount();
  });

  it("moves the roll from the whole-song strip", async () => {
    const base = fixtureSession();
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((source) => ({ ...source, durationBeats: 64 })),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const strip = container.querySelector<HTMLDivElement>("[data-testid='pre-analysis-overview']")!;
    const canvas = container.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
    strip.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, right: 1000, bottom: 36, left: 0, width: 1000, height: 36, toJSON: () => ({}),
    });
    expect(strip.querySelector("[data-navigator-frame]")).not.toBeNull();

    await act(async () => {
      strip.dispatchEvent(pointerEvent("pointerdown", 900));
      strip.dispatchEvent(pointerEvent("pointerup", 900));
    });
    expect(Number(canvas.dataset.playheadBeat)).toBeGreaterThan(50);
    expect(Number(canvas.dataset.viewportStartBeat)).toBeGreaterThan(0);
    await unmount();
  });

  it("sets the roll position by clicking the roll, and zooms with the slider", async () => {
    const base = fixtureSession();
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((source) => ({ ...source, durationBeats: 64 })),
    };
    const { container, unmount } = await renderStatefulWorkspace(session);
    const canvas = container.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
    const before = Number(canvas.dataset.pixelsPerBeat);
    const zoom = container.querySelector<HTMLInputElement>("#pre-analysis-zoom")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(zoom, "4");
      zoom.dispatchEvent(new Event("input", { bubbles: true }));
      zoom.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(Number(canvas.dataset.pixelsPerBeat)).toBe(before * 4);

    canvas.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, right: 1000, bottom: 300, left: 0, width: 1000, height: 300, toJSON: () => ({}),
    });
    await act(async () => {
      canvas.dispatchEvent(pointerEvent("pointerdown", 300));
      canvas.dispatchEvent(pointerEvent("pointerup", 300));
    });
    expect(Number(canvas.dataset.playheadBeat)).toBeGreaterThan(0);
    await unmount();
  });

  it("keeps a part's visibility independent from analysis", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const { container, unmount } = await renderWorkspace(session, { onSessionChange });
    const hide = [...container.querySelectorAll<HTMLButtonElement>("[data-voice-id] button")]
      .find((button) => button.getAttribute("aria-label")?.endsWith("を非表示"))!;
    await act(async () => hide.click());
    const changed = lastSession(onSessionChange);
    expect(changed.voices.filter((voice) => !voice.visible)).toHaveLength(1);
    expect(changed.voices.filter((voice) => voice.included).length)
      .toBe(session.voices.filter((voice) => voice.included).length);
    expect(changed.preset).toBe("auto");
    await unmount();
  });

  it("announces that the settings still need to be analysed", async () => {
    const { container, unmount } = await renderWorkspace(fixtureSession(), { requiresReanalysis: true });
    const banner = container.querySelector("[data-testid='pre-analysis-reanalysis-required']");
    expect(banner?.textContent).toContain("再解析が必要です");
    expect(banner?.textContent).toContain("「解析する」を押してください");
    await unmount();
  });

  it("shows file warnings in a band at the top", async () => {
    const base = fixtureSession();
    const session: AnalysisSession = {
      ...base,
      warnings: [{ code: "time-signature-mismatch", sourceIds: ["master", "split"] }],
    };
    const { container, unmount } = await renderWorkspace(session);
    const band = container.querySelector(".lv-pa-notices");
    expect(band?.textContent).toContain("「split.mid」の拍子が「full.mid」と違います");
    expect(container.textContent).not.toContain("master");
    await unmount();
  });

  it("exposes add, remove and analyse", async () => {
    const onAddMidi = vi.fn();
    const onRemoveSource = vi.fn();
    const onAnalyze = vi.fn();
    const { container, unmount } = await renderWorkspace(fixtureSession(), {
      onAddMidi,
      onRemoveSource,
      onAnalyze,
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='pre-analysis-add-midi']")!.click();
      container.querySelector<HTMLButtonElement>("[data-testid='pre-analysis-analyze']")!.click();
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.getAttribute("aria-label")?.startsWith("MIDIを削除:"))!.click();
    });
    expect(onAddMidi).toHaveBeenCalledOnce();
    expect(onAnalyze).toHaveBeenCalledOnce();
    expect(onRemoveSource).toHaveBeenCalledWith("master");
    // The file name appears under the part only when more than one file is loaded.
    expect(container.querySelectorAll(".lv-pa-pfile").length).toBeGreaterThan(0);
    await unmount();
  });

  it("uses one play / stop toggle, with solo and mute kept apart", async () => {
    const session = fixtureSession();
    const onSessionChange = vi.fn();
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const { container, unmount } = await renderWorkspace(session, { onSessionChange, onPlay, onStop });
    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-testid='pre-analysis-playback-toggle']",
    )!;

    expect(toggle.textContent).toContain("再生");
    await act(async () => toggle.click());
    expect(toggle.textContent).toContain("停止");
    await act(async () => toggle.click());
    expect(toggle.textContent).toContain("再生");
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("[data-voice-id] button")]
        .find((button) => button.getAttribute("aria-label")?.endsWith("を消音"))!.click();
    });
    expect(lastSession(onSessionChange).voices.filter((voice) => voice.muted)).toHaveLength(1);
    await unmount();
  });

  it("draws 100,000 notes on a canvas without creating note DOM nodes", async () => {
    const base = fixtureSession();
    const voice = base.voices.find((candidate) => !candidate.isDrum)!;
    const source = base.sources.find((candidate) => candidate.id === voice.sourceId)!;
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((candidate) => candidate.id === source.id
        ? { ...candidate, durationBeats: 720 }
        : candidate),
      notes: Array.from({ length: 100_000 }, (_, index) => ({
        sourceId: source.id,
        voiceId: voice.id,
        trackIndex: voice.trackIndex,
        channel: voice.channel,
        pitch: 48 + index % 36,
        velocity: 80,
        startBeat: index % 720,
        durationBeats: 0.25,
      })),
    };
    const startedAt = performance.now();
    const { container, unmount } = await renderWorkspace(session);
    const elapsedMs = performance.now() - startedAt;

    expect(container.querySelectorAll("[data-midi-note]")).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(3_000);
    await unmount();
  }, 10_000);
});

async function renderWorkspace(
  session: AnalysisSession,
  overrides: Partial<Parameters<typeof PreAnalysisWorkspace>[0]> = {},
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(
    <PreAnalysisWorkspace
      session={session}
      onSessionChange={vi.fn()}
      onAddMidi={vi.fn()}
      onRemoveSource={vi.fn()}
      onAnalyze={vi.fn()}
      {...overrides}
    />,
  ));
  return {
    container,
    unmount: async () => act(async () => root.unmount()),
  };
}

async function renderStatefulWorkspace(
  initialSession: AnalysisSession,
  handlers: {
    onAnalyze?: () => void;
    onPlay?: () => void;
    onSessionChange?: (session: AnalysisSession) => void;
  } = {},
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const onAnalyze = handlers.onAnalyze ?? vi.fn();

  function Harness() {
    const [session, setSession] = useState(initialSession);
    return (
      <PreAnalysisWorkspace
        session={session}
        onSessionChange={(next) => {
          handlers.onSessionChange?.(next);
          setSession(next);
        }}
        onAddMidi={vi.fn()}
        onRemoveSource={vi.fn()}
        onAnalyze={onAnalyze}
        {...(handlers.onPlay ? { onPlay: handlers.onPlay } : {})}
      />
    );
  }

  await act(async () => root.render(<Harness />));
  return {
    container,
    onAnalyze,
    unmount: async () => act(async () => root.unmount()),
  };
}

function fixtureSession(): AnalysisSession {
  return createAnalysisSession([
    { sourceId: "master", displayName: "full.mid", bytes: midi([0, 1, 9]) },
    { sourceId: "split", displayName: "split.mid", bytes: midi([2]) },
  ]).session!;
}

function midi(
  channels: readonly number[],
  options: { trackName?: string } = {},
): Uint8Array {
  const events: MidiEvent[] = options.trackName
    ? [{ deltaTime: 0, meta: true, type: "trackName", text: options.trackName }]
    : [];
  channels.forEach((channel, index) => {
    events.push({
      deltaTime: 0,
      type: "programChange",
      channel,
      programNumber: channel === 0 ? 0 : channel === 1 ? 32 : 80,
    });
    events.push({
      deltaTime: 0,
      type: "noteOn",
      channel,
      noteNumber: channel === 9 ? 36 : 48 + (index % 4) * 7,
      velocity: 100,
    });
    events.push({
      deltaTime: 480,
      type: "noteOff",
      channel,
      noteNumber: channel === 9 ? 36 : 48 + (index % 4) * 7,
      velocity: 0,
    });
  });
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [events],
  }));
}

function fakeCanvasContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
}

function lastSession(callback: ReturnType<typeof vi.fn>): AnalysisSession {
  return callback.mock.calls[callback.mock.calls.length - 1]![0] as AnalysisSession;
}

function pointerEvent(type: string, clientX: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: 1 },
    buttons: { value: 1 },
  });
  return event;
}
