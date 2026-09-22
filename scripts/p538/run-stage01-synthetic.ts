import { progressionFixture } from "../p534/fixtures";
import { stage01ShadowAggregate } from "./stage01ShadowAudit";

const aggregates = [4, 3, 2, 1].map((numerator) =>
  stage01ShadowAggregate(progressionFixture(numerator, 4)));
process.stdout.write(`${JSON.stringify(aggregates, null, 2)}\n`);
