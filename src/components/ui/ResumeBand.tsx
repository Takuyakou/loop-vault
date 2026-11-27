import type { ReactNode } from "react";
import "./resumeBand.css";

/** P24-07 item 7: the one 「続きから」 band of the three homes (the badge, the words and the Enter). */
export type ResumeBandScreen = "cd" | "bp" | "vl";

const SCREEN: Record<ResumeBandScreen, { mark: string; accent: string; onAccent: string }> = {
  cd: { mark: "CD", accent: "#42d8c6", onAccent: "#06221f" },
  bp: { mark: "BP", accent: "#a79cff", onAccent: "#17123a" },
  vl: { mark: "VL", accent: "#42d8c6", onAccent: "#06221f" },
};

/**
 * P25 V13 (Resume.dc.html 「案」): one 56px row — the mark, 「続きから」 and the title on one line, the facts
 * as small tags, a rule, when it was played, the screen's own part and 「続ける」.
 */
export function ResumeBand({ screen, testId, label, title, tags, when, note, extra, children }: {
  readonly screen: ResumeBandScreen;
  readonly testId: string;
  readonly label: string;
  readonly title: ReactNode;
  /** Small facts (the key, the bar count, the item). */
  readonly tags?: readonly string[];
  /** When it was played (or a short hint), on the right. */
  readonly when?: ReactNode;
  /** A status word (読み込み中 / 今は開けません), before `when`. */
  readonly note?: ReactNode;
  /** The screen's own right-hand part (Chord Dojo's 「ほかの最近」). */
  readonly extra?: ReactNode;
  /** The 「続ける Enter」. */
  readonly children: ReactNode;
}) {
  const tone = SCREEN[screen];
  return <section className={`lv-resume-band lv-resume-band-${screen}`} data-testid={testId} aria-label={label}
    style={{
      ["--lv-resume-accent" as string]: tone.accent,
      ["--lv-resume-on-accent" as string]: tone.onAccent,
    }}>
    <span className="lv-resume-band-mark" aria-hidden="true">{tone.mark}</span>
    <div className="lv-resume-band-main">
      <span className="lv-resume-band-label">{label}</span>
      <span className="lv-resume-band-title">{title}</span>
    </div>
    {tags?.length ? <div className="lv-resume-band-tags">{tags.map((tag) => <span key={tag} className="lv-resume-band-tag">{tag}</span>)}</div> : null}
    {when === undefined && note === undefined ? null : <>
      <span className="lv-resume-band-rule" aria-hidden="true" />
      <span className="lv-resume-band-when">
        {note === undefined ? null : <span className="lv-resume-band-note">{note}</span>}
        {when}
      </span>
    </>}
    {extra === undefined ? null : <div className="lv-resume-band-extra">{extra}</div>}
    <div className="lv-resume-band-action">{children}</div>
  </section>;
}
