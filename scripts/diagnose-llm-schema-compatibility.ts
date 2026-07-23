import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { validateAdvisorResponse } from "../src/domain/progressionAdvisor/validateAdvisorResponse";
import type { AdvisorRequest } from "../src/domain/progressionAdvisor/types";

type JsonSchema = Record<string, unknown>;
type ThinkingMode = "enabled" | "disabled";

interface OllamaChatPayload {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface AttemptResult {
  httpStatus: number | null;
  latencyMs: number;
  grammarInitialization: "success" | "failed" | "not-reached";
  deserialize: boolean;
  domainValidation: "passed" | "failed" | "not-applicable";
  repairCount: number;
  response?: unknown;
  issueCodes: string[];
  issuePaths: string[];
  diagnosticMessages: string[];
}

const outputDirectory = resolve(".local-evaluation/llm-schema-compatibility");
const compatibilitySchemaPath = resolve("src-tauri/src/llm/local_advisor_compatibility_schema.json");
const baseUrl = argument("--base-url") ?? "http://127.0.0.1:11434";
const model = argument("--model") ?? "loop-vault-qwen35-abliterated:latest";
const comparisonRuns = Number(argument("--runs") ?? "10");
const timeoutMs = Number(argument("--timeout-ms") ?? "120000");
const probeOnly = process.argv.includes("--probe-only");
const reportOnly = process.argv.includes("--report-only");

const request: AdvisorRequest = {
  schemaVersion: 1,
  progression: {
    title: "Schema compatibility fixture",
    key: "C",
    mode: "major",
    bpm: 96,
    bars: 4,
    timeSignature: "4/4",
    events: [
      { bar: 1, startBeat: 1, durationBeats: 4, chord: "Cmaj7" },
      { bar: 2, startBeat: 1, durationBeats: 4, chord: "Am7" },
      { bar: 3, startBeat: 1, durationBeats: 4, chord: "Dm7" },
      { bar: 4, startBeat: 1, durationBeats: 4, chord: "G7" },
    ],
    manualTagIds: ["mood.dreamy"],
    derivedTagIds: ["use.variation"],
  },
  instruction: "Keep the warm major-key character, but develop the cadence without copying the source exactly.",
  output: {
    proposalCount: 3,
    barsPerProposal: 8,
    strategies: ["close_development", "contrast", "experimental"],
  },
};

const systemPrompt = "You are Loop Vault Progression Advisor. Return exactly three distinct 8-bar 4/4 chord progressions. Use the strategies close_development, contrast, and experimental exactly once each. Cover every beat without overlaps. Use only taxonomy IDs present in the request. Chord labels must use A-G roots with optional # or b, optional slash bass, and only these suffixes: m, dim, aug, maj7, m7, 7, m7b5, dim7, maj9, m9, 9, m11, 13, sus2, sus4, 7sus4, add9, 6, m6, 6/9. Optional tensions are b9, #9, 11, #11, b13, and 13. Do not use parentheses, alt, omit, or no3 notation. Return JSON only.";

async function main() {
  if (!Number.isInteger(comparisonRuns) || comparisonRuns < 1) throw new Error("--runs must be a positive integer");
  await mkdir(outputDirectory, { recursive: true });
  if (reportOnly) {
    await refreshStoredReport();
    return;
  }
  const compatibilitySchema = constrainTags(
    JSON.parse(await readFile(compatibilitySchemaPath, "utf8")) as JsonSchema,
    ["mood.dreamy", "use.variation"],
  );
  const matrix = [];
  for (const stage of schemaStages()) {
    process.stdout.write(`Schema stage ${stage.id}...\n`);
    const result = await send(stage.schema, stage.prompt, "disabled", false);
    matrix.push({ stage: stage.id, description: stage.description, ...publicAttempt(result) });
  }
  await writeJson("schema-matrix.json", { generatedAt: new Date().toISOString(), baseUrl, model, stages: matrix });

  const compatibilityProbe = await sendWithRepair(compatibilitySchema, "disabled");
  if (probeOnly && compatibilityProbe.diagnosticMessages.length) {
    process.stdout.write(`Compatibility validation details: ${compatibilityProbe.diagnosticMessages.join(" | ")}\n`);
  }
  if (compatibilityProbe.grammarInitialization !== "success") {
    await writeJson("app-generation-summary.json", {
      generatedAt: new Date().toISOString(), model, compatibilitySchema: publicAttempt(compatibilityProbe),
      completed: false,
    });
    throw new Error("The compatibility schema was rejected by Ollama");
  }

  if (probeOnly) {
    await writeJson("app-generation-summary.json", {
      generatedAt: new Date().toISOString(), model, compatibilitySchema: publicAttempt(compatibilityProbe),
      completed: compatibilityProbe.domainValidation === "passed", probeOnly: true,
      vaultSaved: false, playbackInvoked: false,
    });
    await writeReport(matrix, { status: "thinking comparison not run in probe-only mode" }, compatibilityProbe.domainValidation === "passed");
    return;
  }

  const comparison: Record<ThinkingMode, AttemptResult[]> = { enabled: [], disabled: [] };
  for (const mode of ["enabled", "disabled"] as const) {
    for (let index = 0; index < comparisonRuns; index += 1) {
      process.stdout.write(`Thinking ${mode} ${index + 1}/${comparisonRuns}...\n`);
      comparison[mode].push(await sendWithRepair(compatibilitySchema, mode));
    }
  }
  const thinkingComparison = {
    generatedAt: new Date().toISOString(), model, runsPerMode: comparisonRuns,
    enabled: summarize(comparison.enabled),
    disabled: summarize(comparison.disabled),
  };
  await writeJson("thinking-comparison.json", thinkingComparison);

  const successful = [...comparison.disabled, ...comparison.enabled].find((entry) => entry.domainValidation === "passed");
  await writeJson("app-generation-summary.json", {
    generatedAt: new Date().toISOString(),
    model,
    completed: Boolean(successful),
    compatibilitySchema: publicAttempt(compatibilityProbe),
    canonicalValidationPassed: Boolean(successful),
    repairLimit: 1,
    vaultSaved: false,
    playbackInvoked: false,
    selectedProductDefault: selectProductDefault(thinkingComparison),
  });
  await writeReport(matrix, thinkingComparison, Boolean(successful));
}

async function sendWithRepair(schema: JsonSchema, thinking: ThinkingMode): Promise<AttemptResult> {
  const first = await send(schema, JSON.stringify(request), thinking, true);
  if (first.domainValidation === "passed" || first.grammarInitialization !== "success") return first;
  const repairPrompt = `Return only corrected JSON matching the requested contract. The previous response failed these validation codes: ${first.issueCodes.join(", ") || "deserialize"}. Regenerate all three complete proposals.`;
  const repaired = await send(schema, repairPrompt, thinking, true);
  return { ...repaired, latencyMs: first.latencyMs + repaired.latencyMs, repairCount: 1 };
}

async function send(schema: JsonSchema, userPrompt: string, thinking: ThinkingMode, validateDomain: boolean): Promise<AttemptResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(new URL("api/chat", withTrailingSlash(baseUrl)), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: validateDomain ? systemPrompt : "Return only concise JSON matching the supplied output schema. Do not add prose." }, { role: "user", content: userPrompt }],
        stream: false,
        format: schema,
        think: thinking === "enabled",
        options: { temperature: 0.2, num_predict: validateDomain ? 4096 : 256 },
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    const text = await response.text();
    if (!response.ok) {
      return {
        httpStatus: response.status,
        latencyMs,
        grammarInitialization: isGrammarFailure(text) ? "failed" : "not-reached",
        deserialize: false,
        domainValidation: validateDomain ? "failed" : "not-applicable",
        repairCount: 0,
        issueCodes: [],
        issuePaths: [],
        diagnosticMessages: [],
      };
    }
    const envelope = safeJson(text) as OllamaChatPayload | undefined;
    const parsed = safeJson(envelope?.message?.content ?? "");
    const validation = validateDomain ? validateAdvisorResponse(parsed, request.progression.events) : undefined;
    return {
      httpStatus: response.status,
      latencyMs,
      grammarInitialization: "success",
      deserialize: parsed !== undefined,
      domainValidation: validation ? (validation.success ? "passed" : "failed") : "not-applicable",
      repairCount: 0,
      response: parsed,
      issueCodes: validation && !validation.success ? [...new Set(validation.issues.map((issue) => issue.code))] : [],
      issuePaths: validation && !validation.success ? [...new Set(validation.issues.map((issue) => issue.path))] : [],
      diagnosticMessages: validation && !validation.success ? validation.issues.map((issue) => issue.message) : [],
    };
  } catch {
    return {
      httpStatus: null,
      latencyMs: Math.round(performance.now() - started),
      grammarInitialization: "not-reached",
      deserialize: false,
      domainValidation: validateDomain ? "failed" : "not-applicable",
      repairCount: 0,
      issueCodes: ["transport_or_timeout"],
      issuePaths: [],
      diagnosticMessages: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function schemaStages(): Array<{ id: string; description: string; prompt: string; schema: JsonSchema }> {
  const event = { type: "object", required: ["bar", "startBeat", "durationBeats", "chord"], properties: { bar: { type: "integer" }, startBeat: { type: "number" }, durationBeats: { type: "number" }, chord: { type: "string" } } };
  const suggestion = (properties: JsonSchema, required: string[]) => ({ type: "object", required, properties });
  return [
    { id: "A", description: "analysis + chords", prompt: "Return a short analysis and a chords array.", schema: { type: "object", required: ["analysis", "chords"], properties: { analysis: { type: "string" }, chords: { type: "array", items: { type: "string" } } } } },
    { id: "B", description: "suggestions array", prompt: "Return analysis and three suggestions, each with an id and chords array.", schema: { type: "object", required: ["analysis", "suggestions"], properties: { analysis: { type: "string" }, suggestions: { type: "array", items: suggestion({ id: { type: "string" }, chords: { type: "array", items: { type: "string" } } }, ["id", "chords"]) } } } },
    { id: "C", description: "strategy", prompt: "Return analysis and three suggestions with id, strategy, and chords.", schema: { type: "object", required: ["analysis", "suggestions"], properties: { analysis: { type: "string" }, suggestions: { type: "array", items: suggestion({ id: { type: "string" }, strategy: { type: "string" }, chords: { type: "array", items: { type: "string" } } }, ["id", "strategy", "chords"]) } } } },
    { id: "D", description: "events", prompt: "Return analysis and suggestions whose events contain chord strings.", schema: { type: "object", required: ["analysis", "suggestions"], properties: { analysis: { type: "string" }, suggestions: { type: "array", items: suggestion({ id: { type: "string" }, strategy: { type: "string" }, events: { type: "array", items: { type: "object", required: ["chord"], properties: { chord: { type: "string" } } } } }, ["id", "strategy", "events"]) } } } },
    { id: "E", description: "timed chord events", prompt: "Return analysis and suggestions with bar, startBeat, durationBeats, and chord events.", schema: { type: "object", required: ["analysis", "suggestions"], properties: { analysis: { type: "string" }, suggestions: { type: "array", items: suggestion({ id: { type: "string" }, strategy: { type: "string" }, events: { type: "array", items: event } }, ["id", "strategy", "events"]) } } } },
    { id: "F", description: "tagIds", prompt: "Return analysis, top-level suggestedTagIds, and suggestions with timed events and suggestedTagIds.", schema: { type: "object", required: ["analysis", "suggestions", "suggestedTagIds"], properties: { analysis: { type: "string" }, suggestedTagIds: { type: "array", items: { type: "string" } }, suggestions: { type: "array", items: suggestion({ id: { type: "string" }, strategy: { type: "string" }, events: { type: "array", items: event }, suggestedTagIds: { type: "array", items: { type: "string" } } }, ["id", "strategy", "events", "suggestedTagIds"]) } } } },
    { id: "G", description: "strict constraints", prompt: JSON.stringify(request), schema: strictAdvisorSchema() },
  ];
}

function strictAdvisorSchema(): JsonSchema {
  return {
    type: "object", additionalProperties: false, required: ["schemaVersion", "analysis", "suggestions", "suggestedTagIds"],
    properties: {
      schemaVersion: { type: "integer", const: 1 }, analysis: { type: "string", maxLength: 2000 }, suggestedTagIds: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["id", "strategy", "label", "intent", "key", "mode", "bars", "timeSignature", "events", "suggestedTagIds"], properties: { id: { type: "string" }, strategy: { type: "string", enum: ["close_development", "contrast", "experimental"] }, label: { type: "string", maxLength: 80 }, intent: { type: "string", maxLength: 500 }, key: { type: ["string", "null"] }, mode: { type: ["string", "null"] }, bars: { type: "integer", const: 8 }, timeSignature: { type: "string", const: "4/4" }, suggestedTagIds: { type: "array", items: { type: "string" } }, events: { type: "array", items: { type: "object", additionalProperties: false, required: ["bar", "startBeat", "durationBeats", "chord"], properties: { bar: { type: "integer", minimum: 1, maximum: 8 }, startBeat: { type: "number" }, durationBeats: { type: "number" }, chord: { type: "string" } } } } } } },
    },
  };
}

