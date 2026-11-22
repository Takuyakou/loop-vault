/** The 88 keys of a piano (A0 = 21 … C8 = 108), split into the white row and the black keys over it. */
const BLACK_PITCH_CLASSES = [1, 3, 6, 8, 10];

export const PIANO_KEY_LAYOUT = (() => {
  const white: number[] = [];
  const black: { midi: number; whiteIndex: number }[] = [];
  for (let midi = 21; midi <= 108; midi += 1) {
    if (BLACK_PITCH_CLASSES.includes(midi % 12)) black.push({ midi, whiteIndex: white.length });
    else white.push(midi);
  }
  return { white, black };
})();

/**
 * P23-26 S5: the thin 88-key strip, lit while a note is held. The small Live MIDI window (P23-18) and the
 * MIDI 入力 section of Settings draw the same thing, so both use this one part.
 * `bass` marks the lowest held note (the small window paints it white, keyed by `data-key-state`).
 */
export function LiveMidiKeyStrip({
  pressed,
  className = "lv-live-mini-keys",
  testId = "live-midi-keys",
}: {
  readonly pressed: readonly number[];
  readonly className?: string;
  readonly testId?: string;
}) {
  const lowest = pressed.length > 0 ? Math.min(...pressed) : undefined;
  const keyState = (midi: number) => (
    midi === lowest ? "bass" : pressed.includes(midi) ? "on" : undefined
  );
  return (
    <div className={className} aria-hidden="true" data-testid={testId}>
      {PIANO_KEY_LAYOUT.white.map((midi) => (
        <span key={midi} className="lv-live-mini-key" data-midi={midi} data-c={midi % 12 === 0 || undefined} data-label={midi % 12 === 0 ? `C${midi / 12 - 1}` : undefined} data-key-state={keyState(midi)} />
      ))}
      {PIANO_KEY_LAYOUT.black.map(({ midi, whiteIndex }) => (
        <span key={midi} className="lv-live-mini-key" data-black data-midi={midi} data-key-state={keyState(midi)} style={{ left: `${(whiteIndex / PIANO_KEY_LAYOUT.white.length) * 100}%` }} />
      ))}
    </div>
  );
}
