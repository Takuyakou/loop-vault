import type { ChordTimelineItem } from "./types";

export function formatProgressionText(
  items: readonly ChordTimelineItem[],
  options: { barsPerLine?: number } = {},
): string {
  if (items.length === 0) return "";

  const barsPerLine = options.barsPerLine ?? 4;
  const firstBar = Math.min(...items.map((item) => item.bar));
  const lastBar = Math.max(...items.map((item) => item.bar));
  const lines: string[] = [];

  for (let lineStart = firstBar; lineStart <= lastBar; lineStart += barsPerLine) {
    const lineEnd = Math.min(lastBar, lineStart + barsPerLine - 1);
    const cells: string[] = [];

    for (let bar = lineStart; bar <= lineEnd; bar += 1) {
      cells.push(formatBar(items, bar));
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function formatBar(items: readonly ChordTimelineItem[], bar: number): string {
  const labels = items
    .filter((item) => item.bar === bar)
    .sort((a, b) => a.beat - b.beat)
    .map((item) => item.chord.label);

  return labels.length > 0 ? labels.join(" ") : "-";
}
