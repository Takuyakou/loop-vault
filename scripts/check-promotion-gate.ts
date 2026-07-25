import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";

/**
 * Evaluates every analyzer against the frozen promotion gate.
 *
 * Reads the gate definition and the normalized baseline rather than restating
 * either, so the promotion decision cannot drift from the recorded thresholds.
 */
const gatePath = resolve(cwd(), "docs/phase4.0/02-promotion-gates.json");
const baselinePath = resolve(cwd(), optionValue("--baseline") ?? "docs/phase4.0/05-phase4-comparison.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "promotion-gate-check.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

interface GateRule {
  id: string;
  metric?: string;
  rule: string;
  toleranceLossPp?: number;
  minGainPp?: number;
  subset?: string;
  value?: number;
  baselineEstablishedIn?: string;
}

interface Gate {
  status: string;
  requireAll: GateRule[];
  requireAny: GateRule[];
}

interface Weighted { [metric: string]: number }
interface Subset { durationWeighted: Weighted }
interface AnalyzerReport { runtimeMs: number; full: Subset; tune: Subset; holdout: Subset }

const gate = JSON.parse(await readFile(gatePath, "utf8")) as Gate;
const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
  analyzers: Record<string, AnalyzerReport>;
};

const legacy = baseline.analyzers.legacy;
if (!legacy) throw new Error("baseline report has no `legacy` analyzer to compare against");

function read(report: AnalyzerReport, rule: GateRule): number | undefined {
  if (!rule.metric) return undefined;
  const subset = rule.subset === "holdout" ? report.holdout : report.full;
  const value = subset.durationWeighted[rule.metric];
  return typeof value === "number" ? value : undefined;
}

interface Finding { id: string; verdict: "pass" | "fail" | "not-evaluated"; detail: string }

function evaluate(name: string, report: AnalyzerReport) {
  const findings: Finding[] = [];

  for (const rule of gate.requireAll) {
    if (rule.rule === "max" && rule.metric === "runtimeMsPer100Cases") {
      const within = report.runtimeMs <= (rule.value ?? Infinity);
      findings.push({
        id: rule.id,
        verdict: within ? "pass" : "fail",
        detail: `${report.runtimeMs.toFixed(0)} ms vs limit ${rule.value}`,
      });
      continue;
    }
    if (rule.rule !== "noRegression") {
      findings.push({
        id: rule.id,
        verdict: "not-evaluated",
        detail: rule.baselineEstablishedIn
          ? `baseline established in ${rule.baselineEstablishedIn}`
          : "checked outside this script",
      });
      continue;
    }
    const after = read(report, rule);
    const before = read(legacy, rule);
    if (after === undefined || before === undefined) {
      findings.push({ id: rule.id, verdict: "not-evaluated", detail: `metric ${rule.metric} absent` });
      continue;
    }
    const deltaPp = (after - before) * 100;
    const tolerance = rule.toleranceLossPp ?? 0;
    findings.push({
      id: rule.id,
      verdict: deltaPp >= -tolerance ? "pass" : "fail",
      detail: `${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(2)}pp (tolerance ${tolerance}pp)`,
    });
  }

  const anyFindings: Finding[] = gate.requireAny.map((rule) => {
    const after = read(report, rule);
    const before = read(legacy, rule);
    if (after === undefined || before === undefined) {
      return { id: rule.id, verdict: "not-evaluated" as const, detail: `metric ${rule.metric} absent` };
    }
    const deltaPp = (after - before) * 100;
    return {
      id: rule.id,
      verdict: deltaPp >= (rule.minGainPp ?? 0) ? "pass" as const : "fail" as const,
      detail: `${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(2)}pp (needs +${rule.minGainPp}pp)`,
    };
  });

  const failedAll = findings.filter((finding) => finding.verdict === "fail");
  const satisfiedAny = anyFindings.some((finding) => finding.verdict === "pass");
  return {
    analyzer: name,
    verdict: failedAll.length === 0 && satisfiedAny ? "PASS" : "FAIL",
    requireAll: findings,
    requireAny: anyFindings,
    blockedBy: [
      ...failedAll.map((finding) => finding.id),
      ...(satisfiedAny ? [] : ["requireAny"]),
    ],
  };
}

const results = Object.entries(baseline.analyzers)
  .filter(([name]) => name !== "legacy")
  .map(([name, report]) => evaluate(name, report));

stdout.write(`gate status: ${gate.status}\n`);
stdout.write(`baseline: ${baselinePath.split(/[\\/]/).pop()}\n\n`);
for (const result of results) {
  stdout.write(`${result.analyzer}: ${result.verdict}\n`);
  for (const finding of [...result.requireAll, ...result.requireAny]) {
    const mark = finding.verdict === "pass" ? "  ok  " : finding.verdict === "fail" ? " FAIL " : "  --  ";
    stdout.write(`  ${mark} ${finding.id.padEnd(32)} ${finding.detail}\n`);
  }
  stdout.write("\n");
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify({
  schemaVersion: 1,
  stage: "P4.0-06",
  gateStatus: gate.status,
  baselineSource: baselinePath.split(/[\\/]/).pop(),
  results,
}, null, 2)}\n`, "utf8");
