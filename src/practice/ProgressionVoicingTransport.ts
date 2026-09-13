import * as Tone from "tone";
import {
  createPreviewInstrument,
  type PreviewInstrument,
  type PreviewSound,
} from "../audio/chordPreview";
import type {
  ProgressionPracticeVoicingPlan,
  ProgressionVoicingPracticeSnapshot,
} from "../domain/progressionVoicingPractice";
import {
  PROGRESSION_VOICING_PRACTICE_PPQ,
  progressionPracticeTicksAtBeat,
} from "../domain/progressionVoicingPractice";

export interface ProgressionVoicingTransportStartOptions {
  readonly snapshot: ProgressionVoicingPracticeSnapshot;
  readonly plan: ProgressionPracticeVoicingPlan;
  readonly bpm: number;
  readonly countInBars: 0 | 1 | 2;
  readonly metronomeEnabled: boolean;
  readonly referenceSoundEnabled?: boolean;
  readonly sound?: PreviewSound;
  readonly startBeat?: number;
  readonly onTransportBeat: (absoluteBeat: number) => void;
}

export interface ProgressionVoicingTransportPort {
  start(options: ProgressionVoicingTransportStartOptions): Promise<void>;
  pause(): boolean;
  resume(): Promise<boolean>;
  restart(): Promise<boolean>;
  stop(): void;
  setBpm(bpm: number): void;
  setMetronomeEnabled(enabled: boolean): void;
  setReferenceSoundEnabled(enabled: boolean): void;
  audition(midiNotes: readonly number[], sound?: PreviewSound): Promise<void>;
}

/**
 * Runtime adapter for P5.27. Tone.Transport is the only musical clock: the
 * same scheduled ticks drive audio and the domain projection shown by React.
 */
export class ProgressionVoicingTransport implements ProgressionVoicingTransportPort {
  private readonly transport = Tone.getTransport();
  private scheduleIds: number[] = [];
  private voicingInstrument?: PreviewInstrument;
  private voicingSound?: PreviewSound;
  private clickSynth?: Tone.Synth;
  private generation = 0;
  private projectionEpoch = 0;
  private startingGeneration?: number;
  private ownsTransport = false;
  private running = false;
  private paused = false;
  private metronomeEnabled = true;
  private referenceSoundEnabled = true;
  private desiredBpm = 120;
  private activeOptions?: ProgressionVoicingTransportStartOptions;

