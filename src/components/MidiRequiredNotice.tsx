import type { ReactNode } from "react";
import { connectionController } from "../liveMidi/connectionController";
import type { MidiConnectionView } from "../liveMidi/connectionView";
import { openMidiPanel } from "../liveMidi/midiPanel";

/**
 * P14 §5: what a mode says when MIDI is not connected. The heading and the colour come from the shared `kind`;
 * a mode adds only its own description and extra buttons. 「MIDI に接続」 shows only while the intent is off.
 */
export function MidiRequiredNotice({
  view,
  heading,
  description,
  as: Heading = "b",
  compact = false,
  children,
}: {
  view: MidiConnectionView;
  /** Replaces the heading the kind would give (a mode's own wording). */
  heading?: string;
  description?: string;
  as?: "b" | "h2";
  /** One flowing line (the Dojo start screen has no room for a card). */
  compact?: boolean;
  /** Extra buttons, after 「MIDI 設定」. */
  children?: ReactNode;
}) {
  const { kind } = view;
  const title = heading ?? (
    kind === "searching" ? "MIDI 接続を確認しています…"
      : kind === "connecting" ? "MIDI 接続しています…"
        : kind === "error" ? "MIDI 接続でエラーが起きました"
          : kind === "off" || kind === "no-device" ? "MIDI キーボードがつながっていません"
            : view.label
  );
  if (view.busy) {
    return <div className="lv-midi-notice" data-compact={compact || undefined} data-testid="midi-required-notice" data-midi-kind={kind} role="status"><Heading>{title}</Heading></div>;
  }
  return (
    <div className="lv-midi-notice" data-compact={compact || undefined} data-testid="midi-required-notice" data-midi-kind={kind} role={kind === "error" ? "alert" : undefined}>
      <Heading>{title}</Heading>
      {kind === "error" && view.error ? <p>{view.error}</p> : null}
      {description ? <p>{description}</p> : null}
      <div className="lv-midi-notice-buttons">
        {kind === "off" ? <button type="button" className="lv-midi-notice-primary" onClick={() => void connectionController.connect()}>MIDI に接続</button> : null}
        <button type="button" onClick={(event) => openMidiPanel(event.currentTarget)}>MIDI 設定</button>
        {children}
      </div>
    </div>
  );
}
