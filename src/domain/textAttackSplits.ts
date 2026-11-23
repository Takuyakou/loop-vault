/**
 * P24-fix-1: one saved chord per written attack.
 *
 * The one grammar keeps a harmonic span (the same chord held or repeated) with its attacks. The Vault and
 * the practice want a chord per attack — `| C | C |` is two 4-beat chords, `| C % |` is two 2-beat chords,
 * `| C = |` is one 4-beat chord. This is the one place that splits a span that way; the save and the
 * validation both use it, so an old per-span save and a new per-attack save can be told apart.
 */
export interface TextAttackPlacement<C = unknown> {
  /** Absolute beat in the chart (0-based). */
  readonly beat: number;
  readonly durationBeats: number;
  readonly chord: C;
  /** The harmonic span the attack belongs to (a hand-chosen style is stored per span). */
  readonly spanStart: number;
}

export interface TextAttackSpanLike<C = unknown> {
  readonly chord: C;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly sourceSpan: { readonly start: number; readonly end: number };
  readonly attacks: readonly { readonly beat: number }[];
}

export function textAttackPlacements<C>(spans: readonly TextAttackSpanLike<C>[]): TextAttackPlacement<C>[] {
  const out: TextAttackPlacement<C>[] = [];
  for (const span of spans) {
    const spanEnd = span.startBeat + span.durationBeats;
    const beats = [...new Set(span.attacks.map((attack) => attack.beat))]
      .filter((beat) => beat >= span.startBeat - 1e-9 && beat < spanEnd - 1e-9)
      .sort((left, right) => left - right);
    beats.forEach((beat, index) => {
      const end = index + 1 < beats.length ? beats[index + 1]! : spanEnd;
      if (end <= beat) return;
      out.push({ beat, durationBeats: end - beat, chord: span.chord, spanStart: span.sourceSpan.start });
    });
  }
  return out.sort((left, right) => left.beat - right.beat);
}
