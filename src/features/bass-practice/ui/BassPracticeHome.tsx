import { useEffect, useRef, type ReactNode } from "react";
import { ResumeBand, ResumeGoButton } from "../../../components/ui";
import "./bassPracticeHome.css";

/** The five practices, with the same names `BassPracticeModeView` uses. */
export type BassHomeMode = "degree" | "rhythm" | "bassline" | "root-motion" | "midi";

export interface BassHomeInstrument {
  readonly stringCount: 4 | 5;
  readonly handedness: "right" | "left";
  readonly fretRange: { readonly min: number; readonly max: number };
}

export interface BassHomeModeInfo {
  /** The last 7 days, oldest first, today last: true on a day this practice was done. */
  readonly week: readonly boolean[];
  /** When it was last done, already worded (「今日」「きのう」「3 日前」). Left out when never. */
  readonly lastLabel?: string;
}

export interface BassHomeWeekDay {
  /** The weekday (「月」) or 「今日」. */
  readonly label: string;
  /** How many practices were finished that day. */
  readonly count: number;
}

export interface BassPracticeHomeProps {
  /** The practices that are switched on, in the order to draw them. */
  readonly modes: readonly BassHomeMode[];
  readonly info?: Partial<Record<BassHomeMode, BassHomeModeInfo>>;
  /** The practice done last and when (「きのう 21:40」). Left out when there is no record. */
  readonly resume?: { readonly mode: BassHomeMode; readonly whenLabel: string };
  readonly instrument: BassHomeInstrument;
  readonly onInstrumentChange: (next: BassHomeInstrument) => void;
  /** 7 days, oldest first, today last. */
  readonly week: readonly BassHomeWeekDay[];
  /** How many MIDI songs are in the library (the MIDI card's first tag). */
  readonly midiSongCount?: number;
  readonly onOpen: (mode: BassHomeMode) => void;
  /** The home is the screen in front. The practices stay mounted behind it, so the Enter key must stop here. */
  readonly active?: boolean;
}

export const BASS_HOME_MODE_NAMES: Readonly<Record<BassHomeMode, string>> = {
  degree: "度数",
  rhythm: "リズム",
  bassline: "コード進行のベース",
  "root-motion": "ルートの動き",
  midi: "MIDI のベースライン",
};

const MODE_TEXT: Readonly<Record<BassHomeMode, string>> = {
  degree: "短いフレーズを聴いて弾きます。弾いた音を 1 音ずつ確かめます。",
  rhythm: "リズムを聴いて、同じタイミングで弾きます。",
  bassline: "コード進行の上で、ベースラインを聴いて弾きます。",
  "root-motion": "ルートの動きを聴き分けて答え、ベースで弾きます。",
  midi: "MIDI のお手本を聴いて、ベースで弾いた録音を 1 音ずつ確かめます。",
};

/** P23-62: every practice is judged after the take now; the tags say what each one is about. */
const MODE_TAGS: Readonly<Record<Exclude<BassHomeMode, "midi">, readonly string[]>> = {
  degree: ["度数", "別のキーで"],
  rhythm: ["リズム", "3 つの難しさ"],
  bassline: ["進行の上で", "Vault の進行も使える"],
  "root-motion": ["ルートの動き", "Vault の進行も使える"],
};

/** The order of the four Echo cards (2 × 2). */
const ECHO_ORDER: readonly Exclude<BassHomeMode, "midi">[] = ["degree", "rhythm", "root-motion", "bassline"];

const FRET_RANGES: readonly { readonly min: number; readonly max: number }[] = [
  { min: 0, max: 7 },
  { min: 0, max: 12 },
  { min: 5, max: 17 },
];

/** P23-37: the delay at which the reading line of the MIDI picture reaches `x` (75px/s, 2.4s a cycle). */
const midiNoteDelay = (x: number) => `${((x - 46) / 75 - 2.4).toFixed(2)}s`;

