import type {LessonChord} from './lessonModel';
import { chordPitchClasses, voiceChordForPreview } from '../chordVoicing';
import { NAMES, pc, recipeNotes, symbol, type BuiltinQuality, type Quality } from './recipes';
import type { Tension } from '../types';
import { JAZZ_DEFS } from './builtins.p12-4';
export type PointCheck={kind:'half-step';from:number;tone:number;to:number;target:number;dir:1|-1}|{kind:'common-tones';tones:number[]}|{kind:'max-upper-motion';semitones:number}|{kind:'descent'};
export type BuiltinGroup='basics'|'jpop'|'jazz'|'neosoul'|'minor'|'jazz-basic'|'jazz-device'|'jazz-form'|'modern';
/** Which keys a progression is practised in: all twelve, or the six common jazz keys (F B♭ E♭ A♭ C G). */
export type PracticeKeys='all12'|'jazz6';
export interface BuiltinDef {id:string;title?:string;name:string;roots:number[];qualities:BuiltinQuality[];beats?:number[];degrees?:string[];
 /** Per chord: tensions written on it (e.g. ['b9'] for a 7(♭9)). */
 tensions?:(Tension[]|undefined)[];
 /** Per chord: the bass as semitones above the key's tonic (a slash chord). */
 basses?:(number|undefined)[];
 /** One line shown under the name in the list: where this device is used. */
 usage?:string;practiceKeys?:PracticeKeys;
 /** False: not a candidate of today's automatic plan (it is practised from the list and with the random key). */
 todayPool?:boolean;
 group:BuiltinGroup;mode:'major'|'minor';layer:'basics'|'composing'|'voicing';judge:'core'|'shape';pointText:string;pointCheck:PointCheck[];learn:string;}
