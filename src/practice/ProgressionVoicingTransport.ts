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
  progressionPracticePlaybackNotes,
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
  updatePlan(
    plan: ProgressionPracticeVoicingPlan,
    options?: {
      readonly snapshot?: ProgressionVoicingPracticeSnapshot;
      readonly applyAtBeat?: number;
    },
  ): boolean;
  pause(): boolean;
  resume(): Promise<boolean>;
  restart(): Promise<boolean>;
  stop(): void;
  setBpm(bpm: number): void;
  setMetronomeEnabled(enabled: boolean): void;
  setReferenceSoundEnabled(enabled: boolean): void;
  audition(midiNotes: readonly number[], sound?: PreviewSound): Promise<void>;
  readonly supportsSeek?: boolean;
  seek?(eventIndex: number): { readonly status: "running" | "paused" | "count-in"; readonly absoluteBeat: number } | undefined;
}

const AUDITION_RETRIGGER_DELAY_SECONDS = 0.012;

/**
 * Runtime adapter for P5.27. Tone.Transport is the only musical clock: the
 * same scheduled ticks drive audio and the domain projection shown by React.
 */
export class ProgressionVoicingTransport implements ProgressionVoicingTransportPort {
  private readonly transport = Tone.getTransport();
  private scheduleIds: number[] = [];
  private readonly pendingIds = new Set<number>();
  private readonly v2: boolean;
  private rollingCursor = 0;
  private rollingLoop = 0;
  private rollingItems: readonly { readonly startBeat: number; readonly eventIndex: number }[] = [];
  private originToneBeat = 0;
  private originProgressionBeat = 0;
  private loopBaseCount = 0;
  private countInBeats = 0;
  private voicingInstrument?: PreviewInstrument;
  // After all instrument effects: release envelopes/reverb must not fill rests.
  private referenceOutput?: Tone.Gain;
  private latestScheduledAudioTime = 0;
  private voicingSound?: PreviewSound;
  private auditionInstrument?: PreviewInstrument;
  private auditionSound?: PreviewSound;
  private auditionGeneration = 0;
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
  private pendingSessionUpdate?: {
    readonly snapshot: ProgressionVoicingPracticeSnapshot;
    readonly plan: ProgressionPracticeVoicingPlan;
    readonly applyAtBeat: number;
  };

  constructor(v2 = false) {
    this.v2 = v2;
  }

  get supportsSeek(): boolean { return this.v2; }