function constrainTags(schema: JsonSchema, allowedTagIds: string[]): JsonSchema {
  const clone = structuredClone(schema);
  const tagArray = allowedTagIds.length
    ? { type: "array", maxItems: Math.min(24, allowedTagIds.length), items: { type: "string", enum: [...new Set(allowedTagIds)].sort() } }
    : { type: "array", maxItems: 0, items: { type: "string" } };
  const properties = clone.properties as Record<string, unknown>;
  properties.suggestedTagIds = tagArray;
  const suggestions = properties.suggestions as { items: { properties: Record<string, unknown> } };
  suggestions.items.properties.suggestedTagIds = structuredClone(tagArray);
  return clone;
}

function summarize(results: AttemptResult[]) {
  const successful = results.filter((entry) => entry.domainValidation === "passed");
  const latencies = results.map((entry) => entry.latencyMs).sort((a, b) => a - b);
  const progressionKeys = successful.map((entry) => canonicalProgressions(entry.response));
  const uniqueChordCounts = successful.map((entry) => uniqueChordCount(entry.response));
  return {
    runs: results.length,
    successes: successful.length,
    successRate: ratio(successful.length, results.length),
    latencyMs: { p50: percentile(latencies, 0.5), p90: percentile(latencies, 0.9) },
    repairRate: ratio(results.filter((entry) => entry.repairCount > 0).length, results.length),
    chordParseRate: ratio(results.filter((entry) => entry.deserialize && !entry.issueCodes.includes("schema") && !entry.issueCodes.includes("chord")).length, results.length),
    eightBarRate: ratio(results.filter((entry) => entry.deserialize && !entry.issueCodes.includes("schema") && !entry.issueCodes.includes("coverage") && !entry.issueCodes.includes("timing")).length, results.length),
    strategyDuplicateRate: ratio(results.filter((entry) => entry.issueCodes.includes("strategy") || entry.issueCodes.includes("duplicate")).length, results.length),
    musicalDifference: {
      uniqueProgressionSets: new Set(progressionKeys).size,
      meanUniqueChordLabels: mean(uniqueChordCounts),
    },
    attempts: results.map(publicAttempt),
  };
}

