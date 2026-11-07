import {parseChordLabel} from '../../domain/chords';
import {Master251Engine} from '../../domain/master251/engine';
import type {PlaybackRequest} from '../../audio/playbackController';
import type {PreviewSound} from '../../audio/chordPreview';
export function beginMaster251Audition(engine:Master251Engine,index:number,sound:PreviewSound):PlaybackRequest|undefined {
 const target=engine.target.chords[index];
 if(!target||engine.phase==='ready')return undefined;
 const chord=parseChordLabel(target.symbol);
 if(!chord)return undefined;
 if(engine.mode!=='learn'){engine.usedHint=true;engine.hintLevel=4;}
 engine.pause();
 return {type:'chord',chord:{...chord,label:target.symbol},sound,explicitMidiNotes:[...target.notes]};
}
/** Restart timing from a fresh release gate; the auditioned attempt remains assisted. */
export function restartMaster251AfterAudition(engine:Master251Engine){
 const fresh=new Master251Engine(engine.cell,engine.mode,engine.bpm,engine.policy,engine.range);
 fresh.usedHint=engine.usedHint;
 return fresh;
}

/** Audition this cell's ii -> V -> I through the existing exact-note timeline preview. */
export function beginMaster251ProgressionAudition(engine:Master251Engine,sound:PreviewSound):PlaybackRequest|undefined {
 if(engine.phase==='ready')return undefined;
 const chords=engine.target.chords.map(target=>parseChordLabel(target.symbol));if(chords.some(chord=>!chord))return undefined;
 if(engine.mode!=='learn'){engine.usedHint=true;engine.hintLevel=4;}engine.pause();
 const beatsPerBar=4,beats=engine.target.beatsPerChord;
 const timeline=engine.target.chords.map((target,index)=>({eventId:`master251:${engine.cell}:${index}`,bar:Math.floor(index*beats/beatsPerBar)+1,beat:index*beats%beatsPerBar+1,durationBeats:beats,confidence:1,alternatives:[],warnings:[],chord:{...chords[index]!,label:target.symbol}}));
 return {type:'timeline',timeline,bpm:engine.bpm??80,sound,beatsPerBar,explicitMidiNotesByEventId:Object.fromEntries(timeline.map((item,index)=>[item.eventId,[...engine.target.chords[index].notes]]))};
}
