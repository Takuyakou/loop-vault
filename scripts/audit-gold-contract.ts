import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { loadCorpus, type GoldBlock, type GoldScenario } from "./syntheticGoldCorpus";
import { deriveRankConstraintGroups, loadContractAmendments } from "./goldContract";

/**
 * P4.1.2-A0 gold contract audit.
 *
 * A gold corpus can be internally impossible: S23 asks for four distinct cards
 * inside a three-card window, so no implementation can satisfy it and the
 * "failure" says nothing about the product. Auditing the contract before
 * building against it is the only way to keep a later gate meaningful.
 *
 * This reads the manifest and reports contradictions. It never edits the gold to
 * match a measurement — the only permitted change is to a constraint that cannot
 * be satisfied by any implementation, and those are recorded as explicit
 * amendments in docs/phase4.1.2/00-gold-contract-amendments.json rather than
 * written back over the corpus.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusRoot = resolve(cwd(), optionValue("--corpus") ?? ".local-evaluation/synthetic-gold-v1");
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.2/00-gold-contract-audit.json");

/** Window lengths the current generator can produce, from `buildOccurrences`. */
const GENERATOR_LENGTHS = [2, 4, 8, 16];

interface Finding {
  scenarioId: string;
  split: string;
  check: string;
  severity: "impossible" | "inconsistent" | "unmeasurable" | "note";
  detail: string;
}

const corpus = loadCorpus(corpusRoot);
const amendments = loadContractAmendments();
const findings: Finding[] = [];

function distinctPatterns(blocks: readonly GoldBlock[]): string[] {
  return [...new Set(blocks.map((block) => block.pattern_id))];
}

for (const scenario of corpus.scenarios) {
  const add = (check: string, severity: Finding["severity"], detail: string) => {
    findings.push({ scenarioId: scenario.scenarioId, split: scenario.split, check, severity, detail });
  };

  // 1 and 2: a rank window cannot hold more distinct cards than it has slots.
  const top3 = distinctPatterns(scenario.expectedBlocks.filter((block) => block.rank_constraint === "top3"));
  const top10 = distinctPatterns(scenario.expectedBlocks.filter((block) => block.rank_constraint === "top10"));
  if (top3.length > 3) {
    add(
      "top3-capacity",
      "impossible",
      `${top3.length} distinct patterns require rank_constraint "top3" but the window holds 3: ${top3.join(", ")}`,
    );
  }
  const combined = new Set([...top3, ...top10]);
  if (combined.size > 10) {
    add("top10-capacity", "impossible", `${combined.size} distinct patterns must fit ten visible slots`);
  }

  // 3: expected_card_count against the occurrence list.
  for (const pattern of scenario.expectedPatterns) {
    if (pattern.expected_card_count > pattern.occurrences.length) {
      add(
        "card-count-exceeds-occurrences",
        "inconsistent",
        `${pattern.pattern_id} expects ${pattern.expected_card_count} cards from ${pattern.occurrences.length} occurrences`,
      );
    }
    if (pattern.merge_policy === "merge" && pattern.expected_card_count !== 1) {
      add(
        "merge-policy-card-count",
        "inconsistent",
        `${pattern.pattern_id} merges but expects ${pattern.expected_card_count} cards`,
      );
    }
    if (pattern.merge_policy === "separate" && pattern.expected_card_count !== pattern.occurrences.length) {
      add(
        "separate-policy-card-count",
        "inconsistent",
        `${pattern.pattern_id} is separate with ${pattern.occurrences.length} occurrences but expects ${pattern.expected_card_count} cards`,
      );
    }
  }

  // Every expected block must belong to a declared pattern, and every declared
  // pattern occurrence must correspond to a block range.
  const patternIds = new Set(scenario.expectedPatterns.map((pattern) => pattern.pattern_id));
  for (const block of scenario.expectedBlocks) {
    if (!patternIds.has(block.pattern_id)) {
      add("block-pattern-missing", "inconsistent", `${block.id} references unknown pattern ${block.pattern_id}`);
    }
  }

  // 4: can the current generator produce the must-show ranges at all?
  for (const block of scenario.expectedBlocks) {
    const length = block.end_bar - block.start_bar + 1;
    if (block.usefulness !== "must-show") continue;
    if (!GENERATOR_LENGTHS.includes(length)) {
      add(
        "must-show-not-generatable",
        "impossible",
        `${block.id} spans ${length} bars (${block.start_bar}-${block.end_bar}); generator lengths are ${GENERATOR_LENGTHS.join("/")}`,
      );
    }
  }

  // 5: bar ranges, durations, overlaps.
  for (const block of scenario.expectedBlocks) {
    if (block.start_bar < 1 || block.end_bar > scenario.bars || block.end_bar < block.start_bar) {
      add("bar-range-invalid", "inconsistent", `${block.id} ${block.start_bar}-${block.end_bar} outside 1-${scenario.bars}`);
    }
  }
  for (const variant of scenario.variants) {
    let previousEnd = -1;
    for (const event of variant.events) {
      if (event.durationBeats <= 0) {
        add("event-duration-invalid", "inconsistent", `${variant.variant} event ${event.eventIndex} duration ${event.durationBeats}`);
      }
      if (event.startBeatAbsolute < previousEnd - 1e-6) {
        add(
          "event-overlap",
          "inconsistent",
          `${variant.variant} event ${event.eventIndex} starts at ${event.startBeatAbsolute} before ${previousEnd}`,
        );
      }
      previousEnd = event.endBeatAbsolute;
    }
  }

  // 6: structural rule against musical usefulness.
  //
  // The taxonomy's `fragment` has a non-structural clause ("incomplete as a
  // progression"), so a four-bar block with two chords can be labelled either
  // way without contradicting the corpus. That makes block_type unusable as a
  // pass/fail gate; `usefulness` is unambiguous and gates lane placement instead.
  for (const block of scenario.expectedBlocks) {
    const length = block.end_bar - block.start_bar + 1;
    const distinctChords = new Set(block.chord_sequence).size;
    const structural = distinctChords <= 1
      ? "vamp"
      : (length >= 4 && distinctChords >= 2 ? "progression" : "fragment");
    if (structural !== block.block_type) {
      add(
        "block-type-vs-structural-rule",
        "unmeasurable",
        `${block.id} labelled ${block.block_type}; structural rule gives ${structural} `
        + `(${length} bars, ${distinctChords} distinct chords, usefulness ${block.usefulness})`,
      );
    }
  }
}

