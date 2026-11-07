import {GUIDE_HAND_COLORS} from "../../components/music-keyboard/handColors";
import {memo,useMemo,type ReactNode} from 'react';
import type {SnapshotNote,TargetSnapshot} from '../../domain/chordDojo/targetSnapshot';
import './grand-staff.css';
const STEPS=['C','D','E','F','G','A','B'];
const STAFF={treble:{bottom:104,step:30},bass:{bottom:208,step:18}};
const COMPACT_STAFF={treble:STAFF.treble,bass:{...STAFF.bass,bottom:168}};
const handName={left:'左',right:'右',unknown:'手不明'};
const accidental=(alter:number)=>alter===-2?'♭♭':alter===-1?'♭':alter===1?'♯':alter===2?'𝄪':'';
function layout(notes:readonly SnapshotNote[],staves=STAFF,aligned=false){
 const placed=notes.map(n=>{const staff:'treble'|'bass'=n.midi>=60?'treble':'bass',spec=staves[staff];const y=spec.bottom-(n.spelling.octave*7+STEPS.indexOf(n.spelling.step)-spec.step)*6;return {n,staff,y,x:n.hand==='left'?265:n.hand==='right'?395:330};});
 const accidentalColumns:Record<string,number[][]>={treble:[],bass:[]};const fingerLines:Record<string,number[]>={left:[],right:[],unknown:[]};
 // `aligned`: the marks of a hand stand in the order of the notes (from the top down), each as near its note as the one above allows, and
 // the lines to them are short and level: they cannot cross.
 const alignedY=new Map<number,number>();
 if(aligned)for(const hand of ['left','right','unknown'] as const){
  const group=placed.map((p,i)=>({p,i})).filter(({p})=>p.n.hand===hand).sort((a,b)=>a.p.y-b.p.y||a.i-b.i);
  const ys=group.map(({p},k)=>k===0?p.y:p.y);
  for(let k=1;k<ys.length;k+=1)ys[k]=Math.max(ys[k]!,ys[k-1]!+23);
  // keep the group centred on its notes: what was pushed down is brought back up by half
  const push=group.length?(ys.reduce((s,y,k)=>s+y-group[k]!.p.y,0)/group.length):0;
  group.forEach(({i},k)=>alignedY.set(i,ys[k]!-Math.round(push/2)));
  for(let k=1;k<ys.length;k+=1){const a=alignedY.get(group[k-1]!.i)!,b=alignedY.get(group[k]!.i)!;if(b<a+23)alignedY.set(group[k]!.i,a+23);}
 }
 return placed.map((item,i)=>{const near=placed.slice(0,i).filter(p=>p.x===item.x&&(p.staff===item.staff?Math.abs(p.y-item.y)<=6:aligned&&Math.abs(p.y-item.y)<=12)).length;const x=item.x+near*14;const columns=accidentalColumns[item.staff];let column=0;while(columns[column]?.some(y=>Math.abs(y-item.y)<22))column++;(columns[column]??=[]).push(item.y);
  if(aligned){const fingerY=alignedY.get(i)!;return {...item,x,accidentalX:item.x-25-column*19,fingerX:item.n.hand==='left'?180:x+44,fingerY};}
  const lines=fingerLines[item.n.hand];let fingerY=item.y;while(lines.some(y=>Math.abs(y-fingerY)<17))fingerY+=17;lines.push(fingerY);return {...item,x,accidentalX:item.x-25-column*19,fingerX:item.n.hand==='left'?180:item.n.hand==='right'?495:560,fingerY};
 });
}
/** The top and bottom of what is drawn (notes, ledger lines, finger marks), in drawing units: the one formula for the card on show and for a whole item. */
function extentOf(range:readonly ReturnType<typeof layout>[number][],compact:boolean,bassBottom:number|undefined,showFingering:boolean){
 const minY=Math.min(compact?38:24,...range.map(p=>p.y-(compact?20:25)),...(showFingering?range.map(p=>p.fingerY-12):[])),maxY=Math.max(bassBottom!==undefined?bassBottom+(compact?4:28):compact?180:236,...range.map(p=>Math.max(p.y+(compact?14:20),showFingering?p.fingerY+12:0)));
 return {minY,maxY};
}
export interface StaffExtent{minY:number;maxY:number}
/**
 * The extent that holds every one of these cards (an item in all its versions and keys), so that it can be given to the staff as `fixedExtent`
 * and the staff is drawn at the same size and place for each of them. The options are the ones the staff is given.
 */
