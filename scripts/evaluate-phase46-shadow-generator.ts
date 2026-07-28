import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { makeChordSymbol, normalizePc } from "../src/domain/chords";
import {
  generateRootPositionMin7Shadows,
  rootPositionMin7CompanionRuleId,
  shadowCandidateToChord,
} from "./phase46/shadowCandidateGenerator";

const transpositionRows = [];
for (let root = 0; root < 12; root += 1) {
  const required = [0, 3, 7, 10].map((interval) => normalizePc(root + interval));
  const input = {
    rawCandidates: [{
      chord: makeChordSymbol(root, "min7", [], normalizePc(root + 3)),
      rawScore: 1.1 + root / 100,
    }],
    supportingNotes: required.map((pitchClass, index) => ({
      noteInstanceId: `root-${root}-note-${index}`,
      pitchClass,
    })),
  };
  const first = generateRootPositionMin7Shadows(input);
  const second = generateRootPositionMin7Shadows(input);
  transpositionRows.push({
    root,
    generatedCount: first.candidates.length,
    canonicalIdentity: first.candidates[0]?.canonicalIdentity ?? null,
    label: first.candidates[0]
      ? shadowCandidateToChord(first.candidates[0])?.label ?? null
      : null,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    sourceUnchanged: input.rawCandidates[0].chord.bass === normalizePc(root + 3),
    provenanceCount: first.candidates[0]?.supportingNoteInstanceIds.length ?? 0,
  });
}

const budgetInput = {
  rawCandidates: Array.from({ length: 12 }, (_, root) => ({
    chord: makeChordSymbol(root, "min7", [], normalizePc(root + 3)),
    rawScore: 2 - root / 100,
  })),
  supportingNotes: Array.from({ length: 12 }, (_, pitchClass) => ({
    noteInstanceId: `budget-note-${pitchClass}`,
    pitchClass,
  })),
};
const budgetResult = generateRootPositionMin7Shadows(budgetInput);
const report = {
  schemaVersion: 1,
  phase: "4.6-04",
  generator: rootPositionMin7CompanionRuleId,
  productConnected: false,
  vaultPersistent: false,
  publicSchemaChanged: false,
  fileVersionChanged: false,
  transposition: {
    rootsTested: 12,
    generated: transpositionRows.filter((row) => row.generatedCount === 1).length,
    canonicalRoundTrip: transpositionRows.filter((row) => row.label !== null).length,
    deterministic: transpositionRows.every((row) => row.deterministic),
    provenanceComplete: transpositionRows.every((row) => row.provenanceCount === 4),
    sourceUnchanged: transpositionRows.every((row) => row.sourceUnchanged),
    rows: transpositionRows,
  },
  budget: {
    sourceCount: budgetInput.rawCandidates.length,
    generatedCount: budgetResult.candidates.length,
    perEventLimit: 4,
    duplicateCanonicalIdentityCount:
      budgetResult.diagnostics.canonicalDuplicateCount,
    diagnostics: budgetResult.diagnostics,
  },
};

await writeFile(
  resolve(cwd(), "docs/phase4.6/04-shadow-generator.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.6/04-shadow-generator.md"),
  `# Phase 4.6-04 Bounded Compositional Shadow Generator

Implemented \`${rootPositionMin7CompanionRuleId}\` as an evaluation-only module under \`scripts/phase46\`.

## Contract

- source: existing slash-bass \`min7\` raw candidate
- output: same root and quality without bass
- complete note-instance provenance required for root, minor third, fifth and minor seventh
- generated candidates never feed Product, UI, Vault, Analyzer or another generated candidate
- score: the source raw score is retained only as \`counterfactualScore\`

## Bounds

- one candidate per source
- one candidate per root
- four candidates per event
- canonical duplicate: ${report.budget.duplicateCanonicalIdentityCount}
- 12-source stress fixture generated: ${report.budget.generatedCount}

## Transposition and determinism

- roots tested: ${report.transposition.rootsTested}
- roots generated and canonical round-tripped: ${report.transposition.generated} / ${report.transposition.canonicalRoundTrip}
- deterministic: ${report.transposition.deterministic}
- provenance complete: ${report.transposition.provenanceComplete}
- source input unchanged: ${report.transposition.sourceUnchanged}

Product generation, rank, score, Analyzer output, Timeline, schema and \`fileVersion\` remain unchanged.
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report, null, 2)}\n`);
