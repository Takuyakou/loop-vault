import * as Tone from "tone";

export interface MidiInputPianoMonitor {
  updateNotes(notes: readonly number[]): void;
  stop(): void;
  dispose(): void;
}

/**
 * A local, low-latency piano-like monitor for Live MIDI capture.
 * It is intentionally separate from the scheduled preview singleton so a
 * keyboard note cannot cancel a card/progression preview session.
 */
export async function createMidiInputPianoMonitor(): Promise<MidiInputPianoMonitor> {
  await Tone.start();

  const highpass = new Tone.Filter({ frequency: 55, type: "highpass" });
  const lowpass = new Tone.Filter({
    frequency: 5_200,
    type: "lowpass",
    Q: 0.5,
    rolloff: -24,
  });
  const compressor = new Tone.Compressor({ threshold: -18, ratio: 3 });
  const reverb = new Tone.Freeverb(0.18, 3_200);
  reverb.wet.value = 0.08;
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: {
      attack: 0.003,
      decay: 1.1,
      sustain: 0.08,
      release: 0.65,
    },
  }).chain(highpass, lowpass, compressor, reverb, Tone.getDestination());
  synth.volume.value = -9;

  let sounding = new Set<number>();
  let disposed = false;

  const stop = () => {
    if (disposed) return;
    synth.releaseAll();
    sounding = new Set();
  };

  return {
    updateNotes(notes) {
      if (disposed) return;
      const next = new Set(
        [...notes]
          .filter((note) => Number.isInteger(note) && note >= 0 && note <= 127)
          .sort((left, right) => left - right),
      );
      for (const note of sounding) {
        if (!next.has(note)) synth.triggerRelease(midiToNoteName(note));
      }
      for (const note of next) {
        if (!sounding.has(note)) synth.triggerAttack(midiToNoteName(note), undefined, 0.68);
      }
      sounding = next;
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      synth.dispose();
      highpass.dispose();
      lowpass.dispose();
      compressor.dispose();
      reverb.dispose();
    },
  };
}

function midiToNoteName(midi: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
