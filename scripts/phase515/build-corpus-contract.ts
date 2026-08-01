import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { buildCorpusContract } from "./corpusContract";

const root = cwd();
const output = resolve(root, "scripts/phase515/fixtures/manifest-v2.json");
const contract = await buildCorpusContract(root);
const rendered = `${JSON.stringify(contract, null, 2)}\n`;
const exists = await access(output).then(() => true, () => false);
const current = exists ? await readFile(output, "utf8") : null;
if (current !== null && current !== rendered) {
  throw new Error(
    "Source/contract drift detected. Refusing to overwrite the tracked oracle; "
    + "schema upgrades require a code change, a new reviewed fixture, and a manual diff.",
  );
}
if (argv.includes("--write")) {
  if (current !== null) {
    stdout.write(`Verified ${contract.cases.length} source cases against the tracked v2 contract.\n`);
    process.exit(0);
  }
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, rendered, "utf8");
  stdout.write(`Wrote ${contract.cases.length} cases to scripts/phase515/fixtures/manifest-v2.json\n`);
} else {
  if (!exists) {
    throw new Error("Tracked v2 contract is missing. Re-run with --write to initialize it.");
  }
  stdout.write(`Verified ${contract.cases.length} source cases against the tracked v2 contract.\n`);
}