const ART: Readonly<Record<BassHomeMode, ReactNode>> = {
  "degree": (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 148 134">
      <g stroke="#2b3c50" strokeWidth="1.2">
      <line x1="14" x2="134" y1="34" y2="34" />
      <line x1="14" x2="134" y1="56" y2="56" />
      <line x1="14" x2="134" y1="78" y2="78" />
      <line x1="14" x2="134" y1="100" y2="100" />
      <line x1="14" x2="14" y1="34" y2="100" stroke="#1c2836" />
      <line x1="44" x2="44" y1="34" y2="100" stroke="#1c2836" />
      <line x1="74" x2="74" y1="34" y2="100" stroke="#1c2836" />
      <line x1="104" x2="104" y1="34" y2="100" stroke="#1c2836" />
      <line x1="134" x2="134" y1="34" y2="100" stroke="#1c2836" />
      </g>
      <circle className="lv-bh-dot" cx="29" cy="100" r="10" />
      <circle className="lv-bh-dot d2" cx="89" cy="78" r="10" />
      <circle className="lv-bh-dot d3" cx="59" cy="56" r="10" />
      <g fontSize="11" fontWeight="700" fill="#eef3f9" textAnchor="middle" fontFamily="var(--font-mono)">
      <text x="29" y="104">1</text>
      <text x="89" y="82">3</text>
      <text x="59" y="60">5</text>
      </g>
      </svg>
  ),
  "rhythm": (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 148 134">
      <g>
      <rect className="lv-bh-cell acc" x="10" y="52" width="6" height="34" rx="1.5" />
      <rect className="lv-bh-cell" x="18" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell" x="26" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell h" x="34" y="62" width="6" height="24" rx="1.5" />
      <rect className="lv-bh-cell acc" x="42" y="52" width="6" height="34" rx="1.5" />
      <rect className="lv-bh-cell" x="50" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell h" x="58" y="62" width="6" height="24" rx="1.5" />
      <rect className="lv-bh-cell" x="66" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell acc" x="74" y="52" width="6" height="34" rx="1.5" />
      <rect className="lv-bh-cell" x="82" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell h" x="90" y="62" width="6" height="24" rx="1.5" />
      <rect className="lv-bh-cell" x="98" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell" x="106" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      <rect className="lv-bh-cell h" x="114" y="62" width="6" height="24" rx="1.5" />
      <rect className="lv-bh-cell acc" x="122" y="52" width="6" height="34" rx="1.5" />
      <rect className="lv-bh-cell" x="130" y="62" width="6" height="24" rx="1.5" opacity=".45" />
      </g>
      <g fill="#56687d" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
      <text x="13" y="102">1</text>
      <text x="45" y="102">2</text>
      <text x="77" y="102">3</text>
      <text x="109" y="102">4</text>
      </g>
      <rect className="lv-bh-head" x="9" y="44" width="2" height="48" fill="#fff" />
      </svg>
  ),
  "root-motion": (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 148 134">
      <path d="M34 86 Q56 40 76 62" fill="none" stroke="#3a3470" strokeWidth="2" />
      <path d="M80 64 Q104 60 118 76" fill="none" stroke="#3a3470" strokeWidth="2" />
      <g>
      <circle cx="30" cy="88" r="13" fill="#231f48" />
      <circle cx="76" cy="64" r="13" fill="#231f48" />
      <circle cx="120" cy="80" r="13" fill="#231f48" />
      </g>
      <g fontSize="12" fontWeight="700" fill="#eef3f9" textAnchor="middle">
      <text x="30" y="92">C</text>
      <text x="76" y="68">F</text>
      <text x="120" y="84">G</text>
      </g>
      <g fontSize="9.5" fill="#a79cff" textAnchor="middle">
      <text x="50" y="50">4 度上</text>
      <text x="104" y="54">全音上</text>
      </g>
      <circle className="lv-bh-run" cx="30" cy="88" r="4.5" fill="#fff" />
      </svg>
  ),
  "bassline": (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 148 134">
      <g>
      <rect x="10" y="30" width="30" height="16" rx="4" fill="#16263c" />
      <rect x="42" y="30" width="30" height="16" rx="4" fill="#2a2a16" />
      <rect x="74" y="30" width="30" height="16" rx="4" fill="#2e1a22" />
      <rect x="106" y="30" width="32" height="16" rx="4" fill="#16263c" />
      </g>
      <g fontSize="9.5" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">
      <text x="25" y="42" fill="#6aa8ff">Am7</text>
      <text x="57" y="42" fill="#f5dc4a">Dm7</text>
      <text x="89" y="42" fill="#ff6b7d">G7</text>
      <text x="122" y="42" fill="#6aa8ff">C</text>
      </g>
      <g stroke="#1c2836">
      <line x1="10" x2="138" y1="62" y2="62" />
      <line x1="10" x2="138" y1="74" y2="74" />
      <line x1="10" x2="138" y1="86" y2="86" />
      <line x1="10" x2="138" y1="98" y2="98" />
      </g>
      <path className="lv-bh-line" d="M12 92 H26 V80 H40 V68 H56 V80 H72 V98 H88 V86 H104 V74 H120 V92 H136" fill="none" stroke="#a79cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
  ),
  "midi": (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 230 94">
      {/* P23-37: decoration only — the reading line and the lit notes say "this card moves"; nothing is played,
          recorded, judged or saved. */}
      <rect className="lv-bh-scan" x="46" y="8" width="2" height="80" rx="1" />
      <text x="12" y="22" fontSize="9.5" fill="#56687d">お手本</text>
      <text x="12" y="64" fontSize="9.5" fill="#56687d">録音</text>
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(48) }} x="48" y="18" width="22" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(74) }} x="74" y="30" width="16" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(94) }} x="94" y="12" width="26" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(124) }} x="124" y="24" width="18" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(146) }} x="146" y="36" width="24" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(174) }} x="174" y="18" width="20" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(198) }} x="198" y="30" width="30" height="6" rx="2" fill="#2f8f85" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(47) }} x="47" y="54" width="22" height="6" rx="2" fill="#8fb0ff" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(76) }} x="76" y="66" width="12" height="6" rx="2" fill="#8fb0ff" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(96) }} x="96" y="48" width="26" height="6" rx="2" fill="#8fb0ff" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(123) }} x="123" y="60" width="14" height="6" rx="2" fill="#8fb0ff" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(148) }} x="148" y="78" width="24" height="6" rx="2" fill="#f2c14e" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(176) }} x="176" y="54" width="16" height="6" rx="2" fill="#8fb0ff" />
      <rect className="lv-bh-note" style={{ animationDelay: midiNoteDelay(197) }} x="197" y="66" width="30" height="6" rx="2" fill="#8fb0ff" />
      <text className="lv-bh-ok o1" x="52" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      <text className="lv-bh-ok o2" x="78" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      <text className="lv-bh-ok o3" x="98" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      <text className="lv-bh-ok o4" x="128" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      <text className="lv-bh-ok o1" x="150" y="88" fontSize="10" fontWeight="700" fill="#f2c14e">~</text>
      <text className="lv-bh-ok o2" x="178" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      <text className="lv-bh-ok o3" x="202" y="88" fontSize="10" fontWeight="700" fill="#42d8c6">✓</text>
      </svg>
  ),
};

