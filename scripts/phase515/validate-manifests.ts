import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { loadPhase515CorpusContract } from "./validateCorpusContract";
import {
  corpusWorkspaceExists,
  validateCorpusWorkspace,
  validateGeneratedCorpus,
} from "./corpusWorkspace";

const root = cwd();
const manifestPath = resolve(root, "scripts/phase515/fixtures/manifest-v2.json");
const contract = await loadPhase515CorpusContract(manifestPath);
const generated = await validateGeneratedCorpus(contract);
const localPresent = await corpusWorkspaceExists(root);
const local = localPresent
  ? await validateCorpusWorkspace(root, contract, "local-ignored")
  : null;
const valid = generated.valid && (local?.valid ?? true);
stdout.write(`${JSON.stringify({
  manifestPath: "scripts/phase515/fixtures/manifest-v2.json",
  generated,
  localExternalCorpus: local ?? {
    source: "local-ignored",
    status: "SKIPPED (ignored corpus not present; tracked contract is authoritative)",
  },
  valid,
}, null, 2)}\n`);
if (!valid) process.exitCode = 1;
