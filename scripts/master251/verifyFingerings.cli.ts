import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { verifyMasterFingerings } from './verifyFingerings';

// CLI only: vite-node removes the script name from argv, leaving output at index2.
const result = verifyMasterFingerings();
const output = process.argv[2];
if (output) {
  const roots = ['master-sequence-boundary', 'master-lh-templates', 'master-form-templates'].map(name => resolve('p12-generated', name));
  const destination = resolve(output);
  assert(roots.some(root => destination.startsWith(root + '/') || destination.startsWith(root + '\\')),
    'Verification output must stay in approved Master audit folders');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({
  status: result.status, cells: result.cells.length,
  notesSha256: result.notesSha256, fingerprint: result.fingerprint,
  proofScope: result.proofScope,
}, null, 2));
