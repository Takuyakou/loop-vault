import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import type { AnalyzeMidiOptions } from "../../src/domain/midi/types";
import type { MidiProgressionAnalysis } from "../../src/domain/types";
import { STAGE01_ANALYZER_CONFIG_SHA256 } from "./stage01CorpusLock";
import {
  STAGE01_RUNTIME_BENCHMARK_IDS,
  STAGE01_RUNTIME_ATTEMPT_COUNT,
  STAGE01_CASE36_INPUT_DIGEST_SHA256,
  STAGE01_VOICING40_INPUT_DIGEST_SHA256,
  isStrictStage01NoteEvidenceDedupDiagnostics,
  stage01RuntimeAttemptId,
  type Stage01RuntimeBenchmarkId,
} from "./stage01ReportSchema";

interface Request {
  schemaVersion: 2;
  enabled: boolean;
  warmupRuns: 1;
  config: {
    mode: "phase4-v1";
    enableExactNoteEvidenceDedup: boolean;
  };
  inputDigestSha256: string;
  analyzerConfigVersionSha256: typeof STAGE01_ANALYZER_CONFIG_SHA256;
  measurementKind: "planned" | "timeout-retry";
  plannedSampleIndex: number;
  benchmarkId: Stage01RuntimeBenchmarkId;
  attemptId: string;
  runNonce: string;
  protocolAttempt: number;
  generation: 1 | 2;
  deadlineDurationMs: 300_000;
  inputsBase64: string[];
}

const MAX_STDIN_CHARS = 64 * 1024 * 1024;
const MAX_CANONICAL_BASE64_CHARS = 2 * 1024 * 1024;
const rawRequest = readFileSync(0, "utf8");
if (rawRequest.length > MAX_STDIN_CHARS) throw new Error("Stage 01 runtime child request is oversized.");
let parsedRequest: unknown;
try { parsedRequest = JSON.parse(rawRequest); } catch {
  throw new Error("Stage 01 runtime child request is malformed.");
}
if (!parsedRequest || typeof parsedRequest !== "object" || Array.isArray(parsedRequest)) {
  throw new Error("Invalid Stage 01 runtime child request.");
}
const request = parsedRequest as Request;
const allowedKeys = [
  "schemaVersion", "enabled", "warmupRuns", "config", "inputDigestSha256",
  "analyzerConfigVersionSha256", "measurementKind", "plannedSampleIndex",
  "benchmarkId", "attemptId", "runNonce", "protocolAttempt", "generation",
  "deadlineDurationMs", "inputsBase64",
].sort();
const configKeys = request.config && typeof request.config === "object"
  ? Object.keys(request.config).sort() : [];
if (
  JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(allowedKeys)
  || JSON.stringify(configKeys) !== JSON.stringify(["enableExactNoteEvidenceDedup", "mode"])
  || request.schemaVersion !== 2
  || typeof request.enabled !== "boolean"
  || request.warmupRuns !== 1
  || request.config?.mode !== "phase4-v1"
  || request.config.enableExactNoteEvidenceDedup !== request.enabled
  || typeof request.inputDigestSha256 !== "string"
  || !/^[a-f0-9]{64}$/u.test(request.inputDigestSha256)
  || request.analyzerConfigVersionSha256 !== STAGE01_ANALYZER_CONFIG_SHA256
  || !["planned", "timeout-retry"].includes(request.measurementKind)
  || !Number.isInteger(request.plannedSampleIndex)
  || request.plannedSampleIndex < 1
  || !STAGE01_RUNTIME_BENCHMARK_IDS.includes(request.benchmarkId)
  || request.plannedSampleIndex > (request.benchmarkId === "case36-three-minute" ? 7 : 5)
  || !Number.isInteger(request.protocolAttempt)
  || request.protocolAttempt < 1
  || request.protocolAttempt > STAGE01_RUNTIME_ATTEMPT_COUNT
  || request.generation !== (request.measurementKind === "planned" ? 1 : 2)
  || request.deadlineDurationMs !== 300_000
  || typeof request.runNonce !== "string"
  || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(request.runNonce)
  || request.attemptId !== stage01RuntimeAttemptId({
    runNonce: request.runNonce,
    benchmarkId: request.benchmarkId,
    protocolAttempt: request.protocolAttempt,
    featureFlagEnabled: request.enabled,
    plannedSampleIndex: request.plannedSampleIndex,
    measurementKind: request.measurementKind,
    generation: request.generation,
  })
  || !Array.isArray(request.inputsBase64)
  || request.inputsBase64.length === 0
  || request.inputsBase64.length > 40
  || request.inputsBase64.some((item) => typeof item !== "string")
  || request.inputsBase64.some((item) => !isCanonicalBase64(item))
) {
  throw new Error("Invalid Stage 01 runtime child request.");
}

