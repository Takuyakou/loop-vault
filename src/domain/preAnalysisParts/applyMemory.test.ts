import { writeMidi, type MidiEvent } from "midi-file";
import { beforeEach, describe, expect, it } from "vitest";
import { createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import {
  findPreAnalysisMemory,
  memoryEntryFor,
  preAnalysisSignature,
  rememberPreAnalysis,
} from "../../storage/preAnalysisMemory";
import { applyPreAnalysisMemory } from "./applyMemory";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function session(options: { name?: string; melody?: boolean } = {}): AnalysisSession {
  const melody = options.melody ?? true;
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (channel: number, pitch: number, start: number, dur: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel, noteNumber: pitch, velocity: 80 } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 8; bar += 1) {
    for (const pitch of [48, 55, 64, 71]) add(0, pitch, bar * 4, 4);
    add(1, 36 + (bar % 2) * 5, bar * 4, 4);
    if (melody) [86, 89, 93, 89].forEach((pitch, index) => add(0, pitch, bar * 4 + index, 1));
  }
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: options.name ?? "Secret Song" },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
  ];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const bytes = Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
  return createAnalysisSession([{ sourceId: "s", displayName: `${options.name ?? "Secret Song"}.mid`, bytes }]).session!;
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe("前回と同じ設定", () => {
  it("keeps only the shape of the parts and what was chosen: no file name, no track name, no height of a line", () => {
    const base = session();
    const chord = base.voices.find((voice) => voice.channel === 0)!;
    const entry = memoryEntryFor(
      { ...base, voices: base.voices.map((voice) => voice.id === chord.id ? { ...voice, assignedRole: "melody-weak" as const } : voice) },
      { [chord.id]: { melodyFrom: 81 } },
      "harmonic-core",
    );
    rememberPreAnalysis(entry);
    const stored = (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.getItem("loopvault.preAnalysisMemory")!;
    expect(stored).not.toContain("Secret");
    expect(stored).not.toContain("81");
    expect(stored).not.toMatch(/\.mid|trackName|displayName/);
    expect(JSON.parse(stored).entries[0].parts.some((part: { line: boolean }) => part.line)).toBe(true);
  });

  it("matches a song made the same way, and not one made another way", () => {
    const first = session({ name: "A" });
    rememberPreAnalysis(memoryEntryFor(first, {}, "standard"));
    expect(findPreAnalysisMemory(session({ name: "B" }))).toBeDefined();
    const bytes = Uint8Array.from(writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { deltaTime: 0, type: "programChange", channel: 3, programNumber: 40 },
        { deltaTime: 0, type: "noteOn", channel: 3, noteNumber: 60, velocity: 90 },
        { deltaTime: 480, type: "noteOff", channel: 3, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ]],
    }));
    const other = createAnalysisSession([{ sourceId: "o", displayName: "o.mid", bytes }]).session!;
    expect(preAnalysisSignature(other)).not.toBe(preAnalysisSignature(first));
    expect(findPreAnalysisMemory(other)).toBeUndefined();
  });

  it("applies the roles of last time, and gives a part that had a line the line this song suggests", () => {
    const old = session({ name: "Old" });
    const part = old.voices.find((voice) => voice.channel === 0)!;
    const entry = memoryEntryFor(old, { [part.id]: { melodyFrom: 60 } }, "harmonic-core"); // 60: not this song's line
    const fresh = session({ name: "New" });
    const applied = applyPreAnalysisMemory(fresh, {}, entry);
    expect(applied.changed).toBe(true);
    expect(applied.session.voiceContributionPreset).toBe("harmonic-core");
    expect(applied.session.preset).toBe("custom");
    const id = fresh.voices.find((voice) => voice.channel === 0)!.id;
    expect(applied.splits[id]?.melodyFrom).toBe(86);
    expect(applied.splits[id]?.melodyFrom).not.toBe(60);
    // the original session is untouched
    expect(fresh.preset).toBe("auto");
  });

  it("gives no line when this song suggests none", () => {
    const old = session({ name: "Old" });
    const entry = memoryEntryFor(old, { [old.voices[0]!.id]: { melodyFrom: 83 } }, "standard");
    const applied = applyPreAnalysisMemory(session({ name: "New", melody: false }), {}, entry);
    expect(applied.splits).toEqual({});
  });

  it("says nothing changed when last time is what the screen already has", () => {
    const base = session();
    const entry = memoryEntryFor(base, {}, "standard");
    expect(applyPreAnalysisMemory(base, {}, entry).changed).toBe(false);
  });
});
