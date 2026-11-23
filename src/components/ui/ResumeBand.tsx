import type { ReactNode } from "react";
import "./resumeBand.css";

/** P24-07 item 7: the one 「続きから」 band of the three homes (the badge, the words and the Enter). */
export type ResumeBandScreen = "cd" | "bp" | "vl";

const SCREEN: Record<ResumeBandScreen, { mark: string; accent: string; onAccent: string }> = {
  cd: { mark: "CD", accent: "#42d8c6", onAccent: "#06221f" },
  bp: { mark: "BP", accent: "#a79cff", onAccent: "#17123a" },
  vl: { mark: "VL", accent: "#42d8c6", onAccent: "#06221f" },
};

export function ResumeBand({ screen, testId, label, title, meta, note, extra, children }: {
  readonly screen: ResumeBandScreen;
  readonly testId: string;
  readonly label: string;
  readonly title: ReactNode;
  readonly meta?: ReactNode;
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
      <div className="lv-resume-band-label">{label}</div>
      <div className="lv-resume-band-line">
        <span className="lv-resume-band-title">{title}</span>
        {meta === undefined ? null : <span className="lv-resume-band-meta">{" ・ "}{meta}</span>}
      </div>
      {note === undefined ? null : <div className="lv-resume-band-note">{note}</div>}
    </div>
    {extra === undefined ? null : <div className="lv-resume-band-extra">{extra}</div>}
    <div className="lv-resume-band-action">{children}</div>
  </section>;
}