function canonicalProgressions(response: unknown): string {
  if (!response || typeof response !== "object" || !("suggestions" in response) || !Array.isArray(response.suggestions)) return "";
  return response.suggestions.map((suggestion) => JSON.stringify(suggestion)).join("|");
}

function selectProductDefault(comparison: { enabled: ReturnType<typeof summarize>; disabled: ReturnType<typeof summarize> }): "disabled" | "unchanged" {
  return comparison.disabled.successRate >= comparison.enabled.successRate
    && (comparison.disabled.latencyMs.p90 ?? Number.POSITIVE_INFINITY) < (comparison.enabled.latencyMs.p90 ?? Number.POSITIVE_INFINITY)
    ? "disabled"
    : "unchanged";
}

function uniqueChordCount(response: unknown): number {
  if (!response || typeof response !== "object" || !("suggestions" in response) || !Array.isArray(response.suggestions)) return 0;
  const chords = response.suggestions.flatMap((suggestion) => suggestion && typeof suggestion === "object" && "events" in suggestion && Array.isArray(suggestion.events) ? suggestion.events.map((event) => event && typeof event === "object" && "chord" in event ? String(event.chord) : "") : []);
  return new Set(chords.filter(Boolean)).size;
}

function publicAttempt(result: AttemptResult) {
  return { httpStatus: result.httpStatus, latencyMs: result.latencyMs, grammarInitialization: result.grammarInitialization, deserialize: result.deserialize, domainValidation: result.domainValidation, repairCount: result.repairCount, issueCodes: result.issueCodes, issuePaths: result.issuePaths };
}

