/** Public authored patterns composed into deterministic full-chart acceptance input. */
const bars = [
  "C",
  "G#m7/C# _ F7-5 = % Fm7-5 F7+9 _",
  "C C Dm7 _ G7/B % = _",
  "Fdim",
  "C+ _ F7+11 % = G7/B _ C",
] as const;

export function extendedTextSyntheticChart(barCount: number): {
  readonly source: string;
  readonly expectedSlots: number;
} {
  if (!Number.isInteger(barCount) || barCount < 1 || barCount > 256) {
    throw new RangeError("Synthetic chart bar count is outside the authored test range.");
  }
  const selected = Array.from({ length: barCount }, (_, index) => bars[index % bars.length]!);
  const midpoint = Math.floor(selected.length / 2);
  const scoreLine = (values: readonly string[]) => "| " + values.join(" | ") + " |";
  return {
    source: [
      "# Public synthetic full-chart acceptance",
      "<",
      scoreLine(selected.slice(0, midpoint)),
      "# Synthetic section marker",
      scoreLine(selected.slice(midpoint)),
      ">",
    ].join("\n"),
    expectedSlots: selected.reduce((total, bar) => total + bar.split(" ").length, 0),
  };
}
