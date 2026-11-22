import type { TextSourceRange } from "../../domain/extendedTextProgression";
import type { TextPreviewBar as PreviewBar, TextPreviewBand, TextPreviewRest } from "../../domain/textPreviewScore";
import { ChordName } from "../ChordName";
import { displayChordLabel } from "../../ui/chordText";

/** P23-17 V8: the degree and the role of a card, when the key is confirmed and the degrees are shown. */
export interface PreviewHarmony {
  readonly degree?: string;
  /** T / SD / SDm / D, or "" when no rule fits. */
  readonly role?: string;
  /** P23-17 V9: the voicing was changed by hand (the mark the card list used to show). */
  readonly voicing?: string;
  /** The chord's own name (a written 「ii7」 in C major is 「Dm7」). */
  readonly name?: string;
}

interface Props {
  readonly bar: PreviewBar;
  readonly selectedStart?: number;
  readonly errorLabel?: string;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
  readonly onBarSelect?: (sourceSpan: TextSourceRange) => void;
  readonly onAudition?: (sourceSpan: TextSourceRange) => void;
  readonly playing?: boolean;
  readonly progress?: number;
  /** P23-17 V7/V8/V9: the degree, the role and the voicing mark of a band (by its source start). */
  readonly harmonyFor?: (sourceStart: number) => PreviewHarmony | undefined;
  readonly disabled?: boolean;
}

function AttackMarkers({ band, onSeek }: {
  readonly band: TextPreviewBand;
  readonly onSeek: (sourceSpan: TextSourceRange) => void;
}) {
  return <span className="pointer-events-none absolute inset-0" aria-hidden="false">
    {band.attacks.map((attack, index) => <button key={index} type="button"
      className="pointer-events-auto absolute inset-y-0 z-10 w-2 -translate-x-1/2 rounded-sm bg-[var(--lv-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      data-testid="text-preview-attack" data-kind={attack.kind}
      aria-label={(attack.kind === "repeat" ? "この再発音位置へ" : "この発音位置へ")}
      style={{ left: String(attack.percent) + "%" }}
      onClick={event => { event.stopPropagation(); onSeek(attack.sourceSpan); }} />)}
  </span>;
}
function DurationBand({ band, selected, harmony, disabled = false, onSelect, onAudition }: {
  readonly band: TextPreviewBand;
  readonly selected: boolean;
  readonly harmony?: PreviewHarmony;
  readonly disabled?: boolean;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
  readonly onAudition?: (sourceSpan: TextSourceRange) => void;
}) {
  const shown = harmony?.name ?? displayChordLabel(band.writtenChord);
  return <div data-testid="text-preview-band"
    data-source-start={band.sourceSpan.start} data-source-end={band.sourceSpan.end}
    data-selected={selected} data-chord={band.writtenChord} data-role={harmony?.role || undefined}
    data-disabled={disabled || undefined}
    className={"lv-text-preview-band absolute inset-y-0 min-w-0 overflow-hidden rounded border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-text)]" +
      (selected ? " outline outline-2 outline-[var(--lv-accent)]" : "") +
      (harmony?.role ? " lv-text-preview-band-role" : "")}
    style={{ left: String(band.left) + "%", width: String(band.width) + "%" }}
    onClick={() => { if (disabled) return; onSelect(band.sourceSpan); onAudition?.(band.sourceSpan); }}>
    <button type="button" className="lv-text-preview-chord absolute inset-0 flex min-w-0 w-full cursor-pointer flex-col justify-center gap-0.5 px-1 text-left"
      aria-label={shown} title={shown} aria-pressed={selected} disabled={disabled}
      onClick={event => { event.stopPropagation(); if (disabled) return; onSelect(band.sourceSpan); onAudition?.(band.sourceSpan); }}>
      {harmony?.degree ? <span className="lv-text-card-degree block truncate" data-testid="text-preview-degree">{harmony.degree}</span> : null}
      <ChordName label={shown} className="lv-text-card-name block truncate" />
      {harmony?.voicing ? <span className="lv-text-card-voicing block truncate" data-testid="text-progression-voicing-state">{harmony.voicing}</span> : null}
    </button>
    <AttackMarkers band={band}
      onSeek={span => { onSelect(span); onAudition?.(span); }} />
  </div>;
}
function RestRegion({ rest, onSelect }: {
  readonly rest: TextPreviewRest;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
}) {
  return <button type="button" data-testid="text-preview-rest"
    aria-label={"休符"}
    className="absolute inset-y-0 cursor-pointer overflow-hidden rounded border border-dashed border-[var(--lv-border-strong)] text-xs text-[var(--lv-text-muted)]"
    style={{ left: String(rest.left) + "%", width: String(rest.width) + "%" }}
    onClick={() => onSelect(rest.sourceSpan)}>{"休"}</button>;
}
function DiagnosticOverlay({ label }: { readonly label: string }) {
  return <span className="mt-2 block whitespace-pre-wrap break-words text-xs text-[var(--lv-danger)]" role="note">{label}</span>;
}
function PlaybackHighlight({ progress = 0 }: { readonly progress?: number }) {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
    style={{ left: String(Math.max(0, Math.min(100, progress * 100))) + "%" }} />;
}

export function TextPreviewBar({ bar, selectedStart, errorLabel, onSelect, onBarSelect, onAudition,
  playing = false, progress, harmonyFor, disabled = false }: Props) {
  const selected = selectedStart === bar.sourceSpan.start || bar.bands.some(band => band.sourceSpan.start === selectedStart);
  return <article data-testid="extended-text-bar" data-state={bar.error ? "error" : "parsed"}
    data-bar={bar.number} data-selected={selected}
    className={"lv-text-preview-bar min-w-0 rounded-lg border bg-[var(--lv-bg)] p-2" +
      (bar.error ? " border-[var(--lv-danger)]" : selected ? " border-[var(--lv-accent)]" : " border-[var(--lv-border)]")}>
    <button type="button" className="mb-2 font-mono text-xs text-[var(--lv-text-muted)]"
      data-testid="text-preview-bar-select" data-source-start={bar.sourceSpan.start}
      onClick={() => (onBarSelect ?? onSelect)(bar.sourceSpan)}>
      {String(bar.number) + "小節目"}
    </button>
    {bar.error ? <button type="button" data-testid="text-preview-error"
      className="block w-full text-left" onClick={() => onSelect(bar.sourceSpan)}>
      <span className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{bar.raw}</span>
      <DiagnosticOverlay label={errorLabel ?? bar.error} />
    </button> : <div className="lv-text-preview-track relative h-[72px] min-w-0" data-testid="text-preview-track">
      {bar.rests.map((rest, index) => <RestRegion key={index} rest={rest} onSelect={onSelect} />)}
      {bar.bands.map((band, index) => <DurationBand key={index} band={band}
        selected={selectedStart === band.sourceSpan.start}
        harmony={harmonyFor?.(band.sourceSpan.start)}
        disabled={disabled}
        onSelect={onSelect} onAudition={onAudition} />)}
      <span aria-hidden="true" data-testid="text-smooth-playhead" className="lv-text-smooth-playhead" />
      {playing ? <PlaybackHighlight progress={progress} /> : null}
    </div>}
  </article>;
}
