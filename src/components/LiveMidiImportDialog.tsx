import { useEffect, useMemo, useState } from "react";
import { playbackController, type PlaybackController, type PlayingSource } from "../audio/playbackController";
import { historyToSavedProgressionBlock } from "../domain/liveMidi/historyImport";
import type { LiveChordHistoryEntry } from "../domain/liveMidi";
import type { SongIdea } from "../domain/types";
import type { AppCopy } from "../i18n";
import { ChordName } from "./ChordName";
import { useGlobalBpm } from "./GlobalBpmProvider";
import { Modal } from "./Modal";
import { usePreviewSound } from "./PreviewSoundProvider";
import { Check } from "lucide-react";
import { Button, Select, useSaveButtonState } from "./ui";

export interface LiveMidiImportRequest {
  startIndex: number;
  endIndex: number;
  ideaId?: string;
  newIdeaTitle?: string;
}

/** How many chords of the chosen range name a new song. */
const TITLE_CHORDS = 4;
const TITLE_MAX_LENGTH = 80;
const RANGE_SOURCE: PlayingSource = { kind: "capture", id: "live-midi-import:range" };

/** The first chords of the range, as the name a new song starts with. */
export function liveMidiImportTitle(history: readonly LiveChordHistoryEntry[], start: number, end: number): string {
  return history
    .slice(start, Math.min(end + 1, start + TITLE_CHORDS))
    .map((entry) => entry.label)
    .join(" - ")
    .slice(0, TITLE_MAX_LENGTH);
}

/**
 * P23-19: what was played in Live MIDI, saved to the Vault. The chords are numbered buttons; the first press
 * sets where the range starts, the second where it ends. `start` and `end` are 0-based and both inside the range.
 */
