import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const corpus = JSON.parse(readFileSync(new URL('../../docs/phase8.5-pre/extended-v1-canonical-v1.json',import.meta.url),'utf8'));
const seed = 0x85a501;
function random(seedValue) {
  let state = seedValue >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const transformations = [
  ['extra-space', text => text.replace(' ', '  ') + ' ', true],
  ['tab', text => text.replace(' ', '\t'), true],
  ['crlf', text => text.replace(/\r?\n/g, '\r\n'), true],
  ['unicode-flat', text => text.replace('b','♭'), false],
  ['unicode-pipe', text => text.replace('|','｜'), false],
  ['duplicate-delimiter', text => text.includes('|') ? text.replace('|','||') : `${text}||`, false],
  ['missing-delimiter', text => text.replace('|',''), false],
  ['repeat-control', text => `${text}%`, false],
  ['leading-trailing', text => `  ${text}  `, true],
  ['empty-section', text => `${text}\n[]`, false],
  ['punctuation', text => `${text}?!`, false],
  ['unknown-token', text => `${text} Qxyz`, false],
  ['long-line', text => `${text}${' C'.repeat(1024)}`, false],
  ['long-chord', text => `${text}${'9'.repeat(1024)}`, false],
];
export function generateMutations(count = 200, fixedSeed = seed) {
  const rng = random(fixedSeed);
  const bases = corpus.fixtures.filter(f => f.disposition === 'positive');
  return Array.from({length:count},(_,index) => {
    const base = bases[Math.floor(rng() * bases.length)];
    const [mutationId, transform, meaningPreserving] = transformations[Math.floor(rng() * transformations.length)];
    return { index, fixtureId:base.fixtureId, mutationId, meaningPreserving, rawText:transform(base.rawText) };
  });
}
const first = generateMutations();
const second = generateMutations();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
if (digest(first) !== digest(second) || first.length !== 200 || new Set(first.map(x => x.mutationId)).size !== transformations.length) throw new Error('mutation contract failed');
console.log(JSON.stringify({seed, count:first.length, mutationFamilies:transformations.length, deterministic:true, digest:digest(first)}));
