import {formatMidiNoteForDisplay} from '../../components/music-keyboard/noteDisplay';

/** Display spelling only: stored keys and the canonical target stay unchanged. */
export const masterKeyLabel=(name:string)=>name.replace(/([A-G])b/g,'$1♭');
const noteList=(notes:readonly number[])=>notes.slice(0,3).map(n=>masterKeyLabel(formatMidiNoteForDisplay(n,'scientific','flat'))).join(' · ')+(notes.length>3?` ほか${notes.length-3}音`:'');

export function masterWrongFeedback(expected:readonly number[],judged:readonly number[]|undefined,message:string){
 if(!judged||message==='音域（鍵盤の位置）が違います')return `✗ ${message}`;
 const held=[...new Set(judged)].sort((a,b)=>a-b),target=[...new Set(expected)].sort((a,b)=>a-b);
 const extra=held.filter(n=>!target.includes(n)),missing=target.filter(n=>!held.includes(n));
 const sides=[extra.length?`余分：${noteList(extra)}`:'',missing.length?`足りない：${noteList(missing)}`:''].filter(Boolean);
 return sides.length?`✗ ${sides.join(' ／ ')}`:`✗ ${message}`;
}