export function LiveMidiImportDialog({ history, ideas, copy: _copy, onCancel, onContinue, onSave, controller = playbackController }: {
  history: readonly LiveChordHistoryEntry[];
  ideas: readonly SongIdea[];
  copy: AppCopy["liveMidi"];
  /** 保存しない: the played chords are thrown away. */
  onCancel: () => void;
  /** 続けて弾く: back to the small window; the played chords stay. */
  onContinue: () => void;
  onSave: (request: LiveMidiImportRequest) => void;
  /** Test seam; the app's one playback controller by default. */
  controller?: Pick<PlaybackController, "play" | "toggle" | "stop">;
}) {
  const last = history.length - 1;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(last);
  // The chord pressed first while a range is being picked; the next press closes the range.
  const [anchor, setAnchor] = useState<number>();
  const saveBtn = useSaveButtonState();
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [ideaId, setIdeaId] = useState(ideas[0]?.id ?? "");
  const [title, setTitle] = useState(() => liveMidiImportTitle(history, 0, last));
  const [titleEdited, setTitleEdited] = useState(false);
  const { sound } = usePreviewSound();
  const { bpm } = useGlobalBpm();
  const count = end - start + 1;
  const valid = history.length > 0 && count >= 1
    && (target === "new" ? title.trim().length > 0 : ideaId !== "");

  useEffect(() => () => controller.stop(), [controller]);

  const chooseRange = (nextStart: number, nextEnd: number) => {
    setStart(nextStart);
    setEnd(nextEnd);
    if (!titleEdited) setTitle(liveMidiImportTitle(history, nextStart, nextEnd));
  };
  const pressChord = (index: number) => {
    const entry = history[index]!;
    void controller.play(
      { kind: "capture", id: `live-midi-import:chord:${index}` },
      { type: "chord", chord: entry.chord, sound, ...(entry.notes.length > 0 ? { explicitMidiNotes: entry.notes } : {}) },
    ).catch(() => undefined);
    if (anchor === undefined) {
      setAnchor(index);
      chooseRange(index, index);
    } else {
      setAnchor(undefined);
      chooseRange(Math.min(anchor, index), Math.max(anchor, index));
    }
  };
  const chooseLast = (size: number | "all") => {
    setAnchor(undefined);
    chooseRange(size === "all" ? 0 : Math.max(0, history.length - size), last);
  };
  const rangeTimeline = useMemo(
    () => historyToSavedProgressionBlock(history, start, end + 1, { id: "live-midi-import-preview", capturedAt: "" })?.chords ?? [],
    [end, history, start],
  );
  const listen = () => {
    void controller.toggle(RANGE_SOURCE, { type: "timeline", timeline: rangeTimeline, bpm, sound, beatsPerBar: 4 })
      .catch(() => undefined);
  };

  return (
    <Modal onClose={onContinue} closeOnBackdrop={false} ariaLabelledBy="live-midi-import-title" panelClassName="lv-dialog-16 w-full max-w-2xl">
      <form
        className="lv-live-import"
        data-testid="live-midi-import"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          saveBtn.succeed();
          onSave({
            startIndex: start,
            endIndex: end + 1,
            ...(target === "new" ? { newIdeaTitle: title.trim() } : { ideaId }),
          });
        }}
      >
        <h2 id="live-midi-import-title" className="lv-live-import-title">弾いたコードを Vault へ保存</h2>
        <p className="lv-live-import-text">今回弾いた <b>{history.length}</b> 個のコードから、残す所を選びます。</p>

        <div className="lv-live-import-range">
          <span className="lv-live-import-kicker">残す範囲</span>
          <button type="button" className="lv-live-import-quick" data-testid="live-midi-import-all" onClick={() => chooseLast("all")}>すべて</button>
          <button type="button" className="lv-live-import-quick" data-testid="live-midi-import-last-4" onClick={() => chooseLast(4)}>最後の 4</button>
          <button type="button" className="lv-live-import-quick" data-testid="live-midi-import-last-8" onClick={() => chooseLast(8)}>最後の 8</button>
          <span className="lv-live-import-summary" data-testid="live-midi-import-summary" aria-live="polite">
            {start + 1}〜{end + 1} 番 ・ {count} 小節
          </span>
        </div>

        <div className="lv-live-import-grid" role="group" aria-label="弾いたコード" data-testid="live-midi-import-grid">
          {history.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="lv-live-import-chord"
              data-in-range={index >= start && index <= end ? "true" : undefined}
              data-edge={index === start ? "start" : index === end ? "end" : undefined}
              data-anchor={index === anchor ? "true" : undefined}
              aria-pressed={index >= start && index <= end}
              aria-label={`${index + 1} 番 ${entry.label}`}
              onClick={() => pressChord(index)}
            >
              <span className="lv-live-import-chord-n" aria-hidden="true">{index + 1}</span>
              <ChordName label={entry.label} />
            </button>
          ))}
        </div>

        <div className="lv-live-import-listen">
          <Button type="button" variant="secondary" size="sm" data-testid="live-midi-import-listen" onClick={listen}>
            選んだ範囲を聴く
          </Button>
          <span className="lv-live-import-hint">
            {anchor === undefined
              ? "始まりのコードを押し、次に終わりのコードを押します。押すと音も鳴ります。"
              : "次に、終わりのコードを押します。"}
          </span>
        </div>

        <fieldset className="lv-live-import-target">
          <legend className="lv-live-import-kicker">保存先</legend>
          <label className="lv-live-import-option">
            <input type="radio" name="live-midi-import-target" value="new" checked={target === "new"} onChange={() => setTarget("new")} />
            <span>新しい曲として</span>
            <input
              className="lv-live-import-input"
              aria-label="新しい曲の名前"
              data-testid="live-midi-import-title-input"
              value={title}
              maxLength={TITLE_MAX_LENGTH}
              disabled={target !== "new"}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
            />
          </label>
          {ideas.length > 0 ? (
            <label className="lv-live-import-option">
              <input type="radio" name="live-midi-import-target" value="existing" checked={target === "existing"} onChange={() => setTarget("existing")} />
              <span>今ある曲に足す</span>
              <Select
                wrapperClassName="w-full"
                className="w-full"
                aria-label="足す先の曲"
                data-testid="live-midi-import-idea"
                value={ideaId}
                disabled={target !== "existing"}
                onChange={(event) => setIdeaId(event.target.value)}
              >
                {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
              </Select>
            </label>
          ) : null}
        </fieldset>

        <div className="lv-live-import-actions">
          <Button type="button" variant="ghost" data-testid="live-midi-import-discard" onClick={onCancel}>保存しない</Button>
          <Button type="button" variant="secondary" data-testid="live-midi-import-continue" onClick={onContinue}>続けて弾く</Button>
          <Button type="submit" variant="primary" data-testid="live-midi-import-save" data-save-state={saveBtn.state} disabled={!valid}>
            {saveBtn.state === "busy" ? <><span className="lv-save-spin" aria-hidden="true" /><span>保存中…</span></>
              : saveBtn.state === "done" ? <><Check aria-hidden="true" size={16} /><span>保存しました</span></>
              : `${count} 小節を Vault へ保存`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
