import data from './teaching-templates.json' with { type: 'json' };
import type { FormId } from './model';
type Hand = 'lh' | 'rh';
interface Fingers { readonly lh: readonly (readonly number[])[]; readonly rh: readonly (readonly number[])[]; }
interface KeyOverride { readonly form: FormId; readonly key: number; readonly fingers: Fingers; readonly humanApproval: string; }
interface TemplateData { readonly defaultTemplates: Record<FormId, Fingers>; readonly perKeyOverrides: readonly KeyOverride[]; }
const templates: TemplateData = data;
for (const row of templates.perKeyOverrides) {
  if (!Number.isInteger(row.key) || row.key < 0 || row.key > 11
    || typeof row.humanApproval !== 'string' || !row.humanApproval.trim())
    throw Error('Master key override needs numeric pitch class and human approval');
}
/** Master-only pedagogy. Generic fingering costs and personal anchors stay unchanged. */
export function masterTemplateFingers(form: FormId, key: number, hand: Hand, chordIndex: number) {
  if (!Number.isInteger(key) || key < 0 || key > 11) throw Error('Master key must be pitch class 0..11');
  const override = templates.perKeyOverrides.find(row => row.form === form && row.key === key);
  const fingers = (override?.fingers ?? templates.defaultTemplates[form])[hand][chordIndex];
  if (!fingers || fingers.some(f => !Number.isInteger(f) || f < 1 || f > 5)
    || new Set(fingers).size !== fingers.length) throw Error('Invalid Master teaching template');
  return fingers;
}
