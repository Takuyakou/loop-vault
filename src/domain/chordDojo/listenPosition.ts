/**
 * Where the listening of a whole progression is, from the clock of the sound.
 * `startContextTime` is the audio time of beat 0 (taken when the playback starts: the time the first notes are scheduled at) and
 * `contextTime` the audio time that is coming out of the speakers now (`getOutputTimestamp().contextTime`). Nothing here counts time
 * on the screen's side.
 */
export const listenBeat=(contextTime:number,startContextTime:number,bpm:number)=>Math.max(0,(contextTime-startContextTime)*bpm/60);

/** 0…1 over the whole length. */
export const listenProgress=(beat:number,totalBeats:number)=>totalBeats>0?Math.min(1,Math.max(0,beat/totalBeats)):0;

/** The card that is sounding at `beat` (cards are laid end to end), or `undefined` before the start or after the end. */
export function listenCardIndex(beat:number,cards:readonly {startBeat:number;durationBeats:number}[]):number|undefined{
 const index=cards.findIndex(c=>beat>=c.startBeat&&beat<c.startBeat+c.durationBeats);
 return index<0?undefined:index;
}

/** The audio time that is being heard now: the output timestamp when the browser gives a usable one, else the context time less the output latency. */
export function heardContextTime(context:{currentTime:number;outputLatency?:number;getOutputTimestamp?:()=>{contextTime?:number}}):number{
 const stamp=context.getOutputTimestamp?.().contextTime;
 return stamp!==undefined&&stamp>0?stamp:context.currentTime-(context.outputLatency??0);
}
