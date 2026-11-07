// @vitest-environment jsdom

import { writeMidi, type MidiEvent } from "midi-file";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeNotes } from "../../domain/midi/normalize";
import { buildHarmonicCoreNoteWeights } from "../../domain/midi/harmonicCoreNoteWeights";
import { buildVoiceAwareRoleContext } from "../../domain/midi/voiceAwareReranker";
import { buildVoices, voiceId } from "../../domain/midi/voices";
import { createAnalysisSession, type AnalysisSession } from "../../domain/midi/preAnalysis";
import { buildSplitAnalysisRequest, type PartSplits } from "../../domain/preAnalysisParts/splitSession";
import { harmonicCoreNoteMultipliers } from "./harmonicCorePreview";
import { PreAnalysisWorkspace } from "./PreAnalysisWorkspace";
import { drawPianoRoll, pianoRollLayout } from "./PreAnalysisPianoRoll";
import { ROLE_COLOR } from "./sessionView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  );
});

function song(options: { melody?: boolean } = {}): AnalysisSession {
  const melody = options.melody ?? true;
  const chords = [
    { lh: [48, 55], rh: [64, 71], top: [86, 89, 93, 89] },
    { lh: [45, 52], rh: [60, 67], top: [83, 86, 89, 86] },
  ];
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 4; bar += 1) {
    const chord = chords[bar % 2]!;
    for (const pitch of [...chord.lh, ...chord.rh]) add(pitch, bar * 4, 4, 70);
    if (melody) chord.top.forEach((pitch, index) => add(pitch, bar * 4 + index, 1, 110));
  }
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const bytes = Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
  return createAnalysisSession([{ sourceId: "s", displayName: "s.mid", bytes }]).session!;
}

