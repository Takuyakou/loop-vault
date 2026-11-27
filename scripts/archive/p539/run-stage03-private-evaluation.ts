import { readFileSync } from "node:fs";
import { argv } from "node:process";

import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { evaluateFamilyCPrivatePromotion } from "./privatePromotionEvaluation";
import {
  selectPrivateEvaluationDirectory,
  selectSinglePrivateCandidate,
  serializePrivatePromotionAggregate,
} from "./privatePromotionRunner";

const directory = selectPrivateEvaluationDirectory(argv);

const candidates = discoverLfMidi001Candidates(directory);
process.stdout.write(`candidateCount=${candidates.length}\n`);
const candidate = selectSinglePrivateCandidate(candidates);
const aggregate = evaluateFamilyCPrivatePromotion(
  new Uint8Array(readFileSync(candidate)),
);
process.stdout.write(`${serializePrivatePromotionAggregate(aggregate)}\n`);
