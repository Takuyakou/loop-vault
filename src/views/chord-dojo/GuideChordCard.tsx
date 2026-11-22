import { Volume2 } from "lucide-react";
import { ChordName } from "../../components/ChordName";
import { PlayingMark } from "../../components/ui";
import "./guidedCourse.css";

/**
 * P23-47-fix-3: the visible chord name is also the audition button. The whole face is one button, the
 * speaker icon is the normal Dojo's, and the caller decides whether pressing is a hint, a free preview
 * or the example after an answer.
 */
export interface GuideChordCardProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly playing: boolean;
  readonly onClick: () => void;
  readonly testId: string;
  readonly nameTestId?: string;
  readonly hint?: string;
  readonly hintTestId?: string;
  readonly disabled?: boolean;
}

export function GuideChordCard(props: GuideChordCardProps) {
  return <div className="gc-chord-card-row">
    <button
      type="button"
      className="gc-chord-card"
      aria-label={props.ariaLabel}
      data-playing={props.playing || undefined}
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="gc-chord-card-name gc-chord" data-testid={props.nameTestId}><ChordName label={props.label} /></span>
      {props.playing ? <PlayingMark className="gc-chord-card-sound" /> : <Volume2 className="gc-chord-card-sound" size={16} aria-hidden="true" />}
    </button>
    {props.hint === undefined ? null : <p className="gc-chord-card-hint" data-testid={props.hintTestId}>{props.hint}</p>}
  </div>;
}
