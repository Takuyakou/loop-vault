import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { buildSessionAnalysisRequest, createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import { deriveSplitSession } from "./splitSession";
import { suggestMelodyFrom } from "./suggestLine";

/**
 * P15-02 investigation (案4): the notes above the line are handed to the analysis as `exclude` (they are
 * simply not passed), and put back for display afterwards. This runs the gate's three songs and a
 * more realistic melody through the real analysis with 「線より上 = exclude」.
 */
const CHORDS = [
  { label: "Cmaj7", root: 0, lh: [48, 55], rh: [64, 71], far: [86, 89, 93, 89], mixed: [88, 86, 91, 89], near: [69, 67, 64, 62] },
  { label: "Am7", root: 9, lh: [45, 52], rh: [60, 67], far: [83, 86, 89, 86], mixed: [84, 83, 88, 86], near: [67, 64, 62, 60] },
  { label: "Dm7", root: 2, lh: [50, 57], rh: [65, 72], far: [88, 91, 95, 91], mixed: [89, 88, 93, 91], near: [72, 69, 65, 64] },
  { label: "G7", root: 7, lh: [43, 50], rh: [59, 65], far: [81, 84, 88, 84], mixed: [83, 81, 86, 84], near: [71, 67, 65, 62] },
];
type Kind = "far" | "mixed" | "near" | "none";

function build(kind: Kind): { bytes: Uint8Array; labels: string[]; roots: number[] } {
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  const labels: string[] = [];
  const roots: number[] = [];
  for (let bar = 0; bar < 8; bar += 1) {
    const c = CHORDS[bar % 4]!;
    labels.push(c.label);
    roots.push(c.root);
    for (const p of [...c.lh, ...c.rh]) add(p, bar * 4, 4, 70);
    if (kind !== "none") c[kind].forEach((p, i) => add(p, bar * 4 + i, 1, 100 + i));
  }
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return { bytes: Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] })), labels, roots };
}

function labelsOf(session: AnalysisSession, preset: "standard" | "harmonic-core", line: number | undefined, upper: "melody-weak" | "exclude") {
  const base: AnalysisSession = { ...session, voiceContributionPreset: preset };
  let target: AnalysisSession = base;
  if (line !== undefined) {
    const derived = deriveSplitSession(base, { [base.voices[0]!.id]: { melodyFrom: line } }).session;
    target = {
      ...derived,
      voices: derived.voices.map((voice) => voice.id.endsWith("~upper")
        ? { ...voice, assignedRole: upper, included: upper !== "exclude" }
        : voice),
    };
  }
  const request = buildSessionAnalysisRequest(target);
  const result = analyzeMidi(request.bytes, request.options);
  return Array.from({ length: 8 }, (_, bar) => {
    const middle = bar * 4 + 2;
    return result.fullTimeline.find((entry) => {
      const start = (entry.bar - 1) * 4 + entry.beat - 1;
      return start <= middle && start + entry.durationBeats > middle;
    })?.chord;
  });
}

describe("案4 investigation: 線より上 = exclude", () => {
  const rows: Array<Record<string, string>> = [];
  const accuracy = new Map<string, number>();
  for (const [name, kind] of [["離れた・全部コード外の音", "far"], ["離れた・現実的（半々）", "mixed"], ["重なる", "near"], ["コードだけ", "none"]] as const) {
    const { bytes, labels, roots } = build(kind);
    const session = createAnalysisSession([{ sourceId: "s", displayName: `${name}.mid`, bytes }]).session!;
    const own = session.notes.filter((note) => note.voiceId === session.voices[0]!.id);
    const line = suggestMelodyFrom(own);
    const runs: Array<[string, "standard" | "harmonic-core", "melody-weak" | "exclude", boolean]> = [
      ["分けない", "standard", "melody-weak", false],
      ["アプリに任せる", "harmonic-core", "melody-weak", false],
      ["線（今：melody-weak）", "standard", "melody-weak", true],
      ["線＋上をexclude", "standard", "exclude", true],
      ["線＋上をexclude＋アプリに任せる", "harmonic-core", "exclude", true],
    ];
    for (const [method, preset, upper, useLine] of runs) {
      const chords = labelsOf(session, preset, useLine ? line : undefined, upper);
      const exact = chords.filter((chord, index) => chord?.label === labels[index]).length / 8;
      const root = chords.filter((chord, index) => chord?.root === roots[index]).length / 8;
      accuracy.set(`${name}|${method}`, exact);
      rows.push({
        合成データ: name,
        方式: method,
        線: useLine ? String(line ?? "なし") : "-",
        根音: `${Math.round(root * 100)}%`,
        コード名: `${Math.round(exact * 100)}%`,
        結果: chords.map((chord) => chord?.label ?? "-").join(" "),
      });
    }
  }
  it("prints the table", () => {
    console.log(rows.map((row) => Object.values(row).join(" | ")).join("\n"));
    expect(rows.length).toBe(20);
  });
  it("far from the chords: exclude reaches 100%", () => {
    expect(accuracy.get("離れた・全部コード外の音|線＋上をexclude")).toBe(1);
  });
});
