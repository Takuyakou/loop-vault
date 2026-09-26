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

function setup(dynamic = false) {
  let clock = 0;
  const sessions: PreviewLifecycleCallbacks[] = [];
  const played: { notes: readonly { pitch: number; startBeat: number; durationBeats: number }[]; bpm: number }[] = [];
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async () => {}), playTimeline: vi.fn(async () => {}),
    playNotes: vi.fn(async (notes, bpm, _sound, callbacks) => {
      played.push({ notes, bpm }); sessions.push(callbacks); callbacks.onStarted?.();
    }),
    updateNotesBpm: dynamic ? vi.fn(() => true) : undefined,
    stop: vi.fn(),
  };
  const controller = createPlaybackController(driver, () => clock);
  const transport = createTextTransport(controller, source, "electric-piano", () => clock);
  return { transport, played, sessions, advance(ms: number) { clock += ms; }, controller, driver };
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

  it("keeps the active audio session and held notes on a supported live tempo update", () => {
    vi.useFakeTimers();
    const { transport, played, advance, driver } = setup(true);
    transport.play(snapshot);
    advance(500);
    const beat = transport.position();
    const stopsBefore = vi.mocked(driver.stop).mock.calls.length;
    transport.setBpm(90);
    expect(transport.position()).toBeCloseTo(beat, 8);
    expect(played).toHaveLength(1);
    expect(vi.mocked(driver.stop).mock.calls.length).toBe(stopsBefore);
    expect(driver.updateNotesBpm).toHaveBeenCalledWith(90);
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

  it("keeps trailing rests in the score after the audio session naturally ends", () => {
    vi.useFakeTimers();
    const { transport, sessions } = setup();
    transport.play({ sourceText: "| C | _ |", beatsPerBar: 4, lengthBeats: 8,
      notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 88 }] });
    sessions[0]!.onEnded?.("completed");
    expect(transport.getState().status).toBe("playing");
    vi.advanceTimersByTime(4000);
    expect(transport.getState().status).toBe("stopped");
  });

  it("advances a valid rest-only score without sending audio notes", () => {
    vi.useFakeTimers();
    const { transport, played, advance } = setup();
    transport.play({ sourceText: "| _ |", notes: [], beatsPerBar: 4, lengthBeats: 4 });
    expect(transport.getState().status).toBe("playing");
    advance(500);
    expect(transport.position()).toBe(1);
    transport.pause();
    expect(transport.getState()).toMatchObject({ status: "paused", positionBeats: 1 });
    transport.play();
    expect(played).toHaveLength(0);
    transport.stop();
    expect(transport.position()).toBe(0);
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
