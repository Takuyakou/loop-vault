import {
  buildStage00VocabularyBaseline,
  summarizeStage00VocabularyBaseline,
} from "./stage00VocabularyBaseline";
import { SEMANTIC_ORACLE, classifySemantic } from "../p534/semanticOracle";
import { chordFixture } from "../p534/fixtures";
import { analyzeMidi } from "../../src/domain/midi/analysis";

const summary = summarizeStage00VocabularyBaseline(buildStage00VocabularyBaseline());
const semanticCorpus = SEMANTIC_ORACLE.map((entry) => {
  const result = classifySemantic(entry);
  const productionTop1 = analyzeMidi(chordFixture(entry.pitches), {
    mode: "phase4-v1",
  }).fullTimeline[0]?.chord.label ?? "(none)";
  return {
    id: entry.id,
    representability: entry.representable,
    classification: result.classification,
    top1: productionTop1,
    candidateCount: result.candidates.length,
  };
});

process.stdout.write(`${JSON.stringify({ summary, semanticCorpus }, null, 2)}\n`);
