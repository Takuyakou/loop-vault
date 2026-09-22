import { analyzeMidi } from "../../src/domain/midi/analysis";
import { presentationConsumerModel } from "../../src/domain/midi/presentationGrouping";
import { stage03ProductionAggregate } from "./stage03ProductionAudit";

export interface Stage04PerformanceAggregate {
  iterations: number;
  offMedianMs: number;
  onMedianMs: number;
  absoluteMedianDeltaMs: number;
  offMinMs: number;
  onMinMs: number;
  offMaxMs: number;
  onMaxMs: number;
}

export interface Stage04HardeningAggregate {
  consumerEffectiveness: boolean;
  consumerFormattedTextMatches: boolean;
  consumerPresentationGroupCount: number;
  consumerCardCount: number;
  consumerSourceReferencesExact: boolean;
  blockTopologyCoherent: boolean;
  maxPresentationGroupBeats: number;
  variableDurationPresentationGroups: boolean;
  defaultEqualsExplicitOn: boolean;
  explicitOffHasNoProjection: boolean;
  sourceTruthUnchanged: boolean;
  sourceCandidatesUnchanged: boolean;
  promotedShadowParity: boolean;
  deterministic: boolean;
  performance: Stage04PerformanceAggregate;
}

/** Privacy-safe Stage04 aggregate. Never emits paths, filenames, MIDI bytes,
 * fingerprints, chord labels, formatted text, summaries, or raw notes. */
export function stage04HardeningAggregate(
  bytes: Uint8Array,
  iterations = 9,
): Stage04HardeningAggregate {
  const count = Math.max(3, Math.floor(iterations));
  const explicitOff = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const explicitOn = analyzeMidi(bytes, { enablePresentationGrouping: true });
  const defaultOn = analyzeMidi(bytes);
  const projection = explicitOn.presentationGrouping!;
  const consumers = presentationConsumerModel(explicitOn);
  const stage03 = stage03ProductionAggregate(bytes);

  const consumerFormattedTextMatches = consumers?.formattedText === projection.formattedText;
  const consumerSourceReferencesExact = consumers?.cards.every((card) =>
    card.sourceCandidate === explicitOn.blockCandidates[card.sourceCandidateIndex]
    && card.presentationBlock === projection.projectedBlocks[
      consumers.cards.indexOf(card)
    ]
  ) ?? false;
  const blockTopologyCoherent = projection.projectedBlocks.every((block) =>
    explicitOn.blockCandidates[block.sourceCandidateIndex] !== undefined
    && block.startGroupIndex >= 0
    && block.endGroupIndex >= block.startGroupIndex
    && block.absoluteEndBeat > block.absoluteStartBeat
    && block.events.every((event, index) =>
      event.relativeStartBeat >= 0
      && event.relativeStartBeat < block.absoluteEndBeat - block.absoluteStartBeat
      && (index === 0 || event.relativeStartBeat >= block.events[index - 1]!.relativeStartBeat)
    )
    && block.summaryText === `| ${block.cells.map((cell) => cell.text).join(" | ")} |`
  );
  const groupDurations = projection.groups.map((group) =>
    group.absoluteEndBeat - group.absoluteStartBeat);

  for (let index = 0; index < 3; index += 1) {
    analyzeMidi(bytes, { enablePresentationGrouping: false });
    analyzeMidi(bytes, { enablePresentationGrouping: true });
  }
  const offSamples: number[] = [];
  const onSamples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const order = index % 2 === 0 ? [false, true] : [true, false];
    for (const enabled of order) {
      const startedAt = performance.now();
      analyzeMidi(bytes, { enablePresentationGrouping: enabled });
      const duration = performance.now() - startedAt;
      (enabled ? onSamples : offSamples).push(duration);
    }
  }
  const offMedianMs = median(offSamples);
  const onMedianMs = median(onSamples);

  return {
    consumerEffectiveness:
      consumers !== undefined
      && consumerFormattedTextMatches
      && consumers.presentationGroupCount === projection.groups.length
      && consumers.cards.length === projection.projectedBlocks.length
      && consumerSourceReferencesExact,
    consumerFormattedTextMatches,
    consumerPresentationGroupCount: consumers?.presentationGroupCount ?? 0,
    consumerCardCount: consumers?.cards.length ?? 0,
    consumerSourceReferencesExact,
    blockTopologyCoherent,
    maxPresentationGroupBeats: Math.max(0, ...groupDurations),
    variableDurationPresentationGroups: new Set(groupDurations).size > 1,
    defaultEqualsExplicitOn: JSON.stringify(defaultOn) === JSON.stringify(explicitOn),
    explicitOffHasNoProjection: !("presentationGrouping" in explicitOff),
    sourceTruthUnchanged: stage03.sourceTruthUnchanged,
    sourceCandidatesUnchanged: stage03.sourceCandidatesUnchanged,
    promotedShadowParity: stage03.promotedShadowParity,
    deterministic: stage03.deterministic,
    performance: {
      iterations: count,
      offMedianMs,
      onMedianMs,
      absoluteMedianDeltaMs: onMedianMs - offMedianMs,
      offMinMs: Math.min(...offSamples),
      onMinMs: Math.min(...onSamples),
      offMaxMs: Math.max(...offSamples),
      onMaxMs: Math.max(...onSamples),
    },
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}
