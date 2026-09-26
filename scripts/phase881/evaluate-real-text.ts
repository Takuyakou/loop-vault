/**
 * Aggregate-only local real-chart acceptance. Inputs remain under ignored
 * .local-evaluation/phase8.8.1/witnesses; no source, filename or per-case
 * diagnostic is printed or persisted by this script.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BrowserMemoryVaultStorage } from "../../src/storage/browserMemoryVaultStorage";
import { createVaultStore } from "../../src/store/vaultStore";
import { JsonVaultRepository } from "../../src/domain/repository";
import { parseExtendedTextProgression } from "../../src/domain/extendedTextProgression";
import { extendedTextSaveData } from "../../src/domain/extendedTextSave";
import { buildProgressionVoicingPracticeHandoffFromVault } from "../../src/domain/progressionVoicingPractice";

interface LocalWitness {
  readonly file: string;
  readonly beat: string;
  readonly bpm?: number;
}
const inputDir = resolve(".local-evaluation/phase8.8.1/witnesses");
const manifestPath = resolve(inputDir, "manifest.json");
const aggregate = {
  witnessCount: 0, parseComplete: 0, previewComplete: 0,
  vaultComplete: 0, practiceComplete: 0,
  totalBars: 0, totalSlots: 0, totalHarmonicSpans: 0,
  totalAttacks: 0, errorCount: 0, warningCount: 0,
};
if (!existsSync(manifestPath)) {
  process.stdout.write(JSON.stringify({ status: "NO_LOCAL_WITNESSES", ...aggregate }) + "\n");
} else {
  try {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(manifest) || manifest.length > 10 || manifest.some(entry =>
      !entry || typeof entry !== "object"
      || typeof (entry as LocalWitness).file !== "string"
      || !/^[A-Za-z0-9_-]+\.txt$/.test((entry as LocalWitness).file)
      || typeof (entry as LocalWitness).beat !== "string"
      || ((entry as LocalWitness).bpm !== undefined
        && typeof (entry as LocalWitness).bpm !== "number"))) throw new Error("invalid manifest");
    for (const witness of manifest as LocalWitness[]) {
      aggregate.witnessCount += 1;
      try {
        const raw = readFileSync(resolve(inputDir, witness.file), "utf8");
        const parsed = parseExtendedTextProgression(raw, {
          beat: witness.beat,
          ...(witness.bpm === undefined ? {} : { bpm: witness.bpm }),
        });
        aggregate.totalBars += parsed.bars.length;
        aggregate.totalSlots += parsed.slots.length;
        aggregate.totalHarmonicSpans += parsed.harmonicSpans.length;
        aggregate.totalAttacks += parsed.harmonicSpans.reduce((sum, span) => sum + span.attacks.length, 0);
        aggregate.errorCount += parsed.diagnostics.filter(issue => issue.severity === "ERROR").length;
        aggregate.warningCount += parsed.diagnostics.filter(issue => issue.severity === "WARNING").length;
        if (!parsed.canConvert) continue;
        aggregate.parseComplete += 1;
        if (parsed.bars.length > 0 && parsed.bars.every(bar => bar.length > 0)) aggregate.previewComplete += 1;
        const storage = new BrowserMemoryVaultStorage();
        const repository = new JsonVaultRepository(storage);
        let sequence = 0;
        const store = createVaultStore({
          repository,
          idFactory: () => "00000000-0000-4000-8000-" + String(++sequence).padStart(12, "0"),
        });
        await store.getState().initialize();
        const ideaId = store.getState().createIdeaFromTextProgression(extendedTextSaveData(parsed));
        if (!ideaId) continue;
        await store.getState().flush();
        const loaded = await new JsonVaultRepository(storage).load();
        const idea = loaded.vault.ideas.find(value => value.id === ideaId);
        const block = idea?.progressionBlocks?.[0];
        if (loaded.quarantine.length || !block || block.textSource?.rawText !== raw) continue;
        aggregate.vaultComplete += 1;
        const handoff = buildProgressionVoicingPracticeHandoffFromVault([idea!], {
          ideaId, blockId: block.id,
        });
        if (handoff.ok) aggregate.practiceComplete += 1;
      } catch {
        aggregate.errorCount += 1;
      }
    }
    process.stdout.write(JSON.stringify({ status: "AGGREGATE_ONLY", ...aggregate }) + "\n");
  } catch {
    process.stdout.write(JSON.stringify({ status: "INVALID_LOCAL_MANIFEST", ...aggregate }) + "\n");
    process.exitCode = 1;
  }
}
