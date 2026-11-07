export type EarMode = "major" | "minor";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"] as const;

/** The 12 keys the practice uses: C Db D Eb E F F# G Ab A Bb B / Cm C#m Dm Ebm Em Fm F#m Gm G#m Am Bbm Bm. */
export function earKeyName(tonic: number, mode: EarMode): string {
  const index = ((tonic % 12) + 12) % 12;
  return mode === "minor" ? MINOR_KEYS[index]! : MAJOR_KEYS[index]!;
}

/** The same, with ♭ / ♯ (for the screen). */
export function earKeyDisplayName(tonic: number, mode: EarMode): string {
  return earKeyName(tonic, mode).replace("b", "♭").replace("#", "♯");
}

/**
 * Whether a chord written without an accidental on its degree is spelled with flats or sharps in this key.
 * A minor key follows its relative major (D minor → F major → flats); E♭ minor is a flat key, F♯ major a sharp one.
 */
export function keySpelling(tonic: number, mode: EarMode): "flat" | "sharp" {
  const index = ((tonic % 12) + 12) % 12;
  if (mode === "major") return [1, 3, 5, 8, 10].includes(index) ? "flat" : "sharp";
  return [0, 2, 3, 5, 7, 10].includes(index) ? "flat" : "sharp";
}

export interface EarKeySignature {
  accidental: "flat" | "sharp";
  count: number;
}

const MAJOR_SIGNATURES: ReadonlyArray<EarKeySignature> = [
  { accidental: "sharp", count: 0 }, { accidental: "flat", count: 5 }, { accidental: "sharp", count: 2 },
  { accidental: "flat", count: 3 }, { accidental: "sharp", count: 4 }, { accidental: "flat", count: 1 },
  { accidental: "sharp", count: 6 }, { accidental: "sharp", count: 1 }, { accidental: "flat", count: 4 },
  { accidental: "sharp", count: 3 }, { accidental: "flat", count: 2 }, { accidental: "sharp", count: 5 },
];

/** The key signature of one of the 12 keys (C D♭ D E♭ E F F♯ G A♭ A B♭ B; Cm C♯m Dm E♭m Em Fm F♯m Gm G♯m Am B♭m Bm). */
export function keySignatureOf(tonic: number, mode: EarMode): EarKeySignature {
  const index = ((tonic % 12) + 12) % 12;
  // A minor key has the signature of its relative major, three semitones up. E♭ minor (named with flats) is the one
  // whose relative major is written G♭ (6 flats), not F♯ (6 sharps).
  if (mode === "minor" && index === 3) return { accidental: "flat", count: 6 };
  return MAJOR_SIGNATURES[mode === "minor" ? (index + 3) % 12 : index]!;
}
