import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  createAnonymousFixtureId,
  type GroundTruthTemplate,
} from "./roleGroundTruthTemplate";
import { scanMidiForGroundTruth } from "./roleGroundTruthScan";

const execFileAsync = promisify(execFile);
const evaluationRootSuffixes = [
  ".local-evaluation",
  "docs/loop-vault-evaluation-corpus",
  "artifacts",
] as const;
const defaultOutputPrefix = ".local-evaluation/p521-role-ground-truth/review";

interface ChordDripManifestLike {
  schemaVersion: 1;
  files: Array<Record<string, unknown> & { midiFile: string }>;
  dirtyCorpus?: unknown;
  [key: string]: unknown;
}

interface ManifestSource {
  manifest: ChordDripManifestLike;
  entries: Array<{ entry: Record<string, unknown> & { midiFile: string }; midiPath: string }>;
}

interface ReviewRegistry {
  schemaVersion: 1;
  kind: "p521-role-ground-truth-review-registry";
  expectedRoleOptions: readonly string[];
  discovery: {
    worktreesConsidered: number;
    manifestFilesExamined: number;
    validManifests: number;
    uniqueMidiCandidates: number;
    scannedFixtures: number;
    skippedUnreadableMidi: number;
    cleanManifestGenerated: boolean;
    dirtyManifestGenerated: boolean;
  };
  fixtures: readonly GroundTruthTemplate[];
}

interface SourceMap {
  schemaVersion: 1;
  kind: "p521-private-local-source-map";
  sources: Array<{ fixtureId: string; midiPath: string }>;
}

