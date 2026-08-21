// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { extractSourceBasslineSnapshot } from "../domain/sourceBassline";
import type { SavedProgressionBlock } from "../domain/types";
import { SourceBasslineStatus } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const base: SavedProgressionBlock = {
  id: "block",
  summaryText: "Synthetic",
  chords: [],
  tags: [],
  capturedAt: "2026-08-21T00:00:00.000Z",
  analyzerVersion: "synthetic",
};
const sourceBassline = extractSourceBasslineSnapshot({
  selectedSourceId: "source",
  selectedVoiceId: "voice",
  notes: [{
    sourceId: "source",
    voiceId: "voice",
    pitch: 36,
    velocity: 0.8,
    startTick: 0,
    durationTick: 480,
    ticksPerQuarter: 480,
  }],
  range: {
    authority: "raw-integer-ticks",
    constantMeterProven: true,
    barAlignmentProven: true,
    sourceId: "source",
    startTick: 0,
    endTick: 1920,
    sourceEndTick: 1920,
    ticksPerQuarter: 480,
    meter: { numerator: 4, denominator: 4 },
  },
});
const sourceBasslineWithHarmony = extractSourceBasslineSnapshot({
  selectedSourceId: "source",
  selectedVoiceId: "voice",
  notes: [
    {
      sourceId: "source",
      voiceId: "voice",
      pitch: 36,
      velocity: 0.8,
      startTick: 0,
      durationTick: 480,
      ticksPerQuarter: 480,
    },
    {
      sourceId: "source",
      voiceId: "voice",
      pitch: 40,
      velocity: 0.7,
      startTick: 0,
      durationTick: 960,
      ticksPerQuarter: 480,
    },
  ],
  range: {
    authority: "raw-integer-ticks",
    constantMeterProven: true,
    barAlignmentProven: true,
    sourceId: "source",
    startTick: 0,
    endTick: 1920,
    sourceEndTick: 1920,
    ticksPerQuarter: 480,
    meter: { numerator: 4, denominator: 4 },
  },
  capturedHarmony: {
    authority: "raw-integer-ticks",
    sourceId: "source",
    rangeStartTick: 0,
    rangeEndTick: 1920,
    ticksPerQuarter: 480,
    spans: [{
      sourceId: "source",
      startTick: 0,
      durationTick: 1920,
      ticksPerQuarter: 480,
      chord: { root: 0, quality: "maj", tensions: [], label: "C" },
    }],
  },
});
const currentChord = {
  bar: 1,
  beat: 1,
  durationBeats: 4,
  chord: { root: 0, quality: "maj" as const, tensions: [], label: "C" },
  confidence: 1,
  alternatives: [],
  warnings: [],
};
let host: HTMLDivElement;
afterEach(() => host?.remove());

function render(block: SavedProgressionBlock, progressionEdited: boolean, language: "ja" | "en") {
  host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(
    <SourceBasslineStatus block={block} progressionEdited={progressionEdited} language={language} />,
  ));
}

describe("Progression Detail source bassline status", () => {
  it("states absence factually for legacy blocks", () => {
    render(base, false, "en");
    expect(host.textContent).toContain("Source bassline: Not saved");
  });

  it("shows count, bars, export inclusion and honest harmony availability", () => {
    render({ ...base, sourceBassline }, false, "ja");
    expect(host.textContent).toContain("元ベースライン: 保存済み");
    expect(host.textContent).toContain("1音・1小節・Vault書き出しに含まれます");
    expect(host.textContent).toContain("保存時の和声比較は利用できません");
    expect(host.textContent).toContain("同時発音なし・重なりなし");
    expect(host.querySelector("[data-harmony-relationship=unavailable]")).not.toBeNull();
  });

  it("discloses that progression edits do not mutate the source snapshot", () => {
    render({ ...base, sourceBassline }, true, "en");
    expect(host.textContent).toContain("saved source bassline remains unchanged");
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
  it("keeps harmony unavailable without exact current authority and compares note facts rationally", () => {
    const rationalFactsSnapshot = {
      ...sourceBasslineWithHarmony,
      notes: [
        {
          ...sourceBasslineWithHarmony.notes[0]!,
          start: { numerator: 1, denominator: 3 },
          duration: { numerator: 1, denominator: 3 },
        },
        {
          ...sourceBasslineWithHarmony.notes[1]!,
          start: { numerator: 2, denominator: 6 },
          duration: { numerator: 1, denominator: 6 },
        },
      ],
    };
    render({
      ...base,
      chords: [currentChord],
      sourceBassline: rationalFactsSnapshot,
    }, false, "en");
    expect(host.querySelector("[data-harmony-relationship=unavailable]")).not.toBeNull();
    expect(host.textContent).toContain("Captured-harmony comparison is unavailable.");
    expect(host.textContent).toContain("Simultaneous notes present");
    expect(host.textContent).toContain("Overlaps present");
  });});
