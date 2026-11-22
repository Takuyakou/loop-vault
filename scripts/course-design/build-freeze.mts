/**
 * P23-39 freeze generator (v2). Run with vite-node from the repo root:
 *   node node_modules/vite-node/vite-node.mjs scripts/course-design/build-freeze.mts
 *
 * It writes the frozen artifacts under docs/p23-39-contracts/ and their hashes. The script is a design
 * tool: the product never imports `src/courseDesign`.
 *
 * v2 keeps the v1 files on disk (their content and hashes are the historical record; nothing is deleted)
 * and records them under `supersedes`. P23-40 must read the v2 pair only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { CONTRACT_VERSION, POLICY, buildBank } from "../../src/courseDesign/bank";
import { buildInventory } from "../../src/courseDesign/inventory";

const dir = "docs/p23-39-contracts";
mkdirSync(dir, { recursive: true });

function write(name: string, value: unknown): { name: string; sha256: string; bytes: number } {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(`${dir}/${name}`, text, "utf8");
  return { name, sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
}

const inventory = write("inventory.json", buildInventory());
const bank = write("bank-lv1-3-v3.json", buildBank(2338));
const policy = write("policy-lv1-3-v3.json", POLICY);

const manifest = {
  stage: "P23-39",
  frozenOn: "2026-11-17",
  contractVersion: CONTRACT_VERSION,
  pairId: POLICY.pairId,
  versions: { bank: POLICY.bankVersion, policy: POLICY.version, contract: CONTRACT_VERSION },
  supersedes: [
    {
      contractVersion: "p23-39.contracts.v2",
      pairId: "p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2",
      frozenCommit: "895c796b",
      reviewedReportHead: "13bb3a4d",
      review: "review/P23-39-v2.md",
      verdict: "fix requested for two findings: evaluation-set quality coverage and the missing delayed-date rule",
      artifacts: [
        { name: "inventory.json", sha256: "8e40748d77c684d732bccb4ff8a2c32a731628e38ad11c89acdb6475891e6b38", bytes: 413001 },
        { name: "bank-lv1-3-v2.json", sha256: "16cac564ea1b5ec02fdbf57f5b671686aa8ce1a2956e04f6ec72070f750579db", bytes: 100191 },
        { name: "policy-lv1-3-v2.json", sha256: "8af1c5baf4c8ccad964d60024c1a30fceeac2fa10e60a8e340250a42cf31cb82", bytes: 3916 },
      ],
    },
    {
      contractVersion: "p23-39.contracts.v1",
      pairId: "p23-39.bank.lv1-3.v1+p23-39.policy.lv1-3.v1",
      frozenCommit: "64d7f8d7",
      reviewedHead: "9783a450",
      review: "review/P23-39.md",
      verdict: "NOT_READY_FOR_P23-40; v1 is not a valid freeze and must not be used by P23-40",
      artifacts: [
        { name: "inventory.json", sha256: "8e40748d77c684d732bccb4ff8a2c32a731628e38ad11c89acdb6475891e6b38", bytes: 413001 },
        { name: "bank-lv1-3.json", sha256: "0171d0e0da6d96106323c5f920055212f64adf857ae66f1f1d3e4fe8ebe33176", bytes: 16698 },
        { name: "policy-lv1-3-v1.json", sha256: "fb0f80622897dc544baa7bf05a7e2e102521296751f7436e66d77bc5d643aaa7", bytes: 2516 },
      ],
    },
  ],
  differencesFromV2: [
    "Lv2 ear set (10) now covers all four qualities: 3 maj7 / 3 min7 / 2 dom7 / 2 min7b5, all six roots",
    "Lv3 delayed set (12) now covers all six qualities, two each",
    "Lv1 ear set is balanced 5 maj / 5 min across all six roots",
    "official evaluateLevel requires recorded times for every evaluated trial and the delayed block to start on a later local day and >= 12 h after the same-day completion; missing/same-day/<12 h/backwards are not eligible",
    "policy v3 records the delayed-date rule and the v2 superseded reasons; pair p23-39.bank.lv1-3.v3+p23-39.policy.lv1-3.v3",
  ],
  differencesFromV1: [
    "Lv2 bank roots 5 -> 6 (C/G/F/A/D/E); the 20 same-day items still give 5 per quality, and the sixth root of each quality is the spare delayed cell",
    "Lv2 ear 10/8 restored to the policy and to the bank (synthetic single-chord prompts, root presented)",
    "same-day / delayed / ear sets are materialised as item ids; the delayed sets are disjoint from the same-day sets (v1 named sets in prose only)",
    "Lv1/Lv3 keep shared cells on the delayed day (they use every cell on the same day) with a different authored placement; 'different order' alone is not a different problem",
    "name-recall answer policy no longer requires the source voicing's bass: unspecified bass is free (any inversion); saved-voicing exact is a separate policy",
    "input contract: response wait (10000 ms) / capture window (1500 ms from the first Note On) / settle (60 ms) are separate; seal is the boundary instant; stall 250 ms and hidden tab invalidate; ear arms at the audio-ended callback",
    "official pass aggregator requires the exact frozen denominators, every quality block, root coverage, the delayed and ear blocks and the Lv3 speed ratio; partial scoring is a separate non-promotion helper",
    "store physical location frozen (loop-vault:guided-course-v1:data / loopvault/guided-course-v1.json / loopvault-guided-course); the version pair must be internally consistent",
  ],
  artifacts: [inventory, bank, policy],
  tests: {
    runner: "vitest run src/courseDesign",
    files: [
      "src/courseDesign/inputContract.test.ts",
      "src/courseDesign/judgingCorrespondence.test.ts",
      "src/courseDesign/inventory.test.ts",
      "src/courseDesign/bank.test.ts",
      "src/courseDesign/answerPolicy.test.ts",
      "src/courseDesign/storeContract.test.ts",
    ],
    result: "see docs/reports/p23-39-guided-course-contracts.md",
  },
  isolation: "src/courseDesign is not imported by any product module",
};
write("freeze-manifest.json", manifest);
console.log(JSON.stringify({ inventory: inventory.sha256, bank: bank.sha256, policy: policy.sha256 }, null, 2));