interface CliOptions {
  outputDirectory?: string;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2).filter((argument) => argument !== "--run-cli"));
  const outputDirectory = resolveIgnoredOutputDirectory(
    options.outputDirectory ?? `${defaultOutputPrefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  );
  const worktrees = await gitWorktrees();
  const manifests = await discoverManifestSources(worktrees);
  const clean = selectManifest(manifests, "clean");
  const dirty = selectManifest(manifests, "dirty");
  const candidates = uniqueMidiCandidates(manifests);
  const fixtures: GroundTruthTemplate[] = [];
  const sourceMap: SourceMap["sources"] = [];
  let skippedUnreadableMidi = 0;

  for (const [index, candidate] of candidates.entries()) {
    try {
      const bytes = new Uint8Array(await readFile(candidate));
      const fixtureId = createAnonymousFixtureId(randomUUID);
      const template = scanMidiForGroundTruth(bytes, fixtureId);
      fixtures.push(template);
      sourceMap.push({ fixtureId, midiPath: candidate });
      if ((index + 1) % 100 === 0) {
        process.stdout.write(`Scanned ${index + 1} local MIDI fixtures.\n`);
      }
    } catch {
      skippedUnreadableMidi += 1;
    }
  }

  const registry: ReviewRegistry = {
    schemaVersion: 1,
    kind: "p521-role-ground-truth-review-registry",
    expectedRoleOptions: ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"],
    discovery: {
      worktreesConsidered: worktrees.length,
      manifestFilesExamined: manifests.totalExamined,
      validManifests: manifests.sources.length,
      uniqueMidiCandidates: candidates.length,
      scannedFixtures: fixtures.length,
      skippedUnreadableMidi,
      cleanManifestGenerated: clean !== undefined,
      dirtyManifestGenerated: dirty !== undefined,
    },
    fixtures,
  };

  await mkdir(dirname(outputDirectory), { recursive: true });
  await mkdir(outputDirectory);
  await writeJson(resolve(outputDirectory, "role-review-registry.json"), registry);
  await writeJson(resolve(outputDirectory, "role-review-source-map.private.json"), {
    schemaVersion: 1,
    kind: "p521-private-local-source-map",
    sources: sourceMap,
  } satisfies SourceMap);
  await writeFile(resolve(outputDirectory, "role-review.html"), renderReviewHtml(registry), "utf8");
  if (clean) await writeRebasedManifest(resolve(outputDirectory, "clean-manifest.json"), clean);
  if (dirty) await writeRebasedManifest(resolve(outputDirectory, "dirty-manifest.json"), dirty);

  process.stdout.write(
    `Created P5.21 local review registry: fixtures=${fixtures.length}; voices=${countVoices(fixtures)}; output=${relative(process.cwd(), outputDirectory) || "."}.\n`,
  );
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--out" && !args[1].startsWith("--")) {
    return { outputDirectory: args[1] };
  }
  throw new Error("Usage: --run-cli [--out <ignored-local-directory>]");
}

export function resolveIgnoredOutputDirectory(value: string): string {
  const ignoredRoot = resolve(".local-evaluation");
  const outputDirectory = resolve(value);
  const normalizedRoot = ignoredRoot.toLocaleLowerCase();
  const normalizedOutput = outputDirectory.toLocaleLowerCase();
  if (normalizedOutput === normalizedRoot || normalizedOutput.startsWith(`${normalizedRoot}${sep}`)) {
    return outputDirectory;
  }
  throw new Error("--out must remain inside .local-evaluation");
}

export function renderReviewHtml(registry: ReviewRegistry): string {
  const payload = JSON.stringify(registry).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>P5.21 Voice Role Review</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#09121e;color:#e7eff8}main{max-width:1200px;margin:auto;padding:24px}h1{margin:0 0 8px}p{line-height:1.5}.notice{padding:12px;border:1px solid #377aa8;background:#10283a;border-radius:8px}.tools{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}button,select{font:inherit;padding:8px;border-radius:6px;border:1px solid #4b6a83;background:#172b3c;color:#fff}button{cursor:pointer}section{margin:28px 0;border:1px solid #2b465d;border-radius:10px;overflow:auto}h2{font-size:1rem;margin:0;padding:12px;background:#102031}table{border-collapse:collapse;width:100%;min-width:920px}th,td{padding:8px;border-top:1px solid #294158;text-align:left;vertical-align:top}.muted{color:#a8bbca}.role{font-weight:700}.small{font-size:.85rem}.evidence{margin:0;padding-left:18px}.saved{color:#55e0aa;font-weight:700}</style>
</head>
<body><main>
<h1>P5.21 Voice Role Review</h1>
<p class="notice">Predictions and suggestions are not ground truth. Select or explicitly accept each human-reviewed role before exporting. This page contains no MIDI paths, titles, or raw notes.</p>
<div class="tools"><button id="accept-suggestions">Accept remaining suggestions after review</button><button id="download">Download reviewed registry</button><span id="status" class="saved"></span></div>
<div id="fixtures"></div>
<script>
const registry = ${payload};
const roles = registry.expectedRoleOptions;
const fixtures = document.getElementById("fixtures");
const status = document.getElementById("status");
function escapeHtml(value){return String(value).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"})[c]);}
function percent(value){return (Number(value)*100).toFixed(1)+"%";}
function render(){fixtures.innerHTML=""; for(const fixture of registry.fixtures){const section=document.createElement("section");const heading=document.createElement("h2");heading.textContent="Anonymous fixture "+fixture.fixture.id+" - "+fixture.voices.length+" voices";section.appendChild(heading);const table=document.createElement("table");table.innerHTML="<thead><tr><th>Voice</th><th>Features</th><th>Current prediction</th><th>Evidence</th><th>Human expected role</th></tr></thead>";const body=document.createElement("tbody");for(const voice of fixture.voices){const row=document.createElement("tr");const features=[voice.safeVoiceLabel,"Notes: "+voice.noteCount,voice.pitchRange?"Pitch: "+voice.pitchRange.min+" to "+voice.pitchRange.max:"Pitch: unavailable","Duration: "+(voice.averageDurationBeats??"n/a"),"Polyphony: "+(voice.averagePolyphony??"n/a")].map(escapeHtml).join("<br>");const evidence=voice.evidence.map((item)=>escapeHtml(item.kind+": "+item.role+(item.confidence===null?"":" ("+percent(item.confidence)+")"))).join("<br>");row.innerHTML="<td><strong>Voice "+voice.voiceIndex+"</strong><br><span class='muted'>Channel "+voice.midiChannel+"</span></td><td class='small'>"+features+"</td><td><span class='role'>"+escapeHtml(voice.currentAutomaticRole)+"</span><br><span class='muted'>confidence "+percent(voice.currentAutomaticRoleConfidence)+"</span><br><span class='small'>suggested: "+escapeHtml(voice.suggestedExpectedRole)+"</span></td><td class='small'>"+evidence+"</td>";const cell=document.createElement("td");const select=document.createElement("select");select.dataset.voiceId=voice.voiceId;const pending=document.createElement("option");pending.value="";pending.textContent="Review required: suggested: "+voice.suggestedExpectedRole;select.appendChild(pending);for(const role of roles){const option=document.createElement("option");option.value=role;option.textContent=role;if(voice.expectedRole===role)option.selected=true;select.appendChild(option);}select.value=voice.expectedRole??"";select.onchange=()=>{voice.expectedRole=select.value||null;updateStatus();};const accept=document.createElement("button");accept.type="button";accept.textContent="Accept suggestion";accept.onclick=()=>{voice.expectedRole=voice.suggestedExpectedRole;select.value=voice.expectedRole;updateStatus();};cell.append(select,document.createElement("br"),accept);row.appendChild(cell);body.appendChild(row);}table.appendChild(body);section.appendChild(table);fixtures.appendChild(section);}updateStatus();}
function updateStatus(){const voices=registry.fixtures.flatMap((fixture)=>fixture.voices);const reviewed=voices.filter((voice)=>voice.expectedRole!==null).length;status.textContent=reviewed+" / "+voices.length+" roles explicitly reviewed";}
document.getElementById("accept-suggestions").onclick=()=>{for(const fixture of registry.fixtures){for(const voice of fixture.voices){if(voice.expectedRole===null)voice.expectedRole=voice.suggestedExpectedRole;}}render();};
document.getElementById("download").onclick=()=>{const data=JSON.stringify(registry,null,2)+"\\n";const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));link.download="role-review-confirmed.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);};
render();
</script></main></body></html>`;
}

