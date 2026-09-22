import { progressionFixture } from "../p534/fixtures";
import { stage01bShadowV2Aggregate } from "./stage01bShadowV2Audit";

const aggregates = [4, 3, 2, 1].map((numerator) =>
  stage01bShadowV2Aggregate(progressionFixture(numerator, 4)));
process.stdout.write(`${JSON.stringify(aggregates, null, 2)}\n`);
