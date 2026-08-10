import * as Tone from "tone";

const bundledPianoSamples = import.meta.glob(
  "./assets/salamander-piano/*.mp3",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

const PIANO_SAMPLE_FILES = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  C2: "C2.mp3",
  C3: "C3.mp3",
  C4: "C4.mp3",
  C5: "C5.mp3",
  C6: "C6.mp3",
  C7: "C7.mp3",
} as const;

export interface MidiInputPianoMonitor {
  updateNotes(notes: readonly number[]): void;
  stop(): void;
  dispose(): void;
}

/**
 * A local, low-latency sampled-piano monitor for Live MIDI capture.
 * It is intentionally separate from the scheduled preview singleton so a
 * keyboard note cannot cancel a card/progression preview session.
 */
export async function createMidiInputPianoMonitor(): Promise<MidiInputPianoMonitor> {
  await Tone.start();

  const urls = Object.fromEntries(
    Object.entries(PIANO_SAMPLE_FILES).map(([note, fileName]) => {
      const url = bundledPianoSamples[`./assets/salamander-piano/${fileName}`];
      if (!url) {
        throw new Error(`Bundled Salamander piano sample is missing: ${fileName}`);
      }
      return [note, url];
    }),
  );
  const sampler = new Tone.Sampler({ urls, release: 0.8 });
  const highpass = new Tone.Filter({ frequency: 35, type: "highpass" });
  const compressor = new Tone.Compressor({ threshold: -18, ratio: 3 });
  sampler.chain(highpass, compressor, Tone.getDestination());
  sampler.volume.value = -8;

  try {
    await waitForSamples();
  } catch (error) {
    sampler.dispose();
    highpass.dispose();
    compressor.dispose();
    throw error;
  }

  let sounding = new Set<number>();
  let disposed = false;

  const stop = () => {
    if (disposed) return;
    sampler.releaseAll();
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
        if (!next.has(note)) sampler.triggerRelease(midiToNoteName(note));
      }
      for (const note of next) {
        if (!sounding.has(note)) sampler.triggerAttack(midiToNoteName(note), undefined, 0.68);
      }
      sounding = next;
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      sampler.dispose();
      highpass.dispose();
      compressor.dispose();
    },
  };
}

function waitForSamples(timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new Error("Bundled piano samples did not preload before timeout.")),
      timeoutMs,
    );
    Tone.loaded().then(
      () => {
        globalThis.clearTimeout(timeout);
        resolve();
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function midiToNoteName(midi: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
