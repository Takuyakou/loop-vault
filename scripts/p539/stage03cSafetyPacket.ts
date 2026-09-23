/** Stage03c research-only packet. Selection is final-state change, never score or claimed correctness. */
import { randomInt } from "node:crypto";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { ChordTimelineItem } from "../../src/domain/types";
import {
  buildBlindExcerptMidi,
  buildBlindRegionEvidence,
  renderBlindReview,
  type AnonymousRegionId,
  type BlindRegionEvidence,
} from "./groundTruthPacket";
import { parseShadowChordLabel, shadowIdentityKey } from "./shadowRootRelativeIdentity";
import {
  evaluateStage03bInteractions,
  projectedStateAt,
  projectStage03bTimeline,
  type ProjectedStage03bSpan,
  type Stage03bWindowInteraction,
} from "./stage03bInteraction";

export const SAFETY_IDS = ["FC-SAFETY-01", "FC-SAFETY-02", "FC-SAFETY-03"] as const;
export type SafetyId = typeof SAFETY_IDS[number];

export interface ChangedSafetyRegion {
  windowIndex: number;
  changedBeatOffsets: Array<0 | 1>;
}

export interface SafetyChoice {
  origin: "production" | "model-a";
  beatLabels: [string, string];
}

export interface LocalSafetyBinding extends ChangedSafetyRegion {
  id: SafetyId;
  choices: { A: SafetyChoice; B: SafetyChoice };
  conflictingPresentToneInChangedBeat: boolean;
}

export interface SafetyPacket {
  blindRegions: BlindRegionEvidence[];
  localBindings: LocalSafetyBinding[];
  excerpts: Array<{ id: SafetyId; bytes: Uint8Array }>;
  productionBaselineMatchesControl: boolean;
  sourceUnchanged: boolean;
}

/** A changed W2 candidate alone is not a review target: only a final beat-state change is. */
export function selectChangedEndToEndRegions(
  windows: readonly Pick<Stage03bWindowInteraction, "index">[],
  baselineKeyAt: (absoluteBeat: number) => string | null,
  modelAKeyAt: (absoluteBeat: number) => string | null,
  excludedWindowIndices: ReadonlySet<number>,
): ChangedSafetyRegion[] {
  return [...windows].sort((a, b) => a.index - b.index).flatMap((window) => {
    if (excludedWindowIndices.has(window.index)) return [];
    const changedBeatOffsets: Array<0 | 1> = [];
    for (const offset of [0, 1] as const) {
      const beat = window.index * 2 + offset + 0.5;
      const baseline = baselineKeyAt(beat);
      const modelA = modelAKeyAt(beat);
      if (!baseline || !modelA) throw new Error("Final-state evidence unavailable");
      if (baseline !== modelA) changedBeatOffsets.push(offset);
    }
    return changedBeatOffsets.length ? [{ windowIndex: window.index, changedBeatOffsets }] : [];
  });
}

function productionAt(
  timeline: readonly ChordTimelineItem[],
  barLength: number,
  beat: number,
): ChordTimelineItem | null {
  return timeline.find((item) => {
    const start = (item.bar - 1) * barLength + item.beat - 1;
    return start <= beat && beat < start + item.durationBeats;
  }) ?? null;
}

function identityKey(label: string): string {
  const identity = parseShadowChordLabel(label);
  const key = identity && shadowIdentityKey(identity);
  if (!key) throw new Error("Final-state identity unavailable");
  return key;
}

function localLabels(
  windowIndex: number,
  labelAt: (beat: number) => string,
): [string, string] {
  return [labelAt(windowIndex * 2 + 0.5), labelAt(windowIndex * 2 + 1.5)];
}

