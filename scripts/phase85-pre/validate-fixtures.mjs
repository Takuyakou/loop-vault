import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const corpusPath = new URL('../../docs/phase8.5-pre/extended-v1-canonical-v1.json', import.meta.url);
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const fail = (reason) => { throw new Error(`P8.5 PRE fixture contract: ${reason}`); };
if (corpus.fixtureVersion !== 'extended-v1-canonical-v1' || corpus.sourceKind !== 'authored-synthetic') fail('wrong corpus identity');
if (!Array.isArray(corpus.fixtures) || corpus.fixtures.length < 60 || corpus.fixtures.length > 100) fail('fixture count outside freeze range');
const ids = new Set();
const raw = new Set();
const dispositionCounts = { positive: 0, negative: 0, ambiguous: 0, empty: 0 };
const categories = new Set();
for (const fixture of corpus.fixtures) {
  const { fixtureId, category, disposition, rawText, expectedTokens, expectedBars, expectedEvents,
    expectedSections, expectedMetadata, expectedDiagnostics, expectedNormalizedMeaning, sourceFeatureIds } = fixture;
  if (!/^EV1-\d{3}$/.test(fixtureId) || ids.has(fixtureId)) fail('duplicate or malformed ID');
  ids.add(fixtureId);
  if (raw.has(rawText)) fail(`duplicate rawText at ${fixtureId}`);
  raw.add(rawText);
  if (!category || !Object.hasOwn(dispositionCounts, disposition)) fail(`bad category/disposition at ${fixtureId}`);
  dispositionCounts[disposition]++;
  categories.add(category);
  if (typeof rawText !== 'string' || /https?:\/\/|[A-Z]:\\|\/Users\/|\\Users\\|\.mid\b/i.test(rawText)) fail(`unsafe rawText at ${fixtureId}`);
  if (![expectedTokens, expectedBars, expectedEvents, expectedSections, expectedDiagnostics, sourceFeatureIds].every(Array.isArray)) fail(`missing arrays at ${fixtureId}`);
  if (typeof expectedMetadata !== 'object' || !expectedNormalizedMeaning || typeof expectedNormalizedMeaning.barCount !== 'number') fail(`missing normalized contract at ${fixtureId}`);
  if (JSON.stringify(expectedTokens) !== JSON.stringify(expectedBars.flat())) fail(`token/bar mismatch at ${fixtureId}`);
  if (disposition === 'positive') {
    if (!expectedBars.length || expectedDiagnostics.length || expectedEvents.length !== expectedTokens.length) fail(`bad positive at ${fixtureId}`);
    for (const event of expectedEvents) {
      if (!Number.isFinite(event.startBeat) || !Number.isFinite(event.durationBeats) || event.durationBeats <= 0 || !['attack','reattack','hold','rest'].includes(event.kind)) fail(`bad event at ${fixtureId}`);
      if (event.kind !== 'rest' && !event.chord) fail(`unresolved chord at ${fixtureId}`);
    }
  } else if (disposition === 'negative' || disposition === 'ambiguous') {
    if (!expectedDiagnostics.length || expectedEvents.length) fail(`unresolved negative/ambiguous at ${fixtureId}`);
  } else if (expectedEvents.length || expectedDiagnostics.length || expectedBars.length) fail(`bad empty state at ${fixtureId}`);
  if (sourceFeatureIds.some((id) => !/^S\d{2}$/.test(id))) fail(`bad feature ID at ${fixtureId}`);
}
for (const category of ['simple','bars','multi-event','compact-adjacent','internal-whitespace','slash-bass','repeat','rest','sustain','header','comment','metadata','key','bpm','capo','Unicode','complex-chord','altered','omit','malformed','ambiguous','empty','whitespace-only']) {
  if (!categories.has(category)) fail(`missing category ${category}`);
}
const canonicalFixtureDigest = createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
const counts = { canonicalFixtureCount: corpus.fixtures.length, positiveCount: dispositionCounts.positive,
  negativeCount: dispositionCounts.negative, ambiguousCount: dispositionCounts.ambiguous,
  emptyCount: dispositionCounts.empty, categoryCount: categories.size, canonicalFixtureDigest };
try {
  const manifest = JSON.parse(readFileSync(new URL('../../docs/phase8.5-pre/extended-v1-manifest.json', import.meta.url),'utf8'));
  for (const [key,value] of Object.entries(counts)) if (manifest[key] !== undefined && manifest[key] !== value) fail(`manifest mismatch: ${key}`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log(JSON.stringify(counts));
