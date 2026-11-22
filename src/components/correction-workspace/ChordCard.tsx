import type { KeyboardEvent, MouseEvent } from "react";
import type { CorrectionCard } from "../../domain/correction/correctionModel";
import { displayChordLabel } from "../../ui/chordText";
import type { CardHarmony } from "./cardHarmony";
import { cardLabel, cardSize } from "./workspaceGeometry";

/**
 * P23-13: one chord card of the correction workspace and the progression page (`.lv-cw-card`), taken out of
 * `CorrectionWorkspace.tsx` unchanged. It holds no state: the workspace decides everything and passes it in.
 *
 * The card's size class (`data-size`: none = full, `narrow`, `tiny`, `bare`) and the drawn name come from its
 * width in pixels — `cardSize` and `cardLabel` in `workspaceGeometry.ts` (full ≥ 72px, narrow ≥ 40px, tiny ≥ 14px).
 *
 * P23-14: the degree and the role colour sit at the start of the lower row. The colour is on the degree text and
 * a small dot only — never on the card's border (the yellow border means 「要確認」 and the range start).
 * Full: dot + degree. Narrow: the dot only. Tiny and bare: nothing (the CSS hides it).
 */
export interface ChordCardProps {
  card: CorrectionCard;
  /** The timeline's scale; the card's left and width follow its beats. */
  pxPerBeat: number;
  /** Beats in a bar: a card exactly one bar long does not say 「4拍」. */
  meter: number;
  /** The selected card (`aria-pressed`). */
  selected: boolean;
  /** The progression page's workspace (`data-chord-card`). */
  progression: boolean;
  /** On the progression page: 「変更」 or 「追加」 when this card differs from the saved progression. */
  change?: "変更" | "追加";
  /** P23-14: the card's degree and role in the key. Left out when the key is unknown. */
  harmony?: CardHarmony | undefined;
  /** P23-14: false hides the degree text (the setting 「度数を表示」 is off); the dot stays. Default true. */
  showDegree?: boolean;
  /** The save range marks. */
  outOfRange: boolean;
  inRange: boolean;
  startCue: boolean;
  rangeFrom: boolean;
  onPointerEnter: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
}

export function ChordCard({
  card, pxPerBeat, meter, selected, progression, change, harmony, showDegree = true, outOfRange, inRange, startCue, rangeFrom,
  onPointerEnter, onContextMenu, onKeyDown, onClick, onDoubleClick,
}: ChordCardProps) {
  const width = card.duration * pxPerBeat - 2;
  const size = cardSize(width);
  const label = cardLabel(card.name.label, width);
  const review = card.reviewReasons.length > 0;
  return (
    <button
      type="button"
      className="lv-cw-card"
      data-size={size === "full" ? undefined : size}
      data-review={review || undefined}
      data-edited={card.edited || undefined}
      data-name-unreadable={card.nameUnreadable || undefined}
      data-testid="correction-card"
      data-chord-card={progression ? true : undefined}
      aria-pressed={selected}
      aria-label={`${card.bar}小節${card.beat}拍 ${card.name.label}${review ? "（要確認）" : ""}`}
      title={card.name.label}
      style={{ left: card.start * pxPerBeat + 1, width: Math.max(2, width) }}
      data-card-id={card.id}
      data-out-of-range={outOfRange || undefined}
      data-in-range={inRange || undefined}
      data-start-cue={startCue || undefined}
      data-range-from={rangeFrom || undefined}
      onPointerEnter={onPointerEnter}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="lv-cw-card-name" data-full-name={card.name.label} data-small={label.small}>{displayChordLabel(label.text)}</span>
      <span className="lv-cw-card-sub">
        {review ? <span className="lv-cw-flag" aria-hidden="true" /> : null}
        {harmony ? (
          <span className="lv-cw-harmony" data-fn={harmony.role || undefined} data-testid="correction-card-harmony">
            {harmony.role ? <i className="lv-cw-harmony-dot" aria-hidden="true" /> : null}
            {showDegree ? <span className="lv-cw-harmony-degree">{harmony.degree}</span> : null}
          </span>
        ) : null}
        {/* P10.2 §1.1: a card exactly one bar long does not say 「4拍」. */}
        {Math.abs(card.duration - meter) > 1e-6 ? <span>{formatBeats(card.duration)}拍</span> : null}
        {progression && change ? <span className="lv-cw-change">{change}</span> : null}
        {card.attacks > 1 ? <span className="lv-cw-x">×{card.attacks}</span> : null}
      </span>
    </button>
  );
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
