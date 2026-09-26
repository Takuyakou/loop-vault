import type {
  ExtendedTextResult,
  ExtendedTextReasonCode,
  TextSourceRange,
} from "./extendedTextProgression";

export interface TextPreviewAttack {
  readonly percent: number;
  readonly kind: "written" | "repeat";
  readonly sourceSpan: TextSourceRange;
}
export interface TextPreviewBand {
  readonly writtenChord: string;
  readonly left: number;
  readonly width: number;
  readonly sourceSpan: TextSourceRange;
  readonly attacks: readonly TextPreviewAttack[];
}
export interface TextPreviewRest {
  readonly left: number;
  readonly width: number;
  readonly sourceSpan: TextSourceRange;
}
export interface TextPreviewBar {
  readonly number: number;
  readonly sourceSpan: TextSourceRange;
  readonly raw: string;
  readonly bands: readonly TextPreviewBand[];
  readonly rests: readonly TextPreviewRest[];
  readonly error?: ExtendedTextReasonCode;
}
export type TextPreviewItem =
  | { readonly kind: "annotation"; readonly text: string; readonly sourceSpan: TextSourceRange; readonly counted: boolean }
  | { readonly kind: "row"; readonly bars: readonly TextPreviewBar[] };

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

/** A score presentation of parser facts. No chord guessing, resegmentation or text search. */
export function buildTextPreviewScore(result: ExtendedTextResult): readonly TextPreviewItem[] {
  const beatsPerBar = result.beatsPerBar;
  const bandsByBar: TextPreviewBand[][] = Array.from({ length: result.bars.length }, () => []);
  const restsByBar: TextPreviewRest[][] = Array.from({ length: result.bars.length }, () => []);
  for (const span of result.harmonicSpans) {
    const first = Math.floor(span.startBeat / beatsPerBar);
    const last = Math.min(result.bars.length - 1,
      Math.floor((span.startBeat + span.durationBeats - 1e-9) / beatsPerBar));
    for (let index = first; index <= last; index += 1) {
      const barStart = index * beatsPerBar;
      const clipStart = Math.max(barStart, span.startBeat);
      const clipEnd = Math.min(barStart + beatsPerBar, span.startBeat + span.durationBeats);
      if (clipEnd <= clipStart) continue;
      bandsByBar[index]!.push({
        writtenChord: span.writtenChord,
        left: clampPercent((clipStart - barStart) / beatsPerBar * 100),
        width: clampPercent((clipEnd - clipStart) / beatsPerBar * 100),
        sourceSpan: span.sourceSpan,
        attacks: span.attacks.filter(attack => attack.beat >= clipStart && attack.beat < clipEnd)
          .map(attack => ({
            percent: clampPercent((attack.beat - clipStart) / (clipEnd - clipStart) * 100),
            kind: attack.kind,
            sourceSpan: attack.span,
          })),
      });
    }
  }
  for (const slot of result.slots) if (slot.kind === "rest") {
    restsByBar[slot.bar - 1]?.push({
      left: clampPercent((slot.startBeat - 1) / beatsPerBar * 100),
      width: clampPercent(slot.durationBeats / beatsPerBar * 100),
      sourceSpan: slot.span,
    });
  }
  const bars: TextPreviewBar[] = result.bars.map((_tokens, index) => {
    const sourceSpan = result.barSourceSpans[index] ?? { start: 0, end: 0 };
    const error = result.diagnostics.find(issue => issue.severity === "ERROR"
      && issue.span.start < sourceSpan.end && issue.span.end > sourceSpan.start);
    return {
      number: index + 1, sourceSpan, raw: result.source.slice(sourceSpan.start, sourceSpan.end),
      bands: bandsByBar[index]!, rests: restsByBar[index]!,
      ...(error === undefined ? {} : { error: error.reasonCode }),
    };
  });
  const annotations = result.sections.filter(section => section.kind === "comment"
    && !/^\s*#\s*(Key|BPM)\s*:/i.test(section.raw))
    .map(section => ({
      kind: "annotation" as const,
      text: section.raw.trim().replace(/^#\s*/, ""),
      sourceSpan: section.span,
      counted: true,
    }));
  const items: TextPreviewItem[] = [];
  let row: TextPreviewBar[] = [];
  let annotationIndex = 0;
  const flush = () => {
    if (row.length) items.push({ kind: "row", bars: row });
    row = [];
  };
  for (const bar of bars) {
    while (annotationIndex < annotations.length
      && annotations[annotationIndex]!.sourceSpan.start < bar.sourceSpan.start) {
      flush();
      items.push(annotations[annotationIndex]!);
      annotationIndex += 1;
    }
    row.push(bar);
    if (row.length === 4) flush();
  }
  flush();
  while (annotationIndex < annotations.length) {
    items.push(annotations[annotationIndex]!);
    annotationIndex += 1;
  }
  return items;
}