  async start(options: ProgressionVoicingTransportStartOptions): Promise<void> {
    const generation = this.invalidateAndClear();
    this.desiredBpm = options.bpm;
    this.metronomeEnabled = options.metronomeEnabled;
    this.referenceSoundEnabled = options.referenceSoundEnabled ?? true;
    this.startingGeneration = generation;
    this.activeOptions = options;
    try {
      await Tone.start();
    } catch (error) {
      if (generation === this.generation) this.invalidateAndClear();
      throw error;
    }
    if (generation !== this.generation || this.startingGeneration !== generation) return;

    const ppq = this.transport.PPQ;
    try {
      assertCompatibleRuntimePpq(ppq);
    } catch (error) {
      if (generation === this.generation) this.invalidateAndClear();
      throw error;
    }

    const sound = options.sound ?? "electric-piano";
    this.referenceOutput = new Tone.Gain(0).toDestination();
    const voicingInstrumentPromise = createPreviewInstrument(sound, this.referenceOutput);
    this.startingGeneration = undefined;

    const countInBeats = options.countInBars * (this.v2
      ? options.snapshot.practiceGroupBeats ?? options.snapshot.meter.numerator
      : options.snapshot.meter.numerator);
    const loopTicks = Math.max(1, runtimeTickAtPracticeBeat(options.snapshot.lengthBeats, ppq));
    const startBeat = Math.max(0, options.startBeat ?? 0);
    this.ownsTransport = true;
    this.transport.stop();
    this.transport.position = `${Math.round((this.v2 ? 0 : startBeat) * ppq)}i`;
    this.countInBeats = countInBeats;
    this.originToneBeat = countInBeats;
    this.originProgressionBeat = this.v2 ? startBeat : 0;
    this.loopBaseCount = 0;
    this.transport.bpm.value = this.desiredBpm;
    this.voicingSound = sound;
    this.clickSynth = createClickSynth();

    if (this.v2) {
      this.resetRollingCursor(startBeat);
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        if (!this.acceptsCallback(generation)) return;
        this.refillRolling(time, ppq, generation);
      }, "16n", 0));
    } else {
    options.snapshot.events.forEach((event, eventIndex) => {
      const startTicks = runtimeTickAtPracticeBeat(countInBeats + event.startBeat, ppq);
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        if (!this.acceptsCallback(generation)) return;
        const absoluteBeat = this.absoluteBeatAtTime(time, ppq);
        if (absoluteBeat + 1 / ppq < countInBeats) return;
        this.applyPendingSessionUpdate(absoluteBeat);
        this.attackVoicing(eventIndex, 0, time);
      }, `${loopTicks}i`, `${startTicks}i`));
    });

    options.snapshot.spans.filter((span) => span.kind === "rest").forEach((span) => {
      const startTicks = runtimeTickAtPracticeBeat(countInBeats + span.startBeat, ppq);
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        if (!this.acceptsCallback(generation)) return;
        this.closeReferenceOutput(time);
        this.voicingInstrument?.releaseAll(time);
      }, `${loopTicks}i`, `${startTicks}i`));
    });

    }

    this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
      if (!this.acceptsCallback(generation)) return;
      const absoluteBeat = this.absoluteBeatAtTime(time, ppq);
      const beatInBar = Math.floor(absoluteBeat) % (this.v2
        ? options.snapshot.practiceGroupBeats ?? options.snapshot.meter.numerator
        : options.snapshot.meter.numerator);
      const applied = beatInBar === 0 && this.applyPendingSessionUpdate(absoluteBeat);
      if (applied && !this.hasEventAttackAt(absoluteBeat)) {
        this.attackCurrentVoicing(absoluteBeat, time);
      }
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
    }, "64n", 0));

    this.running = true;
    this.paused = false;
    options.onTransportBeat(this.v2 && countInBeats > 0 ? 0 : startBeat);
    const transportStartAudioTime = Tone.now() + 0.05;
    if (!this.v2) this.transport.start("+0.05");

    try {
      const voicingInstrument = await voicingInstrumentPromise;
      if (generation !== this.generation || !this.ownsTransport || !this.running) {
        voicingInstrument.dispose();
        return;
      }
      this.voicingInstrument = voicingInstrument;
      if (this.v2) {
        this.transport.start("+0.05");
        return;
      }
      const currentBeat = this.transport.ticks / ppq;
      const missedImmediateAttack = countInBeats === 0 && Tone.now() >= transportStartAudioTime;
      if (!this.paused && (
        startBeat > countInBeats
        || currentBeat > startBeat
        || missedImmediateAttack
      )) {
        const time = Tone.now() + 0.05;
        this.attackCurrentVoicing(this.absoluteBeatAtTime(time, ppq), time);
      }
    } catch (error) {
      if (generation === this.generation) this.invalidateAndClear();
      throw error;
    }
  }

  updatePlan(
    plan: ProgressionPracticeVoicingPlan,
    options: {
      readonly snapshot?: ProgressionVoicingPracticeSnapshot;
      readonly applyAtBeat?: number;
    } = {},
  ): boolean {
    const activeOptions = this.activeOptions;
    if (!activeOptions) return false;
    const pending = this.pendingSessionUpdate;
    const nextSnapshot = options.snapshot ?? pending?.snapshot ?? activeOptions.snapshot;
    if (!isCompatibleSessionTiming(activeOptions.snapshot, nextSnapshot)
      || !isCompatiblePlan(nextSnapshot, plan)) return false;
    const applyAtBeat = options.applyAtBeat ?? pending?.applyAtBeat;
    if (applyAtBeat !== undefined && Number.isFinite(applyAtBeat)
      && applyAtBeat > (this.v2 ? this.logicalBeat(this.transport.ticks / this.transport.PPQ) : this.transport.ticks / this.transport.PPQ)) {
      this.pendingSessionUpdate = { snapshot: nextSnapshot, plan, applyAtBeat };
      return true;
    }
    this.pendingSessionUpdate = undefined;
    this.activeOptions = { ...activeOptions, snapshot: nextSnapshot, plan };
    return true;
  }

  pause(): boolean {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.projectionEpoch += 1;
      this.startingGeneration = undefined;
      this.activeOptions = undefined;
      return false;
    }
    if (!this.running || this.paused || !this.ownsTransport) return false;
    this.projectionEpoch += 1;
    if (this.v2) this.clearPending();
    this.paused = true;
    this.transport.pause();
    this.closeReferenceOutput(Tone.now(), true);
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
    if (this.v2) {
      this.resetRollingCursor(this.currentProgressionBeat());
      if (this.transport.ticks / this.transport.PPQ >= this.countInBeats) this.skipCurrentRollingAttack();
    }
    this.attackCurrentVoicing(this.v2 ? this.logicalBeat(this.transport.ticks / this.transport.PPQ) : this.transport.ticks / this.transport.PPQ, Tone.now());
    this.transport.start();
    return true;
  }

  async restart(): Promise<boolean> {
    if (this.startingGeneration !== undefined && !this.ownsTransport) {
      this.generation += 1;
      this.projectionEpoch += 1;
      this.startingGeneration = undefined;
      this.activeOptions = undefined;
      return false;
    }
    if (!this.running || !this.ownsTransport) return false;
    const generation = this.generation;
    await Tone.start();
    if (generation !== this.generation || !this.running || !this.ownsTransport) return false;
    this.projectionEpoch += 1;
    if (this.v2) this.clearPending();
    this.closeReferenceOutput(Tone.now(), true);
    this.voicingInstrument?.releaseAll();
    if (!this.paused) this.transport.pause();
    this.transport.position = "0i";
    if (this.v2) {
      this.originToneBeat = this.countInBeats;
      this.originProgressionBeat = 0;
      this.loopBaseCount = 0;
      this.resetRollingCursor(0);
    }
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
    if (this.ownsTransport) {
      // Preserve already queued attack/release/gate times together. Changing
      // tempo before a delivered look-ahead boundary would invalidate only its
      // clock time, not its audio envelope. Start the same Transport's ramp
      // immediately after those committed actions (bounded by its look-ahead).
      const rampStart = Math.max(Tone.now(), this.latestScheduledAudioTime) + 0.001;
      this.transport.bpm.rampTo(bpm, 0.1, rampStart);
    }
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  setReferenceSoundEnabled(enabled: boolean): void {
    this.referenceSoundEnabled = enabled;
    if (!enabled) {
      this.closeReferenceOutput(Tone.now(), true);
      this.voicingInstrument?.releaseAll();
    }
  }

  async audition(midiNotes: readonly number[], sound: PreviewSound = "electric-piano"): Promise<void> {
    if (midiNotes.length === 0 || this.startingGeneration !== undefined || (this.v2 && this.running && !this.paused)) return;
    const generation = ++this.auditionGeneration;
    await Tone.start();
    if (generation !== this.auditionGeneration || this.startingGeneration !== undefined) return;
    if (!this.auditionInstrument || this.auditionSound !== sound) {
      this.disposeAuditionInstrument();
      const instrument = await createPreviewInstrument(sound);
      if (generation !== this.auditionGeneration || this.startingGeneration !== undefined) {
        instrument.dispose();
        return;
      }
      this.auditionInstrument = instrument;
      this.auditionSound = sound;
    }
    const releaseTime = Tone.now();
    this.auditionInstrument.releaseAll(releaseTime);
    // Keep the old chord's release and the new polyphonic attack on distinct
    // audio instants. Some hardware/browser combinations otherwise apply the
    // release to voices allocated by the same-timestamp attack (often the top).
    this.auditionInstrument.triggerAttackRelease(
      midiNotes.map(midiToNoteName),
      2,
      releaseTime + AUDITION_RETRIGGER_DELAY_SECONDS,
      0.72,
    );
  }

  seek(eventIndex: number): { readonly status: "running" | "paused" | "count-in"; readonly absoluteBeat: number } | undefined {
    const options = this.activeOptions;
    if (!this.v2 || !options || !this.ownsTransport || !Number.isInteger(eventIndex)
      || eventIndex < 0 || eventIndex >= options.snapshot.events.length) return;
    const target = options.snapshot.events[eventIndex]!.startBeat;
    const wasCountIn = this.transport.ticks / this.transport.PPQ < this.countInBeats;
    const toneBeat = this.transport.ticks / this.transport.PPQ;
    const logical = this.logicalBeat(toneBeat);
    const previousLoop = Math.floor(Math.max(0, logical - this.countInBeats) / options.snapshot.lengthBeats);
    this.projectionEpoch += 1;
    this.clearPending();
    this.closeReferenceOutput(Tone.now(), true);
    this.voicingInstrument?.releaseAll();
    this.auditionGeneration += 1;
    this.disposeAuditionInstrument();
    if (wasCountIn) {
      this.transport.pause();
      this.transport.position = "0i";
      this.originToneBeat = this.countInBeats;
      this.originProgressionBeat = target;
      this.loopBaseCount = 0;
      this.resetRollingCursor(target);
      this.paused = false;
      this.transport.start("+0.05");
      options.onTransportBeat(0);
      return { status: "count-in", absoluteBeat: 0 };
    }
    this.originToneBeat = toneBeat;
    this.originProgressionBeat = target;
    this.loopBaseCount = previousLoop;
    this.resetRollingCursor(target);
    this.skipCurrentRollingAttack(eventIndex);
    const absoluteBeat = this.countInBeats + previousLoop * options.snapshot.lengthBeats + target;
    options.onTransportBeat(absoluteBeat);
    if (!this.paused) this.attackCurrentVoicing(absoluteBeat, Tone.now() + 0.01);
    return { status: this.paused ? "paused" : "running", absoluteBeat };
  }

  private logicalBeat(toneBeat: number): number {
    const options = this.activeOptions;
    if (!options || toneBeat < this.countInBeats) return toneBeat;
    return this.countInBeats + this.loopBaseCount * options.snapshot.lengthBeats
      + this.originProgressionBeat + Math.max(0, toneBeat - this.originToneBeat);
  }

  private currentProgressionBeat(): number {
    const options = this.activeOptions;
    if (!options) return 0;
    return Math.max(0, this.logicalBeat(this.transport.ticks / this.transport.PPQ) - this.countInBeats) % options.snapshot.lengthBeats;
  }

  private clearPending(): void {
    for (const id of this.pendingIds) this.transport.clear(id);
    this.pendingIds.clear();
  }

  private resetRollingCursor(targetBeat: number): void {
    const options = this.activeOptions;
    if (!options) return;
    this.rollingItems = [
      ...options.snapshot.events.map((event, eventIndex) => ({ startBeat: event.startBeat, eventIndex })),
      ...options.snapshot.spans.filter((span) => span.kind === "rest")
        .map((span) => ({ startBeat: span.startBeat, eventIndex: -1 })),
    ].sort((a, b) => a.startBeat - b.startBeat || a.eventIndex - b.eventIndex);
    this.rollingCursor = this.rollingItems.findIndex((item) => item.startBeat + 1e-9 >= targetBeat);
    if (this.rollingCursor < 0) this.rollingCursor = 0;
    const currentLoop = Math.floor(Math.max(0, this.logicalBeat(this.transport.ticks / this.transport.PPQ) - this.countInBeats)
      / options.snapshot.lengthBeats);
    this.rollingLoop = currentLoop + (this.rollingItems[this.rollingCursor]!.startBeat < targetBeat ? 1 : 0);
  }

  private skipCurrentRollingAttack(eventIndex?: number): void {
    const options = this.activeOptions;
    if (!options || this.rollingItems.length === 0) return;
    const nextItem = this.rollingItems[this.rollingCursor];
    const currentBeat = this.currentProgressionBeat();
    if (nextItem?.eventIndex !== (eventIndex ?? nextItem?.eventIndex)
      || nextItem.eventIndex < 0 || Math.abs(nextItem.startBeat - currentBeat) > 1e-6) return;
    this.rollingCursor += 1;
    if (this.rollingCursor >= this.rollingItems.length) {
      this.rollingCursor = 0;
      this.rollingLoop += 1;
    }
  }

  private refillRolling(time: number, ppq: number, generation: number): void {
    const options = this.activeOptions;
    if (!options || this.rollingItems.length === 0) return;
    const toneBeat = this.transport.getTicksAtTime(time) / ppq;
    const horizon = toneBeat + Math.max(0.75, this.desiredBpm * 1.5 / 60);
    while (this.pendingIds.size < 128) {
      const item = this.rollingItems[this.rollingCursor]!;
      const logicalDue = this.countInBeats + this.rollingLoop * options.snapshot.lengthBeats + item.startBeat;
      const toneDue = this.originToneBeat + logicalDue
        - (this.countInBeats + this.loopBaseCount * options.snapshot.lengthBeats + this.originProgressionBeat);
      if (toneDue > horizon) break;
      this.rollingCursor += 1;
      if (this.rollingCursor >= this.rollingItems.length) {
        this.rollingCursor = 0;
        this.rollingLoop += 1;
      }
      if (toneDue < toneBeat - 1 / ppq) continue;
      const epoch = this.projectionEpoch;
      let id = 0;
      id = this.transport.scheduleOnce((scheduledTime) => {
        this.pendingIds.delete(id);
        if (!this.acceptsCallback(generation) || epoch !== this.projectionEpoch) return;
        if (item.eventIndex < 0) {
          this.closeReferenceOutput(scheduledTime);
          this.voicingInstrument?.releaseAll(scheduledTime);
        } else {
          this.applyPendingSessionUpdate(logicalDue);
          this.attackVoicing(item.eventIndex, 0, scheduledTime);
        }
      }, `${Math.round(toneDue * ppq)}i`);
      this.pendingIds.add(id);
    }
  }

  private invalidateAndClear(): number {
    this.generation += 1;
    this.auditionGeneration += 1;
    this.projectionEpoch += 1;
    this.startingGeneration = undefined;
    if (this.ownsTransport) {
      this.transport.stop();
      for (const id of this.scheduleIds) this.transport.clear(id);
    }
    this.scheduleIds = [];
    this.clearPending();
    this.disposeInstruments();
    this.ownsTransport = false;
    this.running = false;
    this.paused = false;
    this.activeOptions = undefined;
    this.pendingSessionUpdate = undefined;
    return this.generation;
  }

  private acceptsCallback(generation: number): boolean {
    return generation === this.generation && this.ownsTransport && this.running && !this.paused;
  }

  private absoluteBeatAtTime(time: number, ppq: number): number {
    this.latestScheduledAudioTime = Math.max(this.latestScheduledAudioTime, time);
    const toneBeat = Math.max(0, this.transport.getTicksAtTime(time) / ppq);
    return this.v2 ? this.logicalBeat(toneBeat) : toneBeat;
  }

  private disposeInstruments(): void {
    this.voicingInstrument?.releaseAll();
    this.voicingInstrument?.dispose();
    this.referenceOutput?.dispose();
    this.referenceOutput = undefined;
    this.latestScheduledAudioTime = 0;
    this.clickSynth?.dispose();
    this.voicingInstrument = undefined;
    this.voicingSound = undefined;
    this.clickSynth = undefined;
    this.disposeAuditionInstrument();
  }

  private disposeAuditionInstrument(): void {
    this.auditionInstrument?.releaseAll();
    this.auditionInstrument?.dispose();
    this.auditionInstrument = undefined;
    this.auditionSound = undefined;
  }

  private attackCurrentVoicing(absoluteBeat: number, time: number): void {
    const current = this.currentSoundingEvent(absoluteBeat);
    if (!current) {
      this.closeReferenceOutput(time, true);
      return;
    }
    this.attackVoicing(current.eventIndex, current.elapsedBeats, time);
  }

  private applyPendingSessionUpdate(absoluteBeat: number): boolean {
    const pending = this.pendingSessionUpdate;
    const activeOptions = this.activeOptions;
    if (!pending || !activeOptions || absoluteBeat + 1 / this.transport.PPQ < pending.applyAtBeat) return false;
    this.pendingSessionUpdate = undefined;
    this.activeOptions = {
      ...activeOptions,
      snapshot: pending.snapshot,
      plan: pending.plan,
    };
    return true;
  }

  private hasEventAttackAt(absoluteBeat: number): boolean {
    const options = this.activeOptions;
    if (!options) return false;
    const countInBeats = this.v2 ? this.countInBeats : options.countInBars * options.snapshot.meter.numerator;
    if (absoluteBeat < countInBeats) return false;
    const progressionBeat = (absoluteBeat - countInBeats) % options.snapshot.lengthBeats;
    return options.snapshot.events.some((event) => (
      Math.abs(event.startBeat - progressionBeat) <= 1 / this.transport.PPQ
    ));
  }

  private currentSoundingEvent(absoluteBeat: number): { eventIndex: number; elapsedBeats: number } | undefined {
    const options = this.activeOptions;
    if (!options) return;
    const countInBeats = this.v2 ? this.countInBeats : options.countInBars * options.snapshot.meter.numerator;
    if (absoluteBeat < countInBeats) return;
    const progressionBeat = (absoluteBeat - countInBeats) % options.snapshot.lengthBeats;
    const eventIndex = options.snapshot.events.findIndex((event) => progressionBeat >= event.startBeat
      && progressionBeat < event.startBeat + event.durationBeats);
    if (eventIndex < 0) return;
    return { eventIndex, elapsedBeats: progressionBeat - options.snapshot.events[eventIndex]!.startBeat };
  }

  private closeReferenceOutput(time: number, cancel = false): void {
    if (cancel) {
      this.referenceOutput?.gain.cancelScheduledValues(Tone.now());
    }
    this.scheduleReferenceGate(0, time);
  }

  private scheduleReferenceGate(value: 0 | 1, time: number): void {
    const gain = this.referenceOutput?.gain;
    if (!gain) return;
    const now = Tone.now();
    this.latestScheduledAudioTime = Math.max(this.latestScheduledAudioTime, time);
    if (value === 0 && time - now >= 0.003) {
      const rampStart = time - 0.003;
      gain.setValueAtTime(gain.getValueAtTime(rampStart), rampStart);
      gain.linearRampToValueAtTime(0, time);
    } else gain.setValueAtTime(value, time);
  }

  private attackVoicing(eventIndex: number, elapsedBeats: number, time: number): void {
    const options = this.activeOptions;
    if (!options || !this.voicingInstrument || !this.referenceSoundEnabled) return;
    const resolution = options.plan.events[eventIndex];
    if (resolution?.status !== "SUPPORTED") {
      this.closeReferenceOutput(time);
      this.voicingInstrument.releaseAll(time);
      return;
    }
    const event = options.snapshot.events[eventIndex]!;
    this.scheduleReferenceGate(1, time);
    if (this.voicingInstrument.triggerAttack) {
      // Release at the next canonical attack/rest, not at a wall-time duration
      // guessed before a BPM change. A held event has only one boundary attack.
      this.voicingInstrument.releaseAll(time);
      this.voicingInstrument.triggerAttack(progressionPracticePlaybackNotes(resolution.voicing).map(midiToNoteName), time, 0.72);
      return;
    }
    const remainingBeats = Math.max(0.05, event.durationBeats - elapsedBeats);
    const durationSeconds = Math.max(0.05, remainingBeats * 60 / this.desiredBpm);
    this.voicingInstrument.triggerAttackRelease(
      progressionPracticePlaybackNotes(resolution.voicing).map(midiToNoteName),
      durationSeconds,
      time,
      0.72,
    );
  }
}

