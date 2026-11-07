// @vitest-environment jsdom

import { writeMidi, type MidiEvent } from "midi-file";
import { Profiler, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAnalysisSession,
  sessionPreviewNotes,
  updateAnalysisSessionVoice,
  type AnalysisSession,
} from "../../domain/midi/preAnalysis";
import { PIANO_ROLL_GUTTER, PLAYHEAD_COLOR, drawPlaybackOverlay, pianoRollLayout } from "./PreAnalysisPianoRoll";
import { PreAnalysisWorkspace } from "./PreAnalysisWorkspace";
import { audibleNotes, buildSoundingIndex, soundingAt, soundingText } from "./playbackView";

vi.mock("../../audio/chordPreview", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../audio/chordPreview")>(),
  previewMidiNotes: vi.fn(async (
    _notes: unknown,
    _bpm: number,
    _sound: unknown,
    callbacks?: { onStarted?: () => void },
  ) => { callbacks?.onStarted?.(); }),
  stopPreview: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// ---- a fake frame clock -------------------------------------------------------------------------

let clock = 0;
let queue: Array<{ id: number; callback: () => void }> = [];
let nextId = 1;

function installClock() {
  clock = 1000;
  queue = [];
  nextId = 1;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue = queue.filter((entry) => entry.id !== id);
  });
}

/** `frames` frames, `ms` apart. */
async function advance(frames: number, ms = 1000 / 60) {
  for (let frame = 0; frame < frames; frame += 1) {
    clock += ms;
    const due = queue;
    queue = [];
    await act(async () => { due.forEach((entry) => entry.callback()); });
  }
}

// ---- canvas contexts, one per canvas, with counters -----------------------------------------------

interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
}
const contexts = new WeakMap<HTMLCanvasElement, FakeContext>();

