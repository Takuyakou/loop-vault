import { progressionFixture } from "../p534/fixtures";
import { stage00DownstreamBaseline } from "./stage00Baseline";

for (const numerator of [4, 3, 2, 1] as const) {
  const baseline = stage00DownstreamBaseline(progressionFixture(numerator, 4));
  process.stdout.write(`${numerator}/4\t${JSON.stringify(baseline)}\n`);
}