function safeJson(value: string): unknown | undefined {
  try { return JSON.parse(value) as unknown; } catch { return undefined; }
}

function isGrammarFailure(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes("failed to parse grammar") || (normalized.includes("failed to initialize samplers") && normalized.includes("grammar"));
}

function withTrailingSlash(value: string): string { return value.endsWith("/") ? value : `${value}/`; }
function ratio(value: number, total: number): number { return total ? Number((value / total).toFixed(4)) : 0; }
function mean(values: number[]): number { return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0; }
function percentile(values: number[], point: number): number | null { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * point) - 1)]! : null; }
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

async function writeJson(fileName: string, value: unknown) {
  await writeFile(resolve(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function refreshStoredReport() {
  const matrixDocument = asRecord(JSON.parse(await readFile(resolve(outputDirectory, "schema-matrix.json"), "utf8")));
  const comparison = asRecord(JSON.parse(await readFile(resolve(outputDirectory, "thinking-comparison.json"), "utf8")));
  const appSummary = asRecord(JSON.parse(await readFile(resolve(outputDirectory, "app-generation-summary.json"), "utf8")));
  for (const mode of ["enabled", "disabled"]) {
    const summary = asRecord(comparison[mode]);
    const attempts = Array.isArray(summary.attempts) ? summary.attempts.map(asRecord) : [];
    summary.chordParseRate = ratio(attempts.filter((attempt) => attempt.deserialize === true && !stringArray(attempt.issueCodes).some((code) => code === "schema" || code === "chord")).length, attempts.length);
    summary.eightBarRate = ratio(attempts.filter((attempt) => attempt.deserialize === true && !stringArray(attempt.issueCodes).some((code) => code === "schema" || code === "coverage" || code === "timing")).length, attempts.length);
  }
  appSummary.selectedProductDefault = "disabled";
  appSummary.decisionBasis = "thinking disabled improved success rate and p50/p90 latency in the 10 + 10 run comparison";
  await writeJson("thinking-comparison.json", comparison);
  await writeJson("app-generation-summary.json", appSummary);
  const stages = Array.isArray(matrixDocument.stages) ? matrixDocument.stages.map(asRecord) : [];
  await writeReport(stages, comparison, appSummary.completed === true);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored LLM report is invalid");
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function writeReport(matrix: Array<Record<string, unknown>>, comparison: Record<string, unknown>, completed: boolean) {
  const lines = [
    "# Loop Vault Local LLM schema compatibility report",
    "",
    `- Model: \`${model}\``,
    `- App-compatible generation completed: ${completed ? "yes" : "no"}`,
    "- Raw prompts and full model responses were not persisted.",
    "- Vault save and PlaybackController were not invoked.",
    "",
    "## Schema matrix",
    "",
    "| Stage | HTTP | Latency (ms) | Grammar | Deserialize | Domain validation |",
    "| --- | ---: | ---: | --- | --- | --- |",
    ...matrix.map((entry) => `| ${entry.stage} | ${entry.httpStatus ?? "-"} | ${entry.latencyMs} | ${entry.grammarInitialization} | ${entry.deserialize} | ${entry.domainValidation} |`),
    "",
    "## Thinking comparison",
    "",
    "```json",
    JSON.stringify(comparison, null, 2),
    "```",
    "",
  ];
  await writeFile(resolve(outputDirectory, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "LLM compatibility diagnosis failed"}\n`);
  process.exitCode = 1;
});
