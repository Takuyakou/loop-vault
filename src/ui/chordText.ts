/** A chord or key name as it is shown: B♭maj7, F♯m7♭5, E7(♭9). Display only — never store or compare the result. */
export function displayChordLabel(label: string): string {
  return label
    .replace(/([A-G])b/g, "$1♭")
    .replace(/([0-9)a-z])b(?=[0-9])/g, "$1♭")
    .replace(/\(b/g, "(♭")
    .replace(/,b/g, ",♭")
    .replace(/#/g, "♯");
}

export interface ChordLabelParts {
  /** The root letter, A–G. */
  letter: string;
  /** "♯", "♭", a double sign, or "". */
  accidental: string;
  /** Everything after the root: "m7♭5", "7sus4/C", "…", or "". */
  rest: string;
}

/** The shown name split into root and the rest. Undefined when the text does not start with a root (「?」, a rest). */
export function splitChordLabel(label: string): ChordLabelParts | undefined {
  const match = /^([A-G])([♯♭𝄫𝄪]?)(.*)$/su.exec(displayChordLabel(label));
  if (!match) return undefined;
  return { letter: match[1]!, accidental: match[2]!, rest: match[3]! };
}

const ROMAN_GLYPH: Record<string, string> = { I: "Ⅰ", II: "Ⅱ", III: "Ⅲ", IV: "Ⅳ", V: "Ⅴ", VI: "Ⅵ", VII: "Ⅶ" };
const DEGREE_HEAD = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/;

function degreeHead(text: string): { text: string; minor: boolean; rest: string } | undefined {
  const match = DEGREE_HEAD.exec(text);
  if (!match) return undefined;
  const sign = match[1] === "b" || match[1] === "♭" ? "♭" : match[1] === "#" || match[1] === "♯" ? "♯" : "";
  const roman = match[2]!;
  return { text: `${sign}${ROMAN_GLYPH[roman.toUpperCase()]}`, minor: roman !== roman.toUpperCase(), rest: text.slice(match[0].length) };
}

/**
 * A degree as it is shown, in one form on every screen: `ii7` → `Ⅱm7`, `vi` → `Ⅵm`, `bVII7` → `♭Ⅶ7`,
 * `IVmaj9/V` → `Ⅳmaj9/Ⅴ`, `iiø7` → `Ⅱø7`, `I/3rd` → `Ⅰ/3rd`. Text that is already in that form, a list of
 * degrees (`ii–V–I`), or anything that is not a degree comes back unchanged. Display only.
 */
export function displayDegreeLabel<T extends string | undefined>(text: T): T {
  if (text === undefined || /[–\s]/.test(text)) return text;
  const head = degreeHead(text);
  if (!head) return text;
  let rest = head.rest;
  let bass = "";
  const slash = rest.lastIndexOf("/");
  if (slash >= 0) {
    const bassHead = degreeHead(rest.slice(slash + 1));
    if (bassHead && bassHead.rest === "") {
      bass = `/${bassHead.text}`;
      rest = rest.slice(0, slash);
    }
  }
  const minorMark = head.minor && !/^(dim|ø|°|m(?!aj))/.test(rest) ? "m" : "";
  rest = rest.replace(/b(?=\d)/g, "♭").replace(/\(b/g, "(♭").replace(/#/g, "♯");
  return `${head.text}${minorMark}${rest}${bass}` as T;
}

const DEGREE_PART = /^[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:$|[0-9(/+øΔ°]|maj|m(?![a-z])|dim|aug|sus|add)/;

/**
 * A list of degrees joined by 「–」 as it is shown: `IVmaj7–V7–iii7–vi7` → `Ⅳmaj7–Ⅴ7–Ⅲm7–Ⅵm7`.
 * Text in which any part is not a degree (a title such as 「王道進行」 or `Imagine`) comes back unchanged.
 */
export function displayDegreeList<T extends string | undefined>(text: T): T {
  if (text === undefined) return text;
  const parts = text.split("–");
  if (!parts.every((part) => DEGREE_PART.test(part))) return text;
  return parts.map((part) => displayDegreeLabel(part)).join("–") as T;
}
