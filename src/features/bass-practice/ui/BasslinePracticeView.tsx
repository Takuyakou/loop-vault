import { useEffect, useMemo, useState } from "react";
import { Ear, Lightbulb, Square } from "lucide-react";
import { stopPreview, previewMidiNotes } from "../../../audio/chordPreview";
import { Button, Surface } from "../../../components/ui";
import { BASSLINE_GENERATOR_VERSION, createChordContextVaultBasslineExercise, generateBasslineExercise, type VaultChordContextSnapshot } from "../domain";
import { RecordCompareSection } from "../recording/ui/RecordCompareSection";
import { createTargetPlayer } from "../recording/application/playback";

export function BasslinePracticeView({ chordContextSnapshot }: { readonly chordContextSnapshot?: VaultChordContextSnapshot }) {
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [hint, setHint] = useState(0);
  const [review, setReview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const exercise = useMemo(() => chordContextSnapshot
    ? createChordContextVaultBasslineExercise(chordContextSnapshot, level)
    : generateBasslineExercise({
      generatorVersion: BASSLINE_GENERATOR_VERSION,
      seed: `bassline-ui:${level}`,
      source: "generated",
      level,
      tempo: 96,
      meter: { numerator: 4, denominator: 4 },
      key: "C major",
      chords: [
        { root: 2, label: "Dm7", startBeat: 0, durationBeats: 2 },
        { root: 7, label: "G7", startBeat: 2, durationBeats: 2 },
        { root: 0, label: "Cmaj7", startBeat: 4, durationBeats: 4 },
      ],
    }), [chordContextSnapshot, level]);

  useEffect(() => () => stopPreview(), []);
  if (!exercise.ok) return <p role="alert">{exercise.error.message}</p>;
  const listen = () => {
    if (playing) { stopPreview(); return; }
    void previewMidiNotes(exercise.exercise.targetEvents.map((event) => ({
      pitch: event.midiNote,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      velocity: event.velocity,
    })), exercise.exercise.tempo, "freepats-finger-bass", {
      onStarted: () => setPlaying(true),
      onEnded: () => setPlaying(false),
    });
  };

  return <Surface className="p-4" data-testid="bassline-echo-view">
    <p className="lv-section-kicker">Bass Practice</p>
    <h2 className="text-2xl font-bold">Bassline Echo</h2>
    <p className="mt-2 text-sm" data-testid="bassline-source">{chordContextSnapshot ? `Vault source · ${chordContextSnapshot.source.safeLabel}` : "Generated source"} · self-rated practice only · no microphone or automatic score.</p>
    <label className="mt-3 block">Level <select aria-label="Bassline level" value={level} onChange={(event) => setLevel(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>1 — Roots</option><option value={2}>2 — Chord tones</option><option value={3}>3 — Approach</option></select></label>
    <div className="mt-4 rounded border p-3" aria-label="Bassline progression strip">{exercise.exercise.chords.map((chord) => <span key={`${chord.startBeat}:${chord.label}`} className="mr-2">{chord.label}</span>)}</div>
    <div className="mt-3 text-sm" data-testid="bassline-notes">{hint >= 4 || review ? <>
      <span className="mr-2 text-xs text-[var(--lv-text-muted)]">音名:</span>
      {exercise.exercise.targetEvents.map((event) => <span key={event.index} className="mr-2 font-semibold" title={`MIDI ${event.midiNote}`}>{midiNoteName(event.midiNote)}</span>)}
    </> : "Listen and recall first. Notes stay hidden until Hint 4 or Review."}</div>
    <div className="mt-4 flex gap-2">
      <Button onClick={listen} data-testid="bassline-listen">{playing ? <Square size={15} /> : <Ear size={15} />}{playing ? "Stop" : "Listen"}</Button>
      <Button variant="ghost" onClick={() => setHint((value) => Math.min(4, value + 1))}><Lightbulb size={15} /> Hint {hint}/4</Button>
      <Button onClick={() => setReview(true)}><Ear size={15} /> Review</Button>
    </div>
    {review ? <RecordCompareSection
      mode="bassline"
      resetKey={`bassline:${chordContextSnapshot?.signature ?? "generated"}:${level}`}
      countInMs={Math.round((4 * 60_000) / exercise.exercise.tempo)}
      targetPlayer={createTargetPlayer(
        (onEnded) => void previewMidiNotes(
          exercise.exercise.targetEvents.map((event) => ({
            pitch: event.midiNote,
            startBeat: event.startBeat,
            durationBeats: event.durationBeats,
            velocity: event.velocity,
          })),
          exercise.exercise.tempo,
          "freepats-finger-bass",
          { onEnded },
        ),
        stopPreview,
      )}
    /> : null}
    {review ? <fieldset className="mt-4"><legend>Self-rated review</legend>{["again", "hard", "good", "easy"].map((rating) => <button key={rating} type="button" className="mr-2">{rating}</button>)}</fieldset> : null}
  </Surface>;
}

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note number → scientific pitch name (60 = C4), e.g. 45 → "A2". */
function midiNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return "?";
  const rounded = Math.round(midi);
  const name = PITCH_CLASS_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}
