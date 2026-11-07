// @vitest-environment jsdom

import { writeMidi, type MidiEvent } from "midi-file";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalysisSession, type AnalysisSession } from "../../domain/midi/preAnalysis";
import { memoryEntryFor, rememberPreAnalysis } from "../../storage/preAnalysisMemory";
import { PreAnalysisWorkspace } from "./PreAnalysisWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
      strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "",
      textAlign: "left", textBaseline: "alphabetic",
    }) as unknown as CanvasRenderingContext2D,
  );
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function bytesFor(channels: readonly number[], program = 0): Uint8Array {
  const events: MidiEvent[] = [];
  channels.forEach((channel, index) => {
    events.push({ deltaTime: 0, type: "programChange", channel, programNumber: channel === 9 ? 0 : program + index });
    events.push({ deltaTime: 0, type: "noteOn", channel, noteNumber: channel === 9 ? 36 : 48 + index * 7, velocity: 100 });
    events.push({ deltaTime: 480, type: "noteOff", channel, noteNumber: channel === 9 ? 36 : 48 + index * 7, velocity: 0 });
  });
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [events],
  }));
}

function twoFiles(): AnalysisSession {
  return createAnalysisSession([
    { sourceId: "master", displayName: "full.mid", bytes: bytesFor([0, 1]) },
    { sourceId: "other", displayName: "second.mid", bytes: bytesFor([2]) },
  ]).session!;
}

function withMeter(session: AnalysisSession, numerator: number, denominator: number): AnalysisSession {
  return {
    ...session,
    sources: session.sources.map((source) => ({
      ...source,
      timeSignatures: [{ beat: 0, numerator, denominator }],
    })),
  };
}

/** One part that needs no review: chords, a synth pad, high confidence, one file, no warnings. */
function simpleSession(): AnalysisSession {
  const base = createAnalysisSession([
    { sourceId: "solo", displayName: "solo.mid", bytes: bytesFor([0], 40) },
  ]).session!;
  return {
    ...base,
    warnings: [],
    voices: base.voices.map((voice) => ({
      ...voice,
      dominantProgram: 40,
      autoRole: "harmony" as const,
      assignedRole: "harmony" as const,
      included: true,
      autoRoleConfidence: 0.9,
      autoRoleConfidenceBucket: "high" as const,
    })),
  };
}

