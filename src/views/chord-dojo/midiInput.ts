import {createMidiInputPianoMonitor,type MidiInputPianoMonitor} from '../../audio/midiInputPianoMonitor';
import {soundingNotes} from '../../domain/liveMidi';
import {defaultLiveMidiStore} from '../../liveMidi/defaultLiveMidiStore';
import type {LiveMidiStoreState} from '../../liveMidi/liveMidiStore';
import type {StoreApi} from 'zustand/vanilla';

export function hasDojoMidiInput(s:Pick<LiveMidiStoreState,'active'|'status'|'selected'>){return s.active&&s.status==='connected'&&Boolean(s.selected);}

/** Fixture builds only: counts the monitors alive now, so a test can see that there is never more than one (P14 §7). */
function trackMonitor(delta:number){if(typeof window==='undefined')return;const w=window as typeof window&{__dojoMonitorCount?:number};if(typeof w.__dojoMonitorCount==='number')w.__dojoMonitorCount+=delta;}
/** Fixture builds only: the notes last handed to the monitor (VL-13 A: the same fixture input can prove the sound reaches it). */
function trackNotes(notes:readonly number[]){if(typeof window==='undefined')return;const w=window as typeof window&{__dojoMonitorNotes?:number[];__dojoMonitorCount?:number};if(typeof w.__dojoMonitorCount==='number')w.__dojoMonitorNotes=[...notes];}

/** One warm monitor per input session. Muting never forwards preview audio to MIDI. */
export function startDojoPianoInput(onState:(state:'ready'|'error')=>void,store:Pick<StoreApi<LiveMidiStoreState>,'getState'|'subscribe'>=defaultLiveMidiStore,createMonitor:()=>Promise<MidiInputPianoMonitor>=createMidiInputPianoMonitor,initialMuted=false){
 let closed=false,monitor:MidiInputPianoMonitor|undefined,signature='',muted=initialMuted;
 let priorHeld=new Map([...store.getState().notes.held].map(([key,note])=>[key,note.count]));
 const suppressed=new Set(soundingNotes(store.getState().notes)),device=store.getState().selected?.backendId;
 const reset=()=>{if(closed)return;monitor?.stop();trackNotes([]);signature='';suppressed.clear();priorHeld=new Map([...store.getState().notes.held].map(([key,note])=>[key,note.count]));for(const note of soundingNotes(store.getState().notes))suppressed.add(note);};
 const sync=()=>{
  if(!monitor||closed)return;const s=store.getState();
  if(!hasDojoMidiInput(s)||s.selected?.backendId!==device){monitor.stop();trackNotes([]);signature='';return;}
  // A new physical attack also replaces an old suppressed pedal voice at the same pitch.
  for(const [key,note] of s.notes.held)if(note.count>(priorHeld.get(key)??0))suppressed.delete(Number(key.split(':')[1]));
  priorHeld=new Map([...s.notes.held].map(([key,note])=>[key,note.count]));
  const current=soundingNotes(s.notes);for(const note of suppressed)if(!current.includes(note))suppressed.delete(note);
  if(muted){trackNotes([]);return;}
  const notes=[...new Set(current)].filter(note=>!suppressed.has(note)).sort((a,b)=>a-b),next=notes.join(',');
  if(next!==signature){monitor.updateNotes(notes);trackNotes(notes);signature=next;}
 };
 const unsubscribe=store.subscribe(sync);
 void createMonitor().then(m=>{if(closed){m.dispose();return;}monitor=m;trackMonitor(1);sync();onState('ready');},()=>{if(!closed)onState('error');});
 const close=()=>{if(closed)return;closed=true;unsubscribe();if(monitor)trackMonitor(-1);monitor?.dispose();monitor=undefined;trackNotes([]);};
 return Object.assign(close,{reset,setMuted:(value:boolean)=>{if(value===muted)return;muted=value;reset();sync();}});
}