function Chevron() {
  return (
    <svg className="lv-bh-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** The fretboard picture: the strings, frets 0–17, and the chosen fret range lit. Mirrored for the left hand. */
function Fretboard({ instrument }: { instrument: BassHomeInstrument }) {
  const width = 300;
  const left = 22;
  const right = 292;
  const top = 12;
  const gap = 12;
  const frets = 17;
  const bottom = top + gap * (instrument.stringCount - 1);
  const fretX = (fret: number) => left + ((right - left) * fret) / frets;
  const from = fretX(instrument.fretRange.min);
  const to = fretX(Math.min(frets, instrument.fretRange.max));
  return (
    <svg className="lv-bh-fretboard" viewBox={`0 0 ${width} ${bottom + 26}`} aria-hidden="true" focusable="false" data-handedness={instrument.handedness}>
      <g transform={instrument.handedness === "left" ? `translate(${width} 0) scale(-1 1)` : undefined}>
        <rect className="lv-bh-fret-range" x={from} y={top - 5} width={Math.max(4, to - from)} height={bottom - top + 10} rx="4" />
        {Array.from({ length: frets + 1 }, (_, fret) => (
          <line key={`f${fret}`} className="lv-bh-fret-line" x1={fretX(fret)} x2={fretX(fret)} y1={top} y2={bottom} data-nut={fret === 0 || undefined} />
        ))}
        {Array.from({ length: instrument.stringCount }, (_, string) => (
          <line key={`s${string}`} className="lv-bh-string" x1={left} x2={right} y1={top + gap * string} y2={top + gap * string} />
        ))}
        {[3, 5, 7, 9, 12, 15].map((fret) => (
          <circle key={`d${fret}`} className="lv-bh-fret-dot" cx={(fretX(fret - 1) + fretX(fret)) / 2} cy={(top + bottom) / 2} r="1.8" />
        ))}
      </g>
      <text className="lv-bh-fret-number" x={instrument.handedness === "left" ? width - from : from} y={bottom + 20} textAnchor="middle">{instrument.fretRange.min}</text>
      <text className="lv-bh-fret-number" x={instrument.handedness === "left" ? width - to : to} y={bottom + 20} textAnchor="middle">{instrument.fretRange.max}</text>
    </svg>
  );
}

function Segment<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly text: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="lv-bh-option">
      <span>{label}</span>
      <div className="lv-bh-segment" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ mode, info, tags, wide, onOpen }: {
  mode: BassHomeMode;
  info?: BassHomeModeInfo;
  tags: readonly string[];
  wide?: boolean;
  onOpen: (mode: BassHomeMode) => void;
}) {
  const week = info?.week ?? [];
  return (
    <button type="button" className="lv-bh-card" data-wide={wide || undefined} data-testid="bass-home-card" data-mode={mode} onClick={() => onOpen(mode)}>
      <span className="lv-bh-art">{ART[mode]}</span>
      <span className="lv-bh-card-body">
        <span className="lv-bh-card-name">{BASS_HOME_MODE_NAMES[mode]}<Chevron /></span>
        <span className="lv-bh-card-text">{MODE_TEXT[mode]}</span>
        <span className="lv-bh-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
        <span className="lv-bh-card-foot">
          <span className="lv-bh-days" role="img" aria-label={`この 7 日のうち ${week.filter(Boolean).length} 日`} data-testid="bass-home-card-week">
            {Array.from({ length: 7 }, (_, day) => <i key={day} data-on={week[day] ? "true" : undefined} />)}
          </span>
          <span className="lv-bh-last">{info?.lastLabel ? `最後: ${info.lastLabel}` : "まだ弾いていません"}</span>
        </span>
      </span>
    </button>
  );
}