/** 03a's source-only evidence is reused, with three newly frozen anonymous IDs. */
export function buildSafetyPacket(bytes: Uint8Array, priorWindowIndices: readonly number[]): SafetyPacket {
  if (priorWindowIndices.length !== 2 || new Set(priorWindowIndices).size !== 2) {
    throw new Error("Frozen prior binding unavailable");
  }
  const before = Uint8Array.from(bytes);
  const parsedBefore = parseMidi(bytes);
  const { data, windows } = evaluateStage03bInteractions(bytes);
  const control = projectStage03bTimeline(data, windows, "control");
  const modelA = projectStage03bTimeline(data, windows, "model-a");
  const production = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const barLength = beatsPerBar(data.timeSignature);
  const productionLabelAt = (beat: number) => {
    const label = productionAt(production.fullTimeline, barLength, beat)?.chord.label;
    if (!label) throw new Error("Production final state unavailable");
    return label;
  };
  const modelAStateAt = (beat: number): ProjectedStage03bSpan => {
    const state = projectedStateAt(modelA, beat);
    if (!state) throw new Error("Model A final state unavailable");
    return state;
  };
  const selected = selectChangedEndToEndRegions(
    windows,
    (beat) => identityKey(productionLabelAt(beat)),
    (beat) => modelAStateAt(beat).identityKey,
    new Set(priorWindowIndices),
  );
  if (selected.length !== SAFETY_IDS.length) throw new Error("Expected exactly three safety regions");
  const excluded = new Set(priorWindowIndices);
  const productionBaselineMatchesControl = windows.filter((window) => !excluded.has(window.index)).every((window) => (
    [0.5, 1.5].every((offset) => {
      const beat = window.index * 2 + offset;
      return identityKey(productionLabelAt(beat)) === projectedStateAt(control, beat)?.identityKey;
    })
  ));
  if (!productionBaselineMatchesControl) throw new Error("Production/control projection mismatch");
  const modelALabels = new Map(windows.flatMap((row) => [row.w2, row.b0, row.b1]
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .map((pair) => [pair.expanded.identityKey, pair.expanded.canonicalLabel] as const)));

  const blindRegions = selected.map((region, ordinal) => (
    buildBlindRegionEvidence(data, region.windowIndex * 2, SAFETY_IDS[ordinal] as AnonymousRegionId)
  ));
  const localBindings = selected.map((region, ordinal): LocalSafetyBinding => {
    const row = windows.find((window) => window.index === region.windowIndex);
    if (!row) throw new Error("Selected window unavailable");
    const productionChoice: SafetyChoice = {
      origin: "production",
      beatLabels: localLabels(region.windowIndex, productionLabelAt),
    };
    const modelAChoice: SafetyChoice = {
      origin: "model-a",
      beatLabels: localLabels(region.windowIndex, (beat) => {
        const state = modelAStateAt(beat);
        const label = modelALabels.get(state.identityKey);
        if (!label) throw new Error("Model A label unavailable");
        return label;
      }),
    };
    const choices = randomInt(2) === 0
      ? { A: productionChoice, B: modelAChoice }
      : { A: modelAChoice, B: productionChoice };
    const changedBeatCandidates = region.changedBeatOffsets.map((offset) => (
      offset === 0 ? row.b0?.expanded : row.b1?.expanded
    ));
    return {
      ...region,
      id: SAFETY_IDS[ordinal],
      choices,
      conflictingPresentToneInChangedBeat: changedBeatCandidates.some((candidate) => (
        (candidate?.explanation.conflictingPresentTones.length ?? 0) > 0
      )),
    };
  });
  const excerpts = blindRegions.map((region, ordinal) => ({
    id: SAFETY_IDS[ordinal],
    bytes: buildBlindExcerptMidi(region, data.tempo ?? 120),
  }));
  const sourceUnchanged = before.length === bytes.length && before.every((value, index) => value === bytes[index])
    && JSON.stringify(parseMidi(bytes)) === JSON.stringify(parsedBefore);
  if (!sourceUnchanged) throw new Error("Private source changed during packet generation");
  return { blindRegions, localBindings, excerpts, productionBaselineMatchesControl, sourceUnchanged };
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  ));
}

export function renderSafetySource(regions: readonly BlindRegionEvidence[]): string {
  return renderBlindReview(regions);
}

/** A/B origin is deliberately absent from this page and sealed in a separate local file. */
export function renderSafetyChoices(bindings: readonly LocalSafetyBinding[]): string {
  const sections = bindings.map((binding) => {
    const choice = (letter: "A" | "B") => {
      const labels = binding.choices[letter].beatLabels;
      return `<p>${letter}: first beat ${escape(labels[0])} → second beat ${escape(labels[1])}</p>`;
    };
    return `<section><h2>${escape(binding.id)}</h2>${choice("A")}${choice("B")}<p>Judge the two-beat interpretation from source evidence, not an assumed single whole-window chord. Choose A, B, both plausible, neither, temporal mixture, or insufficient evidence. A/B origins are hidden.</p></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anonymous safety choices</title><style>body{font:16px system-ui;background:#101923;color:#edf5fb;margin:0}main{max-width:900px;margin:auto;padding:24px}section{border:1px solid #426070;border-radius:8px;padding:16px;margin:20px 0}</style></head><body><main><h1>Candidate interpretations</h1><p>Open only after the source-only review. Do not infer correctness from A/B order.</p>${sections}</main></body></html>`;
}
