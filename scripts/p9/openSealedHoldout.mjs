/** Holdout may only be opened by a single P9.7 invocation. Never import this in dev evaluators. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function openSealedHoldout({ stage, runId }) {
  if (stage !== "P9.7" || typeof runId !== "string" || !runId.trim()) {
    throw new Error("SEALED_HOLDOUT_ACCESS_DENIED");
  }
  const local = resolve(".local-evaluation/p9-sealed");
  const publicMetadata = JSON.parse(await readFile(resolve("docs/phase9.0/evidence/holdout-seal-metadata.json"), "utf8"));
  const manifestBytes = await readFile(resolve(local, "manifest.json"));
  if (digest(manifestBytes) !== publicMetadata.manifestSha256) throw new Error("SEALED_MANIFEST_MISMATCH");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.status !== "SEALED" || manifest.openingCount !== 0) throw new Error("SEALED_MANIFEST_INVALID");
  await writeFile(resolve(local, "opened.json"), JSON.stringify({ stage, runId, openedAt: new Date().toISOString() }), { flag: "wx" });
  const payloadBytes = await readFile(resolve(local, "holdout.json"));
  if (digest(payloadBytes) !== manifest.payloadSha256) throw new Error("SEALED_PAYLOAD_MISMATCH");
  return JSON.parse(payloadBytes.toString("utf8"));
}