  async start(options: ProgressionVoicingTransportStartOptions): Promise<void> {
    const generation = this.invalidateAndClear();
    this.desiredBpm = options.bpm;
    this.metronomeEnabled = options.metronomeEnabled;
    this.referenceSoundEnabled = options.referenceSoundEnabled ?? true;
    this.startingGeneration = generation;
    await Tone.start();
    if (generation !== this.generation || this.startingGeneration !== generation) return;

    const ppq = this.transport.PPQ;
    assertCompatibleRuntimePpq(ppq);

    const sound = options.sound ?? "electric-piano";
    const voicingInstrumentPromise = createPreviewInstrument(sound);
    this.startingGeneration = undefined;

    const countInBeats = options.countInBars * options.snapshot.meter.numerator;
    const loopTicks = Math.max(1, runtimeTickAtPracticeBeat(options.snapshot.lengthBeats, ppq));
    const startBeat = Math.max(0, options.startBeat ?? 0);
    this.ownsTransport = true;
    this.transport.stop();
    this.transport.position = `${Math.round(startBeat * ppq)}i`;
    this.transport.bpm.value = this.desiredBpm;
    this.activeOptions = options;
    this.voicingSound = sound;
    this.clickSynth = createClickSynth();

    options.snapshot.events.forEach((event, eventIndex) => {
      const resolution = options.plan.events[eventIndex];
      if (!resolution || resolution.status !== "SUPPORTED") return;
      const startTicks = runtimeTickAtPracticeBeat(countInBeats + event.startBeat, ppq);
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        if (!this.acceptsCallback(generation)) return;
        this.attackCurrentVoicing(this.absoluteBeatAtTime(time, ppq), time);
      }, `${loopTicks}i`, `${startTicks}i`));
    });

    this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
      if (!this.acceptsCallback(generation)) return;
      const absoluteBeat = this.absoluteBeatAtTime(time, ppq);
      const beatInBar = Math.floor(absoluteBeat) % options.snapshot.meter.numerator;
      if (this.metronomeEnabled) {
        this.clickSynth?.triggerAttackRelease(beatInBar === 0 ? "C6" : "C5", "32n", time);
      }
    }, "4n", 0));

    this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
      if (!this.acceptsCallback(generation)) return;
      const absoluteBeat = this.absoluteBeatAtTime(time, ppq);
      const projectionEpoch = this.projectionEpoch;
      Tone.getDraw().schedule(() => {
        if (projectionEpoch === this.projectionEpoch && this.acceptsCallback(generation)) {
          options.onTransportBeat(absoluteBeat);
        }
      }, time);
    }, "16n", 0));

    this.running = true;
    this.paused = false;
    options.onTransportBeat(startBeat);
    this.transport.start("+0.05");

    try {
      const voicingInstrument = await voicingInstrumentPromise;
      if (generation !== this.generation || !this.ownsTransport || !this.running) {
        voicingInstrument.dispose();
        return;
      }
      this.voicingInstrument = voicingInstrument;
      const currentBeat = this.transport.ticks / ppq;
      if (!this.paused && (startBeat > countInBeats || currentBeat > startBeat)) {
        this.attackCurrentVoicing(currentBeat, Tone.now() + 0.05);
      }
    } catch (error) {
      if (generation === this.generation) this.invalidateAndClear();
      throw error;
    }
  }

  pause(): boolean {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.projectionEpoch += 1;
      this.startingGeneration = undefined;
      return false;
    }
    if (!this.running || this.paused || !this.ownsTransport) return false;
    this.projectionEpoch += 1;
    this.paused = true;
    this.transport.pause();
    this.voicingInstrument?.releaseAll();
    return true;
  }

  async resume(): Promise<boolean> {
    if (!this.running || !this.paused || !this.ownsTransport) return false;
    const generation = this.generation;
    await Tone.start();
    if (generation !== this.generation || !this.running || !this.paused || !this.ownsTransport) return false;
    this.projectionEpoch += 1;
    this.paused = false;
    this.attackCurrentVoicing(this.transport.ticks / this.transport.PPQ, Tone.now());
    this.transport.start();
    return true;
  }

  async restart(): Promise<boolean> {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.projectionEpoch += 1;
      this.startingGeneration = undefined;
      return false;
    }
    if (!this.running || !this.ownsTransport) return false;
    const generation = this.generation;
    await Tone.start();
    if (generation !== this.generation || !this.running || !this.ownsTransport) return false;
    this.projectionEpoch += 1;
    this.voicingInstrument?.releaseAll();
    this.transport.stop();
    this.transport.position = 0;
    this.paused = false;
    this.transport.start("+0.05");
    return true;
  }

  stop(): void {
    this.invalidateAndClear();
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) return;
    this.desiredBpm = bpm;
    if (this.ownsTransport) this.transport.bpm.rampTo(bpm, 0.1);
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  setReferenceSoundEnabled(enabled: boolean): void {
    this.referenceSoundEnabled = enabled;
    if (!enabled) this.voicingInstrument?.releaseAll();
  }

  async audition(midiNotes: readonly number[], sound: PreviewSound = "electric-piano"): Promise<void> {
    if (midiNotes.length === 0 || this.startingGeneration !== undefined || this.running || this.ownsTransport) return;
    const generation = ++this.generation;
    await Tone.start();
    if (generation !== this.generation || this.running || this.ownsTransport) return;
    if (!this.voicingInstrument || this.voicingSound !== sound) {
      this.disposeInstruments();
      const instrument = await createPreviewInstrument(sound);
      if (generation !== this.generation || this.running || this.ownsTransport) {
        instrument.dispose();
        return;
      }
      this.voicingInstrument = instrument;
      this.voicingSound = sound;
    }
    this.voicingInstrument.releaseAll();
    this.voicingInstrument.triggerAttackRelease(midiNotes.map(midiToNoteName), 2, Tone.now(), 0.72);
  }

  private invalidateAndClear(): number {
    this.generation += 1;
    this.projectionEpoch += 1;
    this.startingGeneration = undefined;
    if (this.ownsTransport) {
      this.transport.stop();
      for (const id of this.scheduleIds) this.transport.clear(id);
    }
    this.scheduleIds = [];
    this.disposeInstruments();
    this.ownsTransport = false;
    this.running = false;
    this.paused = false;
    this.activeOptions = undefined;
    return this.generation;
  }

  private acceptsCallback(generation: number): boolean {
    return generation === this.generation && this.ownsTransport && this.running && !this.paused;
  }

  private absoluteBeatAtTime(time: number, ppq: number): number {
    return Math.max(0, this.transport.getTicksAtTime(time) / ppq);
  }

  private disposeInstruments(): void {
    this.voicingInstrument?.releaseAll();
    this.voicingInstrument?.dispose();
    this.clickSynth?.dispose();
    this.voicingInstrument = undefined;
    this.voicingSound = undefined;
    this.clickSynth = undefined;
  }

  private attackCurrentVoicing(absoluteBeat: number, time: number): void {
    const options = this.activeOptions;
    if (!options || !this.voicingInstrument || !this.referenceSoundEnabled) return;
    const countInBeats = options.countInBars * options.snapshot.meter.numerator;
    if (absoluteBeat < countInBeats) return;
    const progressionBeat = (absoluteBeat - countInBeats) % options.snapshot.lengthBeats;
    let eventIndex = 0;
    for (let index = options.snapshot.events.length - 1; index >= 0; index -= 1) {
      if (progressionBeat >= options.snapshot.events[index]!.startBeat) {
        eventIndex = index;
        break;
      }
    }
    const resolution = options.plan.events[eventIndex];
    if (resolution?.status !== "SUPPORTED") return;
    const event = options.snapshot.events[eventIndex]!;
    const elapsedBeats = progressionBeat - event.startBeat;
    const remainingBeats = Math.max(0.05, event.durationBeats - elapsedBeats);
    const durationSeconds = Math.max(0.05, remainingBeats * 60 / this.desiredBpm);
    this.voicingInstrument.triggerAttackRelease(
      resolution.voicing.midiNotes.map(midiToNoteName),
      durationSeconds,
      time,
      0.72,
    );
  }
}

function createClickSynth(): Tone.Synth {
  const synth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  }).toDestination();
  synth.volume.value = -18;
  return synth;
}

function midiToNoteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const normalized = Math.max(0, Math.min(127, Math.round(note)));
  return `${names[normalized % 12]}${Math.floor(normalized / 12) - 1}`;
}

function runtimeTickAtPracticeBeat(beat: number, runtimePpq: number): number {
  const practiceTicks = progressionPracticeTicksAtBeat(beat);
  return Math.round(practiceTicks * runtimePpq / PROGRESSION_VOICING_PRACTICE_PPQ);
}

function assertCompatibleRuntimePpq(runtimePpq: number): void {
  if (!Number.isInteger(runtimePpq)
    || runtimePpq <= 0
    || runtimePpq % PROGRESSION_VOICING_PRACTICE_PPQ !== 0) {
    throw new RangeError("Voicing Loop requires a Tone PPQ that exactly represents its practice grid.");
  }
}
