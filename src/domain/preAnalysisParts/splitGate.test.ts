import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import { buildSplitAnalysisRequest, type PartSplits } from "./splitSession";
import { suggestMelodyFrom } from "./suggestLine";

/**
 * P15-02 test 8, the gate: does 「線で分ける」 help? Three ways (分けない / アプリに任せる / 線で分ける) are run
 * through the real analysis on three synthetic songs whose chords are known. The table is printed
 * (and reported). The line has to beat 「分けない」 where the melody is far from the chords, and has to
 * leave a song with no melody exactly as it was.
 */
interface N { pitch: number; start: number; dur: number; vel: number }
interface Song { name: string; notes: N[]; roots: number[]; labels: string[] }

const BARS = 8;
const CHORDS = [
  // C maj7, Am7, Dm7, G7: left hand, right hand, and what the melody plays over it (not chord tones)
  { label: "Cmaj7", root: 0, lh: [48, 55], rh: [64, 71], far: [86, 89, 93, 89], near: [69, 67, 64, 62] },
  { label: "Am7", root: 9, lh: [45, 52], rh: [60, 67], far: [83, 86, 89, 86], near: [67, 64, 62, 60] },
  { label: "Dm7", root: 2, lh: [50, 57], rh: [65, 72], far: [88, 91, 95, 91], near: [72, 69, 65, 64] },
  { label: "G7", root: 7, lh: [43, 50], rh: [59, 65], far: [81, 84, 88, 84], near: [71, 67, 65, 62] },
];

function song(name: string, melody: "far" | "near" | "none"): Song {
  const notes: N[] = [];
  const roots: number[] = [];
  const labels: string[] = [];
  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = CHORDS[bar % CHORDS.length]!;
    roots.push(chord.root);
    labels.push(chord.label);
    for (const pitch of [...chord.lh, ...chord.rh]) {
      notes.push({ pitch, start: bar * 4, dur: 4, vel: 70 });
    }
    if (melody !== "none") {
      chord[melody].forEach((pitch, index) => {
        notes.push({ pitch, start: bar * 4 + index, dur: 1, vel: 110 });
      });
    }
  }
  return { name, notes, roots, labels };
}

function midiBytes(notes: readonly N[]): Uint8Array {
  const ticks = 480;
  const events: Array<{ at: number; event: MidiEvent }> = [
    { at: 0, event: { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 } },
  ];
  for (const note of notes) {
    events.push({ at: Math.round(note.start * ticks), event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: note.pitch, velocity: note.vel } });
    events.push({ at: Math.round((note.start + note.dur) * ticks) - 1, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: note.pitch, velocity: 0 } });
  }
  events.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
  ];
  for (const { at, event } of events) {
    track.push({ ...event, deltaTime: at - last } as MidiEvent);
    last = at;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: ticks },
    tracks: [track],
  }));
}

type Method = "分けない" | "アプリに任せる" | "線で分ける";

function run(session: AnalysisSession, method: Method, splits: PartSplits) {
  const base = method === "アプリに任せる"
    ? { ...session, voiceContributionPreset: "harmonic-core" as const }
    : session;
  const { request } = buildSplitAnalysisRequest(base, method === "線で分ける" ? splits : {});
  return analyzeMidi(request.bytes, request.options);
}

function perBar(result: ReturnType<typeof analyzeMidi>) {
  const perBarBeats = 4;
  return Array.from({ length: BARS }, (_, bar) => {
    const middle = bar * perBarBeats + 2;
    const item = result.fullTimeline.find((entry) => {
      const start = (entry.bar - 1) * perBarBeats + entry.beat - 1;
      return start <= middle && start + entry.durationBeats > middle;
    });
    return item?.chord;
  });
}

const SONGS = [song("コード+上にメロディ（音域が離れている）", "far"), song("コード+メロディ（音域が重なる）", "near"), song("コードだけ（メロディ無し）", "none")];

describe("P15-02 gate (test 8): three ways on three synthetic songs", () => {
  const table: Array<Record<string, string | number>> = [];
  const results = new Map<string, Record<Method, { root: number; label: number; labels: string[] }>>();

  for (const spec of SONGS) {
    const session = createAnalysisSession([{ sourceId: "s", displayName: `${spec.name}.mid`, bytes: midiBytes(spec.notes) }]).session!;
    expect(session.voices).toHaveLength(1);
    const voice = session.voices[0]!;
    const own = session.notes.filter((note) => note.voiceId === voice.id);
    const line = suggestMelodyFrom(own);
    const splits: PartSplits = line === undefined ? {} : { [voice.id]: { melodyFrom: line } };
    const row = {} as Record<Method, { root: number; label: number; labels: string[] }>;
    for (const method of ["分けない", "アプリに任せる", "線で分ける"] as const) {
      const chords = perBar(run(session, method, splits));
      const root = chords.filter((chord, index) => chord?.root === spec.roots[index]).length / BARS;
      const label = chords.filter((chord, index) => chord?.label === spec.labels[index]).length / BARS;
      row[method] = { root, label, labels: chords.map((chord) => chord?.label ?? "-") };
      table.push({
        合成データ: spec.name,
        方式: method,
        根音の正解率: `${Math.round(root * 100)}%`,
        コード名の正解率: `${Math.round(label * 100)}%`,
        線の位置: method === "線で分ける" ? (line ?? "なし（メロディ無し）") : "-",
        結果: row[method].labels.join(" "),
      });
    }
    results.set(spec.name, row);
  }

  it("prints the table", () => {
    console.table(table);
    expect(table).toHaveLength(9);
  });

  // The notes above the line are left out of the analysis (案4). With them as melody-weak the line gave
  // exactly the result of 「分けない」 (docs/reports/P15-02-gate.md); left out, it reaches the chords-only result.
  it("far from the chords: the line beats 「分けない」", () => {
    const row = results.get(SONGS[0]!.name)!;
    expect(row["線で分ける"].label).toBeGreaterThan(row["分けない"].label);
  });

  it("no melody: no line is suggested and the result is exactly 「分けない」", () => {
    const row = results.get(SONGS[2]!.name)!;
    expect(row["線で分ける"].labels).toEqual(row["分けない"].labels);
  });
});
