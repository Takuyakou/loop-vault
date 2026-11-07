import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { createAnalysisSession, type AnalysisSession } from "../midi/preAnalysis";
import { buildSplitAnalysisRequest, canSplitPart, type PartSplits } from "./splitSession";
import { chordsAboveLine, singleShareAbove, suggestMelodyFrom, togetherShare } from "./suggestLine";

/**
 * P15-02: 「分けない」 and 「線で分ける」 on a real MIDI (chords and melody in one track, the melody
 * well above the chords). Not part of the normal run:
 *
 *   P15_REAL_MIDI=<a .mid file, or a folder of them> npx vitest run src/domain/preAnalysisParts/realMidiCompare.test.ts
 *
 * Optional: P15_LINE=<MIDI note number> to use that line instead of the suggested one.
 * Prints one table per file (the chord name of every bar, by way). There is no answer key for a real
 * song: the table is what a person reads and judges.
 */
const target = process.env.P15_REAL_MIDI;
const have = Boolean(target && existsSync(target));
const forcedLine = process.env.P15_LINE ? Number(process.env.P15_LINE) : undefined;

function files(): string[] {
  if (!target) return [];
  return statSync(target).isDirectory()
    ? readdirSync(target).filter((name) => /\.mid$/i.test(name)).map((name) => join(target, name))
    : [target];
}

function run(session: AnalysisSession, preset: "standard" | "harmonic-core", splits: PartSplits) {
  const { request } = buildSplitAnalysisRequest({ ...session, voiceContributionPreset: preset }, splits);
  const result = analyzeMidi(request.bytes, request.options);
  const beatsPerBar = Number(result.timeSignature?.split("/")[0] ?? 4) * 4 / Number(result.timeSignature?.split("/")[1] ?? 4);
  return Array.from({ length: result.totalBars }, (_, bar) => {
    const middle = bar * beatsPerBar + beatsPerBar / 2;
    return result.fullTimeline.find((entry) => {
      const start = (entry.bar - 1) * beatsPerBar + entry.beat - 1;
      return start <= middle && start + entry.durationBeats > middle;
    })?.chord.label ?? "-";
  });
}

describe.skipIf(!have)("a real MIDI: 分けない と 線で分ける", () => {
  for (const path of files()) {
    it(path, () => {
      const created = createAnalysisSession([{
        sourceId: "real",
        displayName: path.split(/[\\/]/).pop()!,
        bytes: new Uint8Array(readFileSync(path)),
      }]);
      const session = created.session!;
      const parts = session.voices.filter(canSplitPart);
      const target = parts.sort((a, b) => b.noteCount - a.noteCount)[0];
      expect(target, "a chord part to put a line on").toBeDefined();
      const notes = session.notes.filter((note) => note.voiceId === target!.id);
      const suggested = suggestMelodyFrom(notes);
      const line = forcedLine ?? suggested;
      const splits: PartSplits = line === undefined ? {} : { [target!.id]: { melodyFrom: line } };
      const none = run(session, "standard", {});
      const core = run(session, "harmonic-core", {});
      const lined = run(session, "standard", splits);
      const linedCore = run(session, "harmonic-core", splits);
      const above = line === undefined ? 0 : notes.filter((note) => note.pitch >= line).length;
      const rows = none.map((label, bar) => `${String(bar + 1).padStart(3)} | ${label.padEnd(10)} | ${core[bar]!.padEnd(10)} | ${lined[bar]!.padEnd(10)} | ${linedCore[bar]!.padEnd(10)}${label === lined[bar] ? "" : "  ←違う"}`);
      const changed = none.filter((label, bar) => label !== lined[bar]).length;
      console.log([
        `P15 REAL ${session.sources[0]!.displayName}`,
        `part=${target!.displayName} notes=${notes.length} range=${target!.minPitch}-${target!.maxPitch} suggestedLine=${suggested ?? "なし"} usedLine=${line ?? "なし"} notesAboveLine=${above} (${notes.length ? Math.round(above / notes.length * 100) : 0}%) 線より上で1音ずつ鳴る割合=${line === undefined ? "-" : Math.round(singleShareAbove(notes, line) * 100) + "%"} 警告=${line === undefined ? "-" : chordsAboveLine(notes, line) ? "出る" : "出ない"} 同時に始まる割合=${line === undefined ? "-" : Math.round(togetherShare(notes, line) * 100) + "%"}`,
        `bars=${none.length} 名前が変わった小節=${changed}`,
        "bar | 分けない   | アプリに任せる | 線で分ける | 線＋アプリに任せる",
        ...rows,
      ].join("\n"));
      expect(none.length).toBeGreaterThan(0);
    });
  }
});
