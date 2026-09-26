import type { TextProgressionParseResult, TextProgressionToken } from "./textProgression";
import type { TextPreviewBand, TextPreviewBar, TextPreviewItem, TextPreviewRest } from "./textPreviewScore";

/** Present Standard's existing 4/4 parser facts with the Extended score primitives. */
export function buildStandardTextPreviewScore(result: TextProgressionParseResult): readonly TextPreviewItem[] {
  const tokensByBar = new Map<number, TextProgressionToken[]>();
  for (const token of result.tokens) {
    const list = tokensByBar.get(token.bar) ?? [];
    list.push(token);
    tokensByBar.set(token.bar, list);
  }
  const bandsByBar: TextPreviewBand[][] = Array.from({ length: result.bars }, () => []);
  const restsByBar: TextPreviewRest[][] = Array.from({ length: result.bars }, () => []);
  let lastWrittenChord = "";
  for (const event of result.events) {
    const writtenChord = event.raw === "%" ? lastWrittenChord || event.canonical : event.raw;
    if (event.raw !== "%") lastWrittenChord = event.raw;
    const start = (event.bar - 1) * 4 + event.startBeat - 1;
    const end = start + event.durationBeats;
    for (let bar = event.bar; bar <= result.bars && (bar - 1) * 4 < end; bar += 1) {
      const barStart = (bar - 1) * 4;
      const clipStart = Math.max(start, barStart);
      const clipEnd = Math.min(end, barStart + 4);
      if (clipEnd <= clipStart) continue;
      bandsByBar[bar - 1]!.push({
        writtenChord,
        left: (clipStart - barStart) * 25,
        width: (clipEnd - clipStart) * 25,
        sourceSpan: event.range,
        attacks: start >= clipStart && start < clipEnd ? [{
          percent: (start - clipStart) / (clipEnd - clipStart) * 100,
          kind: event.raw === "%" ? "repeat" : "written",
          sourceSpan: event.range,
        }] : [],
      });
    }
  }
  for (const token of result.tokens) if (token.raw === "_"
    && token.startBeat !== undefined && token.durationBeats !== undefined) {
    restsByBar[token.bar - 1]?.push({
      left: (token.startBeat - 1) * 25,
      width: token.durationBeats * 25,
      sourceSpan: token.range,
    });
  }
  const bars: TextPreviewBar[] = Array.from({ length: result.bars }, (_, index) => {
    const number = index + 1;
    const tokens = tokensByBar.get(number) ?? [];
    const issues = result.diagnostics.filter(issue => issue.bar === number);
    const start = Math.min(...tokens.map(token => token.range.start), ...issues.map(issue => issue.range.start));
    const end = Math.max(...tokens.map(token => token.range.end), ...issues.map(issue => issue.range.end));
    const sourceSpan = Number.isFinite(start) && Number.isFinite(end)
      ? { start, end } : { start: 0, end: 0 };
    return {
      number, sourceSpan, raw: result.input.slice(sourceSpan.start, sourceSpan.end),
      bands: bandsByBar[index]!, rests: restsByBar[index]!,
      ...(issues.length ? { error: "INVALID_STRUCTURE" as const } : {}),
    };
  });
  const items: TextPreviewItem[] = [];
  for (let index = 0; index < bars.length; index += 4) {
    items.push({ kind: "row", bars: bars.slice(index, index + 4) });
  }
  return items;
}
