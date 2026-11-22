import { Button } from "../../components/ui";
import type { CaptureAnalysisProgressStage } from "./captureRuntime";

/** What the dashed box shows. */
export type CaptureEntryState = "idle" | "over" | "loading" | "error";

export interface CaptureEntryProps {
  readonly state: CaptureEntryState;
  /** The reason the file could not be read (only used when state is "error"). */
  readonly error?: string;
  /** Which part of the reading is running (only used when state is "loading"). */
  readonly progressStage?: CaptureAnalysisProgressStage;
  /** True while a draft is open: the text entry cannot be opened. */
  readonly textDisabled?: boolean;
  readonly onChooseMidi: () => void;
  readonly onOpenText: () => void;
  /** Left out where Live MIDI cannot be opened; the row is then not drawn. */
  readonly onOpenLiveMidi?: () => void;
}

const KNOWN_ERRORS: Readonly<Record<string, string>> = {
  // P23-17 V15: the messages the MIDI import shows, in Japanese.
  "MIDI contains no note events.": "この MIDI には音が入っていません。",
  "The selected file exceeds Loop Vault's safe import limits.": "ファイルが大きすぎるため、読み込めません。",
  "MIDI could not be read.": "MIDI を読み込めませんでした。",
};

/** The reason, in Japanese. Messages that are already Japanese pass through unchanged. */
export function captureEntryErrorText(error: string | undefined): string {
  const text = error?.trim() ?? "";
  if (text === "") return "MIDI ファイルを読み込めませんでした。";
  const known = KNOWN_ERRORS[text];
  if (known) return known;
  // Anything with a non-ASCII character was written for the user already.
  if (/[\u0080-\uffff]/.test(text)) return text;
  return "MIDI として読めないファイルでした。別のファイルで試してください。";
}

/** The line shown while a file is being read. */
export function captureEntryProgressText(stage: CaptureAnalysisProgressStage | undefined): string {
  if (stage === "reading") return "MIDI を読み込んでいます…";
  if (stage === "finalizing") return "候補を準備しています…";
  return "コードを読み取っています…";
}

const STATUS_TEXT: Readonly<Record<Exclude<CaptureEntryState, "loading" | "error">, string>> = {
  idle: "MIDI ファイルをここに落とす",
  over: "放すと読み込みます",
};

const ROLL_ROWS = [8, 16, 24, 31] as const;
const ROLL_NOTES = Array.from({ length: 8 }, (_, column) => column).flatMap((column) =>
  ROLL_ROWS.flatMap((top, row) => ((column + row) % 4 === 3
    ? []
    : [{ key: `${column}-${row}`, left: column * 12.5 + 1, top: top + ((column * 3 + row) % 3) }])));

const LANE_NOTES = [
  { part: "melody", left: 2, width: 30, top: 6 },
  { part: "melody", left: 36, width: 22, top: 6 },
  { part: "melody", left: 62, width: 34, top: 6 },
  { part: "chord", left: 2, width: 46, top: 17 },
  { part: "chord", left: 52, width: 44, top: 17 },
  { part: "chord", left: 2, width: 46, top: 23 },
  { part: "chord", left: 52, width: 44, top: 23 },
  { part: "bass", left: 2, width: 22, top: 33 },
  { part: "bass", left: 27, width: 21, top: 33 },
  { part: "bass", left: 52, width: 44, top: 33 },
] as const;

const CHIPS = [
  { name: "F", fn: "sd" },
  { name: "G7", fn: "d" },
  { name: "Em", fn: "t" },
  { name: "Am", fn: "t" },
] as const;