/** P23-25: the screen that comes first in Bass Practice — pick a practice, set the instrument, see the week. */
export function BassPracticeHome({ modes, info = {}, resume, instrument, onInstrumentChange, week, midiSongCount, onOpen, active = true }: BassPracticeHomeProps) {
  const echoes = ECHO_ORDER.filter((mode) => modes.includes(mode));
  const midi = modes.includes("midi");
  const total = week.reduce((sum, day) => sum + day.count, 0);
  const highest = Math.max(1, ...week.map((day) => day.count));
  const resumeShown = resume && modes.includes(resume.mode) ? resume : undefined;
  const fretValue = `${instrument.fretRange.min}-${instrument.fretRange.max}`;

  // P23-36: Enter resumes, with the same contract as the Chord Dojo home. The practices stay mounted behind
  // this screen, and they keep their own keys; the home takes Enter only when nothing focused wants it.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const resumeModeRef = useRef<BassHomeMode | undefined>(resumeShown?.mode);
  resumeModeRef.current = resumeShown?.mode;
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input,select,textarea,button,a,summary,[contenteditable=true]")) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused.closest("input,select,textarea,button,a,summary,[contenteditable=true]")) return;
      const mode = resumeModeRef.current;
      if (!mode) return;
      event.preventDefault();
      openRef.current(mode);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  return (
    <div className="lv-bh" data-testid="bass-practice-home" data-resume={resumeShown ? "true" : "false"}>
      {/* P23-43: the resume band is a full-width row (from column 1's left edge to the instrument panel's right
          edge); the cards and instrument share the row below it, and a missing band does not leave an empty row.
          P23-67: 「聴いてまねる」 and its empty top box are gone — the cards start at the top; 「弾いて確かめる」 stays. */}
      {resumeShown ? (
        <ResumeBand screen="bp" testId="bass-home-resume" label="続きから"
          title={BASS_HOME_MODE_NAMES[resumeShown.mode]}
          meta={`${resumeShown.whenLabel} に弾きました`}>
          <ResumeGoButton label="続ける" data-testid="bass-home-resume-open" onClick={() => onOpen(resumeShown.mode)} />
        </ResumeBand>
      ) : null}

      <div className="lv-bh-main lv-bh-column">
        {echoes.length > 0 ? (
          <div className="lv-bh-grid">
            {echoes.map((mode) => <Card key={mode} mode={mode} info={info[mode]} tags={MODE_TAGS[mode]} onOpen={onOpen} />)}
          </div>
        ) : null}

        {midi ? (
          <>
            <p className="lv-bh-group">弾いて確かめる</p>
            <Card
              mode="midi"
              wide
              info={info.midi}
              tags={midiSongCount === undefined ? ["MIDI を読み込める"] : [`お手本 ${midiSongCount} 曲`, "MIDI を読み込める"]}
              onOpen={onOpen}
            />
          </>
        ) : null}
      </div>

      <div className="lv-bh-aside lv-bh-column">
        <section className="lv-bh-side" aria-labelledby="bass-home-instrument-title">
          <h2 id="bass-home-instrument-title">楽器<small>どの練習にも同じ設定を使います</small></h2>
          <div className="lv-bh-fretboard-box"><Fretboard instrument={instrument} /></div>
          <Segment<4 | 5>
            label="弦"
            value={instrument.stringCount}
            options={[{ value: 4, text: "4 弦" }, { value: 5, text: "5 弦" }]}
            onChange={(stringCount) => onInstrumentChange({ ...instrument, stringCount })}
          />
          <Segment<"right" | "left">
            label="利き手"
            value={instrument.handedness}
            options={[{ value: "right", text: "右利き" }, { value: "left", text: "左利き" }]}
            onChange={(handedness) => onInstrumentChange({ ...instrument, handedness })}
          />
          <Segment
            label="フレット"
            value={fretValue}
            options={FRET_RANGES.map((range) => ({ value: `${range.min}-${range.max}`, text: `${range.min}〜${range.max}` }))}
            onChange={(value) => {
              const range = FRET_RANGES.find((candidate) => `${candidate.min}-${candidate.max}` === value);
              if (range) onInstrumentChange({ ...instrument, fretRange: range });
            }}
          />
        </section>

        <section className="lv-bh-side" aria-labelledby="bass-home-week-title">
          <h2 id="bass-home-week-title">この 7 日<small>弾き終えた回数</small></h2>
          <div className="lv-bh-week" data-testid="bass-home-week">
            {week.map((day, index) => (
              <div key={index} className="lv-bh-week-day" data-today={index === week.length - 1 ? "true" : undefined} title={`${day.label} ${day.count} 回`}>
                <i style={{ height: `${Math.round((day.count / highest) * 100)}%` }} />
                <span>{day.label}</span>
              </div>
            ))}
          </div>
          <p className="lv-bh-week-sum" data-testid="bass-home-week-sum">
            {total > 0 ? <>この 7 日で <b>{total}</b> 回</> : "この 7 日は、まだ弾いていません"}
          </p>
        </section>
      </div>
    </div>
  );
}
