import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewLifecycleCallbacks } from "./chordPreview";
import { createPlaybackController, type PlaybackAudioDriver } from "./playbackController";
import { createTextTransport, sliceTextNotes, type TextPlaybackSnapshot } from "./textTransport";

const source = { kind: "capture" as const, id: "text-test" };
const snapshot: TextPlaybackSnapshot = {
  sourceText: "| C G |", lengthBeats: 4, beatsPerBar: 4,
  notes: [
    { pitch: 60, startBeat: 0, durationBeats: 2, velocity: 88 },
    { pitch: 67, startBeat: 2, durationBeats: 2, velocity: 88 },
  ],
};

function setup() {
  let clock = 0;
  const sessions: PreviewLifecycleCallbacks[] = [];
  const played: { notes: readonly { pitch: number; startBeat: number; durationBeats: number }[]; bpm: number }[] = [];
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async () => {}), playTimeline: vi.fn(async () => {}),
    playNotes: vi.fn(async (notes, bpm, _sound, callbacks) => {
      played.push({ notes, bpm }); sessions.push(callbacks); callbacks.onStarted?.();
    }),
    stop: vi.fn(),
  };
  const controller = createPlaybackController(driver, () => clock);
  const transport = createTextTransport(controller, source, "electric-piano", () => clock);
  return { transport, played, sessions, advance(ms: number) { clock += ms; }, controller };
}

afterEach(() => vi.useRealTimers());
describe("Text transport", () => {
  it("freezes notes on Play, pauses at the exact beat, resumes, and Stop returns to the anchor", () => {
    vi.useFakeTimers();
    const { transport, played, advance } = setup();
    transport.seek(1);
    transport.play(snapshot);
    expect(transport.getState()).toMatchObject({ status: "playing", playAnchor: 1 });
    expect(played[0]!.notes[0]).toMatchObject({ pitch: 60, startBeat: 0, durationBeats: 1 });
    advance(250); transport.pause();
    expect(transport.getState()).toMatchObject({ status: "paused", positionBeats: 1.5 });
    transport.play();
    expect(played[1]!.notes[0]).toMatchObject({ pitch: 60, durationBeats: 0.5 });
    transport.stop();
    expect(transport.getState()).toMatchObject({ status: "stopped", positionBeats: 1, playAnchor: 1 });
    transport.stop();
    expect(transport.position()).toBe(1);
  });

  it("seeks and changes BPM without moving musical position or refiring old attacks", () => {
    vi.useFakeTimers();
    const { transport, played, advance } = setup();
    transport.play(snapshot);
    advance(500);
    transport.setBpm(90);
    expect(transport.position()).toBe(1);
    expect(played[1]!.bpm).toBe(90);
    expect(played[1]!.notes.map(note => note.pitch)).toEqual([67]);
    transport.seek(2);
    expect(played[2]!.notes[0]).toMatchObject({ pitch: 67, startBeat: 0 });
    transport.beginning();
    expect(transport.position()).toBe(0);
    transport.pause(); transport.seek(2.5);
    expect(transport.getState()).toMatchObject({ status: "paused", positionBeats: 2.5 });
    transport.play();
    expect(played[played.length - 1]!.notes[0]).toMatchObject({ pitch: 67, durationBeats: 1.5 });
  });

  it("loops only the whole frozen progression and ignores stale end callbacks", () => {
    vi.useFakeTimers();
    const { transport, played, sessions, advance } = setup();
    transport.setLoop(true);
    transport.play(snapshot);
    advance(2000); vi.advanceTimersByTime(2000);
    expect(played).toHaveLength(2);
    sessions[0]!.onEnded?.("completed");
    expect(transport.getState().status).toBe("playing");
    transport.stop();
  });

  it("handles repeated live BPM changes with one end timer and a stable beat", () => {
    vi.useFakeTimers();
    const { transport, played, advance } = setup();
    transport.play(snapshot);
    advance(500);
    for (const bpm of [90, 140, 75, 180, 100]) {
      const before = transport.position();
      transport.setBpm(bpm);
      expect(transport.position()).toBeCloseTo(before, 8);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    }
    expect(played.map(item => item.bpm)).toEqual([120, 90, 140, 75, 180, 100]);
    transport.pause();
    expect(vi.getTimerCount()).toBe(0);
    transport.setBpm(110);
    transport.play();
    expect(played[played.length - 1]!.bpm).toBe(110);
    transport.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("trims held notes only for Pause/Seek and preserves a frozen copy", () => {
    const sourceNotes = [{ pitch: 60, startBeat: 0, durationBeats: 4, velocity: 80 }];
    expect(sliceTextNotes(sourceNotes, 1, true)).toMatchObject([{ startBeat: 0, durationBeats: 3 }]);
    expect(sliceTextNotes(sourceNotes, 1, false)).toEqual([]);
    vi.useFakeTimers();
    const { transport, played } = setup();
    const authored = { ...snapshot, notes: sourceNotes };
    transport.play(authored);
    sourceNotes[0]!.pitch = 99;
    transport.seek(1);
    expect(played[1]!.notes[0]!.pitch).toBe(60);
  });
});
