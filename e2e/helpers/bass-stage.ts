import type { Page } from "@playwright/test";

/**
 * P23-62: a synthetic bass for the practice stage. Real WebAudio → MediaRecorder → decoding → the analysis
 * worker; only the microphone is replaced. Before pressing 「録って弾く」, call `setTakePlan` with the notes to
 * "play": [midi note, seconds from the start of recording, length in seconds]. The run needs Chromium's fake
 * capture device (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`) so an input exists.
 */
export async function stageMicrophone(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:bass-practice-record-channel:v1", "left");
    const scope = globalThis as typeof globalThis & { __bpPlan?: [number, number, number][] };
    let attack = () => {};
    const NativeContext = AudioContext;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async (constraints?: MediaStreamConstraints) => {
      const context = new NativeContext();
      const destination = context.createMediaStreamDestination();
      let consumed = false;
      let shared: typeof AudioContext | undefined;
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { if (globalThis.AudioContext === shared) globalThis.AudioContext = NativeContext; if (!consumed) void context.close(); stop(); };
      }
      attack = () => {
        const plan = scope.__bpPlan ?? [];
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 8), context.sampleRate);
        const pcm = buffer.getChannelData(0);
        for (const [pitch, time, duration] of plan) {
          const start = Math.round(time * context.sampleRate), length = Math.round(duration * context.sampleRate);
          for (let j = 0; j < length && start + j < pcm.length; j++) pcm[start + j] += .25 * Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * j / context.sampleRate) * Math.min(1, j / 100, (length - j) / 100);
        }
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination); source.start();
      };
      await context.resume();
      // The recorder builds its context right after getUserMedia: share this clock for that one construction.
      if (typeof constraints?.audio === "object") {
        shared = class extends NativeContext {
          constructor(options?: AudioContextOptions) {
            if (!consumed && options === undefined) { consumed = true; globalThis.AudioContext = NativeContext; return context; }
            super(options);
          }
        };
        globalThis.AudioContext = shared;
      }
      return destination.stream;
    } });
    const NativeRecorder = MediaRecorder;
    globalThis.MediaRecorder = class extends NativeRecorder { override start(timeslice?: number) { super.start(timeslice); attack(); } };
  });
}

/** The notes the synthetic bass plays at the next take: one note per beat position, from 0.1s. */
export async function setTakePlan(page: Page, notes: readonly { readonly pitch: number; readonly beat: number; readonly seconds?: number }[], bpm: number) {
  await page.evaluate(({ notes, bpm }) => {
    (globalThis as typeof globalThis & { __bpPlan?: [number, number, number][] }).__bpPlan = notes.map((note) => [note.pitch, .1 + note.beat * 60 / bpm, note.seconds ?? .4]);
  }, { notes, bpm });
}
