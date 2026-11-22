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
 * One hand's panel: five fixed slots (P5.26.2-02 shape kept — the panel is as wide for one note as for
 * five). P23-20 L1: the P24 decision 案2 — a card per finger with the finger name, the note and the
 * chord tone; a finger that is not used is a faint empty frame with no 「·」, so the panel still shows
 * which fingers move between two chords.
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
  const used = slots.slots.filter((slot) => slot.pitch !== undefined).length;
  const handTone = hand === "left" ? "voicing-hand-left" : "voicing-hand-right";
  return (
    <section
      className={`voicing-hand ${handTone} min-w-0 rounded-[var(--lv-radius-sm)] border ${compact ? "px-2 py-1.5" : "p-2.5"}`}
      data-testid={testId}
      data-hand={hand}
      data-used={used}
      data-overflow={slots.overflow.length || undefined}
      data-compact={compact || undefined}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <p className="voicing-hand-name text-xs font-bold tracking-[0.1em]">{labels.hand}</p>
        {badge}
      </div>
      <div className="voicing-hand-slots" role="group" aria-label={labels.hand}>
        {slots.slots.map((slot) => {
          const degree = slot.pitch !== undefined ? degreeOf(slot.pitch) : undefined;
          const usedSlot = slot.pitch !== undefined;
          return (
            <div
              key={slot.finger}
              className={`voicing-hand-slot${usedSlot ? "" : " is-unused"}`}
              data-testid="voicing-loop-hand-slot"
              data-slot={`${prefix}${slot.finger}`}
              data-used={usedSlot}
              data-chord-tone={degree ? degree.chordTone : undefined}
              title={usedSlot
                ? `${prefix}${slot.finger} ${pitchLabel(slot.pitch!)} ${degree?.label ?? ""}`.trim()
                : `${prefix}${slot.finger} ${labels.unused}`}
            >
              <b className="voicing-hand-slot-finger">{showFingering ? `${prefix}${slot.finger}` : ""}</b>
              {usedSlot ? (
                <>
                  <span className="voicing-hand-slot-pitch">{pitchLabel(slot.pitch!)}</span>
                  <small className="voicing-hand-slot-degree" data-chord-tone={degree?.chordTone ? "true" : "false"}>
                    {degree?.label}
                  </small>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {slots.overflow.length ? (
        <p className="mt-1 truncate text-[11px] text-amber-200" data-testid="voicing-loop-hand-overflow" title={labels.extra}>
          {labels.extra}: {slots.overflow.map((pitch) => `${pitchLabel(pitch)} (${degreeOf(pitch).label})`).join(" · ")}
        </p>
      ) : null}
      {notice ? <p className="mt-1 truncate text-[10px] text-[var(--lv-text-muted)]">{notice}</p> : null}
    </section>
  );
}
