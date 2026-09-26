import {
  EXTENDED_TEXT_PARSER_VERSION,
  EXTENDED_TEXT_SEMANTIC_POLICY,
  type ExtendedTextResult,
  type TextSourceRange,
} from "./extendedTextProgression";

export const TEXT_GENERATED_VOICING_POLICY = "generated-close-v1";

export interface SavedTextSourceV1 {
  readonly schemaVersion: 1;
  readonly dialect: "extended-v1";
  readonly rawText: string;
  readonly parserVersion: string;
  readonly semanticPolicyVersion: string;
  readonly generatedVoicingPolicyId: string;
  readonly metadata: {
    readonly beat: string;
    readonly key?: string;
    readonly bpm?: number;
    readonly capo?: number;
  };
  readonly sections: readonly {
    readonly kind: "comment" | "playback-start" | "playback-end";
    readonly line: number;
    readonly span: TextSourceRange;
    readonly raw: string;
  }[];
  readonly slots: readonly {
    readonly raw: string;
    readonly span: TextSourceRange;
    readonly bar: number;
    readonly slot: number;
    readonly startBeat: number;
    readonly durationBeats: number;
    readonly kind: "attack" | "reattack" | "hold" | "rest";
    readonly chordLabel?: string;
  }[];
  readonly harmonicSpans: readonly {
    readonly writtenChord: string;
    readonly semanticAlterations?: readonly ("b5")[];
    readonly chordLabel: string;
    readonly startBeat: number;
    readonly durationBeats: number;
    readonly sourceSpan: TextSourceRange;
    readonly attacks: readonly {
      readonly beat: number;
      readonly kind: "written" | "repeat";
      readonly span: TextSourceRange;
    }[];
  }[];
}

export function buildSavedTextSource(result: ExtendedTextResult): SavedTextSourceV1 {
  if (!result.canConvert) throw new Error("A complete extended text result is required.");
  return {
    schemaVersion: 1,
    dialect: "extended-v1",
    rawText: result.source,
    parserVersion: EXTENDED_TEXT_PARSER_VERSION,
    semanticPolicyVersion: EXTENDED_TEXT_SEMANTIC_POLICY,
    generatedVoicingPolicyId: TEXT_GENERATED_VOICING_POLICY,
    metadata: {
      beat: `${result.beatsPerBar}/4`,
      ...(result.metadata.confirmed && result.metadata.key ? { key: result.metadata.key } : {}),
      ...(result.metadata.bpm === undefined ? {} : { bpm: result.metadata.bpm }),
      ...(result.metadata.capo === undefined ? {} : { capo: result.metadata.capo }),
    },
    sections: result.sections.map(section => ({ ...section, span: { ...section.span } })),
    slots: result.slots.map(slot => ({
      raw: slot.raw,
      span: { ...slot.span },
      bar: slot.bar,
      slot: slot.slot,
      startBeat: slot.startBeat,
      durationBeats: slot.durationBeats,
      kind: slot.kind,
      ...(slot.chord === undefined ? {} : { chordLabel: slot.chord.label }),
    })),
    harmonicSpans: result.harmonicSpans.map(span => ({
      writtenChord: span.writtenChord,
      ...(span.semanticAlterations === undefined ? {} : { semanticAlterations: [...span.semanticAlterations] }),
      chordLabel: span.chord.label,
      startBeat: span.startBeat,
      durationBeats: span.durationBeats,
      sourceSpan: { ...span.sourceSpan },
      attacks: span.attacks.map(attack => ({ beat: attack.beat, kind: attack.kind, span: { ...attack.span } })),
    })),
  };
}
