import * as Tone from "tone";
import type { RhythmPracticeExercise } from "../domain";
import { buildRhythmPlaybackPlan } from "./rhythmPlayback";

export interface RhythmPlaybackCallbacks { onPlayhead?(beat: number): void; onEnded?(): void; }
export interface RhythmPlaybackOptions { readonly metronomeEnabled: boolean; readonly callbacks?: RhythmPlaybackCallbacks; }

export class RhythmPlaybackController {
  private readonly transport = Tone.getTransport();
  private ids: number[] = [];
  private click?: Tone.Synth;
  private mutedBass?: Tone.Synth;
  private generation = 0;

  async start(exercise: RhythmPracticeExercise, options: RhythmPlaybackOptions): Promise<void> {
    const generation = this.clear();
    await Tone.start();
    if (generation !== this.generation) return;
    const plan = buildRhythmPlaybackPlan(exercise, { metronomeEnabled: options.metronomeEnabled });
    const ppq = this.transport.PPQ;
    this.transport.stop(); this.transport.position = 0; this.transport.bpm.value = exercise.tempo;
    this.click = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: .001, decay: .03, sustain: 0, release: .01 } }).toDestination();
    this.click.volume.value = -18;
    this.mutedBass = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: .003, decay: .05, sustain: .05, release: .08 } }).toDestination();
    this.mutedBass.volume.value = -10;
    for (const event of plan.events) {
      const ticks = Math.round(event.beat * ppq);
      this.ids.push(this.transport.schedule((time) => {
        if (generation !== this.generation) return;
        if (event.kind === "target") this.mutedBass?.triggerAttackRelease("C2", "32n", time, event.accent ? .88 : .7);
        else this.click?.triggerAttackRelease(event.accent ? "C6" : "C5", "32n", time);
        Tone.getDraw().schedule(() => { if (generation === this.generation) options.callbacks?.onPlayhead?.(event.beat); }, time);
      }, `${ticks}i`));
    }
    this.ids.push(this.transport.schedule((time) => Tone.getDraw().schedule(() => { if (generation === this.generation) { options.callbacks?.onEnded?.(); this.stop(); } }, time), `${Math.round(plan.totalBeats * ppq)}i`));
    this.transport.start("+0.05");
  }

  stop(): void { this.clear(); }
  dispose(): void { this.clear(); }

  private clear(): number {
    this.generation += 1;
    this.transport.stop();
    for (const id of this.ids) this.transport.clear(id);
    this.ids = [];
    this.click?.dispose(); this.click = undefined;
    this.mutedBass?.dispose(); this.mutedBass = undefined;
    return this.generation;
  }
}
