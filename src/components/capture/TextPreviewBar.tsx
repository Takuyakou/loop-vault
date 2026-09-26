import type { TextSourceRange } from "../../domain/extendedTextProgression";
import type { TextPreviewBar as PreviewBar, TextPreviewBand, TextPreviewRest } from "../../domain/textPreviewScore";
import type { AppLanguage } from "../../i18n";

interface Props {
  readonly bar: PreviewBar;
  readonly language: AppLanguage;
  readonly selectedStart?: number;
  readonly errorLabel?: string;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
  readonly onAudition?: (sourceSpan: TextSourceRange) => void;
  readonly playing?: boolean;
  readonly progress?: number;
}

function ChordLabel({ value }: { readonly value: string }) {
  return <span className="block truncate px-2 pt-1 text-left text-xs font-bold" title={value}>{value}</span>;
}
function AttackMarkers({ band }: { readonly band: TextPreviewBand }) {
  return <span className="pointer-events-none absolute inset-0" aria-hidden="true">
    {band.attacks.map((attack, index) => <span key={index}
      className="absolute inset-y-0 w-0.5 bg-[var(--lv-accent)]"
      data-testid="text-preview-attack" data-kind={attack.kind}
      style={{ left: String(attack.percent) + "%" }} />)}
  </span>;
}
function DurationBand({ band, selected, onSelect, onAudition }: {
  readonly band: TextPreviewBand;
  readonly selected: boolean;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
  readonly onAudition?: (sourceSpan: TextSourceRange) => void;
}) {
  return <button type="button" data-testid="text-preview-band"
    data-source-start={band.sourceSpan.start} data-source-end={band.sourceSpan.end}
    data-selected={selected}
    aria-label={band.writtenChord}
    className={"absolute inset-y-0 min-w-0 overflow-hidden rounded border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-text)]" +
      (selected ? " outline outline-2 outline-[var(--lv-accent)]" : "")}
    style={{ left: String(band.left) + "%", width: String(band.width) + "%" }}
    onClick={() => { onSelect(band.sourceSpan); onAudition?.(band.sourceSpan); }}>
    <ChordLabel value={band.writtenChord} />
    <AttackMarkers band={band} />
  </button>;
}
function RestRegion({ rest, language, onSelect }: {
  readonly rest: TextPreviewRest;
  readonly language: AppLanguage;
  readonly onSelect: (sourceSpan: TextSourceRange) => void;
}) {
  return <button type="button" data-testid="text-preview-rest"
    aria-label={language === "ja" ? "休符" : "Rest"}
    className="absolute inset-y-0 overflow-hidden rounded border border-dashed border-[var(--lv-border-strong)] text-xs text-[var(--lv-text-muted)]"
    style={{ left: String(rest.left) + "%", width: String(rest.width) + "%" }}
    onClick={() => onSelect(rest.sourceSpan)}>{language === "ja" ? "休" : "R"}</button>;
}
function DiagnosticOverlay({ label }: { readonly label: string }) {
  return <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[var(--lv-danger)]" role="note">{label}</p>;
}
function PlaybackHighlight({ progress = 0 }: { readonly progress?: number }) {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
    style={{ left: String(Math.max(0, Math.min(100, progress * 100))) + "%" }} />;
}

export function TextPreviewBar({ bar, language, selectedStart, errorLabel, onSelect, onAudition,
  playing = false, progress }: Props) {
  const selected = selectedStart === bar.sourceSpan.start || bar.bands.some(band => band.sourceSpan.start === selectedStart);
  return <article data-testid="extended-text-bar" data-state={bar.error ? "error" : "parsed"}
    data-bar={bar.number} data-selected={selected}
    className={"min-w-0 rounded-lg border bg-[var(--lv-bg)] p-2" +
      (bar.error ? " border-[var(--lv-danger)]" : selected ? " border-[var(--lv-accent)]" : " border-[var(--lv-border)]")}>
    <button type="button" className="mb-2 text-xs text-[var(--lv-text-muted)]"
      data-testid="text-preview-bar-select" data-source-start={bar.sourceSpan.start}
      onClick={() => onSelect(bar.sourceSpan)}>
      {language === "ja" ? String(bar.number) + "小節目" : "Bar " + String(bar.number)}
    </button>
    {bar.error ? <div data-testid="text-preview-error">
      <p className="whitespace-pre-wrap break-words text-sm">{bar.raw}</p>
      <DiagnosticOverlay label={errorLabel ?? bar.error} />
    </div> : <div className="relative h-9 min-w-0" data-testid="text-preview-track">
      {bar.rests.map((rest, index) => <RestRegion key={index} rest={rest} language={language} onSelect={onSelect} />)}
      {bar.bands.map((band, index) => <DurationBand key={index} band={band}
        selected={selectedStart === band.sourceSpan.start} onSelect={onSelect} onAudition={onAudition} />)}
      {playing ? <PlaybackHighlight progress={progress} /> : null}
    </div>}
  </article>;
}