export function grandStaffExtent(snapshots:readonly TargetSnapshot[],{compact=true,staffGap,showFingering=true,fingerLayout}:{compact?:boolean;staffGap?:number;showFingering?:boolean;fingerLayout?:'aligned'}={}):StaffExtent{
 const bassBottom=staffGap===undefined?undefined:STAFF.treble.bottom+staffGap+48;
 const staves=bassBottom===undefined?(compact?COMPACT_STAFF:STAFF):{treble:STAFF.treble,bass:{...STAFF.bass,bottom:bassBottom}};
 return extentOf(snapshots.flatMap(s=>layout(s.notes,staves,fingerLayout==='aligned')),compact,bassBottom,showFingering);
}
/** Flats and sharps of a key signature, from the first: the line or space (octave, step) each sits on. */
export const SIGNATURE_STEPS={
 flat:{treble:[[4,6],[5,2],[4,5],[5,1],[4,4],[5,0],[4,3]],bass:[[2,6],[3,2],[2,5],[3,1],[2,4],[3,0],[2,3]]},
 sharp:{treble:[[5,3],[5,0],[5,4],[5,1],[4,5],[5,2],[4,6]],bass:[[3,3],[3,0],[3,4],[3,1],[2,5],[3,2],[2,6]]},
};
export interface StaffKeySignature{accidental:'flat'|'sharp';count:number;}
export type StaffTone='held'|'sounded'|'answer';
function GrandStaffRenderer({snapshot,compact=false,viewportSnapshots,caption,captionNode,hiddenText,showFingering=true,fingerLayout,keySignature,answerSnapshot,tone,cropX,alwaysStaff=false,staffGap,fixedExtent}:{snapshot?:TargetSnapshot;compact?:boolean;viewportSnapshots?:readonly TargetSnapshot[];caption?:string;captionNode?:ReactNode;hiddenText?:string;
 /** The finger numbers, their lines and the legend. Off for the ear practice (the hand is not asked). The default shows everything as before. */
 showFingering?:boolean;
 /** Drawn after the clefs. Without it nothing is drawn there, as before. */
 keySignature?:StaffKeySignature;
 /** A second set of notes beside the first (the answer next to what is being played), in the tone `answer`. */
 answerSnapshot?:TargetSnapshot;
 /** Colours the notes of `snapshot` by what they are (held keys, the sounded chord). Without it the hand colours are used, as before. */
 tone?:StaffTone;
 /** Shows only this stretch of the width (the clefs, the key signature and the notes: without the finger columns). Without it the whole width, as before. */
 cropX?:{x:number;width:number};
 /** Draws the staff (and the key signature) even when there are no notes. Without it an empty staff is not drawn, as before. */
 alwaysStaff?:boolean;
 /** The room between the lowest line of the treble staff and the top line of the bass staff, in drawing units (one line apart is 12).
  * Without it the gap is as before (the compact one is small: the treble clef reaches down into it). */
 staffGap?:number;
 /** `aligned`: the marks of the fingers stand in the order of the notes, close to them, with short level lines. Without it they are placed as before. */
 fingerLayout?:'aligned';
 /** The top and bottom of what is drawn, fixed (see `grandStaffExtent`); the card on show only adds to it if it does not fit. Without it the extent follows the notes of the card, as before. */
 fixedExtent?:StaffExtent}){
 const bassBottom=staffGap===undefined?undefined:STAFF.treble.bottom+staffGap+48;
 const staves=useMemo(()=>bassBottom===undefined?(compact?COMPACT_STAFF:STAFF):{treble:STAFF.treble,bass:{...STAFF.bass,bottom:bassBottom}},[bassBottom,compact]);
 const placed=useMemo(()=>snapshot?layout(snapshot.notes,staves,fingerLayout==='aligned'):[],[snapshot,staves,fingerLayout]);
 const placedAnswer=useMemo(()=>answerSnapshot?layout(answerSnapshot.notes,staves,fingerLayout==='aligned'):[],[answerSnapshot,staves,fingerLayout]);
 const range=useMemo(()=>[...(viewportSnapshots?viewportSnapshots.flatMap(s=>layout(s.notes,staves,fingerLayout==='aligned')):placed),...placedAnswer],[viewportSnapshots,placed,placedAnswer,staves,fingerLayout]);
  const own=extentOf(range,compact,bassBottom,showFingering),minY=fixedExtent?Math.min(fixedExtent.minY,own.minY):own.minY,maxY=fixedExtent?Math.max(fixedExtent.maxY,own.maxY):own.maxY,height=Math.max(viewportSnapshots?188:0,maxY-minY+(compact?8:16));
 const signature=keySignature&&keySignature.count>0?keySignature:undefined;
 const drawNote=(p:ReturnType<typeof layout>[number],noteTone?:StaffTone)=>{const bottom=staves[p.staff].bottom,top=bottom-48,ledgers=[];if(p.y<top)for(let y=top-12;y>=p.y;y-=12)ledgers.push(y);if(p.y>bottom)for(let y=bottom+12;y<=p.y;y+=12)ledgers.push(y);return <g key={`${noteTone??'hand'}:${p.n.id}`} className="dojo-score-note" data-tone={noteTone} style={noteTone||p.n.hand==='unknown'?undefined:{color:GUIDE_HAND_COLORS[p.n.hand]}} data-score-midi={p.n.midi} data-score-note-id={p.n.id} data-score-hand={p.n.hand} data-score-finger={p.n.finger} data-score-step={p.n.spelling.step} data-score-alter={p.n.spelling.alter} data-score-octave={p.n.spelling.octave}>
    <title>{showFingering?`${p.n.spelling.step}${accidental(p.n.spelling.alter)}${p.n.spelling.octave}・${handName[p.n.hand]}${p.n.finger?`手 指${p.n.finger}`:'・運指候補なし'}`:`${p.n.spelling.step}${accidental(p.n.spelling.alter)}${p.n.spelling.octave}`}</title>
    {ledgers.map(y=><line className="dojo-score-ledger" key={y} x1={p.x-13} x2={p.x+13} y1={y} y2={y}/>)}
    {p.n.spelling.alter?<text className="dojo-score-accidental" data-double={p.n.spelling.alter===2||undefined} x={p.accidentalX} y={p.y+5}>{accidental(p.n.spelling.alter)}</text>:null}
    {p.n.spelling.alter===2?<g className="dojo-score-dsharp" transform={`translate(${p.accidentalX} ${p.y-7})`} aria-hidden="true"><path d="M2 2L12 12M12 2L2 12"/><path d="M0 0h4v4h-4zM10 0h4v4h-4zM0 10h4v4h-4zM10 10h4v4h-4z"/></g>:null}
    <ellipse cx={p.x} cy={p.y} rx="8" ry="5.5" transform={`rotate(-18 ${p.x} ${p.y})`}/>
    {showFingering?<><path className="dojo-score-leader" d={`M ${p.x+(p.n.hand==='left'?-13:13)} ${p.y} L ${p.fingerX+(p.n.hand==='left'?25:-10)} ${p.fingerY}`}/><text className="dojo-score-finger" x={p.fingerX} y={p.fingerY+5}>{`${handName[p.n.hand]}${p.n.finger??'・'}`}</text></>:null}
   </g>;};
 return <section className="dojo-score" aria-label="構成音表示" data-testid="dojo-score" data-score-visible={Boolean(snapshot)} data-score-compact={compact||undefined}>
  <div className="dojo-score-caption">{captionNode??<><b>{caption??'構成音表示・リズム指定なし'}</b>{showFingering?<span>左＝左手 · 右＝右手</span>:null}</>}</div>
  <div className="dojo-score-scroll" tabIndex={0} role="region" aria-label="譜面のスクロール">{snapshot||viewportSnapshots||answerSnapshot||alwaysStaff?<svg className="dojo-grand-staff" role="img" aria-label={snapshot?`${snapshot.chordSymbol} の構成音${showFingering?'と運指':''}${snapshot.representative?'（高さは代表例）':''}`:'譜表・答えは弾いた後に表示します'} viewBox={`${cropX?.x??0} ${minY-(compact?4:8)} ${cropX?.width??640} ${height}`} style={{height:viewportSnapshots?188:fixedExtent?'100%':height}} data-target-id={snapshot?.targetId} data-target-revision={snapshot?.revision}>
   <title>{snapshot?`${snapshot.chordSymbol}・構成音表示`:hiddenText??"答えは弾いた後に表示します"}</title>
   {(['treble','bass'] as const).map(staff=><g key={staff} className="dojo-score-staff" data-score-staff={staff}>{Array.from({length:5},(_,i)=><line key={i} x1="78" x2="608" y1={staves[staff].bottom-i*12} y2={staves[staff].bottom-i*12}/>)}<text x="12" y={staves[staff].bottom-18} className="dojo-score-clef-label">{staff==='treble'?'高音':'低音'}</text></g>)}
   <path className="dojo-score-clef" d="M 101 118 C 87 106 82 92 99 84 C 117 76 129 88 120 99 C 109 112 93 101 96 90 M 108 125 C 112 113 103 90 101 72 C 99 51 113 39 116 49 C 125 63 97 75 91 90"/>
   <g data-score-clef="bass" transform={`translate(0 ${bassBottom!==undefined?bassBottom-214:compact?-46:-6})`}><path className="dojo-score-clef" d="M 95 174 C 113 159 130 181 111 194 C 104 200 96 203 90 208 M 99 178 a 4 4 0 1 1 -1 -1"/><circle cx="125" cy="172" r="2.4"/><circle cx="125" cy="184" r="2.4"/></g>
   <path className="dojo-score-brace" d={bassBottom!==undefined?`M 69 55 C 55 72 73 ${bassBottom-85} 61 ${bassBottom-76} C 73 ${bassBottom-67} 55 ${bassBottom-18} 69 ${bassBottom+1}`:compact?"M 69 55 C 55 72 73 103 61 112 C 73 121 55 150 69 169":"M 69 55 C 55 72 73 123 61 132 C 73 141 55 190 69 209"}/>
   {signature?<g className="dojo-score-key" data-testid="dojo-score-key" data-key-accidental={signature.accidental} data-key-count={signature.count}>{(['treble','bass'] as const).flatMap(staff=>SIGNATURE_STEPS[signature.accidental][staff].slice(0,signature.count).map(([octave,step],i)=><text key={`${staff}${i}`} className="dojo-score-accidental" x={150+i*13} y={staves[staff].bottom-(octave*7+step-staves[staff].step)*6+(signature.accidental==='flat'?4:6)}>{accidental(signature.accidental==='flat'?-1:1)}</text>))}</g>:null}
   {placed.map(p=>drawNote(p,tone))}
   {placedAnswer.map(p=>drawNote(p,'answer'))}
  </svg>:<div className="dojo-score-hidden">{hiddenText??"答えは弾いた後に表示します"}</div>}</div>
  {showFingering?<p className="dojo-score-legend">1 親指 · 2 人差し指 · 3 中指 · 4 薬指 · 5 小指{snapshot?.notes.some(n=>n.finger===undefined)?' · 運指候補なしの音には番号を付けていません。':''}{snapshot?.representative?' · 音の高さは代表例です。構成の練習はどの高さでも判定します。':''}</p>:null}
 </section>;
}
export const GrandStaff=memo(GrandStaffRenderer);
