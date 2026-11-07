import type { ReactNode } from "react";
import type { FingeringHand } from "../../domain/progressionFingering";
import type { HandSlots } from "../../voicingPractice/handSlots";

export interface HandSlotLabels {
  readonly hand: string;
  readonly finger: string;
  readonly pitches: string;
  readonly chordTone: string;
  readonly unused: string;
  readonly extra: string;
}

/**
 * One hand's panel: finger / note name / chord-tone degree, always five slots in a fixed table, so the
 * panel is as wide for one note as for five and an unused finger shows as an empty slot (P5.26.2-02).
 * Left and right use the same table; their order on screen is the keyboard's (L5…L1 | R1…R5).
 */
export function HandSlotPanel({ hand, slots, labels, pitchLabel, degreeOf, showFingering, badge, notice, compact = false, testId }: {
  readonly hand: FingeringHand;
  readonly slots: HandSlots;
  readonly labels: HandSlotLabels;
  readonly pitchLabel: (pitch: number) => string;
  /** The degree above the chord root; `chordTone` false for a note the chord does not name (shown quieter, never blank). */
  readonly degreeOf: (pitch: number) => { readonly label: string; readonly chordTone: boolean };
  readonly showFingering: boolean;
  readonly badge?: ReactNode;
  readonly notice?: string;
  readonly compact?: boolean;
  readonly testId: string;
}) {
  const prefix = hand === "left" ? "L" : "R";
  const handText = hand === "left" ? "text-amber-200" : compact ? "text-[var(--lv-accent)]" : "text-teal-200";
  const border = hand === "left"
    ? (compact ? "border-amber-300/55 bg-amber-400/[0.12]" : "border-amber-300/75 bg-amber-400/[0.17]")
    : (compact ? "border-[var(--lv-accent)] bg-teal-300/[0.08]" : "border-teal-300/50 bg-teal-300/[0.08]");
  const cell = compact ? "px-0 py-0.5 text-xs" : "px-0.5 py-1 text-sm";
  const head = compact ? "w-10 whitespace-nowrap pr-0.5 text-[10px]" : "w-12 whitespace-nowrap pr-1.5 text-[11px]";
  const used = slots.slots.filter((slot) => slot.pitch !== undefined).length;
  return (
    <section className={`min-w-0 rounded-[var(--lv-radius-sm)] border ${compact ? "px-2 py-1.5" : "p-2.5"} ${border}`}
      data-testid={testId} data-hand={hand} data-used={used} data-overflow={slots.overflow.length || undefined}>
      <div className="flex min-w-0 items-center justify-between gap-1">
        <p className={`text-xs font-bold tracking-[0.1em] ${handText}`}>{labels.hand}</p>
        {badge}
      </div>
      <table className="mt-1 w-full table-fixed border-collapse text-center">
        <colgroup><col className={compact ? "w-10" : "w-12"} /><col /><col /><col /><col /><col /></colgroup>
        <tbody>
          {showFingering ? (
            <tr data-row="finger">
              <th scope="row" className={`${head} text-left font-bold tracking-[0.08em] text-[var(--lv-text-secondary)]`}>{labels.finger}</th>
              {slots.slots.map((slot) => (
                <td key={slot.finger} data-testid="voicing-loop-hand-slot" data-slot={`${prefix}${slot.finger}`} data-used={slot.pitch !== undefined}
                  className={`${cell} font-bold ${slot.pitch !== undefined ? handText : "text-[var(--lv-text-muted)]/60"}`}>
                  {prefix}{slot.finger}
                </td>
              ))}
            </tr>
          ) : null}
          <tr data-row="pitch">
            <th scope="row" className={`${head} text-left font-bold tracking-[0.08em] text-[var(--lv-text-secondary)]`}>{labels.pitches}</th>
            {slots.slots.map((slot) => (
              <td key={slot.finger} data-slot={`${prefix}${slot.finger}`} data-used={slot.pitch !== undefined}
                className={`${cell} truncate whitespace-nowrap ${slot.pitch !== undefined ? "font-semibold text-[var(--lv-text)]" : "text-[var(--lv-text-muted)]/50"}`}
                title={slot.pitch !== undefined ? pitchLabel(slot.pitch) : `${prefix}${slot.finger} ${labels.unused}`}>
                {slot.pitch !== undefined ? pitchLabel(slot.pitch) : <span aria-label={labels.unused}>·</span>}
              </td>
            ))}
          </tr>
          <tr data-row="degree">
            <th scope="row" className={`${head} text-left font-bold tracking-[0.08em] text-[var(--lv-text-secondary)]`}>{labels.chordTone}</th>
            {slots.slots.map((slot) => {
              const degree = slot.pitch !== undefined ? degreeOf(slot.pitch) : undefined;
              return (
                <td key={slot.finger} data-slot={`${prefix}${slot.finger}`} data-used={slot.pitch !== undefined}
                  data-chord-tone={degree ? degree.chordTone : undefined}
                  className={`${cell} whitespace-nowrap ${degree ? (degree.chordTone ? "text-[var(--lv-text-secondary)]" : "italic text-[var(--lv-text-muted)]") : "text-[var(--lv-text-muted)]/50"}`}>
                  {degree ? degree.label : <span aria-label={labels.unused}>·</span>}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {slots.overflow.length ? (
        <p className="mt-1 truncate text-[11px] text-amber-200" data-testid="voicing-loop-hand-overflow" title={labels.extra}>
          {labels.extra}: {slots.overflow.map((pitch) => `${pitchLabel(pitch)} (${degreeOf(pitch).label})`).join(" · ")}
        </p>
      ) : null}
      {notice ? <p className="mt-1 truncate text-[10px] text-[var(--lv-text-muted)]">{notice}</p> : null}
    </section>
  );
}
