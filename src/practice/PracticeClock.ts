import * as Tone from "tone";
import type { ChordTimelineItem } from "../domain/types";

export const PRACTICE_FLOW_EARLY_MS = 180;
export const PRACTICE_FLOW_LATE_MS = 180;

export interface PracticeClockCallbacks {
  onTargetOpen(eventIndex: number): void;
  onTargetClose(eventIndex: number): void;
  onRoundCompleted(): void;
  onBeat?(beat: number): void;
}

export interface PracticeClockStartOptions {
  events: readonly ChordTimelineItem[];
  bpm: number;
  beatsPerBar: number;
  callbacks: PracticeClockCallbacks;
}

export interface PracticeClockSchedule {
  roundBeats: number;
  events: Array<{
    eventIndex: number;
    targetBeat: number;
    openBeat: number;
    closeBeat: number;
  }>;
}

export function buildPracticeClockSchedule(
  events: readonly ChordTimelineItem[],
  beatsPerBar: number,
  bpm: number,
): PracticeClockSchedule {
  if (events.length === 0) return { roundBeats: 0, events: [] };
  const ordered = events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .sort((left, right) => absoluteBeat(left.event, beatsPerBar) - absoluteBeat(right.event, beatsPerBar));
  const firstBeat = absoluteBeat(ordered[0]!.event, beatsPerBar);
  const beatSeconds = 60 / bpm;
  const earlyBeats = PRACTICE_FLOW_EARLY_MS / 1000 / beatSeconds;
  const lateBeats = PRACTICE_FLOW_LATE_MS / 1000 / beatSeconds;
  const scheduled = ordered.map(({ event, eventIndex }) => {
    const targetBeat = absoluteBeat(event, beatsPerBar) - firstBeat;
    return {
      eventIndex,
      targetBeat,
      openBeat: Math.max(0, targetBeat - earlyBeats),
      closeBeat: targetBeat + lateBeats,
      durationBeats: event.durationBeats,
    };
  });
  return {
    roundBeats: Math.max(...scheduled.map((event) => event.targetBeat + event.durationBeats)),
    events: scheduled.map(({ durationBeats: _durationBeats, ...event }) => event),
  };
}

export class PracticeClock {
  private readonly transport = Tone.getTransport();
  private scheduleIds: number[] = [];
  private metronome?: Tone.Synth;
  private running = false;

  async start(options: PracticeClockStartOptions): Promise<void> {
    this.stop();
    if (options.events.length === 0) return;
    await Tone.start();

    const schedule = buildPracticeClockSchedule(
      options.events,
      options.beatsPerBar,
      options.bpm,
    );
    const ppq = this.transport.PPQ;
    const roundTicks = Math.max(1, Math.round(schedule.roundBeats * ppq));

    this.transport.stop();
    this.transport.position = 0;
    this.transport.bpm.value = options.bpm;
    this.metronome = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).toDestination();
    this.metronome.volume.value = -18;

    schedule.events.forEach((event) => {
      const openTicks = Math.max(0, Math.round(event.openBeat * ppq));
      const closeTicks = Math.max(openTicks + 1, Math.round(event.closeBeat * ppq));
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        Tone.getDraw().schedule(() => options.callbacks.onTargetOpen(event.eventIndex), time);
      }, `${roundTicks}i`, `${openTicks}i`));
      this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
        Tone.getDraw().schedule(() => options.callbacks.onTargetClose(event.eventIndex), time);
      }, `${roundTicks}i`, `${closeTicks}i`));
    });

    let beat = 0;
    this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
      const beatInBar = beat % options.beatsPerBar;
      this.metronome?.triggerAttackRelease(beatInBar === 0 ? "C6" : "C5", "32n", time);
      Tone.getDraw().schedule(() => options.callbacks.onBeat?.(beatInBar + 1), time);
      beat += 1;
    }, "4n", 0));
    this.scheduleIds.push(this.transport.scheduleRepeat((time) => {
      Tone.getDraw().schedule(options.callbacks.onRoundCompleted, time);
    }, `${roundTicks}i`, `${roundTicks}i`));

    this.running = true;
    this.transport.start("+0.05");
  }

  pause(): void {
    if (!this.running) return;
    this.transport.pause();
  }

  resume(): void {
    if (!this.running) return;
    this.transport.start();
  }

  setBpm(bpm: number): void {
    this.transport.bpm.rampTo(bpm, 0.1);
  }

  stop(): void {
    if (this.running) this.transport.stop();
    this.running = false;
    for (const id of this.scheduleIds) this.transport.clear(id);
    this.scheduleIds = [];
    this.metronome?.dispose();
    this.metronome = undefined;
  }
}

function absoluteBeat(event: ChordTimelineItem, beatsPerBar: number): number {
  return (event.bar - 1) * beatsPerBar + (event.beat - 1);
}
