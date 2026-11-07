import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiPreviewNote } from "../../audio/chordPreview";
import { keySignatureOf, type EarSession } from "../../domain/earPractice";
import type { EarPlayHandle } from "./earPlayback";
import { chordSnapshot } from "./earStaff";
import { ProgressionScore, type ScoreAnnotation } from "./ProgressionScore";
import type { ScoreChordInput } from "./scoreLayout";
import { displayChordLabel } from "./label";

/** How long a chord pressed on the score sounds (seconds). */
const CHORD_SECONDS = 1.6;

type Which = "sounded" | "played";

/** The result screen's score of the whole progression, with the switch between what was sounded and what was played. */
export function ResultScore({ session, play, stop }: {
  session: EarSession;
  play: (id: string, notes: MidiPreviewNote[], endBeat: number) => EarPlayHandle;
  stop: () => void;
}) {
  const question = session.question;
  const [which, setWhich] = useState<Which>("sounded");
  const [playing, setPlaying] = useState<number>();
  const token = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  /** The notes of a chord on the screen now: what the app sounded, or the keys that were down when it was right. */
  const notesOf = useCallback((index: number): number[] => {
    const played = session.cards[index]!.playedNotes;
    return which === "played" && played?.length ? played : question.chords[index]!.notes;
  }, [question, session, which]);

  const chords = useMemo<ScoreChordInput[]>(() => question.chords.map((chord, index) => ({
    index,
    label: chord.label,
    bar: chord.bar,
    startBeat: chord.startBeat,
    durationBeats: chord.durationBeats,
    notes: chordSnapshot(`ear:score:${which}:${index}`, chord.symbol, notesOf(index), question.tonic, question.mode)?.notes ?? [],
  })), [notesOf, question, which]);

  const annotations = useMemo(() => {
    const map = new Map<number, ScoreAnnotation>();
    session.cards.forEach((card) => {
      const marks = session.marks(card);
      const text = card.shownFromStart ? "最初から表示" : card.self ? "自分で判定" : card.sec !== undefined ? `${card.sec.toFixed(1)}s` : "";
      map.set(card.index, { marks, text });
    });
    return map;
  }, [session]);

  const signature = question.keyName !== "" ? keySignatureOf(question.tonic, question.mode) : undefined;

  const stopAll = useCallback(() => {
    token.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setPlaying(undefined);
    stop();
  }, [stop]);
  useEffect(() => () => { token.current += 1; if (timer.current) clearTimeout(timer.current); }, []);

  const pressChord = useCallback((index: number) => {
    token.current += 1;
    const mine = token.current;
    if (timer.current) clearTimeout(timer.current);
    const beats = CHORD_SECONDS * question.bpm / 60;
    void play(`ear:score:chord:${index}`, notesOf(index).map((pitch) => ({ pitch, startBeat: 0, durationBeats: beats, velocity: 90 })), beats);
    setPlaying(index);
    timer.current = setTimeout(() => { if (token.current === mine) setPlaying(undefined); }, CHORD_SECONDS * 1000);
  }, [notesOf, play, question.bpm]);

  /** 「譜面を見ながら聴く」: the whole progression from the start, the chord that sounds lit. */
  const listen = useCallback(() => {
    token.current += 1;
    const mine = token.current;
    if (timer.current) clearTimeout(timer.current);
    setPlaying(undefined);
    const total = question.length * question.beatsPerBar;
    const notes = question.chords.flatMap((chord, index) =>
      notesOf(index).map((pitch) => ({ pitch, startBeat: chord.startBeat, durationBeats: chord.durationBeats * 0.92, velocity: 90 })));
    const handle = play("ear:score:lap", notes, total);
    let interval: ReturnType<typeof setInterval> | undefined;
    void handle.started.then((info) => {
      if (!info || token.current !== mine) return;
      interval = globalThis.setInterval(() => {
        const beat = (globalThis.performance.now() - info.startPerfMs) / 1000 * question.bpm / 60;
        let at: number | undefined;
        question.chords.forEach((chord, index) => { if (beat >= chord.startBeat) at = index; });
        setPlaying(beat >= 0 && beat < total ? at : undefined);
      }, 40);
    });
    void handle.ended.then(() => {
      if (interval) globalThis.clearInterval(interval);
      if (token.current === mine) setPlaying(undefined);
    });
  }, [notesOf, play, question]);

  const hasPlayed = session.cards.some((card) => card.playedNotes?.length);
  return (
    <div className="dojo-card ear-score-card" data-testid="ear-result-score">
      <div className="ear-score-bar-head">
        <h2>譜面</h2>
        <div className="ear-seg" role="radiogroup" aria-label="譜面の音">
          <button type="button" role="radio" aria-checked={which === "sounded"} data-on={which === "sounded" || undefined} data-testid="ear-score-which-sounded"
            onClick={() => { stopAll(); setWhich("sounded"); }}>鳴った音</button>
          <button type="button" role="radio" aria-checked={which === "played"} data-on={which === "played" || undefined} data-testid="ear-score-which-played" disabled={!hasPlayed}
            onClick={() => { stopAll(); setWhich("played"); }}>自分が弾いた音</button>
        </div>
        <button type="button" data-testid="ear-score-listen" onClick={listen}>譜面を見ながら聴く</button>
        {playing !== undefined ? <button type="button" data-testid="ear-score-stop" onClick={stopAll}>止める</button> : null}
        <span className="ear-help">和音を押すと、その和音が鳴ります{which === "played" ? "(自分が弾いた音)" : ""}</span>
      </div>
      <ProgressionScore chords={chords} beatsPerBar={question.beatsPerBar} signature={signature} annotations={annotations}
        tone={which} playingIndex={playing} onPlay={pressChord} labelFor={(index) => displayChordLabel(question.chords[index]!.label)} />
    </div>
  );
}
