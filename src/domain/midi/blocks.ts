import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";

export function extractHybridBlocks(timeline: readonly ChordTimelineItem[], totalBars: number): ProgressionBlockCandidate[] {
  const raw: ProgressionBlockCandidate[] = [];
  for (const lengthBars of [4, 8, 16] as const) {
    for (let startBar = 1; startBar + lengthBars - 1 <= totalBars; startBar += 1) {
      const endBar = startBar + lengthBars - 1;
      const chords = timeline.filter((item) => item.bar >= startBar && item.bar <= endBar);
      if (!chords.length) continue;
      const signature = beatGridSignature(chords, startBar, lengthBars);
      const repeatCount = countSimilarRepeats(timeline, totalBars, signature, lengthBars);
      const confidence = average(chords.map((item) => item.confidence));
      raw.push({ id: `hybrid-bars-${startBar}-${endBar}`, startBar, endBar, lengthBars, chords: [...chords],
        summaryText: `| ${signature.filter((_, index) => index % 4 === 0).join(" | ")} |`,
        confidence: clamp(confidence + Math.min(0.16, Math.max(0, repeatCount - 1) * 0.05)),
        ...(repeatCount > 1 ? { repeatCount } : {}),
        labels: repeatCount > 1 ? ["main", ...(lengthBars === 4 ? ["turnaround"] : [])] : [lengthBars === 4 ? "turnaround" : "variation"],
        warnings: [...new Set(chords.flatMap((item) => item.warnings))] });
    }
  }
  const seen = new Set<string>();
  return raw.sort((a, b) => b.confidence - a.confidence || a.startBar - b.startBar).filter((candidate) => {
    const key = beatGridSignature(candidate.chords, candidate.startBar, candidate.lengthBars).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

export function beatGridSignature(chords: readonly ChordTimelineItem[], startBar: number, lengthBars: number): string[] {
  const startBeat = (startBar - 1) * 4;
  return Array.from({ length: lengthBars * 4 }, (_, offset) => {
    const beat = startBeat + offset;
    return chords.find((item) => {
      const itemStart = (item.bar - 1) * 4 + item.beat - 1;
      return beat >= itemStart && beat < itemStart + item.durationBeats;
    })?.chord.label ?? "N.C.";
  });
}

function countSimilarRepeats(timeline: readonly ChordTimelineItem[], totalBars: number, target: string[], lengthBars: number): number {
  let count = 0;
  for (let start = 1; start + lengthBars - 1 <= totalBars; start += 1) {
    const candidate = beatGridSignature(timeline, start, lengthBars);
    const same = candidate.filter((label, index) => label === target[index]).length / Math.max(1, target.length);
    if (same >= 0.82) count += 1;
  }
  return count;
}

function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number): number { return Math.max(0, Math.min(0.92, Number(value.toFixed(4)))); }