export interface BuiltinProgression {usage?:string;practiceKeys:PracticeKeys;todayPool:boolean;id:string;version:number;layer:'basics'|'composing'|'voicing';group:BuiltinGroup;mode:'major'|'minor';title?:string;name:string;fullDegrees:string[];chords:{degree:string;quality:BuiltinQuality;beats:number}[];judge:'core'|'shape';learns:string[];pointText:string;pointCheck:PointCheck[];}
const h=(from:number,tone:number,to:number,target:number,dir:1|-1):PointCheck=>({kind:'half-step',from,tone,to,target,dir});
export const DEFS:BuiltinDef[]=[
 {id:'ii-v-i-major',name:'ii–V–I',degrees:['ii7','V7','Imaj7'],roots:[2,7,0],qualities:['min7','dom7','maj7'],group:'basics',mode:'major',layer:'basics',judge:'core',pointText:'7度が次のコードの3度へ半音で下りる',pointCheck:[h(0,10,1,4,-1),h(1,10,2,4,-1)],learn:'guide-tone-resolution'},
 {id:'ii-v-i-minor',name:'iiø–V–i',degrees:['iiø7','V7','i7'],roots:[2,7,0],qualities:['min7b5','dom7','min7'],group:'minor',mode:'minor',layer:'basics',judge:'core',pointText:'iiøの♭5がVの根音へ半音で下りる',pointCheck:[h(0,6,1,0,-1)],learn:'minor-ii-v'},
 {id:'i-vi7-ii-v',name:'I–VI7–ii–V',degrees:['Imaj7','VI7','ii7','V7'],roots:[0,9,2,7],qualities:['maj7','dom7','min7','dom7'],group:'basics',mode:'major',layer:'basics',judge:'core',pointText:'VI7の3度がiiの根音へ半音で上がる',pointCheck:[h(1,4,2,0,1)],learn:'secondary-dominant'},
 {id:'i-v-vi-iv',name:'I–V–vi–IV',degrees:['I','V','vi7','IVmaj7'],roots:[0,7,9,5],qualities:['maj','maj','min7','maj7'],group:'basics',mode:'major',layer:'basics',judge:'core',pointText:'ベースが大きく動いても、上の音は近くに留める',pointCheck:[{kind:'max-upper-motion',semitones:4}],learn:'bass-vs-upper-motion'},
 {id:'iv-iii-ii-i',name:'IV–iii–ii–I',degrees:['IVmaj7','iii7','ii7','Imaj7'],roots:[5,4,2,0],qualities:['maj7','min7','min7','maj7'],group:'basics',mode:'major',layer:'composing',judge:'core',pointText:'形を保ったまま1段ずつ下りる',pointCheck:[{kind:'descent'}],learn:'diatonic-descent'},
 {id:'iv-iii7-vi',name:'IV–III7–vi',degrees:['IVmaj7','III7','vi7'],roots:[5,4,9],qualities:['maj7','dom7','min7'],group:'jpop',mode:'major',layer:'composing',judge:'core',pointText:'III7の3度がviの根音へ半音で上がる',pointCheck:[h(1,4,2,0,1)],learn:'secondary-dominant'},
 {id:'backdoor',name:'iv–♭VII7–I',degrees:['iv7','♭VII7','Imaj7'],roots:[5,10,0],qualities:['min7','dom7','maj7'],group:'jazz',mode:'major',layer:'composing',judge:'core',pointText:'♭6度が5度へ半音で下りて落ち着く',pointCheck:[h(1,10,2,7,-1)],learn:'backdoor-resolution'},
 {id:'imaj9-ivmaj9',name:'Imaj9–IVmaj9',roots:[0,5],qualities:['maj9','maj9'],group:'neosoul',mode:'major',layer:'voicing',judge:'shape',pointText:'共通の音（1・3・5）を同じ高さに残したまま動く',pointCheck:[{kind:'common-tones',tones:[0,4,7]}],learn:'common-tone-voice-leading'},
 // J-POP
 {id:'ouudou',title:'王道進行',name:'IVmaj7–V7–iii7–vi7',roots:[5,7,4,9],qualities:['maj7','dom7','min7','min7'],group:'jpop',mode:'major',layer:'composing',judge:'core',pointText:'IVmaj7の7度がV7の7度へ半音で上がる',pointCheck:[h(0,11,1,10,1)],learn:'guide-tone-resolution'},
 {id:'komuro',title:'小室進行',name:'vi–IV–V–I',roots:[9,5,7,0],qualities:['min','maj','maj','maj'],group:'jpop',mode:'major',layer:'basics',judge:'core',pointText:'Vの3度がIの根音へ半音で上がる',pointCheck:[h(2,4,3,0,1)],learn:'leading-tone'},
 {id:'marusa',title:'丸サ進行',name:'IVmaj7–III7–vi7–v7–I7',roots:[5,4,9,7,0],qualities:['maj7','dom7','min7','min7','dom7'],beats:[4,4,4,2,2],group:'jpop',mode:'major',layer:'composing',judge:'core',pointText:'III7の3度がvi7の7度へ半音で下りる',pointCheck:[h(1,4,2,10,-1)],learn:'secondary-dominant'},
 {id:'canon',title:'カノン進行',name:'I–V–vi–iii–IV–I–IV–V',roots:[0,7,9,4,5,0,5,7],qualities:['maj','maj','min','min','maj','maj','maj','maj'],group:'jpop',mode:'major',layer:'basics',judge:'core',pointText:'ベースが大きく動いても、上の音は近くに留める',pointCheck:[{kind:'max-upper-motion',semitones:4}],learn:'bass-vs-upper-motion'},
 {id:'sdm',title:'サブドミナントマイナー',name:'IVmaj7–iv6–Imaj7',roots:[5,5,0],qualities:['maj7','min6','maj7'],group:'jpop',mode:'major',layer:'composing',judge:'core',pointText:'IVの3度が半音下がって、ivの3度になる',pointCheck:[h(0,4,1,3,-1)],learn:'subdominant-minor'},
 // ジャズ・ボサ
 {id:'circle',title:'循環進行',name:'Imaj7–vi7–ii7–V7',roots:[0,9,2,7],qualities:['maj7','min7','min7','dom7'],group:'basics',mode:'major',layer:'basics',judge:'core',pointText:'ii7の7度がV7の3度へ半音で下りる',pointCheck:[h(2,10,3,4,-1)],learn:'guide-tone-resolution'},
 {id:'iii-vi-ii-v-i',title:'3-6-2-5-1',name:'iii7–vi7–ii7–V7–Imaj7',roots:[4,9,2,7,0],qualities:['min7','min7','min7','dom7','maj7'],group:'basics',mode:'major',layer:'basics',judge:'core',pointText:'ii7とV7の7度が、次のコードの3度へ半音で下りる',pointCheck:[h(2,10,3,4,-1),h(3,10,4,4,-1)],learn:'guide-tone-resolution'},
 {id:'tritone',title:'裏コード',name:'ii7–♭II7–Imaj7',roots:[2,1,0],qualities:['min7','dom7','maj7'],group:'jazz',mode:'major',layer:'composing',judge:'core',pointText:'♭II7の3度がImaj7の3度へ半音で下りる',pointCheck:[h(1,4,2,4,-1)],learn:'tritone-substitution'},
 {id:'passing-dim',title:'パッシングディミニッシュ',name:'Imaj7–♯idim7–ii7–V7',roots:[0,1,2,7],qualities:['maj7','dim7','min7','dom7'],group:'jazz',mode:'major',layer:'composing',judge:'core',pointText:'♯idim7の音がii7の5度へ半音で下りる',pointCheck:[h(1,9,2,7,-1)],learn:'passing-diminished'},
 {id:'sus4',title:'sus4 を挟むツーファイブ',name:'ii7–V7sus4–V7–Imaj7',roots:[2,7,7,0],qualities:['min7','dom7sus4','dom7','maj7'],group:'jazz',mode:'major',layer:'composing',judge:'core',pointText:'sus4の4度が3度へ半音で下りる',pointCheck:[h(1,5,2,4,-1)],learn:'suspension'},
 // ネオソウル・Lo-fi・Future Bass
 {id:'ii-v-i-ext',title:'9th・13th のツーファイブワン',name:'ii9–V13–Imaj9',roots:[2,7,0],qualities:['min9','dom13','maj9'],group:'neosoul',mode:'major',layer:'voicing',judge:'core',pointText:'テンションを足しても、7度が次の3度へ半音で下りる',pointCheck:[h(0,10,1,4,-1),h(1,10,2,4,-1)],learn:'guide-tone-resolution'},
 {id:'bvi-bvii-i',title:'♭VI–♭VII–I',name:'♭VImaj7–♭VII–Imaj7',roots:[8,10,0],qualities:['maj7','maj','maj7'],group:'neosoul',mode:'major',layer:'composing',judge:'core',pointText:'♭VIIの根音がImaj7の7度へ半音で上がる',pointCheck:[h(1,0,2,11,1)],learn:'modal-borrowing'},
 {id:'dorian',title:'ドリアンの往復',name:'i7–IV7',roots:[0,5],qualities:['min7','dom7'],group:'neosoul',mode:'minor',layer:'voicing',judge:'core',pointText:'i7の7度がIV7の3度へ半音で下りる',pointCheck:[h(0,10,1,4,-1)],learn:'dorian-vamp'},
 {id:'lofi-minor',title:'Lo-fi のマイナー進行',name:'i7–iv7–♭VII7–♭IIImaj7',roots:[0,5,10,3],qualities:['min7','min7','dom7','maj7'],group:'neosoul',mode:'minor',layer:'composing',judge:'core',pointText:'7度が次のコードの3度へ半音で下りる',pointCheck:[h(1,10,2,4,-1),h(2,10,3,4,-1)],learn:'guide-tone-resolution'},
 // マイナー
 {id:'aeolian',title:'エオリアン',name:'i–♭VI–♭VII–i',roots:[0,8,10,0],qualities:['min','maj','maj','min'],group:'minor',mode:'minor',layer:'basics',judge:'core',pointText:'♭VIIの3度がiの3度へ半音で上がる',pointCheck:[h(2,4,3,3,1)],learn:'aeolian-cadence'},
 {id:'minor-cadence',title:'マイナーの終止',name:'i–iv–V7–i',roots:[0,5,7,0],qualities:['min','min','dom7','min'],group:'minor',mode:'minor',layer:'basics',judge:'core',pointText:'V7の3度（導音）がiの根音へ半音で上がる',pointCheck:[h(2,4,3,0,1)],learn:'leading-tone'},
 {id:'andalusian',title:'アンダルシア進行',name:'i–♭VII–♭VI–V7',roots:[0,10,8,7],qualities:['min','maj','maj','dom7'],group:'minor',mode:'minor',layer:'basics',judge:'core',pointText:'♭VIの3度がV7の3度へ半音で下りる',pointCheck:[h(2,4,3,4,-1)],learn:'andalusian-cadence'},
 ...JAZZ_DEFS,
];
export const BUILTINS:BuiltinProgression[]=DEFS.map(d=>({...(d.usage?{usage:d.usage}:{}),practiceKeys:d.practiceKeys??'all12',todayPool:d.todayPool!==false,id:d.id,version:1,layer:d.layer,group:d.group,mode:d.mode,...(d.title?{title:d.title}:{}),name:d.name,fullDegrees:d.degrees??d.name.split('–'),chords:d.roots.map((_,j)=>({degree:d.name.split('–')[j],quality:d.qualities[j],beats:d.beats?.[j]??4})),judge:d.judge,learns:[d.learn],pointText:d.pointText,pointCheck:d.pointCheck}));
export const keyLabel=(root:number,mode:'major'|'minor')=>NAMES[pc(root)]+(mode==='minor'?'m':'');
/** P12.3: the bass is always strictly below every upper note (one octave lower until it is). */
export function placeBassBelow(ns:number[]):number[]{let bass=ns[0];const low=Math.min(...ns.slice(1));while(bass>=low)bass-=12;return [bass,...ns.slice(1)];}
function rotations(notes:number[]){return Array.from({length:18},(_,i)=>55+i).map(start=>placeBassBelow([notes[0],...notes.slice(1).map(n=>start+pc(n-start)).sort((a,b)=>a-b)])).filter((ns,i,all)=>ns[ns.length-1]!<=84&&ns[ns.length-1]!-ns[1]<=12&&all.findIndex(a=>a.join(',')===ns.join(','))===i);}
export const builtinDisplayName=(b:{title?:string;name:string})=>b.title??b.name;
/** P12.3 appendix B: the groups of the standard-progression list, and their order. */
export const BUILTIN_GROUPS:{group:BuiltinGroup;name:string;description:string;ids:string[]}[]=[
 {group:'basics',name:'基本',description:'まず覚えたい流れ',ids:['ii-v-i-major','i-v-vi-iv','circle','iii-vi-ii-v-i','i-vi7-ii-v','iv-iii-ii-i']},
 {group:'jpop',name:'J-POP',description:'歌もので定番の流れ',ids:['ouudou','komuro','marusa','canon','iv-iii7-vi','sdm']},
 {group:'jazz',name:'ジャズ・ボサ',description:'経過和音と代理',ids:['tritone','passing-dim','sus4','backdoor']},
 {group:'neosoul',name:'ネオソウル・Lo-fi',description:'テンションと借用・モード',ids:['ii-v-i-ext','imaj9-ivmaj9','bvi-bvii-i','dorian','lofi-minor']},
 {group:'minor',name:'マイナー',description:'マイナーキーの流れ',ids:['ii-v-i-minor','aeolian','minor-cadence','andalusian']},
 // P12.4-02: appended after the groups above, so those keep their order and contents.
 {group:'jazz-basic',name:'ジャズ基礎',description:'ジャズの定型の流れ',ids:JAZZ_DEFS.filter(d=>d.group==='jazz-basic').map(d=>d.id)},
 {group:'jazz-device',name:'ジャズの仕掛け',description:'作曲に持ち帰れる和声の仕掛け',ids:JAZZ_DEFS.filter(d=>d.group==='jazz-device').map(d=>d.id)},
 {group:'jazz-form',name:'ジャズ・フォーム',description:'8〜12小節の形式をキーを選んで通す',ids:JAZZ_DEFS.filter(d=>d.group==='jazz-form').map(d=>d.id)},
 {group:'modern',name:'ネオソウル・ボサ・モーダル',description:'浮遊感・平行移動・半音の動き',ids:JAZZ_DEFS.filter(d=>d.group==='modern').map(d=>d.id)},
];
export type DojoChord = LessonChord;
export function pointPass(check:PointCheck,chords:DojoChord[],key:number):boolean{
 const ns=chords.map(c=>c.notes);
 if(check.kind==='half-step'){return ns[check.from].filter(n=>pc(n)===pc(chords[check.from].chord.root+check.tone)).some(n=>ns[check.to].includes(n+check.dir)&&pc(n+check.dir)===pc(chords[check.to].chord.root+check.target));}
 if(check.kind==='common-tones')return check.tones.every(t=>ns[0].some(n=>pc(n)===pc(key+t)&&ns[1].includes(n)));
 for(let i=1;i<ns.length;i++){
  const a=ns[i-1].slice(1),b=ns[i].slice(1);
  if(a.length!==b.length)return false;
  if(check.kind==='max-upper-motion') {if(a.some((n,j)=>Math.abs(n-b[j])>check.semitones))return false;}
  else {if(a.some((n,j)=>n-b[j]<1||n-b[j]>2)||a.slice(1).some((n,j)=>n-a[j]!==b[j+1]-b[j]))return false;}
 }
 return true;
}
function motion(a:number[],b:number[]){const au=a.slice(1),bu=b.slice(1);return au.length!==bu.length?100+Math.abs(au.length-bu.length)*12:au.reduce((s,n,i)=>s+Math.abs(n-bu[i]),0);}
export function buildBuiltin(id:string,key=0){
 const d=BUILTINS.find(b=>b.id===id)!;const def=DEFS.find(b=>b.id===id)!;
 const cs=d.chords.map((c,i)=>symbol(pc(key+def.roots[i]),c.quality,def.tensions?.[i]??[],def.basses?.[i]===undefined?undefined:pc(key+def.basses[i]!)));
 // The table's close shape is for a plain chord; a chord with a tension or a written bass is voiced from its symbol.
 const groups=cs.map(c=>rotations((c.tensions.length||c.bass!==undefined?undefined:recipeNotes(c.root,c.quality as Quality))??voiceChordForPreview(c).notes));
 const chosen:number[][]=[];for(const g of groups){const prev=chosen[chosen.length-1];chosen.push([...g].sort((a,b)=>prev?motion(prev,a)-motion(prev,b):Math.abs(a[a.length-1]!-67)-Math.abs(b[b.length-1]!-67))[0]);}
 const make=(notes:number[][])=>notes.map((n,i)=>({chord:cs[i],notes:n,beats:d.chords[i].beats}));
 let actual=make(chosen),passes=d.pointCheck.every(c=>pointPass(c,actual,key));
 // Keep the basic note count and pitch classes. Never add duplicate tones to force a claim.
 if(!passes){let found:DojoChord[]|undefined;const search=(i:number,path:number[][])=>{if(found)return;if(i===groups.length){const x=make(path);if(d.pointCheck.every(c=>pointPass(c,x,key)))found=x;return;}for(const n of groups[i])search(i+1,[...path,n]);};search(0,[]);if(found){actual=found;passes=true;}}
 return {...d,key,chords:actual,pointIsTheory:!passes,pointText:(passes?'':'理論の上では：')+d.pointText};
}
export function corePcs(c:DojoChord){return chordPitchClasses(c.chord);}
