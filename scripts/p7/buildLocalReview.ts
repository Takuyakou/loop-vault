/** Local-only source review pack. Never imports analysis, ranking, or prior truth. */
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { extractSourceFacts, blankReview, validateReview, materializeReviewedGold, type ReviewAnnotation, type SourceFactBundle } from "./localAnnotation";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
async function existing(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
async function regularDirectory(path: string): Promise<void> {
  if (await existing(path)) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Local output must be a regular directory.");
  } else await mkdir(path);
}
function safeJson(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }
async function main(): Promise<void> {
  const sourcePath = arg("--source");
  if (!sourcePath) throw new Error("Required: --source <local MIDI path> [--id local-witness-01] [--check <review.json>]");
  const id = arg("--id") ?? "local-witness-01";
  const source = resolve(sourcePath);
  const bytes = new Uint8Array(await readFile(source));
  const facts = extractSourceFacts(bytes, id);
  const root = resolve(arg("--local-root") ?? resolve(process.cwd(), ".local-evaluation"));
  if (basename(root) !== ".local-evaluation") throw new Error("--local-root must name a .local-evaluation directory.");
  const phase = resolve(root, "phase7");
  const output = resolve(phase, id);
  await regularDirectory(root); await regularDirectory(phase); await regularDirectory(output);
  const factsPath = resolve(output, "source-facts.json");
  const reviewPath = resolve(output, "review.json");
  if (await existing(factsPath)) {
    const prior = JSON.parse(await readFile(factsPath, "utf8")) as SourceFactBundle;
    if (prior.sourceSha256 !== facts.sourceSha256 || prior.anonymousId !== id) throw new Error("Existing local pack belongs to a different source.");
  }
  if (await existing(reviewPath)) {
    const prior = JSON.parse(await readFile(reviewPath, "utf8")) as ReviewAnnotation;
    if (prior.sourceSha256 !== facts.sourceSha256 || prior.anonymousId !== id) throw new Error("Existing local review belongs to a different source.");
  }
  if (sha(new Uint8Array(await readFile(source))) !== facts.sourceSha256) throw new Error("Source changed during extraction.");
  if (arg("--check")) {
    const review = JSON.parse(await readFile(resolve(arg("--check")!), "utf8")) as ReviewAnnotation;
    const issues = validateReview(facts, review);
    if (issues.length) throw new Error("Review validation: " + issues.join(", "));
    if (review.status === "reviewed") {
      await writeFile(resolve(output, "accepted-gold.json"), safeJson(materializeReviewedGold(facts, review)), { flag: "w" });
    }
    process.stdout.write("Local review structure valid; status=" + review.status + ". Source unchanged.\n");
    return;
  }
  const template = await readFile(new URL("./localReviewTemplate.html", import.meta.url), "utf8");
  const embedded = safeJson(facts).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
  if (!template.includes("__SOURCE_FACTS_JSON__")) throw new Error("Review template placeholder missing.");
  await writeFile(factsPath, safeJson(facts), { flag: "w" });
  if (!(await existing(reviewPath))) await writeFile(reviewPath, safeJson(blankReview(facts)), { flag: "wx" });
  await writeFile(resolve(output, "source-only-review.html"), template.replace("__SOURCE_FACTS_JSON__", embedded), { flag: "w" });
  process.stdout.write("Local source-only pack ready under .local-evaluation/phase7/" + id + "/\n");
  process.stdout.write("Observed notes=" + facts.notes.length + ", onset clusters=" + facts.onsetClusters.length + ", PPQ=" + facts.ppq + ", source unchanged=true. Gold status=draft.\n");
}
try { await main(); } catch (error) {
  process.stderr.write("P7 local review failed: " + (error instanceof Error ? error.message : "unknown error") + "\n");
  process.exitCode = 1;
}