function ImportArrow() {
  return (
    <svg className="lv-capture-zone-arrow" viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** P23-11: the first screen of 取り込む. The box, the three steps, and the other two ways in. */
export function CaptureEntry({
  state,
  error,
  progressStage,
  textDisabled = false,
  onChooseMidi,
  onOpenText,
  onOpenLiveMidi,
}: CaptureEntryProps) {
  return (
    <div className="lv-capture-entry">
      <section
        className="lv-capture-hero"
        aria-labelledby="capture-empty-title"
        data-zone-state={state}
        data-drop-target-state={state === "over" ? "active" : "idle"}
      >
        <div className="lv-capture-story">
          <p className="lv-section-kicker">集める</p>
          <h2 id="capture-empty-title" className="lv-capture-title">MIDI から<br />コード進行を拾う</h2>
          <p className="lv-capture-lead">曲の MIDI を落とすと、鳴っている音からコードを読み取ります。</p>
          <p className="lv-capture-lead">気に入った所を、鳴っていた音のまま Vault に保存できます。</p>
          <p className="lv-capture-flow-caption" id="capture-flow-caption">取り込みの流れ</p>
          <ol className="lv-capture-flow" aria-labelledby="capture-flow-caption">
            <li className="lv-capture-step" data-step="1">
              <span className="lv-capture-step-head"><span className="lv-capture-step-n" aria-hidden="true">1</span><span className="lv-capture-step-name">MIDI を落とす</span></span>
              <span className="lv-capture-step-text">曲まるごとでも、数小節でも</span>
              <span className="lv-capture-step-pic" aria-hidden="true">
                {ROLL_NOTES.map((note) => (
                  <i key={note.key} style={{ left: `${note.left}%`, width: "10.5%", top: `${note.top}px` }} />
                ))}
              </span>
            </li>
            <li className="lv-capture-step" data-step="2">
              <span className="lv-capture-step-head"><span className="lv-capture-step-n" aria-hidden="true">2</span><span className="lv-capture-step-name">パートを確かめる</span></span>
              <span className="lv-capture-step-text">コード・ベース・メロディを見分ける</span>
              <span className="lv-capture-step-pic" data-pic="lanes" aria-hidden="true">
                {LANE_NOTES.map((note, index) => (
                  <i key={index} data-part={note.part} style={{ left: `${note.left}%`, width: `${note.width}%`, top: `${note.top}px` }} />
                ))}
              </span>
            </li>
            <li className="lv-capture-step" data-step="3">
              <span className="lv-capture-step-head"><span className="lv-capture-step-n" aria-hidden="true">3</span><span className="lv-capture-step-name">選んで保存</span></span>
              <span className="lv-capture-step-text">気に入った所を、直して Vault へ</span>
              <span className="lv-capture-step-chips" aria-hidden="true">
                {CHIPS.map((chip) => <span key={chip.name} data-fn={chip.fn}>{chip.name}</span>)}
              </span>
            </li>
          </ol>
        </div>

        <div className="lv-capture-zone" data-testid="capture-entry-zone">
          {state === "error" ? (
            <>
              <svg className="lv-capture-zone-arrow" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5M12 16.2v.3" />
              </svg>
              <div role="alert">
                <p className="lv-capture-zone-title">MIDI を読み込めませんでした</p>
                <p className="lv-capture-zone-help">{captureEntryErrorText(error)}</p>
              </div>
              <Button variant="secondary" className="lv-capture-zone-button" data-testid="capture-retry-midi" onClick={onChooseMidi}>
                別のファイルを選ぶ
              </Button>
            </>
          ) : (
            <>
              {state === "loading" ? null : <ImportArrow />}
              <p className="lv-capture-zone-title" role="status" aria-live="polite">
                {state === "loading" ? captureEntryProgressText(progressStage) : STATUS_TEXT[state]}
              </p>
              {state === "loading" ? (
                <>
                  <div className="lv-capture-zone-progress" role="progressbar" aria-label="MIDI解析の進捗"><i /></div>
                  <p className="lv-capture-zone-help">少し待つと、次の画面が開きます</p>
                </>
              ) : null}
              {state === "over" ? <p className="lv-capture-zone-help">.mid ・ .midi</p> : null}
              {state === "idle" ? (
                <>
                  <p className="lv-capture-zone-help">.mid / .midi ・ この画面のどこに落としても読み込みます</p>
                  <Button variant="primary" className="lv-capture-zone-button" data-testid="capture-choose-midi" onClick={onChooseMidi}>
                    ファイルを選ぶ
                  </Button>
                  <p className="lv-capture-zone-ease"><i aria-hidden="true" />コードとメロディが混ざっていても大丈夫。次の画面でパートを分けられます</p>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="lv-capture-ways" aria-labelledby="capture-ways-title">
        <p className="lv-capture-ways-title" id="capture-ways-title">ほかの入れ方</p>
        <button type="button" className="lv-capture-way" data-testid="capture-entry-text" disabled={textDisabled} onClick={onOpenText}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
            <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
          </svg>
          <span className="lv-capture-way-body">
            <span className="lv-capture-way-name">コード譜のテキストを貼り付け</span>
            <span className="lv-capture-way-text">Dm7 | G7 | Cmaj7 のように書いた進行を入れる</span>
          </span>
        </button>
        {onOpenLiveMidi ? (
          <button type="button" className="lv-capture-way" data-testid="capture-entry-live-midi" onClick={onOpenLiveMidi}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <rect x="3" y="7" width="18" height="10" rx="1.5" />
              <path d="M8 7v5M12 7v5M16 7v5" />
            </svg>
            <span className="lv-capture-way-body">
              <span className="lv-capture-way-name">鍵盤で弾いて拾う</span>
              <span className="lv-capture-way-text">Live MIDI で弾いた進行を、あとから保存</span>
            </span>
          </button>
        ) : null}
      </section>
    </div>
  );
}
