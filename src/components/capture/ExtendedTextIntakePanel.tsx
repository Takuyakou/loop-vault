import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  parseExtendedTextProgression,
  type ExtendedTextMetadata,
  type ExtendedTextResult,
  type ExtendedTextReasonCode,
} from "../../domain/extendedTextProgression";
import type { AppLanguage } from "../../i18n";
import { BpmScrubField } from "../BpmScrubField";

interface Props {
  readonly language: AppLanguage;
  readonly input: string;
  readonly disabled: boolean;
  readonly onInput: (value: string) => void;
  readonly onSave: (result: ExtendedTextResult, title: string) => boolean;
  readonly modeSelector?: ReactNode;
}

function label(language: AppLanguage, english: string, japanese: string): string {
  return language === "ja" ? japanese : english;
}

const japaneseDiagnostic: Readonly<Record<ExtendedTextReasonCode, string>> = {
  UNKNOWN_TOKEN: "読み取れない記号・トークンがあります。入力を確認してください。",
  UNKNOWN_CHORD: "このコード表記は対応していません。表記を確認してください。",
  AMBIGUOUS_TOKENIZATION: "コードの区切り方を一意に決められません。空白か小節線で区切ってください。",
  INVALID_STRUCTURE: "小節内の区切り・保持・スラッシュ等の書式を確認してください。",
  UNSUPPORTED_SUBDIVISION: "この等分割は正確なタイミングで表現できません。",
  INPUT_LIMIT_EXCEEDED: "入力が対応する長さ・小節数・イベント数の上限を超えています。",
  UNSUPPORTED_METER: "対応する拍子は1/4から12/4です。",
  INVALID_METADATA: "拍子以外の設定値を確認してください。",
};

/** Comment hints never change authored metadata until the person applies them. */
export function detectExtendedTextMetadataHints(input: string): { key?: string; bpm?: number } {
  const key = /^\s*#\s*Key\s*:\s*(.+?)\s*$/im.exec(input)?.[1];
  const rawBpm = /^\s*#\s*BPM\s*:\s*(\d+(?:\.\d+)?)\s*$/im.exec(input)?.[1];
  const bpm = rawBpm === undefined ? undefined : Number(rawBpm);
  return {
    ...(key === undefined ? {} : { key }),
    ...(bpm !== undefined && Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? { bpm } : {}),
  };
}

