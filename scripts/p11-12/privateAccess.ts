import { rankPracticeHandFingerings } from "../../src/voicingPractice/rankPracticeFingerings";
/** Diagnostic-only access to exact private function bodies. Never edits or substitutes product code. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as product from "../../src/domain/progressionFingering";
import { findPersonalFingering, type FingeringPreferenceCollection } from "../../src/voicingPractice/fingeringPreferences";
import type { ProgressionVoicingPracticeSnapshot, ProgressionVoicingSelection } from "../../src/domain/progressionVoicingPractice";
import type { ProgressionFingeringHandTargets } from "../../src/voicingPractice/fingeringDisplay";

type Group = Extract<product.FingeringCandidateResult, { status: "supported" }>;
export type Ranked = product.RankedFingering | product.UnavailableFingering;
function extract(path: string, names: string[], bindings: Record<string, unknown>) {
  const source = readFileSync(path, "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map(name => {
    const found = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    if (!found) throw new Error(`Diagnostic function absent: ${name}`);
    return found.getText(tree).replace(/^export\s+/, "");
  });
  const code = ts.transpileModule(`${declarations.join("\n")}\nreturn {${names.join(",")}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as Record<string, unknown>;
}
const rankerPath = "src/domain/progressionFingering.ts";
const viewPath = "src/views/ProgressionVoicingPracticeView.tsx";
const privateRanker = extract(rankerPath, ["transitionCost", "priorCost", "spacingCost", "preferredFingers", "triadInversion"], {});
export const costs = privateRanker as unknown as {
  transitionCost(a: Group, ai: number, b: Group, bi: number): number;
  priorCost(a: readonly number[], b: readonly number[]): number;
  spacingCost(pitches: readonly number[], fingers: readonly number[], hand: product.FingeringHand): number;
  preferredFingers(input: product.FingeringInput, pitches: number[]): { fingers: product.FingerNumber[]; reason: string };
};
export const viewFunctions = extract(viewPath, ["rankFingeringsForHand", "effectiveFingering", "addKeyboardFingerLabels", "fingerSummary"], {
  rankPracticeHandFingerings, rankCyclicFingerings: product.rankCyclicFingerings, findPersonalFingering, EMPTY_NOTES: [],
}) as unknown as {
  rankFingeringsForHand(snapshot: ProgressionVoicingPracticeSnapshot | undefined, hands: readonly ProgressionFingeringHandTargets[], selection: ProgressionVoicingSelection, hand: product.FingeringHand, preferences?: FingeringPreferenceCollection): readonly Ranked[];
  effectiveFingering(value: Ranked | undefined, preferences: FingeringPreferenceCollection): product.RankedFingering | undefined;
  addKeyboardFingerLabels(labels: Map<number, string>, value: product.RankedFingering | undefined, prefix: "L" | "R"): void;
  fingerSummary(value: product.RankedFingering | undefined, prefix: "L" | "R", count: number, unavailable: string): string;
};
export function sourceManifest() {
  return [rankerPath, viewPath, "src/voicingPractice/fingeringDisplay.ts", "src/voicingPractice/fingeringPreferences.ts", "src/voicingPractice/nextMove.ts", "scripts/p11-12/privateAccess.ts", "scripts/p11-12/fixtures.ts", "scripts/p11-12/integration.ts", "scripts/p11-12/run.ts", "scripts/p11-12/diagnostic.test.ts", "scripts/p11-12/uiAudit.test.tsx"].map(file => ({
    file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  }));
}
