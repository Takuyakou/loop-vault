/** A chord or key name as it is shown: B♭maj7, F♯m7♭5, E7(♭9). */
export function displayChordLabel(label: string): string {
  return label
    .replace(/([A-G])b/g, "$1♭")
    .replace(/([0-9)a-z])b(?=[0-9])/g, "$1♭")
    .replace(/\(b/g, "(♭")
    .replace(/,b/g, ",♭")
    .replace(/#/g, "♯");
}
