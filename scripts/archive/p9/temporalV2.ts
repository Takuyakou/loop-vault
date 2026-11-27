import type { SourceEvidenceBundle } from "./temporalSourceEvidence";

export type TemporalHead = "HARMONIC" | "VOICING" | "ORNAMENT_NOTE_EVENT";
export type TemporalSelector = "ALL_LATTICE" | "SCORE_TOPK" | "CORROBORATED" | "STRUCTURAL";
export interface TemporalProposal {
  readonly beat: number;
  readonly head: TemporalHead;
  readonly score: number;
  readonly onsetCount: number;
  readonly offsetCount: number;
  readonly pitchClassChange: number;
  readonly noteNumberChange: number;
  readonly bassChange: boolean;
  readonly shortOnsetCount: number;
  readonly reStrikeCount: number;
}
export interface TemporalProposalBundle {
  readonly sourceEndBeat: number;
  readonly sourceMeter?: string;
  readonly ppq: number;
  readonly proposals: Readonly<Record<TemporalHead, readonly TemporalProposal[]>>;
}
export interface TemporalSelectorPolicy {
  readonly harmonicCut: number;
  readonly voicingCut: number;
  readonly ornamentCut: number;
  readonly corroborationCut: number;
  readonly maxPerBeat: number;
}
export const TEMPORAL_V2_BUDGET = Object.freeze({ maxSourceBeats: 2400, maxProposalsPerHead: 4800 });
/** Initial dev policy; freeze in the stage report after comparing selectors. */
export const TEMPORAL_V2_POLICY: TemporalSelectorPolicy = Object.freeze({
  harmonicCut: 0.5, voicingCut: 0.38, ornamentCut: 0.5,
  corroborationCut: 0.3, maxPerBeat: 2,
});
const pc = (pitch: number) => pitch % 12;
const change = (left: Set<number>, right: Set<number>): number => {
  const union = new Set([...left, ...right]);
  return union.size ? [...union].filter(value => left.has(value) !== right.has(value)).length / union.size : 0;
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
function active(bundle: SourceEvidenceBundle, tick: number): number[] {
  return bundle.notes.filter(note => note.channel !== 9 && note.onsetTick <= tick
    && note.sustainedEndTick > tick).map(note => note.pitch);
}
/** Evidence proposals retain source coordinates; no Gold boundary or identity is assigned. */
export function proposeTemporalHeads(bundle: SourceEvidenceBundle): TemporalProposalBundle {
  const endTick = Math.max(0, ...bundle.notes.map(note => note.sustainedEndTick));
  const sourceEndBeat = endTick / bundle.ppq;
  if (sourceEndBeat > TEMPORAL_V2_BUDGET.maxSourceBeats) throw Error("Temporal source budget exceeded");
  const ticks = new Set<number>([0]);
  for (const note of bundle.notes) {
    if (note.channel === 9) continue;
    if (note.onsetTick > 0 && note.onsetTick < endTick) ticks.add(note.onsetTick);
    if (note.offsetTick > 0 && note.offsetTick < endTick) ticks.add(note.offsetTick);
  }
  for (let tick = bundle.ppq / 2; tick < endTick; tick += bundle.ppq / 2) ticks.add(Math.round(tick));
  if (ticks.size > TEMPORAL_V2_BUDGET.maxProposalsPerHead) throw Error("Temporal proposal budget exceeded");
  const heads: Record<TemporalHead, TemporalProposal[]> = {
    HARMONIC: [], VOICING: [], ORNAMENT_NOTE_EVENT: [],
  };
  for (const tick of [...ticks].sort((a, b) => a - b)) {
    const before = active(bundle, tick - 1), after = active(bundle, tick);
    const onset = bundle.notes.filter(note => note.channel !== 9 && note.onsetTick === tick);
    const offset = bundle.notes.filter(note => note.channel !== 9 && note.offsetTick === tick);
    const pitchClassChange = change(new Set(before.map(pc)), new Set(after.map(pc)));
    const noteNumberChange = change(new Set(before), new Set(after));
    const bassChange = before.length > 0 && after.length > 0
      && Math.min(...before) % 12 !== Math.min(...after) % 12;
    const shortOnsetCount = onset.filter(note => (note.offsetTick - note.onsetTick) / bundle.ppq <= 0.5).length;
    const reStrikeCount = bundle.notes.filter(note => note.reStruck && note.offsetTick === tick).length;
    const onsetDensity = clamp(onset.length / 4), loneOnset = onset.length === 1 ? 1 : 0;
    const melodyEvidence = onset.length === 1 ? onset[0]!.role.melody : 0;
    const values: Record<TemporalHead, number> = {
      HARMONIC: clamp(0.58 * pitchClassChange + 0.22 * onsetDensity
        + 0.16 * Number(bassChange) + 0.04 * clamp(offset.length / 4)),
      VOICING: clamp(0.55 * noteNumberChange + 0.3 * onsetDensity
        + 0.15 * Number(bassChange)),
      ORNAMENT_NOTE_EVENT: clamp(Math.max(0.5 * loneOnset + 0.3 * Number(shortOnsetCount > 0)
        + 0.2 * melodyEvidence, reStrikeCount > 0 ? 0.7 : 0)),
    };
    for (const head of ["HARMONIC", "VOICING", "ORNAMENT_NOTE_EVENT"] as const) {
      if (tick === 0 && head !== "ORNAMENT_NOTE_EVENT") continue;
      heads[head].push({ beat: tick / bundle.ppq, head, score: values[head],
        onsetCount: onset.length, offsetCount: offset.length, pitchClassChange,
        noteNumberChange, bassChange, shortOnsetCount, reStrikeCount });
    }
  }
  return { sourceEndBeat, sourceMeter: bundle.timeSignature, ppq: bundle.ppq, proposals: heads };
}

/** Bounded selector; short intervals are never discarded by duration alone. */
export function selectTemporalBoundaries(
  source: TemporalProposalBundle,
  head: TemporalHead,
  mode: TemporalSelector,
  policy: TemporalSelectorPolicy = TEMPORAL_V2_POLICY,
): number[] {
  const proposals = source.proposals[head];
  if (mode === "ALL_LATTICE") return proposals.map(row => row.beat);
  const cut = head === "HARMONIC" ? policy.harmonicCut
    : head === "VOICING" ? policy.voicingCut : policy.ornamentCut;
  const max = Math.max(1, Math.min(TEMPORAL_V2_BUDGET.maxProposalsPerHead,
    Math.ceil(source.sourceEndBeat * policy.maxPerBeat)));
  const selected = proposals.filter(row => mode === "SCORE_TOPK" || mode === "STRUCTURAL"
    ? row.score >= cut
    : row.score >= cut || (row.score >= policy.corroborationCut
      && (head === "ORNAMENT_NOTE_EVENT"
        ? row.shortOnsetCount > 0 || row.reStrikeCount > 0
        : row.onsetCount >= 2 && (row.pitchClassChange > 0 || row.noteNumberChange > 0))));
  const bounded = mode === "STRUCTURAL" ? selected.filter(row => head === "HARMONIC"
    ? row.onsetCount >= 1 && (row.pitchClassChange >= 0.4 || row.bassChange)
    : head === "VOICING"
      ? row.onsetCount >= 1 && row.noteNumberChange >= 0.45
      : row.reStrikeCount > 0 || (row.onsetCount === 1 && row.shortOnsetCount > 0)) : selected;
  return bounded.sort((left, right) => right.score - left.score || left.beat - right.beat)
    .slice(0, max).map(row => row.beat).sort((a, b) => a - b);
}