async function render(
  session: AnalysisSession,
  initial: PartSplits,
  onSplitsChange: (splits: PartSplits) => void = () => undefined,
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  function Harness() {
    const [splits, setSplits] = useState<PartSplits>(initial);
    return (
      <PreAnalysisWorkspace
        session={session}
        splits={splits}
        onSplitsChange={(next) => { onSplitsChange(next); setSplits(next); }}
        onSessionChange={vi.fn()}
        onAddMidi={vi.fn()}
        onRemoveSource={vi.fn()}
        onAnalyze={vi.fn()}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  return { container, unmount: async () => act(async () => root.unmount()) };
}

const click = (element: Element | null | undefined) => act(async () => (element as HTMLElement).click());

describe("「このパートを線で分ける」", () => {
  it("is a tool of the chord part's card, off until it is asked for", async () => {
    const session = song();
    const { container, unmount } = await render(session, {});
    expect(container.querySelectorAll("[data-testid='pre-analysis-split-start']")).toHaveLength(1);
    expect(container.querySelector("[data-testid='pre-analysis-split']")).toBeNull();
    // Without asking, nothing is split anywhere and the summary is the plain one.
    expect(container.querySelector("[data-testid='pre-analysis-summary']")?.textContent).not.toContain("より下");
    await unmount();
  });

  it("puts the line where the melody starts, and the summary says what is analysed and what is not", async () => {
    const session = song();
    const seen: PartSplits[] = [];
    const { container, unmount } = await render(session, {}, (next) => seen.push(next));
    await click(container.querySelector("[data-testid='pre-analysis-split-start']"));

    const id = session.voices[0]!.id;
    expect(seen[seen.length - 1]).toEqual({ [id]: { melodyFrom: 83 } });
    expect(container.querySelector("[data-testid='pre-analysis-split-pitch']")?.textContent).toBe("B5");
    const summary = container.querySelector("[data-testid='pre-analysis-summary']")!.textContent!;
    expect(summary).toContain("B5より下");
    expect(summary).toContain("B5以上・解析には使わない");
    expect(container.querySelector("[data-testid='pre-analysis-split-none']")).toBeNull();
    expect(container.textContent).toContain("このパートでは、線がパート全体の設定より優先されます");
    expect(container.querySelector("[data-testid='pre-analysis-piano-roll']")).not.toBeNull();
    await unmount();
  });

  it("says no melody was found, with the line above the highest note", async () => {
    const session = song({ melody: false });
    const seen: PartSplits[] = [];
    const { container, unmount } = await render(session, {}, (next) => seen.push(next));
    await click(container.querySelector("[data-testid='pre-analysis-split-start']"));
    const highest = Math.max(...session.notes.map((note) => note.pitch));
    expect(seen[seen.length - 1]![session.voices[0]!.id]!.melodyFrom).toBe(highest + 1);
    expect(container.querySelector("[data-testid='pre-analysis-split-none']")?.textContent)
      .toBe("自動では線の位置を決められませんでした。線を置けば分けられます");
    await unmount();
  });

  it("warns, without stopping anything, when chords still sound above the line", async () => {
    const session = song();
    const id = session.voices[0]!.id;
    const low = await render(session, { [id]: { melodyFrom: 62 } });
    expect(low.container.querySelector("[data-testid='pre-analysis-split-chords']")?.textContent)
      .toBe("線より上でも和音が鳴っている所があります。和音の音を切っている可能性があります");
    // the line is still in effect and usable
    expect(low.container.querySelector("[aria-label$='の線を半音上げる']")).not.toBeNull();
    await low.unmount();
    const high = await render(session, { [id]: { melodyFrom: 83 } });
    expect(high.container.querySelector("[data-testid='pre-analysis-split-chords']")).toBeNull();
    await high.unmount();
  });

  it("always tells to check the colours when a line is in effect, even on the suggested line (no warning there)", async () => {
    const session = song();
    const id = session.voices[0]!.id;
    const { container, unmount } = await render(session, { [id]: { melodyFrom: 83 } });
    expect(container.querySelector("[data-testid='pre-analysis-split-check']")?.textContent)
      .toContain("線より上の音は解析に使いません。和音の音が混ざっていないか、色で確かめてください");
    expect(container.querySelector("[data-testid='pre-analysis-split-chords']")).toBeNull();
    await unmount();
  });

  it("cannot be moved down to where nothing is left below it, and can be taken off", async () => {
    const session = song();
    const id = session.voices[0]!.id;
    const lowest = Math.min(...session.notes.map((note) => note.pitch));
    const seen: PartSplits[] = [];
    const { container, unmount } = await render(session, { [id]: { melodyFrom: lowest + 1 } }, (next) => seen.push(next));
    const down = container.querySelector<HTMLButtonElement>("[aria-label$='の線を半音下げる']")!;
    await click(down);
    expect(seen).toHaveLength(0); // the line stays: a note is still left below it
    await click(container.querySelector("[aria-label$='の線を半音上げる']"));
    expect(seen[seen.length - 1]![id]!.melodyFrom).toBe(lowest + 2);
    await click(container.querySelector("[data-testid='pre-analysis-split-remove']"));
    expect(seen[seen.length - 1]).toEqual({});
    expect(container.querySelector("[data-testid='pre-analysis-split']")).toBeNull();
    await unmount();
  });

  it("is not offered for a part that is not used as chords", async () => {
    const base = song();
    const session = {
      ...base,
      voices: base.voices.map((voice) => ({ ...voice, assignedRole: "bass" as const })),
    };
    const { container, unmount } = await render(session, {});
    expect(container.querySelector("[data-testid='pre-analysis-split-start']")).toBeNull();
    await unmount();
  });
});

describe("the roll and the weights with a line", () => {
  it("draws the notes above the line as melody", () => {
    const session = song();
    const id = session.voices[0]!.id;
    const fills: Array<{ color: string; alpha: number }> = [];
    const context = fakeContext(fills);
    drawPianoRoll(context as unknown as CanvasRenderingContext2D, 900, pianoRollLayout(session, 400), {
      session,
      pixelsPerBeat: 20,
      viewportStartBeat: 0,
      splits: { [id]: { melodyFrom: 83 } },
    }, { current: [] });
    const above = session.notes.filter((note) => note.pitch >= 83).length;
    expect(fills.filter((fill) => fill.color === ROLE_COLOR.melody)).toHaveLength(above);
    expect(fills.filter((fill) => fill.color === ROLE_COLOR.chord).length)
      .toBeGreaterThanOrEqual(session.notes.length - above);
  });

  it("weights notes as the analysis really will, with the line in place (the made-up parts do not leak into the picture)", () => {
    const session = song();
    const id = session.voices[0]!.id;
    const splits: PartSplits = { [id]: { melodyFrom: 83 } };
    const preview = harmonicCoreNoteMultipliers(session, splits);

    const built = buildSplitAnalysisRequest({ ...session, voiceContributionPreset: "harmonic-core" }, splits);
    const prepared = built.request.options.preparedData!;
    const normalized = normalizeNotes(prepared);
    const context = buildVoiceAwareRoleContext(buildVoices(prepared), normalized, built.request.options.analysisInput);
    const evidence = normalized.filter((note) =>
      note.channel !== undefined
      && context.analysisInput.enabledVoiceIds.includes(voiceId(note.trackIndex, note.channel)));
    const direct = buildHarmonicCoreNoteWeights(evidence, context.roles);

    expect(preview.size).toBe(direct.summary.weightedNoteCount);
    expect(preview.size).toBeGreaterThan(0);
    expect([...preview.values()].sort()).toEqual([...direct.multipliers.values()].sort());
    // Keys are the session's own notes, and never a note above the line.
    const own = new Set(session.notes);
    expect([...preview.keys()].every((note) => own.has(note) && note.pitch < 83)).toBe(true);
  });
});

function fakeContext(fills: Array<{ color: string; alpha: number }> = []) {
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect() { fills.push({ color: context.fillStyle, alpha: context.globalAlpha }); },
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  return context;
}
