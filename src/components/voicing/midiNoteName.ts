const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiNoteName(note: number): string {
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}