async function render(
  session: AnalysisSession,
  props: Partial<Parameters<typeof PreAnalysisWorkspace>[0]> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <PreAnalysisWorkspace
      session={session}
      onSessionChange={vi.fn()}
      onAddMidi={vi.fn()}
      onRemoveSource={vi.fn()}
      onAnalyze={vi.fn()}
      {...props}
    />,
  ));
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function click(container: HTMLElement, testId: string) {
  const element = container.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`);
  expect(element, testId).not.toBeNull();
  return act(async () => element!.click());
}

describe("取り込み前の確認: 注意の帯 (P15-03)", () => {
  it("names the file that differs and what is used instead", async () => {
    const session: AnalysisSession = {
      ...twoFiles(),
      warnings: [
        { code: "tempo-map-mismatch", sourceIds: ["master", "other"] },
        { code: "duration-mismatch", sourceIds: ["master", "other"] },
      ],
    };
    const { container, unmount } = await render(session);
    const text = container.querySelector("[data-testid='pre-analysis-notices']")!.textContent!;
    expect(text).toContain("「second.mid」のテンポが「full.mid」と違います");
    expect(text).toContain("「full.mid」のテンポを使います");
    expect(text).toContain("「second.mid」の長さが「full.mid」と大きく違います");
    expect(text).not.toContain("master");
    await unmount();
  });

  it("states a tempo change as information, with no button", async () => {
    const base = createAnalysisSession([
      { sourceId: "one", displayName: "one.mid", bytes: bytesFor([0]) },
    ]).session!;
    const session: AnalysisSession = {
      ...base,
      sources: base.sources.map((source) => ({
        ...source,
        representativeBpm: 108,
        tempoDiagnostics: {
          effectiveTempoEventCount: 2,
          effectiveTempoSegmentCount: 2,
          rawMinBpm: 90,
          rawMaxBpm: 120,
          weightedP05Bpm: 90,
          weightedMedianBpm: 108,
          weightedP95Bpm: 120,
        },
      })),
    };
    const { container, unmount } = await render(session);
    const notice = container.querySelector("[data-testid='pre-analysis-notice-tempo:one']")!;
    expect(notice.textContent).toContain("途中でテンポが変わっています");
    expect(notice.querySelector("button")).toBeNull();
    await unmount();
  });

  it("says an unusual meter as information only: the file is analysed as it is written, nothing to press", async () => {
    const session = withMeter(createAnalysisSession([
      { sourceId: "odd", displayName: "odd.mid", bytes: bytesFor([0]) },
    ]).session!, 1, 4);
    const { container, unmount } = await render(session);
    const notice = container.querySelector("[data-testid='pre-analysis-notice-meter:odd']")!;
    expect(notice.textContent).toContain("拍子が 1/4 と書かれています。解析は書かれた拍子のまま行います");
    expect(notice.textContent).not.toContain("4/4 として読む");
    expect(notice.querySelector("button")).toBeNull();
    await unmount();
  });
  it("does not call a plain 6/8 or 3/4 unusual", async () => {
    for (const [numerator, denominator] of [[6, 8], [3, 4], [4, 4]] as const) {
      const { container, unmount } = await render(withMeter(simpleSession(), numerator, denominator));
      expect(container.querySelector("[data-testid^='pre-analysis-notice-meter:']")).toBeNull();
      await unmount();
    }
  });

  it("lets an exact duplicate be used after all, with 「両方使う」", async () => {
    const duplicateBytes = bytesFor([0]);
    const base = createAnalysisSession([
      { sourceId: "full", displayName: "full.mid", bytes: duplicateBytes },
      { sourceId: "split", displayName: "split.mid", bytes: duplicateBytes },
    ]).session!;
    const duplicate = base.voices.find((voice) => voice.duplicateOf)!;
    const onSessionChange = vi.fn();
    const { container, unmount } = await render(base, { onSessionChange });

    expect(container.querySelector(`[data-testid='pre-analysis-notice-duplicate:${duplicate.id}']`)!.textContent)
      .toContain("同じ内容なので、片方だけ使います");
    await click(container, "pre-analysis-use-both");
    const next = onSessionChange.mock.calls[onSessionChange.mock.calls.length - 1]![0] as AnalysisSession;
    const used = next.voices.find((voice) => voice.id === duplicate.id)!;
    expect(used.included).toBe(true);
    expect(used.assignedRole).not.toBe("exclude");
    expect(next.preset).toBe("custom");
    expect(base.voices.find((voice) => voice.id === duplicate.id)!.included).toBe(false);
    await unmount();
  });
});

describe("取り込み前の確認: 前回と同じ設定 (P15-03)", () => {
  function remembered(): { fresh: AnalysisSession } {
    const earlier = twoFiles();
    const changed: AnalysisSession = {
      ...earlier,
      voices: earlier.voices.map((voice, index) => index === 0
        ? { ...voice, assignedRole: "exclude" as const, included: false }
        : voice),
    };
    rememberPreAnalysis(memoryEntryFor(changed, {}, "harmonic-core"));
    return { fresh: twoFiles() };
  }

  it("offers last time's setting only when the parts are made the same way, and applies it only on a press", async () => {
    const { fresh } = remembered();
    const onSessionChange = vi.fn();
    const { container, unmount } = await render(fresh, { onSessionChange });

    expect(container.querySelector("[data-testid='pre-analysis-offer-memory']")).not.toBeNull();
    expect(onSessionChange).not.toHaveBeenCalled();
    await click(container, "pre-analysis-offer-memory");
    const applied = onSessionChange.mock.calls[onSessionChange.mock.calls.length - 1]![0] as AnalysisSession;
    expect(applied.voices[0]!.included).toBe(false);
    expect(applied.voiceContributionPreset).toBe("harmonic-core");
    await unmount();

    // Parts made another way: nothing is offered.
    const other = createAnalysisSession([
      { sourceId: "x", displayName: "x.mid", bytes: bytesFor([3, 4, 5]) },
    ]).session!;
    const { container: otherContainer, unmount: unmountOther } = await render(other);
    expect(otherContainer.querySelector("[data-testid='pre-analysis-offer-memory']")).toBeNull();
    await unmountOther();
  });

  it("says it was applied, and puts the screen back with 「元に戻す」", async () => {
    const { fresh } = remembered();
    const changes: AnalysisSession[] = [];

    function Harness() {
      const [session, setSession] = useState(fresh);
      return (
        <PreAnalysisWorkspace
          session={session}
          onSessionChange={(next) => {
            changes.push(next);
            setSession(next);
          }}
          onAddMidi={vi.fn()}
          onRemoveSource={vi.fn()}
          onAnalyze={vi.fn()}
        />
      );
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    await click(container, "pre-analysis-offer-memory");
    expect(container.querySelector("[data-testid='pre-analysis-memory-applied']")!.textContent)
      .toContain("前回の役割を使いました");
    // The offer is gone while the banner is up.
    expect(container.querySelector("[data-testid='pre-analysis-offer-memory']")).toBeNull();

    await click(container, "pre-analysis-memory-undo");
    expect(container.querySelector("[data-testid='pre-analysis-memory-applied']")).toBeNull();
    const back = changes[changes.length - 1]!;
    expect(back.voices.map((voice) => [voice.assignedRole, voice.included]))
      .toEqual(fresh.voices.map((voice) => [voice.assignedRole, voice.included]));
    await act(async () => root.unmount());
    container.remove();
  });

  it("has 「前回の設定を使う」 in the detailed settings, disabled when nothing matches", async () => {
    const { container, unmount } = await render(twoFiles());
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.startsWith("詳しい設定"))!.click();
    });
    const button = container.querySelector<HTMLButtonElement>("[data-testid='pre-analysis-use-memory']")!;
    expect(button.disabled).toBe(true);
    await unmount();
  });
});

describe("取り込み前の確認: 単純な MIDI (P15-03)", () => {
  it("folds the list of parts into one sentence, keeps the roll, and opens on 「パートを確認する」", async () => {
    const { container, unmount } = await render(simpleSession());
    const folded = container.querySelector("[data-testid='pre-analysis-collapsed']");
    expect(folded).not.toBeNull();
    expect(folded!.textContent).toContain("1パートをコードとして解析します");
    expect(folded!.textContent).toContain("パートを確認する");
    expect(container.querySelector("[data-testid='pre-analysis-piano-roll']")).not.toBeNull();
    expect(container.querySelector("[data-testid='pre-analysis-analyze']")).not.toBeNull();

    await act(async () => {
      [...folded!.querySelectorAll<HTMLButtonElement>("button")][0]!.click();
    });
    expect(container.querySelector("[data-testid='pre-analysis-collapsed']")).toBeNull();
    await unmount();
  });

  it("does not fold when the app wants the parts looked at (a drum part, several parts, a warning)", async () => {
    const cases: AnalysisSession[] = [
      createAnalysisSession([{ sourceId: "d", displayName: "d.mid", bytes: bytesFor([0, 9], 40) }]).session!,
      twoFiles(),
      { ...simpleSession(), warnings: [{ code: "near-duplicate", sourceIds: ["solo"] }] },
    ];
    for (const session of cases) {
      const { container, unmount } = await render(session);
      expect(container.querySelector("[data-testid='pre-analysis-collapsed']")).toBeNull();
      await unmount();
    }
  });
});
