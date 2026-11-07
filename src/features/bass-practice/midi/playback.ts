import * as Tone from "tone";
import { createFreepatsBassInstrument, type BassPreviewInstrument } from "../application/freepatsBass";
import { createPreviewInstrument, type PreviewInstrument } from "../../../audio/chordPreview";
import type { MidiBassNote } from "./model";
export class MidiBassPlayback {
  private bass?:BassPreviewInstrument; private harmony?:PreviewInstrument; private click?:Tone.Synth;
  private generation=0; private timer?:ReturnType<typeof setTimeout>; private raf?:number;
  async prepare() {const g=++this.generation;this.release();await Tone.start();const [bass,harmony]=await Promise.all([createFreepatsBassInstrument("finger"),createPreviewInstrument("electric-piano")]);if(g!==this.generation){bass.dispose();harmony.dispose();return false;}this.bass=bass;this.harmony=harmony;this.click=new Tone.Synth({oscillator:{type:"sine"},envelope:{attack:.001,decay:.03,sustain:0,release:.01}}).toDestination();this.click.volume.value=-20;return true;}
  /** Absolute audio origin; no global Transport ownership or meter mutation. */
  start(notes:readonly MidiBassNote[],accompaniment:readonly MidiBassNote[],bpm:number,lengthBeats:number,click:boolean,onBeat:(beat:number)=>void,onEnded:()=>void, additionalDelayMs=0) {
    const origin=Tone.now()+additionalDelayMs/1000, delayMs=Math.max(0,(origin-Tone.immediate())*1000),seconds=60/bpm,g=this.generation;const start=performance.now()+delayMs;
    for(const n of notes)this.bass?.triggerAttackRelease(Tone.Frequency(n.pitch,"midi").toNote(),n.durationBeats*seconds,origin+n.startBeat*seconds,n.velocity);
    for(const n of accompaniment)this.harmony?.triggerAttackRelease([Tone.Frequency(n.pitch,"midi").toNote()],n.durationBeats*seconds,origin+n.startBeat*seconds,n.velocity);
    if(click)for(let b=0;b<lengthBeats;b++)this.click?.triggerAttackRelease(b%4===0?"C6":"C5",.04,origin+b*seconds,.6);
    const tick=()=>{if(g!==this.generation)return;const beat=Math.max(0,(performance.now()-start)/(seconds*1000));onBeat(Math.min(lengthBeats,beat));if(beat<lengthBeats)this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);
    this.timer=setTimeout(()=>{if(g!==this.generation)return;onEnded();this.stop();},lengthBeats*seconds*1000+delayMs);
    return delayMs;
  }
  countIn(bpm:number) {const origin=Tone.now();for(let b=0;b<4;b++)this.click?.triggerAttackRelease(b===0?"C6":"C5",.04,origin+b*60/bpm,.6);}
  stop(){this.generation++;this.release();}
  private release(){if(this.timer)clearTimeout(this.timer);if(this.raf)cancelAnimationFrame(this.raf);this.timer=undefined;this.raf=undefined;this.bass?.releaseAll();this.bass?.dispose();this.harmony?.releaseAll();this.harmony?.dispose();this.click?.dispose();this.bass=undefined;this.harmony=undefined;this.click=undefined;}
}