const inputDigestSha256 = createHash("sha256")
  .update(JSON.stringify(request.inputsBase64))
  .digest("hex");
const expectedInputDigestSha256 = request.benchmarkId === "case36-three-minute"
  ? STAGE01_CASE36_INPUT_DIGEST_SHA256 : STAGE01_VOICING40_INPUT_DIGEST_SHA256;
if (inputDigestSha256 !== request.inputDigestSha256
  || inputDigestSha256 !== expectedInputDigestSha256) {
  throw new Error("Stage 01 runtime child input digest mismatch.");
}

const inputs = request.inputsBase64.map((item) => new Uint8Array(Buffer.from(item, "base64")));
if ((request.benchmarkId === "case36-three-minute" && inputs.length !== 1)
  || (request.benchmarkId === "voicing-gold-development-40" && inputs.length !== 40)) {
  throw new Error("Stage 01 runtime benchmark identity does not match its fixed input count.");
}
for (const bytes of inputs) {
  analyzeWithStage01Capability(
    bytes,
    { mode: request.config.mode },
    request.config.enableExactNoteEvidenceDedup,
  );
}
const started = performance.now();
for (const bytes of inputs) {
  analyzeWithStage01Capability(
    bytes,
    { mode: request.config.mode },
    request.config.enableExactNoteEvidenceDedup,
  );
}
const elapsedMs = Number((performance.now() - started).toFixed(6));
process.stdout.write(`${JSON.stringify({
  schemaVersion: 2,
  status: "completed",
  elapsedMs,
  warmupRuns: request.warmupRuns,
  warmupAnalysisCount: inputs.length,
  config: request.config,
  inputDigestSha256,
  analyzerConfigVersionSha256: request.analyzerConfigVersionSha256,
  measurementKind: request.measurementKind,
  plannedSampleIndex: request.plannedSampleIndex,
  benchmarkId: request.benchmarkId,
  attemptId: request.attemptId,
  runNonce: request.runNonce,
  protocolAttempt: request.protocolAttempt,
  generation: request.generation,
  deadlineDurationMs: request.deadlineDurationMs,
  featureFlagEnabled: request.enabled,
  analysisCount: inputs.length,
})}\n`);

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0 || value.length > MAX_CANONICAL_BASE64_CHARS || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

interface Stage01AnalyzerOptionsCapability {
  phase515: { enableExactNoteEvidenceDedup: boolean };
}

function analyzeWithStage01Capability(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions,
  featureEnabled: boolean,
): MidiProgressionAnalysis {
  const extendedOptions: AnalyzeMidiOptions & Stage01AnalyzerOptionsCapability = {
    ...options,
    phase515: { enableExactNoteEvidenceDedup: featureEnabled },
  };
  const result = analyzeMidi(bytes, extendedOptions);
  if (featureEnabled && !hasStrictStage01Diagnostics(result)) {
    throw new Error("Stage 01 exact-note evidence capability unavailable.");
  }
  return result;
}

function hasStrictStage01Diagnostics(value: unknown): boolean {
  if (!isUnknownRecord(value) || !("noteEvidenceDedup" in value)) return false;
  const diagnostics = value.noteEvidenceDedup;
  return isStrictStage01NoteEvidenceDedupDiagnostics(diagnostics);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
