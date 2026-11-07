import type {DojoChord} from './builtins';
import type {VaultProgression} from './collect';
import type {DojoStore,Task} from './store';

export function progressionEntriesInRange(p:VaultProgression,range:Task['range']){
 if(!range)return p.chords.map((chord,i)=>({chord,bar:p.chordBars[i]}));
 const meter=p.beatsPerBar;
 if(!meter||!p.chordBeatRanges)return p.chords.flatMap((chord,i)=>p.chordBars[i]>=range.startBar&&p.chordBars[i]<=range.endBar?[{chord,bar:p.chordBars[i]}]:[]);
 const start=(range.startBar-1)*meter,end=range.endBar*meter;
 return p.chords.flatMap((chord,i)=>{const span=p.chordBeatRanges![i];if(!span||span.end<=start||span.start>=end)return [];return [{chord:span.start>=start&&span.end<=end?chord:{...chord,beats:Math.min(span.end,end)-Math.max(span.start,start)},bar:Math.floor(Math.max(start,span.start)/meter)+1}];});
}
export const progressionInRange=(p:VaultProgression,range:Task['range'])=>progressionEntriesInRange(p,range).map(e=>e.chord);
const signature=(chords:readonly DojoChord[])=>JSON.stringify(chords.map(c=>({chord:c.chord,notes:c.notes,beats:c.beats})));
/** A theme may carry a range even when it covers the whole saved progression.
 * Missing/changed source or partial frozen targets never authorize whole mastery. */
export function isPartialProgression(store:DojoStore,task:Task,progressions:VaultProgression[]=[]){
 if(task.kind!=='progression'||!task.key.startsWith('vault:'))return false;
 const today=store.today;
 if(!today?.lesson&&!today?.legacyTargets)return Boolean(task.range);
 const source=progressions.find(p=>p.key===task.key);
 if(task.range&&(!source?.range||task.range.startBar>source.range.startBar||task.range.endBar<source.range.endBar))return true;
 const frozen=(today.lesson?.targets??today.legacyTargets??[]).filter(t=>t.taskKey===task.key&&!t.composition&&t.keyIndex===today.cursor.keyIndex).sort((a,b)=>a.chordIndex-b.chordIndex).map(t=>t.chord);
 return !source||!frozen.length||signature(frozen)!==signature(source.chords)||signature(progressionInRange(source,task.range))!==signature(source.chords);
}