async function gitWorktrees(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"]);
  return stdout.split(/\r?\n/).flatMap((line) => line.startsWith("worktree ") ? [resolve(line.slice(9))] : []);
}

async function discoverManifestSources(worktrees: readonly string[]): Promise<{ sources: ManifestSource[]; totalExamined: number }> {
  const roots = await evaluationRoots(worktrees);
  const files = (await Promise.all(roots.map((root) => findManifestFiles(root)))).flat();
  const sources: ManifestSource[] = [];
  for (const path of files) {
    const source = await loadManifestSource(path, worktrees);
    if (source) sources.push(source);
  }
  return { sources, totalExamined: files.length };
}

async function evaluationRoots(worktrees: readonly string[]): Promise<string[]> {
  const values: string[] = [];
  for (const worktree of worktrees) {
    for (const suffix of evaluationRootSuffixes) {
      const candidate = resolve(worktree, suffix);
      if (await isDirectory(candidate)) values.push(candidate);
    }
  }
  return [...new Set(values.map((value) => value.toLocaleLowerCase()))].map((value) => value);
}

async function findManifestFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isFile() && entry.name === "manifest.json") results.push(path);
    if (entry.isDirectory() && !entry.isSymbolicLink()) results.push(...await findManifestFiles(path, depth + 1));
  }
  return results;
}

async function loadManifestSource(path: string, allowedWorktrees: readonly string[]): Promise<ManifestSource | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isChordDripManifest(parsed)) return undefined;
    const entries: ManifestSource["entries"] = [];
    for (const entry of parsed.files) {
      const midiPath = resolve(dirname(path), entry.midiFile);
      if (!isInsideAny(midiPath, allowedWorktrees) || !isMidiFile(midiPath) || !await isFile(midiPath)) continue;
      entries.push({ entry, midiPath });
    }
    return entries.length ? { manifest: parsed, entries } : undefined;
  } catch {
    return undefined;
  }
}

function isChordDripManifest(value: unknown): value is ChordDripManifestLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { schemaVersion?: unknown; files?: unknown };
  return candidate.schemaVersion === 1
    && Array.isArray(candidate.files)
    && candidate.files.length > 0
    && candidate.files.every((entry) => entry && typeof entry === "object" && typeof (entry as { midiFile?: unknown }).midiFile === "string");
}

function selectManifest(
  manifests: { sources: readonly ManifestSource[] },
  kind: "clean" | "dirty",
): ManifestSource | undefined {
  const matches = manifests.sources.filter((source) => kind === "dirty"
    ? source.manifest.dirtyCorpus !== undefined
    : source.manifest.dirtyCorpus === undefined && source.entries.every((entry) => entry.entry.degradation === undefined));
  return matches.length === 1 ? matches[0] : undefined;
}

function uniqueMidiCandidates(manifests: { sources: readonly ManifestSource[] }): string[] {
  return [...new Set(manifests.sources.flatMap((source) => source.entries.map((entry) => entry.midiPath.toLocaleLowerCase())))]
    .sort((left, right) => left.localeCompare(right));
}

async function writeRebasedManifest(target: string, source: ManifestSource): Promise<void> {
  const rebased = {
    ...source.manifest,
    files: source.entries.map(({ entry, midiPath }) => ({
      ...entry,
      midiFile: relative(dirname(target), midiPath).split(sep).join("/"),
    })),
  };
  await writeJson(target, rebased);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countVoices(fixtures: readonly GroundTruthTemplate[]): number {
  return fixtures.reduce((total, fixture) => total + fixture.voices.length, 0);
}

function isMidiFile(path: string): boolean {
  const extension = extname(path).toLocaleLowerCase();
  return extension === ".mid" || extension === ".midi";
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}

function isInsideAny(path: string, roots: readonly string[]): boolean {
  const target = resolve(path).toLocaleLowerCase();
  return roots.some((root) => {
    const normalizedRoot = resolve(root).toLocaleLowerCase();
    return target === normalizedRoot || target.startsWith(`${normalizedRoot}${sep}`);
  });
}

if (process.argv.includes("--run-cli")) {
  await main();
}