export function ExtendedTextIntakePanel({ language, input, disabled, onInput, onSave, modeSelector }: Props) {
  const [beat, setBeat] = useState("4/4");
  const [key, setKey] = useState<string>();
  const [bpm, setBpm] = useState<number>();
  const [practiceBpm, setPracticeBpm] = useState(120);
  const [name, setName] = useState(label(language, "Text progression", "テキスト進行"));
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [visiblePane, setVisiblePane] = useState<"input" | "preview">("input");
  const gutterRef = useRef<HTMLDivElement>(null);
  const hints = useMemo(() => detectExtendedTextMetadataHints(input), [input]);
  const metadata: ExtendedTextMetadata = useMemo(() => ({
    beat,
    ...(key === undefined ? {} : { key, confirmed: true }),
    ...(bpm === undefined ? {} : { bpm }),
  }), [beat, key, bpm]);
  const result = useMemo(() => parseExtendedTextProgression(input, metadata), [input, metadata]);
  const slotsByBar = useMemo(() => {
    const grouped = new Map<number, typeof result.slots>();
    for (const slot of result.slots) grouped.set(slot.bar, [...(grouped.get(slot.bar) ?? []), slot]);
    return grouped;
  }, [result]);
  const errors = result.diagnostics.filter(issue => issue.severity === "ERROR");
  const warnings = result.diagnostics.filter(issue => issue.severity === "WARNING");
  const annotationCount = result.sections.filter(section => section.kind === "comment"
    && !/^\s*#\s*(Key|BPM)\s*:/i.test(section.raw)).length;
  const lines = input.split(/\r\n|\r|\n/);
  const pendingClass = "rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-3 py-2 text-sm text-[var(--lv-warning)]";
  const appliedClass = "lv-button-secondary px-3 py-2 text-sm";

  function save() {
    if (disabled || !result.canConvert || !name.trim()) return;
    const success = onSave(result, name.trim());
    setSaveFailed(!success);
    setSaved(success);
  }

  return (
    <div data-testid="extended-text-intake" className="lv-text-intake-shell mt-4 overflow-hidden rounded-xl border border-[var(--lv-border)] bg-[var(--lv-surface)]">
      <div className="lv-text-intake-toolbar flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] p-3">
        {modeSelector}
        <label className="flex items-center gap-2 text-sm">{label(language, "Meter", "拍子")}
          <select data-testid="extended-text-meter" value={beat} disabled={disabled}
            onChange={event => setBeat(event.target.value)}
            className="lv-field-control min-h-9 px-2">
            {Array.from({ length: 12 }, (_, index) => String(index + 1) + "/4").map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <BpmScrubField idPrefix="text-intake-bpm" label="BPM" disabled={disabled}
          dragLabel={label(language, "Drag up or down to change BPM", "上下にドラッグしてBPMを変更")}
          value={practiceBpm} onChange={value => { setPracticeBpm(value); setBpm(value); }} />
        <button type="button" className="lv-button-secondary min-h-9 px-3 text-sm" disabled
          aria-pressed={false}>{label(language, "Metronome OFF", "メトロノーム OFF")}</button>
        <button type="button" className="lv-button-secondary min-h-9 px-3 text-sm" disabled
          aria-pressed={false}>{label(language, "Loop OFF", "ループ OFF")}</button>
        <button type="button" className="lv-button-primary min-h-9 px-3 text-sm" disabled
          data-testid="extended-text-play">{label(language, "Play all", "▶ 全体を再生")}</button>
      </div>

      <div className="lv-text-intake-tabs border-b border-[var(--lv-border)] p-2" role="tablist"
        aria-label={label(language, "Text workspace", "テキスト作業領域")}>
        <button type="button" role="tab" aria-selected={visiblePane === "input"}
          className={visiblePane === "input" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
          onClick={() => setVisiblePane("input")}>{label(language, "Input", "入力")}</button>
        <button type="button" role="tab" aria-selected={visiblePane === "preview"}
          className={visiblePane === "preview" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
          onClick={() => setVisiblePane("preview")}>{label(language, "Preview", "プレビュー")}</button>
      </div>

      <div className="lv-text-intake-grid">
        <section className={"lv-text-intake-pane min-w-0 border-r border-[var(--lv-border)] p-3" + (visiblePane === "input" ? " lv-text-intake-pane-active" : "")}
          aria-label={label(language, "Source editor", "元テキストの入力")} data-testid="extended-text-editor">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="extended-text-input" className="text-sm font-semibold">{label(language, "Score text", "進行テキスト")}</label>
            <div className="flex flex-wrap gap-2">
              {hints.key ? <button type="button" className={key === hints.key ? appliedClass : pendingClass}
                disabled={disabled || key === hints.key} onClick={() => setKey(hints.key)}>
                {key === hints.key
                  ? label(language, "Key applied: " + hints.key, "キー " + hints.key + " 使用中")
                  : label(language, "Use Key: " + hints.key, "キー " + hints.key + "を使う")}
              </button> : null}
              {hints.bpm !== undefined ? <button type="button" className={bpm === hints.bpm ? appliedClass : pendingClass}
                disabled={disabled || bpm === hints.bpm}
                onClick={() => { if (hints.bpm !== undefined) { setBpm(hints.bpm); setPracticeBpm(hints.bpm); } }}>
                {bpm === hints.bpm
                  ? label(language, "BPM applied: " + hints.bpm, "BPM " + hints.bpm + " 使用中")
                  : label(language, "Use BPM " + hints.bpm, "BPM " + hints.bpm + "を使う")}
              </button> : null}
            </div>
          </div>
          <div className="lv-text-intake-editor relative flex min-h-64 overflow-hidden rounded border border-[var(--lv-border)] bg-[var(--lv-bg)]">
            <div ref={gutterRef} aria-hidden="true" className="lv-text-intake-gutter shrink-0 overflow-hidden border-r border-[var(--lv-border)] text-right font-mono text-xs text-[var(--lv-text-muted)]">
              {lines.map((line, index) => <div key={index} className={/^\s*#/.test(line) ? "text-[var(--lv-accent)]" : ""}>{index + 1}</div>)}
            </div>
            <textarea id="extended-text-input" data-testid="extended-text-input" value={input}
              disabled={disabled} spellCheck={false}
              aria-invalid={errors.length > 0}
              aria-describedby="extended-text-diagnostics"
              onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }}
              onChange={event => { setSaveFailed(false); setSaved(false); onInput(event.currentTarget.value); }}
              className="lv-text-intake-textarea min-h-64 min-w-0 flex-1 resize-none overflow-auto bg-transparent p-2 font-mono text-sm outline-none" />
          </div>
          {(key || bpm !== undefined) ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="extended-text-metadata">
            {key ? "Key: " + key : ""}{key && bpm !== undefined ? " · " : ""}{bpm !== undefined ? String(bpm) + " BPM" : ""}
          </p> : null}
        </section>
        <section aria-label={label(language, "Live preview", "入力中のプレビュー")}
          className={"lv-text-intake-pane min-w-0 p-3" + (visiblePane === "preview" ? " lv-text-intake-pane-active" : "")}
          data-testid="extended-text-preview">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{label(language, "Live preview", "プレビュー")}</h3>
            <span className="text-xs text-[var(--lv-text-muted)]">{result.bars.length} {label(language, "bars", "小節")}</span>
            <span className="rounded border border-[var(--lv-danger)] px-2 py-1 text-xs text-[var(--lv-danger)]">{label(language, "Errors", "エラー")} {errors.length}</span>
            <span className="rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-2 py-1 text-xs text-[var(--lv-warning)]">{label(language, "Warnings", "注意")} {warnings.length}</span>
            <span className="rounded border border-[var(--lv-border)] px-2 py-1 text-xs">{label(language, "Practice limits", "練習制限")} 0</span>
          </div>
          {result.state === "EMPTY" ? <p className="text-sm text-[var(--lv-text-muted)]">{label(language, "Enter a progression to preview it.", "進行を入力するとここに表示されます。")}</p> : null}
          {result.sections.map(section => <p key={String(section.line) + ":" + String(section.span.start)}
            className="mt-3 border-l-2 border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] p-2 text-xs"
            data-testid="extended-text-section">{section.raw.trim()}</p>)}
          <div className="lv-text-intake-bars">
            {result.bars.map((bar, index) => <div key={index}
              className="min-w-0 rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] p-2"
              data-testid="extended-text-bar" data-state={slotsByBar.has(index + 1) ? "parsed" : "error"}>
              <p className="text-xs text-[var(--lv-text-muted)]">{label(language, "Bar " + String(index + 1), String(index + 1) + "小節目")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(slotsByBar.get(index + 1) ?? []).map(slot => <span key={slot.span.start}
                  className="rounded border border-[var(--lv-border)] px-2 py-1 text-xs" data-testid="extended-text-slot">
                  {slot.kind === "rest" ? label(language, "Rest", "休符")
                    : slot.kind === "hold" ? label(language, "Hold", "保持")
                      : slot.kind === "reattack" ? label(language, "Reattack", "再発音")
                        : slot.chord?.label ?? slot.raw}
                </span>)}
                {!slotsByBar.has(index + 1) ? <span className="whitespace-pre-wrap text-sm text-[var(--lv-danger)]">
                  {label(language, "Unparsed source: ", "解析できない元テキスト: ")}{bar.join(" ")}
                </span> : null}
              </div>
            </div>)}
          </div>
          <div id="extended-text-diagnostics" role="status" aria-live="polite" className="mt-3"
            data-testid="extended-text-diagnostics">
            {result.diagnostics.map((diagnostic, index) => <p key={String(diagnostic.span.start) + ":" + String(index)}
              className={"mt-1 text-sm " + (diagnostic.severity === "ERROR" ? "text-[var(--lv-danger)]" : "text-[var(--lv-warning)]")}
              data-reason={diagnostic.reasonCode} data-span-start={diagnostic.span.start}
              data-span-end={diagnostic.span.end}>
              {diagnostic.severity} {diagnostic.line}:{diagnostic.column} [{diagnostic.span.start}-{diagnostic.span.end}] · {language === "ja" ? japaneseDiagnostic[diagnostic.reasonCode] : diagnostic.message}
            </p>)}
          </div>
        </section>
      </div>

      <div className="lv-text-intake-savebar sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] bg-[var(--lv-surface)] p-3">
        <label className="text-xs">{label(language, "Name", "名前")}
          <input value={name} maxLength={80} onChange={event => setName(event.target.value)}
            className="lv-field-control ml-2 min-h-9 w-44 px-2" data-testid="extended-text-name" />
        </label>
        <span className="min-w-0 flex-1 text-xs text-[var(--lv-text-muted)]">
          {result.bars.length} {label(language, "bars", "小節")} · {annotationCount} {label(language, "annotations", "注記")}
          {" · " + beat + " · " + String(practiceBpm) + " BPM"}
          {" · " + label(language, "Errors", "エラー") + " " + String(errors.length)}
          {" / " + label(language, "Warnings", "注意") + " " + String(warnings.length)}
          {" / " + label(language, "Practice limits", "練習制限") + " 0"}
        </span>
        <button type="button" data-testid="extended-text-save" className="lv-button-primary min-h-9 px-4 text-sm"
          disabled={disabled || !result.canConvert || !name.trim()} onClick={save}>
          {label(language, "Save to Vault", "Vaultに保存")}
        </button>
        {saved ? <span role="status" className="text-sm text-[var(--lv-accent)]">{label(language, "Saved", "保存しました")}</span> : null}
        {saveFailed ? <span role="alert" className="text-sm text-[var(--lv-warning)]">
          {label(language, "Save failed. Your text is still here.", "保存できませんでした。入力内容は保持されています。")}
        </span> : null}
      </div>
    </div>
  );
}
