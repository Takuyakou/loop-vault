/** The semitones of the major scale from its tonic (degrees I…VII). */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export interface DegreeRef {
  /** −1 = ♭, 0 = natural, 1 = ♯ */
  accidental: -1 | 0 | 1;
  /** 1…7 */
  degree: number;
}

export interface DegreeToken extends DegreeRef {
  /** What follows the degree, as the app writes a chord suffix: "", "m7", "7(b9)", "6/9", "7alt" … */
  suffix: string;
  bass?: DegreeRef;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
const TOKEN = /^([b#]?)(VII|VI|IV|V|III|II|I)(.*)$/;
// A "/" is a bass only when what follows is a degree at the very end ("6/9" is not a bass).
const BASS = /\/([b#]?)(VII|VI|IV|V|III|II|I)$/;

function ref(accidental: string, roman: string): DegreeRef {
  return {
    accidental: accidental === "b" ? -1 : accidental === "#" ? 1 : 0,
    degree: ROMAN.indexOf(roman as (typeof ROMAN)[number]) + 1,
  };
}

/** `bVIImaj7`, `V7(b9)`, `I/III`, `I6/9/II` … Throws on anything else (the data is checked by a test). */
export function parseDegreeToken(token: string): DegreeToken {
  const head = TOKEN.exec(token);
  if (!head) throw new Error(`Not a degree token: ${token}`);
  let suffix = head[3]!;
  let bass: DegreeRef | undefined;
  const slash = BASS.exec(suffix);
  if (slash) {
    bass = ref(slash[1]!, slash[2]!);
    suffix = suffix.slice(0, slash.index);
  }
  return { ...ref(head[1]!, head[2]!), suffix, ...(bass ? { bass } : {}) };
}

/** Pitch class of a degree above the tonic. */
export function degreePitchClass(tonic: number, value: DegreeRef): number {
  return (((tonic + MAJOR_SCALE[value.degree - 1]! + value.accidental) % 12) + 12) % 12;
}
