import * as Tone from 'tone';
/** Audio-context clock anchored to the first chord's physical attack.
 * It shares Tone's context/destination, never changes the global transport.
 */
export function startMaster251Clicks(originMs:number,bpm:number,enabled:()=>boolean){
 const beatMs=60000/bpm,now=performance.now(),first=Math.max(1,Math.ceil((now-originMs)/beatMs));
 const synth=new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:.001,decay:.04,sustain:0,release:.02}}).toDestination();synth.volume.value=-18;
 const origin=Tone.immediate()+(originMs-now)/1000;let closed=false;
 const clock=new Tone.Clock((time,beat=0)=>{if(closed||beat>=8)return;if(enabled())synth.triggerAttackRelease(beat%2===0?'C6':'C5',.04,time);},bpm/60);
 clock.start(origin+first*beatMs/1000,first);clock.stop(origin+8*beatMs/1000);
 return ()=>{if(closed)return;closed=true;clock.stop();clock.dispose();synth.dispose();};
}
