import {BUILTINS,type DojoChord} from './builtins';
import {judgeChord,type Target} from './judging';
/** Explicit saved/source/custom pitches are the answer, including omissions and register.
 * Generated built-in exercises keep their separately defined core/shape contract. */
export function progressionTarget(event:DojoChord,taskKey:string):Target {
 const builtin=taskKey.startsWith('builtin:')?BUILTINS.find(b=>b.id===taskKey.split(':')[1]):undefined;
 const target:Target={chord:event.chord,notes:event.notes,judge:event.source?'exact':builtin?.judge??'core',bass:'self'};
 // Old frozen snapshots may retain pitches without origin metadata. Never invent
 // provenance or demand a tone absent from their answer; keep ordinary core guides.
 if(taskKey.startsWith('vault:')&&!event.source&&event.notes.length&&!judgeChord(target,event.notes).ok)return {...target,judge:'exact'};
 return target;
}
