import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const docs = [
  '00-text-intake-overlap-audit.md', '01-extended-v1-syntax-spec.md',
  '02-normal-extended-compatibility.md', '03-syntax-saturation-report.md',
  '04-canonical-fixture-spec.md', '05-property-fuzz-contract.md',
  '06-chord-semantics-compatibility.md', '07-reference-voicing-research.md',
  'P8.5-PRE-final-handoff.md',
];
const fail = reason => { throw new Error(`P8.5 PRE research validation: ${reason}`); };
for (const name of docs) {
  const path = new URL(`docs/phase8.5-pre/${name}`,root);
  if (!existsSync(path)) fail(`missing ${name}`);
  const content = readFileSync(path,'utf8');
  if (!content.startsWith('# ') || content.length < 500) fail(`incomplete ${name}`);
}
const tracked = execFileSync('git',['ls-files','--','docs/phase8.5-pre','scripts/phase85-pre','.local-evaluation'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
if (tracked.some(path => path.startsWith('.local-evaluation/'))) fail('local research artifact tracked');
const forbidden = [/[A-Z]:\\(?:Users|dev)\\/i, /\\Users\\/i, /\/Users\//, /\.mid\b/i, /https?:\/\//i,
  /\.local-evaluation/i, /(?:\.mp3|\.wav|\.flac)\b/i];
for (const path of tracked.filter(path => path.startsWith('docs/phase8.5-pre/'))) {
  const content = readFileSync(new URL(path,root),'utf8');
  if (forbidden.some(pattern => pattern.test(content))) fail(`private/source-specific string in ${path}`);
}
const manifest = JSON.parse(readFileSync(new URL('docs/phase8.5-pre/extended-v1-manifest.json',root),'utf8'));
if (manifest.syntaxFamilyCount !== 18 || manifest.chordFamilyCount !== 18 || manifest.researchPassCount < 5 || !manifest.saturationReached) fail('research counts/status mismatch');
if (manifest.referenceVoicingSampleCount !== 30 || manifest.voicingComplexityClassification !== 'SIMPLE_CHORD_LOCAL') fail('voicing status mismatch');
console.log(JSON.stringify({requiredDocs:docs.length,trackedResearchFiles:tracked.length,localArtifactTracked:false,neutralSourceScan:'pass',privacyScan:'pass'}));
