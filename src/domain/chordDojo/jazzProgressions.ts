import data from './jazzProgressions.json';
import {parseTextChordLabel} from '../chords';
import type {ChordSymbol} from '../types';
import type {OriginalCard} from './originalPractice';
import {snapshotRevision,type SnapshotNote,type TargetSnapshot,type WrittenPitch} from './targetSnapshot';

/**
 * Jazz Progressions: voicings (left and right hand, fingers) worked out for practice. They are NOT a transcription of anyone's
 * playing. A card passes like an Original Practice card (HeldCardJudge): every note is held, every `struck` note is pressed
 * again after the card began, other notes are ignored. Only the original key; the notes are real pitches (MIDI) with the tonic,
 * and laps are counted by progression × tonic, so the twelve keys can be added later without changing the record.
 */
export const JAZZ_PROGRESSIONS_GROUP_NAME='Jazz Progressions';
export const JAZZ_PROGRESSIONS_NOTE='推奨ボイシング(元の演奏の書き起こしではない)';

/** A card in the same shape as an Original Practice card, plus what the screen needs to write it as the data does. */
export interface JazzCard extends OriginalCard{
 /** The name shown (`Dm6/9`, `D♯7(♯9)`): never read it back from `chord.label`, which does not keep the spelling. */
 display:string;
 /** The key the degree is a degree of (the progression's key, except in the second half of item 9). */
 keyContext:string;
 /** Per pitch: the note as written, with ♭ ♯ 𝄪 (`C♭4`, `F𝄪3`). */
 names:ReadonlyMap<number,string>;
 leftNames:string[];rightNames:string[];
 /** Per pitch: the finger, as `L5` (left hand, little finger) or `R1` (right hand, thumb). */
 labels:ReadonlyMap<number,string>;
 /** Per pitch: the note as written on the staff. */
 written:ReadonlyMap<number,WrittenPitch>;
}
export interface JazzProgression{
 id:string;item:number;main:boolean;
 /** The name of this version inside its item (null for a main progression that has no other version). */
 variantLabel:string|null;
 title:string;key:string;tonic:number;mode:'major'|'minor';tempoBpm:number;bars:number;
 /** What this progression is for, in a line or two. */
 focus:string;
 cards:JazzCard[];degrees:string[];
 /** The tonic (0-11) of the item's MAIN progression this was made for; every version of an item moves together. */
 itemTonic:number;
 /** Semitones every pitch moved from the data (0 in the original key). */
 shift:number;
}
export interface JazzItem{no:number;id:string;title:string;/** Ids of the progressions: the first is the main one. */progressions:string[];}

interface RawStruck{name:string;pitch:number;hand:string;finger:number;offsetBeats:number;durationBeats:number;velocity:number}
interface RawEvent{index:number;startBeat:number;durationBeats:number;label:string;parseLabel:string;display:string;degree:string;keyContext:string;
 expectedPitches:number[];expectedNames:string[];leftHand:string[];rightHand:string[];fingers:{left:Record<string,number>;right:Record<string,number>};
 heldFromPrevious:string[];struck:RawStruck[]}
interface RawProgression{id:string;item:number;main:boolean;variantLabel:string|null;title:string;key:string;tonic:number;mode:'major'|'minor';tempoBpm:number;bars:number;focus:string;events:RawEvent[]}
const RAW=data as unknown as {note:string;items:JazzItem[];progressions:RawProgression[]};

