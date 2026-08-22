import type { ChordTimelineItem } from "./types";

export type HarmonicActivityLevel = "inactive" | "low" | "medium" | "high";

export interface HarmonicActivityBar {
  bar: number;
  normalized: number;
  level: HarmonicActivityLevel;
}

export function harmonicActivityLevel(normalized: number): HarmonicActivityLevel {
  if (!(normalized > 0)) return "inactive";
  if (normalized <= 0.25) return "low";
  if (normalized <= 0.75) return "medium";
  return "high";
}

export function buildTimelineHarmonicActivity(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  beatsPerBar: number,
): HarmonicActivityBar[] {
  if (
    !Number.isFinite(totalBars)
    || !Number.isFinite(beatsPerBar)
    || totalBars <= 0
    || beatsPerBar <= 0
  ) {
    return [];
  }

  const barCount = Math.floor(totalBars);
  const overlapByBar = Array.from({ length: barCount }, () => 0);

  for (const event of timeline) {
    if (
      !Number.isFinite(event.bar)
      || !Number.isFinite(event.beat)
      || !Number.isFinite(event.durationBeats)
      || event.bar < 1
      || event.beat < 1
      || event.durationBeats <= 0
    ) {
      continue;
    }

    const eventStart = (event.bar - 1) * beatsPerBar + event.beat - 1;
    const eventEnd = eventStart + event.durationBeats;
    const firstBarIndex = Math.max(0, Math.floor(eventStart / beatsPerBar));
    const lastBarIndex = Math.min(
      barCount - 1,
      Math.ceil(eventEnd / beatsPerBar) - 1,
    );

    for (let barIndex = firstBarIndex; barIndex <= lastBarIndex; barIndex += 1) {
      const barStart = barIndex * beatsPerBar;
      const barEnd = barStart + beatsPerBar;
      overlapByBar[barIndex]! += Math.max(
        0,
        Math.min(barEnd, eventEnd) - Math.max(barStart, eventStart),
      );
    }
  }

  return overlapByBar.map((overlapBeats, index) => {
    const normalized = Math.min(1, Math.max(0, overlapBeats / beatsPerBar));
    return {
      bar: index + 1,
      normalized,
      level: harmonicActivityLevel(normalized),
    };
  });
}
