import { useMemo, useState } from "react";
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
  readonly onSave: (result: ExtendedTextResult) => boolean;
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

/** Comments remain source text. Their Key/BPM hints are only applied by explicit action. */
export function detectExtendedTextMetadataHints(input: string): { key?: string; bpm?: number } {
  const key = /^\s*#\s*Key\s*:\s*(.+?)\s*$/im.exec(input)?.[1];
  const rawBpm = /^\s*#\s*BPM\s*:\s*(\d+(?:\.\d+)?)\s*$/im.exec(input)?.[1];
  const bpm = rawBpm === undefined ? undefined : Number(rawBpm);
  return {
    ...(key === undefined ? {} : { key }),
    ...(bpm !== undefined && Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? { bpm } : {}),
  };
}

export function ExtendedTextIntakePanel({ language, input, disabled, onInput, onSave }: Props) {
  const [beat, setBeat] = useState("4/4");
  const [key, setKey] = useState<string>();
  const [bpm, setBpm] = useState<number>();
  const [practiceBpm, setPracticeBpm] = useState(120);
  const [saveFailed, setSaveFailed] = useState(false);
  const hints = useMemo(() => detectExtendedTextMetadataHints(input), [input]);
  const metadata: ExtendedTextMetadata = useMemo(() => ({
    beat,
    ...(key === undefined ? {} : { key, confirmed: true }),
    ...(bpm === undefined ? {} : { bpm }),
  }), [beat, key, bpm]);
  const result = useMemo(() => parseExtendedTextProgression(input, metadata), [input, metadata]);
  const slotsByBar = new Map<number, typeof result.slots>();
  for (const slot of result.slots) {
    slotsByBar.set(slot.bar, [...(slotsByBar.get(slot.bar) ?? []), slot]);
  }

  return (
    <div data-testid="extended-text-intake" className="mt-4 grid gap-5 xl:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor="extended-text-input" className="block text-sm font-semibold">
          {label(language, "Score text", "進行テキスト")}
        </label>
        <textarea
          id="extended-text-input"
          data-testid="extended-text-input"
          value={input}
          disabled={disabled}
          aria-invalid={result.state === "INVALID" || result.state === "AMBIGUOUS"}
          aria-describedby="extended-text-diagnostics"
          onChange={event => { setSaveFailed(false); onInput(event.target.value); }}
          className="mt-2 min-h-64 w-full border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 font-mono text-sm"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            {label(language, "Meter", "拍子")}
            <select
              data-testid="extended-text-meter"
              value={beat}
              disabled={disabled}
              onChange={event => setBeat(event.target.value)}
              className="mt-1 block border border-[var(--lv-border)] bg-[var(--lv-surface)] px-3 py-2"
            >
              {Array.from({ length: 12 }, (_, index) => `${index + 1}/4`).map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <BpmScrubField idPrefix="text-intake-bpm" label="BPM" disabled={disabled}
            dragLabel={label(language, "Drag up or down to change BPM", "上下にドラッグしてBPMを変更")}
            value={practiceBpm} onChange={(value) => { setPracticeBpm(value); setBpm(value); }} />
          {hints.key ? (
            <button type="button" className={key === hints.key ? "lv-button-secondary px-3 py-2 text-sm" : "rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-3 py-2 text-sm text-[var(--lv-warning)]"} disabled={disabled || key === hints.key}
              onClick={() => setKey(hints.key)}>
              {label(language, `Use Key: ${hints.key}`, `キー ${hints.key}を使う`)}
            </button>
          ) : null}
          {hints.bpm !== undefined ? (
            <button type="button" className={bpm === hints.bpm ? "lv-button-secondary px-3 py-2 text-sm" : "rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-3 py-2 text-sm text-[var(--lv-warning)]"} disabled={disabled || bpm === hints.bpm}
              onClick={() => { if (hints.bpm !== undefined) { setBpm(hints.bpm); setPracticeBpm(hints.bpm); } }}>
              {label(language, `Use ${hints.bpm} BPM`, `BPM ${hints.bpm}を使う`)}
            </button>
          ) : null}
        </div>
        {(key || bpm !== undefined) ? (
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="extended-text-metadata">
            {key ? `Key: ${key}` : ""}{key && bpm !== undefined ? " · " : ""}{bpm !== undefined ? `${bpm} BPM` : ""}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="extended-text-save"
          className="lv-button-primary mt-4 px-4 py-2 text-sm"
          disabled={disabled || !result.canConvert}
          onClick={() => setSaveFailed(!onSave(result))}
        >
          {label(language, "Save to Vault", "Vaultに保存")}
        </button>
        {saveFailed ? <p role="alert" className="mt-2 text-sm text-amber-200">
          {label(language, "Save failed. Your text is still here.", "保存できませんでした。入力内容は保持されています。")}
        </p> : null}
      </div>

      <section aria-label={label(language, "Live preview", "入力中のプレビュー")} className="min-w-0 border border-[var(--lv-border)] p-4" data-testid="extended-text-preview">
        <h3 className="text-sm font-semibold">{label(language, "Live preview", "入力中のプレビュー")}</h3>
        {result.state === "EMPTY" ? (
          <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{label(language, "Enter a progression to preview it.", "進行を入力するとここに表示されます。")}</p>
        ) : null}
        {result.sections.map(section => (
          <p key={`${section.line}:${section.span.start}`} className="mt-3 text-xs text-[var(--lv-text-muted)]" data-testid="extended-text-section">
            {section.kind === "comment" ? section.raw.trim().replace(/^#\s*/, "") : section.raw.trim()}
          </p>
        ))}
        {result.bars.map((bar, index) => (
          <div key={index} className="mt-3 border-l-2 border-[var(--lv-border)] pl-3" data-testid="extended-text-bar" data-state={slotsByBar.has(index + 1) ? "parsed" : "error"}>
            <p className="text-xs text-[var(--lv-text-muted)]">{label(language, `Bar ${index + 1}`, `${index + 1}小節目`)}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(slotsByBar.get(index + 1) ?? []).map(slot => (
                <span key={slot.span.start} className="border border-[var(--lv-border)] px-2 py-1 text-sm" data-testid="extended-text-slot">
                  {slot.kind === "rest" ? label(language, "Rest", "休符")
                    : slot.kind === "hold" ? label(language, "Hold", "保持")
                      : slot.kind === "reattack" ? label(language, "Reattack", "再発音")
                        : slot.chord?.label ?? slot.raw}
                  <span className="ml-2 text-xs text-[var(--lv-text-muted)]">{slot.durationBeats}♩</span>
                </span>
              ))}
              {!slotsByBar.has(index + 1) ? <span className="whitespace-pre-wrap text-sm text-amber-200">{label(language, "Unparsed source: ", "解析できない元テキスト: ")}{bar.join(" ")}</span> : null}
            </div>
          </div>
        ))}
        <div id="extended-text-diagnostics" role="status" aria-live="polite" className="mt-4" data-testid="extended-text-diagnostics">
          {result.diagnostics.map((diagnostic, index) => (
            <p key={`${diagnostic.span.start}:${index}`} className="mt-1 text-sm text-amber-200" data-reason={diagnostic.reasonCode}
              data-span-start={diagnostic.span.start} data-span-end={diagnostic.span.end}>
              {diagnostic.severity} {diagnostic.line}:{diagnostic.column} [{diagnostic.span.start}-{diagnostic.span.end}] · {language === "ja" ? japaneseDiagnostic[diagnostic.reasonCode] : diagnostic.message}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