function isCompatiblePlan(
  snapshot: ProgressionVoicingPracticeSnapshot,
  plan: ProgressionPracticeVoicingPlan,
): boolean {
  return plan.snapshotFingerprint === snapshot.fingerprint
    && plan.selection === snapshot.selection
    && plan.events.length === snapshot.events.length
    && plan.events.every((event, index) => event.eventId === snapshot.events[index]?.id);
}

function isCompatibleSessionTiming(
  active: ProgressionVoicingPracticeSnapshot,
  next: ProgressionVoicingPracticeSnapshot,
): boolean {
  return active.selection === next.selection
    && active.meter.numerator === next.meter.numerator
    && active.meter.denominator === next.meter.denominator
    && active.lengthBeats === next.lengthBeats
    && active.events.length === next.events.length
    && active.events.every((event, index) => {
      const candidate = next.events[index];
      return candidate?.id === event.id
        && candidate.startBeat === event.startBeat
        && candidate.durationBeats === event.durationBeats;
    })
    && active.spans.length === next.spans.length
    && active.spans.every((span, index) => {
      const candidate = next.spans[index];
      return candidate?.kind === span.kind
        && candidate.startBeat === span.startBeat
        && candidate.durationBeats === span.durationBeats
        && (span.kind !== "chord"
          || candidate.kind === "chord" && candidate.eventIndex === span.eventIndex);
    });
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

/** Candidate transport with bounded chord scheduling; legacy constructor remains the rollback path. */
export class ProgressionVoicingTransportV2 extends ProgressionVoicingTransport {
  constructor() { super(true); }
}
