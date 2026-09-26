import { performance } from "node:perf_hooks";
import { extendedTextSyntheticChart } from "../../src/domain/__fixtures__/extendedTextSyntheticChart";
import { parseExtendedTextProgression } from "../../src/domain/extendedTextProgression";
import { buildTextPreviewScore } from "../../src/domain/textPreviewScore";

const rounds = 20;
for (const barCount of [70, 150, 200]) {
  const source = extendedTextSyntheticChart(barCount).source;
  const parseMs: number[] = [];
  const previewMs: number[] = [];
  let rows = 0;
  let bars = 0;
  for (let round = 0; round < rounds + 2; round += 1) {
    const parseStart = performance.now();
    const result = parseExtendedTextProgression(source, { beat: "4/4" });
    const previewStart = performance.now();
    const preview = buildTextPreviewScore(result);
    const finished = performance.now();
    if (!result.canConvert) throw new Error("The public synthetic chart did not parse.");
    rows = preview.filter(item => item.kind === "row").length;
    bars = preview.reduce((total, item) => total + (item.kind === "row" ? item.bars.length : 0), 0);
    if (bars !== barCount) throw new Error("Preview omitted a source bar.");
    if (round >= 2) {
      parseMs.push(previewStart - parseStart);
      previewMs.push(finished - previewStart);
    }
  }
  parseMs.sort((a, b) => a - b);
  previewMs.sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({
    bars, rows, samples: rounds,
    parseMedianMs: Number(parseMs[Math.floor(rounds / 2)]!.toFixed(2)),
    parseWorstMs: Number(parseMs[rounds - 1]!.toFixed(2)),
    previewMedianMs: Number(previewMs[Math.floor(rounds / 2)]!.toFixed(2)),
    previewWorstMs: Number(previewMs[rounds - 1]!.toFixed(2)),
  }) + "\n");
}
