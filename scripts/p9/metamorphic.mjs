import { sha256, canonicalJson } from "./usageProfile.mjs";
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";

function mapGold(testCase, transform) {
  return { ...testCase, gold: testCase.gold.map((event) => ({ ...event, sourceNotes: event.sourceNotes.map(transform) })) };
}
export function metamorphicVariants(testCase) {
  const variants = [];
  variants.push({ id: "transpose-plus-2", source: mapGold({ ...testCase, notes: testCase.notes.map((note) => ({ ...note, pitch: note.pitch + 2 })) }, (pitch) => pitch + 2), expected: "pitch-shift-plus-2" });
  variants.push({ id: "tempo-136", source: { ...testCase, tempoBpm: 136 }, expected: "same-note-ticks" });
  variants.push({ id: "jitter-plus-5-ticks", source: { ...testCase, notes: testCase.notes.map((note) => ({ ...note, startTick: note.startTick + 5, durationTick: Math.max(1, note.durationTick - 5) })) }, expected: "same-note-identity" });
  variants.push({ id: "velocity-minus-12", source: { ...testCase, notes: testCase.notes.map((note) => ({ ...note, velocity: Math.max(1, note.velocity - 12) })) }, expected: "same-note-ticks" });
  variants.push({ id: "register-plus-12", source: mapGold({ ...testCase, notes: testCase.notes.map((note) => ({ ...note, pitch: note.pitch + 12 })) }, (pitch) => pitch + 12), expected: "pitch-shift-plus-12" });
  variants.push({ id: "meter-representation-one-quarter", source: { ...testCase, meter: [1, 4] }, expected: "same-absolute-ticks" });
  variants.push({ id: "track-split", source: { ...testCase, notes: testCase.notes.map((note, index) => ({ ...note, track: index % 2 })) }, expected: "same-note-ticks" });
  variants.push({ id: "track-merge", source: { ...testCase, notes: testCase.notes.map((note) => ({ ...note, track: 0 })) }, expected: "same-note-ticks" });
  return variants;
}
export function generateMetamorphicInventory() {
  const { cases, manifest } = generateUsageCorpusV2();
  const inventory = cases.flatMap((item) => metamorphicVariants(item).map((variant) => ({ sourceCaseId: item.id, variantId: variant.id, expected: variant.expected, sha256: sha256(canonicalJson(variant.source)) })));
  return { sourceManifestSha: manifest.sha256, variants: inventory, sha256: sha256(canonicalJson(inventory)) };
}