// Split hygiene: each file in exactly one split, and pairs never straddle splits.
const splitOf = new Map<string, string>();
for (const [split, files] of Object.entries(corpus.splits)) {
  for (const file of files) {
    if (splitOf.has(file)) {
      findings.push({
        scenarioId: file,
        split,
        check: "split-duplicate",
        severity: "inconsistent",
        detail: `also in ${splitOf.get(file)}`,
      });
    }
    splitOf.set(file, split);
  }
}
for (const scenario of corpus.scenarios) {
  const splits = new Set(scenario.variants.map((variant) => splitOf.get(variant.fileName)));
  if (splits.size > 1) {
    findings.push({
      scenarioId: scenario.scenarioId,
      split: [...splits].join("+"),
      check: "scenario-pair-split-straddle",
      severity: "inconsistent",
      detail: "clean and stress variants are in different splits",
    });
  }
  for (const variant of scenario.variants) {
    if (!splitOf.has(variant.fileName)) {
      findings.push({
        scenarioId: scenario.scenarioId,
        split: "none",
        check: "variant-missing-from-splits",
        severity: "inconsistent",
        detail: variant.variant,
      });
    }
  }
}

/** Rank constraints restated as priority groups, with amendments applied. */
const groups = Object.fromEntries(corpus.scenarios.map((scenario: GoldScenario) => [
  scenario.scenarioId,
  deriveRankConstraintGroups(scenario, amendments),
]));

const bySeverity = new Map<string, number>();
for (const finding of findings) {
  bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.2-A0",
  corpus: { format: "loop-vault-synthetic-gold-corpus-v1", generatorVersion: corpus.generatorVersion },
  generatorLengths: GENERATOR_LENGTHS,
  amendmentsApplied: Object.keys(amendments),
  findings,
  findingsBySeverity: Object.fromEntries(bySeverity),
  rankConstraintGroups: groups,
  policy: {
    goldNeverFittedToResults: true,
    onlyImpossibleConstraintsAmended: true,
    blockTypeExcludedFromHardGate:
      "The fragment definition contains a non-structural clause, so block_type cannot decide pass/fail. Lane placement is gated on `usefulness`, which is unambiguous.",
  },
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`findings ${findings.length}\n`);
for (const [severity, count] of bySeverity) stdout.write(`  ${severity.padEnd(14)} ${count}\n`);
stdout.write("\n");
for (const finding of findings) {
  stdout.write(`[${finding.severity}] ${finding.scenarioId} ${finding.check}: ${finding.detail}\n`);
}
