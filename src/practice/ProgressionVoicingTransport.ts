import * as Tone from "tone";
import type {
  ProgressionPracticeVoicingPlan,
  ProgressionVoicingPracticeSnapshot,
} from "../domain/progressionVoicingPractice";

export interface ProgressionVoicingTransportStartOptions {
  readonly snapshot: ProgressionVoicingPracticeSnapshot;
  readonly plan: ProgressionPracticeVoicingPlan;
  readonly bpm: number;
  readonly countInBars: 0 | 1 | 2;
  readonly metronomeEnabled: boolean;
  readonly startBeat?: number;
  readonly onTransportBeat: (absoluteBeat: number) => void;
}

export interface ProgressionVoicingTransportPort {
  start(options: ProgressionVoicingTransportStartOptions): Promise<void>;
  pause(): boolean;
  resume(): boolean;
  restart(): boolean;
  stop(): void;
  setBpm(bpm: number): void;
  setMetronomeEnabled(enabled: boolean): void;
  audition(midiNotes: readonly number[]): Promise<void>;
}

/**
 * Runtime adapter for P5.27. Tone.Transport is the only musical clock: the
 * same scheduled ticks drive audio and the domain projection shown by React.
 */
export class ProgressionVoicingTransport implements ProgressionVoicingTransportPort {
  private readonly transport = Tone.getTransport();
  private scheduleIds: number[] = [];
  private voicingSynth?: Tone.PolySynth<Tone.FMSynth>;
  private clickSynth?: Tone.Synth;
  private generation = 0;
  private startingGeneration?: number;
  private ownsTransport = false;
  private running = false;
  private paused = false;
  private metronomeEnabled = true;
  private desiredBpm = 120;
  private activeOptions?: ProgressionVoicingTransportStartOptions;

  async start(options: ProgressionVoicingTransportStartOptions): Promise<void> {
    const generation = this.invalidateAndClear();
    this.desiredBpm = options.bpm;
    this.metronomeEnabled = options.metronomeEnabled;
    this.startingGeneration = generation;
    await Tone.start();
    if (generation !== this.generation || this.startingGeneration !== generation) return;
    this.startingGeneration = undefined;

    const ppq = this.transport.PPQ;
    const countInBeats = options.countInBars * options.snapshot.meter.numerator;
    const loopTicks = Math.max(1, Math.round(options.snapshot.lengthBeats * ppq));
    const startBeat = Math.max(0, options.startBeat ?? 0);
    this.ownsTransport = true;
    this.transport.stop();
    this.transport.position = `${Math.round(startBeat * ppq)}i`;
    this.transport.bpm.value = this.desiredBpm;
    this.activeOptions = options;
    this.voicingSynth = createVoicingSynth();
    this.clickSynth = createClickSynth();

    options.snapshot.events.forEach((event, eventIndex) => {
      const resolution = options.plan.events[eventIndex];
      if (!resolution || resolution.status !== "SUPPORTED") return;
      const startTicks = Math.round((countInBeats + event.startBeat) * ppq);
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
      Tone.getDraw().schedule(() => {
        if (this.acceptsCallback(generation)) options.onTransportBeat(absoluteBeat);
      }, time);
    }, "16n", 0));

    this.running = true;
    this.paused = false;
    options.onTransportBeat(startBeat);
    if (startBeat > countInBeats) this.attackCurrentVoicing(startBeat, Tone.now() + 0.05);
    this.transport.start("+0.05");
  }

  pause(): boolean {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.startingGeneration = undefined;
      return false;
    }
    if (!this.running || this.paused || !this.ownsTransport) return false;
    this.paused = true;
    this.transport.pause();
    this.disposeInstruments();
    return true;
  }

  resume(): boolean {
    if (!this.running || !this.paused || !this.ownsTransport) return false;
    this.recreateInstruments();
    this.paused = false;
    this.attackCurrentVoicing(this.transport.ticks / this.transport.PPQ, Tone.now());
    this.transport.start();
    return true;
  }

  restart(): boolean {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.startingGeneration = undefined;
      return false;
    }
    if (!this.running || !this.ownsTransport) return false;
    this.disposeInstruments();
    this.recreateInstruments();
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

  async audition(midiNotes: readonly number[]): Promise<void> {
    if (midiNotes.length === 0 || this.startingGeneration !== undefined || this.running || this.ownsTransport) return;
    const generation = ++this.generation;
    await Tone.start();
    if (generation !== this.generation || this.running || this.ownsTransport) return;
    this.voicingSynth ??= createVoicingSynth();
    this.voicingSynth.releaseAll();
    this.voicingSynth.triggerAttackRelease(midiNotes.map(midiToNoteName), "1n", Tone.now(), 0.72);
  }

  private invalidateAndClear(): number {
    this.generation += 1;
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

  private recreateInstruments(): void {
    this.voicingSynth = createVoicingSynth();
    this.clickSynth = createClickSynth();
  }

  private disposeInstruments(): void {
    this.voicingSynth?.releaseAll();
    this.voicingSynth?.dispose();
    this.clickSynth?.dispose();
    this.voicingSynth = undefined;
    this.clickSynth = undefined;
  }

  private attackCurrentVoicing(absoluteBeat: number, time: number): void {
    const options = this.activeOptions;
    if (!options || !this.voicingSynth) return;
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
    this.voicingSynth.releaseAll(time);
    this.voicingSynth.triggerAttack(resolution.voicing.midiNotes.map(midiToNoteName), time, 0.72);
  }
}

function createVoicingSynth(): Tone.PolySynth<Tone.FMSynth> {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 1.8,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 0.006, decay: 0.75, sustain: 0.24, release: 0.32 },
    modulationEnvelope: { attack: 0.006, decay: 0.15, sustain: 0.04, release: 0.2 },
  }).toDestination();
  synth.volume.value = -8;
  return synth;
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