function contextOf(testId: string): FakeContext {
  const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid='${testId}']`)!;
  return contexts.get(canvas)!;
}

function makeContext(): FakeContext {
  return {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "",
    textAlign: "left", textBaseline: "alphabetic",
  };
}

beforeEach(() => {
  installClock();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    let context = contexts.get(this);
    if (!context) {
      context = makeContext();
      contexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

// ---- the song ----------------------------------------------------------------------------------

/**
 * ch0 (keys, chords): C3 E3 G3 for bars 1-12 (4 beats each);
 * ch1 (bass): C2 for the same;
 * ch2 (lead): one note per bar at D5 on beat 2 (1 beat long).
 */
function songBytes(): Uint8Array {
  const events: Array<{ at: number; event: MidiEvent }> = [];
  const add = (channel: number, pitch: number, start: number, length: number) => {
    events.push({ at: start * 480, event: { deltaTime: 0, type: "noteOn", channel, noteNumber: pitch, velocity: 90 } });
    events.push({ at: (start + length) * 480, event: { deltaTime: 0, type: "noteOff", channel, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 12; bar += 1) {
    for (const pitch of [48, 52, 55]) add(0, pitch, bar * 4, 4);
    add(1, 36, bar * 4, 4);
    add(2, 74, bar * 4 + 1, 1);
  }
  events.sort((a, b) => a.at - b.at || (a.event.type === "noteOff" ? -1 : 1));
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
  ];
  let last = 0;
  for (const { at, event } of events) {
    track.push({ ...event, deltaTime: at - last } as MidiEvent);
    last = at;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
}

function song(): AnalysisSession {
  return createAnalysisSession([{ sourceId: "s", displayName: "s.mid", bytes: songBytes() }]).session!;
}

async function mount(session: AnalysisSession, onRender?: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const tree = (
    <PreAnalysisWorkspace
      session={session}
      onSessionChange={vi.fn()}
      onAddMidi={vi.fn()}
      onRemoveSource={vi.fn()}
      onAnalyze={vi.fn()}
    />
  );
  await act(async () => root.render(onRender ? <Profiler id="w" onRender={onRender}>{tree}</Profiler> : tree));
  return { container, unmount: async () => act(async () => root.unmount()) };
}

const toggle = () => document.querySelector<HTMLButtonElement>("[data-testid='pre-analysis-playback-toggle']")!;
const base = () => document.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
const overlay = () => document.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-roll-overlay']")!;
const press = async (button: HTMLButtonElement) => act(async () => button.click());

/** The x of the last line the upper layer drew with moveTo(x, 0): the playhead. */
function playheadX(): number {
  const calls = contextOf("pre-analysis-roll-overlay").moveTo.mock.calls;
  return calls[calls.length - 1]![0] as number;
}

// ---- tests 1-4, 7: the frame loop -------------------------------------------------------------

describe("再生中の縦線 (P15-04)", () => {
  it("1. does not render the screen again for every frame (one second of playback: a few times at most)", async () => {
    let commits = 0;
    const { unmount } = await mount(song(), () => { commits += 1; });
    commits = 0;
    await press(toggle());
    await advance(60);
    expect(toggle().getAttribute("aria-label")).toBe("停止");
    expect(commits).toBeLessThanOrEqual(5);
    await unmount();
  });

  it("2. does not draw the lower layer (grid and notes) again while playing, only when the page turns", async () => {
    const { unmount } = await mount(song());
    await press(toggle());
    const lower = contextOf("pre-analysis-piano-roll");
    const drawn = lower.clearRect.mock.calls.length;
    const upperBefore = contextOf("pre-analysis-roll-overlay").clearRect.mock.calls.length;
    await advance(60); // 1 s = 2 beats: still on the first page (27 beats)
    expect(lower.clearRect.mock.calls.length).toBe(drawn);
    // …while the upper layer is drawn for every frame
    expect(contextOf("pre-analysis-roll-overlay").clearRect.mock.calls.length - upperBefore).toBeGreaterThanOrEqual(59);

    // The roll shows about 9 beats in this test: it pages as the line nears the right edge. Each page
    // is one redraw of the lower layer, and nothing else is.
    const pages = new Set([base().dataset.viewportStartBeat]);
    const before = lower.clearRect.mock.calls.length;
    for (let step = 0; step < 10; step += 1) {
      await advance(1, 1500);
      pages.add(base().dataset.viewportStartBeat);
    }
    expect(pages.size).toBeGreaterThan(1);
    expect(lower.clearRect.mock.calls.length - before).toBe(pages.size - 1);
    await unmount();
  });

  it("3. moves the line as startBeat + seconds × bpm / 60 (120 bpm: 2 beats a second)", async () => {
    const { unmount } = await mount(song());
    await press(toggle());
    await advance(1, 0);
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER, 5);
    await advance(1, 1500); // 1.5 s → 3 beats
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER + 3 * 26, 3);
    await advance(1, 500); // 2 s → 4 beats
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER + 4 * 26, 3);
    expect(contextOf("pre-analysis-roll-overlay").stroke).toBeDefined();
    await unmount();
  });

  it("4. writes the place it stopped at to the state once, and starts again from there", async () => {
    let commits = 0;
    const { unmount } = await mount(song(), () => { commits += 1; });
    await press(toggle());
    await advance(1, 1500); // 3 beats
    expect(base().dataset.playheadBeat).toBe("0"); // the state is not written while playing
    commits = 0;
    await press(toggle()); // stop
    expect(commits).toBeLessThanOrEqual(3);
    expect(Number(base().dataset.playheadBeat)).toBeCloseTo(3, 3);
    expect(toggle().getAttribute("aria-label")).toBe("再生");
    // the line stays where it stopped
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER + 3 * 26, 3);

    clock += 5000; // time passes while stopped
    await press(toggle());
    await advance(1, 0);
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER + 3 * 26, 3);
    await advance(1, 1000); // +2 beats
    expect(playheadX()).toBeCloseTo(PIANO_ROLL_GUTTER + 5 * 26, 3);
    await unmount();
  });

  it("7. moves the head of the whole-song strip in the same frames, and changes the bar number only when the bar changes", async () => {
    const { container, unmount } = await mount(song());
    const head = container.querySelector<HTMLElement>("[data-navigator-head]")!;
    const label = container.querySelector("[data-testid='pre-analysis-bar-label']")!;
    expect(label.textContent).toBe("1小節目 / 12");
    await press(toggle());
    await advance(1, 1000); // 2 beats of 48
    expect(Number.parseFloat(head.style.left)).toBeCloseTo(2 / 48 * 100, 2);
    expect(label.textContent).toBe("1小節目 / 12");
    await advance(1, 2000); // 6 beats: bar 2
    expect(Number.parseFloat(head.style.left)).toBeCloseTo(6 / 48 * 100, 2);
    expect(label.textContent).toBe("2小節目 / 12");
    await unmount();
  });
});

// ---- tests 5, 6: the lights ---------------------------------------------------------------------

describe("鳴っている音 (P15-04)", () => {
  it("6. lists the pitches that sound, lowest first, while playing, and clears on stop", async () => {
    const { container, unmount } = await mount(song());
    const names = container.querySelector("[data-testid='pre-analysis-sounding']")!;
    expect(names.textContent).toBe("");
    await press(toggle());
    await advance(1, 0);
    // beat 0: bass C2, keys C3 E3 G3 (the lead is silent until beat 1)
    expect(names.textContent).toBe("鳴っている音 C2 C3 E3 G3");
    await advance(1, 750); // 1.5 beats: the lead D5 sounds too
    expect(names.textContent).toBe("鳴っている音 C2 C3 E3 G3 D5");
    await press(toggle());
    expect(names.textContent).toBe("");
    await unmount();
  });

  it("6b. while playing the names take the place of the colour legend; stopped, the legend is back", async () => {
    const { container, unmount } = await mount(song());
    const transport = container.querySelector(".lv-pa-transport")!;
    expect(transport.hasAttribute("data-sounding")).toBe(false);
    expect(container.querySelector(".lv-pa-legend")).not.toBeNull();
    await press(toggle());
    await advance(1, 0);
    expect(transport.hasAttribute("data-sounding")).toBe(true); // the stylesheet hides the legend on this
    await press(toggle());
    expect(transport.hasAttribute("data-sounding")).toBe(false);
    await unmount();
  });

  it("6c. says so when nothing sounds, instead of leaving the place empty", async () => {
    const base0 = song();
    // everything is quiet before beat 40: only a note at the very end
    const voice = base0.voices[0]!;
    const quiet: AnalysisSession = { ...base0, notes: [{
      sourceId: voice.sourceId, voiceId: voice.id, trackIndex: voice.trackIndex, channel: voice.channel,
      pitch: 60, velocity: 80, startBeat: 40, durationBeats: 4,
    }] };
    const { container, unmount } = await mount(quiet);
    await press(toggle());
    await advance(1, 0);
    // (the part that has no sound at all cannot be played; this part has one note, far away)
    expect(container.querySelector("[data-testid='pre-analysis-sounding']")!.textContent).toBe("鳴っている音 なし");
    await unmount();
  });

  it("5a. lights the notes that sound on the upper layer, and nothing when stopped", async () => {
    const { unmount } = await mount(song());
    expect(overlay().dataset.soundingCount).toBe("0");
    await press(toggle());
    await advance(1, 0);
    expect(overlay().dataset.soundingCount).toBe("4");
    await advance(1, 750);
    expect(overlay().dataset.soundingCount).toBe("5");
    await press(toggle());
    expect(overlay().dataset.soundingCount).toBe("0");
    await unmount();
  });

  it("5b. an unused, muted or not-soloed part is neither heard nor lit nor named", async () => {
    const base0 = song();
    const lead = base0.voices.find((voice) => voice.channel === 2)!;
    const muted: AnalysisSession = updateAnalysisSessionVoice(base0, lead.id, { muted: true });
    const index = buildSoundingIndex(muted);
    expect(soundingText(soundingAt(index, 1.5))).toBe("鳴っている音 C2 C3 E3 G3");

    const soloOnBass: AnalysisSession = {
      ...base0,
      voices: base0.voices.map((voice) => ({ ...voice, solo: voice.channel === 1 })),
    };
    expect(soundingText(soundingAt(buildSoundingIndex(soloOnBass), 1.5))).toBe("鳴っている音 C2");

    const unused: AnalysisSession = updateAnalysisSessionVoice(base0, lead.id, { assignedRole: "exclude", included: false });
    expect(soundingText(soundingAt(buildSoundingIndex(unused), 1.5))).toBe("鳴っている音 C2 C3 E3 G3");

    // the same on the screen
    const { container, unmount } = await mount(muted);
    await press(toggle());
    await advance(1, 750);
    expect(container.querySelector("[data-testid='pre-analysis-sounding']")!.textContent)
      .toBe("鳴っている音 C2 C3 E3 G3");
    expect(overlay().dataset.soundingCount).toBe("4");
    await unmount();
  });

  it("5c. a note sounds from its start up to, not including, its end", () => {
    const index = buildSoundingIndex(song());
    const at = (beat: number) => soundingAt(index, beat).map((note) => note.pitch).sort((a, b) => a - b);
    expect(at(0)).toEqual([36, 48, 52, 55]);
    expect(at(0.999)).toEqual([36, 48, 52, 55]);
    expect(at(1)).toEqual([36, 48, 52, 55, 74]); // the lead starts exactly now
    expect(at(1.999)).toEqual([36, 48, 52, 55, 74]);
    expect(at(2)).toEqual([36, 48, 52, 55]); // the lead ended exactly now
    expect(at(4)).toEqual([36, 48, 52, 55]); // the next bar starts exactly when the last one ends
    // unchanged → the same array comes back (the caller can tell by reference)
    const first = soundingAt(index, 2.1);
    expect(soundingAt(index, 2.4, first)).toBe(first);
    expect(soundingAt(index, 5.2, first)).not.toBe(first);
  });

  it("5d. a long held note is found without searching all the others", () => {
    const base0 = song();
    const voice = base0.voices[0]!;
    const held: AnalysisSession = {
      ...base0,
      notes: [...base0.notes, {
        sourceId: voice.sourceId, voiceId: voice.id, trackIndex: voice.trackIndex, channel: voice.channel,
        pitch: 84, velocity: 80, startBeat: 3, durationBeats: 40,
      }],
    };
    const index = buildSoundingIndex(held);
    expect(soundingAt(index, 30).map((note) => note.pitch)).toContain(84);
    expect(soundingAt(index, 43).map((note) => note.pitch)).not.toContain(84);
  });

  it("finds the notes that sound in a part of 100,000 notes (and a held note) in well under a frame", () => {
    const base0 = song();
    const voice = base0.voices[0]!;
    const notes = Array.from({ length: 100_000 }, (_, index) => ({
      sourceId: voice.sourceId, voiceId: voice.id, trackIndex: voice.trackIndex, channel: voice.channel,
      pitch: 40 + index % 40, velocity: 80, startBeat: index * 0.02, durationBeats: 0.5,
    }));
    notes.push({ ...notes[0]!, pitch: 90, startBeat: 0, durationBeats: 2000 });
    const index = buildSoundingIndex({ ...base0, notes });
    const startedAt = performance.now();
    let previous: ReturnType<typeof soundingAt> = [];
    for (let frame = 0; frame < 3600; frame += 1) previous = soundingAt(index, frame * 0.5, previous);
    // a full minute of frames takes a fraction of a second: each frame looks at a few notes only
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(previous.some((note) => note.pitch === 90)).toBe(true);
  });

  it("lights exactly what is heard: the audible notes are those of sessionPreviewNotes", () => {
    const base0 = song();
    const lead = base0.voices.find((voice) => voice.channel === 2)!;
    const bass = base0.voices.find((voice) => voice.channel === 1)!;
    const sessions: AnalysisSession[] = [
      base0,
      updateAnalysisSessionVoice(base0, lead.id, { muted: true }),
      updateAnalysisSessionVoice(base0, bass.id, { solo: true }),
      updateAnalysisSessionVoice(base0, lead.id, { assignedRole: "exclude", included: false }),
      { ...base0, sources: base0.sources.map((source) => ({ ...source, muted: true })) },
    ];
    for (const session of sessions) {
      const heard = sessionPreviewNotes(session, 0).map((note) => [note.pitch, note.startBeat, note.durationBeats]);
      const lit = audibleNotes(session).map((note) => [note.pitch, note.startBeat, note.durationBeats]);
      const order = (a: number[], b: number[]) => a[1]! - b[1]! || a[0]! - b[0]! || a[2]! - b[2]!;
      expect(lit.sort(order)).toEqual(heard.sort(order));
    }
  });

  it("5e. the upper layer draws the playhead in the accent colour and a white edge on each lit note", () => {
    const session = song();
    const layout = pianoRollLayout(session, 400);
    const strokes: string[] = [];
    const fills: string[] = [];
    const context = {
      ...makeContext(),
      set strokeStyle(value: string) { strokes.push(value); },
      set fillStyle(value: string) { fills.push(value); },
    };
    const lit = drawPlaybackOverlay(context as unknown as CanvasRenderingContext2D, 900, layout, {
      voiceById: new Map(session.voices.map((voice) => [voice.id, voice])),
      shownSources: new Set(["s"]),
      pixelsPerBeat: 26,
      viewportStartBeat: 0,
      beat: 1.5,
      sounding: soundingAt(buildSoundingIndex(session), 1.5),
    });
    expect(lit).toBe(5);
    expect(strokes).toContain(PLAYHEAD_COLOR);
    expect(strokes.filter((value) => value === "#ffffff").length).toBeGreaterThanOrEqual(5);
    expect(context.strokeRect).toHaveBeenCalled();
    // the key column: one lit row for each sounding pitch
    const keyRows = (context.fillRect as ReturnType<typeof vi.fn>).mock.calls
      .filter((call) => call[0] === 0 && call[2] === PIANO_ROLL_GUTTER);
    expect(keyRows).toHaveLength(5);
  });
});