const STEPS=['C','D','E','F','G','A','B'] as const;
const ALTER:Record<string,number>={'':0,b:-1,bb:-2,'#':1,'##':2,x:2};
const GLYPH:Record<number,string>={[-2]:'𝄫',[-1]:'♭',0:'',1:'♯',2:'𝄪'};
/** `Ab3` → A♭ in octave 3. `b` is ♭, `#` is ♯, `x` is 𝄪. */
export function parseWrittenName(name:string):WrittenPitch{
 const m=/^([A-G])(bb|b|##|#|x)?(-?\d+)$/.exec(name);if(!m)throw new Error(`Jazz Progressions: unreadable note name ${name}`);
 return {step:m[1] as WrittenPitch['step'],alter:ALTER[m[2]??'']!,octave:Number(m[3])};
}
/** The name as the screen shows it: `Ab3` → `A♭3`, `Fx3` → `F𝄪3`. */
export const writtenLabel=(p:WrittenPitch)=>`${p.step}${GLYPH[p.alter]}${p.octave}`;
const NATURAL=[0,2,4,5,7,9,11];
/** The pitch a written note stands for (MIDI): C♭4 is 59. */
export const writtenPitch=(p:WrittenPitch)=>(p.octave+1)*12+NATURAL[STEPS.indexOf(p.step)]!+p.alter;

/** What changes in a card when it is moved to another key (see transposeJazzProgression). */
interface Moved{display:string;parseLabel:string;keyContext:string;/** The written names of the notes, in the order of `expectedNames` (`Ab3`, `Fx3`). */names:string[];shift:number}
function card(e:RawEvent,moved?:Moved):JazzCard{
 const shift=moved?.shift??0,parseLabel=moved?.parseLabel??e.parseLabel,display=moved?.display??e.display,writtenNames=moved?.names??e.expectedNames;
 const chord=parseTextChordLabel(parseLabel);if(!chord)throw new Error(`Jazz Progressions: ${parseLabel} is not read as a chord`);
 const pitches=e.expectedPitches.map(p=>p+shift);
 // the lists of the data (hands, kept notes, fingers) name the notes as the data writes them: they are found by their place
 const pitchOf=(name:string)=>{const i=e.expectedNames.indexOf(name);if(i<0)throw new Error(`Jazz Progressions: ${name} is not in ${e.display}`);return pitches[i]!;};
 const written=new Map(writtenNames.map((n,i)=>[pitches[i]!,parseWrittenName(n)] as const));
 const names=new Map([...written].map(([pitch,w])=>[pitch,writtenLabel(w)] as const));
 const labels=new Map<number,string>();
 for(const n of e.leftHand)labels.set(pitchOf(n),`L${e.fingers.left[n]}`);
 for(const n of e.rightHand)labels.set(pitchOf(n),`R${e.fingers.right[n]}`);
 return {label:display,display,keyContext:moved?.keyContext??e.keyContext,degree:e.degree,chord:chord as ChordSymbol,
  expected:pitches,struck:e.struck.map(s=>s.pitch+shift),carried:e.heldFromPrevious.map(pitchOf),
  left:e.leftHand.map(pitchOf),right:e.rightHand.map(pitchOf),
  startBeat:e.startBeat,durationBeats:e.durationBeats,
  offsets:e.struck.map(s=>({pitch:s.pitch+shift,offsetBeats:s.offsetBeats,durationBeats:s.durationBeats,velocity:s.velocity})),
  names,leftNames:e.leftHand.map(n=>names.get(pitchOf(n))!),rightNames:e.rightHand.map(n=>names.get(pitchOf(n))!),labels,written};
}

export const JAZZ_PROGRESSIONS_ITEMS:readonly JazzItem[]=RAW.items;
/** Every progression id, mains and other versions. */
export const JAZZ_PROGRESSIONS_IDS:string[]=RAW.progressions.map(p=>p.id);
export const isJazzProgressionId=(id:string)=>JAZZ_PROGRESSIONS_IDS.includes(id);
// ---- the twelve keys ----------------------------------------------------------------------------------------------
// The rules are those of the reference table (`jazzTranspose.expected.json`, made by its reference implementation); this is the
// same computation. A transposition is per ITEM: the player chooses the key of the item's main progression, and every version
// moves by the same interval and the same octave, so a chord that two versions share sounds the same in both.
const LETTERS='CDEFGAB';
const LETTER_PC:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const ACCIDENTAL:Record<string,number>={bb:-2,b:-1,'':0,'#':1,x:2};
const ACCIDENTAL_NAME:Record<number,string>={[-2]:'bb',[-1]:'b',0:'',1:'#',2:'x'};
const MAJOR_KEYS=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const MINOR_KEYS=['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B'];
/** The lowest note of the left hand, by the interval it makes with the next note up (semitones): below it the chord sounds muddy. */
const LOW_LIMIT:Record<number,number>={7:33,8:36,9:36,10:36,11:36,5:38,6:38,3:43,4:43};
const ROMAN:Record<string,number>={'Ⅰ':0,'Ⅱ':1,'Ⅲ':2,'Ⅳ':3,'Ⅴ':4,'Ⅵ':5,'Ⅶ':6};
const mod=(n:number,m:number)=>((n%m)+m)%m;
/** `b` → ♭, `#` → ♯, `x` → 𝄪, `bb` → 𝄫, for every one of them in the text. */
const glyphs=(s:string)=>s.replace(/bb/g,'𝄫').replace(/b/g,'♭').replace(/#/g,'♯').replace(/x/g,'𝄪');
function splitName(name:string){const m=/^([A-G])(bb|b|#|x)?(-?\d)?$/.exec(name);if(!m)throw new Error(`Jazz Progressions: unreadable name ${name}`);return {letter:m[1]!,accidental:ACCIDENTAL[m[2]??'']!};}
const keyRoot=(key:string)=>{const m=/^([A-G])(♭|♯)?(m?)$/.exec(key);if(!m)throw new Error(`Jazz Progressions: unreadable key ${key}`);return {name:m[1]!+(m[2]==='♭'?'b':m[2]==='♯'?'#':''),minor:m[3]==='m'};};
const nameFor=(letter:string,pc:number):string|undefined=>{const accidental=mod(pc-LETTER_PC[letter]!+6,12)-6;return accidental in ACCIDENTAL_NAME?letter+ACCIDENTAL_NAME[accidental]:undefined;};
/** E♯ B♯ C♭ F♭ and the double accidentals are written as the plain name they stand for. */
const isUnusual=(root:string|undefined)=>root===undefined||['x','bb'].includes(root.slice(1))||['E#','B#','Cb','Fb'].includes(root);
function plainRoot(root:string|undefined):string{
 if(root===undefined)throw new Error('Jazz Progressions: a chord root without a name');
 if(!isUnusual(root))return root;
 const {letter,accidental}=splitName(root),pc=mod(LETTER_PC[letter]!+accidental,12);
 let step=accidental>0?1:-1;if(root==='Cb'||root==='Fb')step=-1;if(root==='E#'||root==='B#')step=1;
 const name=nameFor(LETTERS[mod(LETTERS.indexOf(letter)+step,7)]!,pc);
 if(name===undefined)throw new Error(`Jazz Progressions: no plain name for ${root}`);
 return name;
}
/** A note of the given letter at the given pitch: `Ab3`. */
function noteName(letter:string,pitch:number):string{
 const accidental=mod(pitch%12-LETTER_PC[letter]!+6,12)-6;
 return `${letter}${ACCIDENTAL_NAME[accidental]}${Math.floor((pitch-LETTER_PC[letter]!-accidental)/12)-1}`;
}
const itemOfId=(id:string)=>{const item=jazzItemOf(id);if(!item)throw new Error(`Jazz Progressions: unknown ${id}`);return item;};
const rawOf=(id:string)=>{const raw=RAW.progressions.find(p=>p.id===id);if(!raw)throw new Error(`Jazz Progressions: unknown ${id}`);return raw;};
const mainRawOf=(item:JazzItem)=>{const members=item.progressions.map(rawOf);return members.find(p=>p.main)??members[0]!;};
/** The pitch class of the key of a progression as the data writes it (`E♭` → 3, `G♯m` → 8). */
const keyPc=(key:string)=>{const {name}=keyRoot(key),{letter,accidental}=splitName(name);return mod(LETTER_PC[letter]!+accidental,12);};
/** The tonic (0-11) of the item's main progression in the original key. */
export const jazzItemMainTonic=(item:JazzItem)=>keyPc(mainRawOf(item).key);
const octaveShifts=new Map<string,number|undefined>();
/** The octave shift every version of the item takes for the main progression in `itemTonic`: of the two candidates the one nearer the data (the lower on a tie) at which every card of every version stays low enough and the left hand stays out of the muddy low register. */
function itemShift(item:JazzItem,itemTonic:number):number{
 const cacheKey=`${item.id}|${itemTonic}`;
 if(octaveShifts.has(cacheKey)){const cached=octaveShifts.get(cacheKey);if(cached!==undefined)return cached;throw new Error(`Jazz Progressions: no common octave for ${cacheKey}`);}
 const members=item.progressions.map(rawOf),interval=mod(itemTonic-jazzItemMainTonic(item),12);
 const fits=(x:number)=>members.every(p=>p.events.every(e=>{
  const pitchOf=new Map(e.expectedNames.map((n,i)=>[n,e.expectedPitches[i]!] as const));
  const left=e.leftHand.map(n=>pitchOf.get(n)!).sort((a,b)=>a-b);
  if(Math.max(...e.expectedPitches)+x>84)return false;
  const limit=left.length>1?LOW_LIMIT[left[1]!-left[0]!]??33:33;
  return left[0]!+x>=limit;
 }));
 const options=[interval,interval-12].filter(fits).sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);
 octaveShifts.set(cacheKey,options[0]);
 if(options[0]===undefined)throw new Error(`Jazz Progressions: no common octave for ${cacheKey}`);
 return options[0];
}
const built=new Map<string,JazzProgression>();
/**
 * A progression with the main progression of its item in the key whose tonic is `itemTonic` (0-11; the tonic of the data's own key
 * gives the data as it is). Every version of the item moves by the same interval and octave. Spelling: the root of a chord takes
 * its letter from the degree (counted from the letter of the key the degree belongs to) and its accidental from the pitch; every
 * other note keeps its letter distance from the root. The keys: C D♭ D E♭ E F F♯ G A♭ A B♭ B / Cm C♯m Dm E♭m Em Fm F♯m Gm G♯m Am B♭m Bm.
 */
export function transposeJazzProgression(id:string,itemTonic:number):JazzProgression{
 const cacheKey=`${id}|${itemTonic}`,cached=built.get(cacheKey);if(cached)return cached;
 if(!Number.isInteger(itemTonic)||itemTonic<0||itemTonic>11)throw new Error(`Jazz Progressions: ${itemTonic} is not a tonic`);
 const raw=rawOf(id),item=itemOfId(id),interval=mod(itemTonic-jazzItemMainTonic(item),12);
 const shift=interval===0?0:itemShift(item,itemTonic);
 const {minor}=keyRoot(raw.key),tonic=mod(keyPc(raw.key)+interval,12);
 const key=interval===0?raw.key:glyphs((minor?MINOR_KEYS:MAJOR_KEYS)[tonic]!)+(minor?'m':'');
 const cards=raw.events.map(e=>{
  if(interval===0)return card(e);
  const rootOfData=/^([A-G][b#]?)/.exec(e.label)![1]!,{letter:rootLetter,accidental:rootAccidental}=splitName(rootOfData);
  const context=keyRoot(e.keyContext),contextLetter=splitName(context.name);
  const contextName=(context.minor?MINOR_KEYS:MAJOR_KEYS)[mod(LETTER_PC[contextLetter.letter]!+contextLetter.accidental+interval,12)]!;
  const numeral=/^(?:♭|♯)?([ⅠⅡⅢⅣⅤⅥⅦ])/.exec(e.degree)![1]!;
  const root=plainRoot(nameFor(LETTERS[mod(LETTERS.indexOf(contextName[0]!)+ROMAN[numeral]!,7)]!,mod(LETTER_PC[rootLetter]!+rootAccidental+interval,12)));
  const names=e.expectedNames.map((n,i)=>{
   const letterDistance=mod(LETTERS.indexOf(splitName(n).letter)-LETTERS.indexOf(rootLetter),7);
   return noteName(LETTERS[mod(LETTERS.indexOf(root[0]!)+letterDistance,7)]!,e.expectedPitches[i]!+shift);
  });
  return card(e,{display:glyphs(root)+e.display.slice(glyphs(rootOfData).length),parseLabel:root+e.parseLabel.slice(rootOfData.length),
   keyContext:glyphs(contextName)+(context.minor?'m':''),names,shift});
 });
 const progression:JazzProgression={id:raw.id,item:raw.item,main:raw.main,variantLabel:raw.variantLabel,title:raw.title,key,tonic,mode:raw.mode,tempoBpm:raw.tempoBpm,bars:raw.bars,focus:raw.focus,cards,degrees:cards.map(c=>c.degree),itemTonic,shift};
 built.set(cacheKey,progression);return progression;
}
const raised=new WeakMap<JazzProgression,Map<number,JazzProgression>>();
/**
 * The same progression `octaves` octaves higher: every pitch of every card moves by 12 × octaves (the hands, the fingers, what is kept down
 * and what is struck again move with them), and each name keeps its spelling with the octave number moved. The transposition (the key) is
 * not touched: this is added to its result. 0 gives the progression itself.
 */
export function raiseJazzProgression(progression:JazzProgression,octaves:number):JazzProgression{
 if(!Number.isInteger(octaves))throw new Error(`Jazz Progressions: ${octaves} octaves is not a whole number`);
 if(octaves===0)return progression;
 const byOctave=raised.get(progression)??new Map<number,JazzProgression>(),cached=byOctave.get(octaves);if(cached)return cached;
 const up=12*octaves,move=(pitches:readonly number[])=>pitches.map(p=>p+up);
 const cards=progression.cards.map((c):JazzCard=>{
  const written=new Map([...c.written].map(([pitch,w])=>[pitch+up,{...w,octave:w.octave+octaves}] as const));
  const names=new Map([...written].map(([pitch,w])=>[pitch,writtenLabel(w)] as const));
  return {...c,expected:move(c.expected),struck:move(c.struck),carried:move(c.carried),left:move(c.left),right:move(c.right),
   offsets:c.offsets.map(o=>({...o,pitch:o.pitch+up})),names,written,
   leftNames:move(c.left).map(p=>names.get(p)!),rightNames:move(c.right).map(p=>names.get(p)!),
   labels:new Map([...c.labels].map(([pitch,label])=>[pitch+up,label] as const))};
 });
 const result:JazzProgression={...progression,cards,shift:progression.shift+up};
 byOctave.set(octaves,result);raised.set(progression,byOctave);return result;
}
/** The original key only: the notes are as in the data. */
export function buildJazzProgression(id:string):JazzProgression{return transposeJazzProgression(id,jazzItemMainTonic(itemOfId(id)));}

/** The item (1-12) a progression belongs to, and the progressions of an item (the main one first). */
export const jazzItemOf=(id:string)=>RAW.items.find(i=>i.progressions.includes(id));
/** The main progression of an item: the one shown when no other version is chosen. */
export const jazzMainOf=(item:JazzItem)=>item.progressions[0]!;
/** The tonic the laps of a progression are counted under (the original key; later one of twelve). */
export const jazzRecordTonic=(progression:Pick<JazzProgression,'tonic'>)=>progression.tonic;

/**
 * A card as the staff and the keyboard draw it: the spelling and the fingers are the data's own (a plain snapshot, nothing is
 * spelled from the chord symbol, so D♯7(♯9) keeps its F𝄪 and E𝄪, and D♭7 its C♭).
 */
export function jazzCardSnapshot(progression:Pick<JazzProgression,'id'|'cards'>,index:number):TargetSnapshot{
 const c=progression.cards[index];if(!c)throw new Error(`Jazz Progressions: ${progression.id} has no card ${index}`);
 const targetId=`jazz:${progression.id}:${index}`;
 const notes:SnapshotNote[]=c.expected.map((midi,i)=>{
  const hand=c.left.includes(midi)?'left' as const:'right' as const;
  const finger=Number(c.labels.get(midi)?.slice(1));
  return {id:`${targetId}:note:${i}`,midi,hand,spelling:c.written.get(midi)!,...(finger?{finger}:{})};
 });
 return {targetId,revision:snapshotRevision({targetId,notes,display:c.display,keyContext:c.keyContext}),midiNotes:[...c.expected],bass:Math.min(...c.expected),chordSymbol:c.display,keyContext:c.keyContext,notes,representative:false};
}

export interface JazzListenNote{pitch:number;startBeat:number;durationBeats:number;velocity:number}
/** How hard the notes of the whole-progression listening are struck: the same as one card played alone (`previewChord`). */
export const JAZZ_LISTEN_VELOCITY=0.72;
/** How much of the card's length each note is held: the rest is the room before the next card (the release tail sounds into it). */
export const JAZZ_LISTEN_LENGTH_RATIO=0.9;
/**
 * The whole progression for listening (a `{type:'notes'}` playback at the tempo of the progression): every card sounds ALL its
 * notes again, kept ones included, as one card played alone does, so each card is as loud and as full as when it is played on its
 * own. The practice judging (kept down / pressed again) is not part of this: it is only how the example is played.
 */
export const jazzListenNotes=(progression:Pick<JazzProgression,'cards'>):JazzListenNote[]=>
 progression.cards.flatMap(c=>c.expected.map(pitch=>({pitch,startBeat:c.startBeat,durationBeats:c.durationBeats*JAZZ_LISTEN_LENGTH_RATIO,velocity:JAZZ_LISTEN_VELOCITY})));

/** The whole-progression listening at a tempo: the notes (in beats), the tempo they are played at, and how many beats the seek bar runs over. The seek bar and the sound read the same tempo from here. */
export const jazzListenPlan=(progression:Pick<JazzProgression,'cards'>,bpm:number)=>{
 const last=progression.cards[progression.cards.length-1]!;
 return {notes:jazzListenNotes(progression),bpm,totalBeats:last.startBeat+last.durationBeats};
};
