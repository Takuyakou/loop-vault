import {useMemo,type CSSProperties,type ReactNode} from 'react';
import type {StoreApi} from 'zustand';
import {MidiRequiredNotice} from '../../components/MidiRequiredNotice';
import {PracticeKeyboard} from '../../components/practice/PracticeKeyboard';
import type {LapState} from '../../domain/chordDojo/lapRecords';
import {snapshotFingerLabels,type TargetSnapshot} from '../../domain/chordDojo/targetSnapshot';
import {GrandStaff,grandStaffExtent,type StaffExtent} from './GrandStaff';
import {answerKeyboardRange} from './keyboardRange';
import type {HeldCardRun} from './useHeldCardRun';
import {RECALL_CARRIED,RECALL_MESSAGE} from './heldCardRecall';

/** Nothing is a wrong note here: every key that is held shows only as held. */
const ALL_PITCH_CLASSES=[0,1,2,3,4,5,6,7,8,9,10,11];
const SELF_NOTICE='答えを見ながら弾いて、「弾けた」を押すと次のカードに進みます。';

/** What is said above the cards when the input or the record needs attention (nothing is shown when all is well). */
export function HeldCardNotices({run,lapStore}:{run:HeldCardRun;lapStore:StoreApi<LapState>}){
 const {audioState,retryAudio,manual,waiting,view,connected,chooseMode,records}=run;
 return <>
  {audioState==='error'?<p className="dojo-notice" role="alert">入力のピアノ音を開始できませんでした。入力の判定は続けられます。<button type="button" onClick={retryAudio}>入力音をもう一度</button></p>:null}
  {manual?<MidiRequiredNotice compact view={view} description={SELF_NOTICE}/>:null}
  {waiting?<MidiRequiredNotice view={view} description="MIDI が外れました。このカードで一時停止しています。つなぎ直すと、このカードから続けます。"><button type="button" onClick={()=>chooseMode('manual')}>自分で判定に切り替える</button></MidiRequiredNotice>:null}
  {manual&&connected?<button type="button" onClick={()=>chooseMode('midi')}>MIDIで判定に切り替える</button>:null}
  {records.error?<p role="alert">{records.error}<button type="button" onClick={()=>void lapStore.getState().retry()}>記録の保存を再試行</button></p>:null}
 </>;
}

/** What to do on this card, in a line: it is the same for both kinds of practice, only the names of the notes differ.
 * With `recall` (P18-02: the ② stage of Jazz) nothing speaks the names of the notes, because the card conceals them. */
export function heldCardHint({run,before,card,names,recall}:{run:HeldCardRun;before?:{expected:readonly number[]};card:{struck:readonly number[];carried:readonly number[]};names:(ns:readonly number[])=>string;recall?:boolean}){
 const again=Boolean(before)&&card.struck.every(n=>before!.expected.includes(n));
 return run.waiting?'MIDI が外れました。このカードで一時停止しています。つなぎ直すと続けられます':run.manual?'答えのとおりに弾いてみて、合っていたら「弾けた」'
  :again?(recall?RECALL_CARRIED:'前のカードと同じ音です。もう一度、すべて弾き直してください')
  :card.carried.length?(recall?RECALL_CARRIED:`${names(card.carried)} は押さえたままで構いません。ほかの音は弾き直します`)
  :(recall?RECALL_MESSAGE:'表示の音をすべて弾いてください。メロディなど、ほかの音を重ねても構いません');
}

/** The staff and the keyboard of the card on the screen. */
/**
 * The room between the lowest line of the treble staff and the top line of the bass staff, in drawing units (a line apart is 12). The
 * staff of this screen is written by the pitch of each note (middle C and above on the treble staff); at the 24 a grand staff really has,
 * the C4 on its ledger line and the A♭3 on the top line of the bass staff are 12 apart (the compact staff had 16 and they touched).
 */
export const HELD_STAFF_GAP=28;

/** The extent of the staff for a whole item: every card of every version and key, drawn the way HeldCardBoard draws them. */
export const heldStaffExtent=(snapshots:readonly TargetSnapshot[],aligned=false):StaffExtent=>grandStaffExtent(snapshots,{compact:true,staffGap:HELD_STAFF_GAP,...(aligned?{fingerLayout:'aligned' as const}:{})});

export function HeldCardBoard({snapshot,left,right,caption,captionNode,headExtra,keyHeight,markScale,staffGap=HELD_STAFF_GAP,fingerLayout,staffExtent,concealed}:{snapshot:TargetSnapshot;left:readonly number[];right:readonly number[];caption?:string;captionNode?:ReactNode;/** More in the line above the keyboard (Jazz: the keys that have been played through). */headExtra?:ReactNode;
 /** How high the keys are drawn, where the screen has room for taller keys than the usual 128 px; and how much larger the marks on them are. */keyHeight?:number;markScale?:number;/** The room between the two staves (see HELD_STAFF_GAP). */staffGap?:number;/** Where the marks of the fingers on the staff stand (see GrandStaff). */fingerLayout?:'aligned';/** The staff is drawn over this extent for every card of the item (see `grandStaffExtent`), so that its size does not change from card to card. */staffExtent?:StaffExtent;
 /** P18-02: the answer is concealed (the ② stage of Jazz): the staff shows the waiting text (the same as ① of A and B) and the keyboard shows only the keys that are pressed. The sizes do not change: the staff and the keyboard keep what the snapshot gives them. */concealed?:boolean}){
 // The mark of a key: the finger with the hand (左5) where there is one; else only the hand (左 / 右), so that the two hands differ by more than a colour.
 const fingerLabels=useMemo(()=>{
  const labels=new Map(snapshotFingerLabels(snapshot)??[]);
  for(const n of left)if(!labels.has(n))labels.set(n,'左');
  for(const n of right)if(!labels.has(n))labels.set(n,'右');
  return labels;
 },[snapshot,left,right]);
 const keyboardRange=answerKeyboardRange(snapshot.midiNotes,true);
 return <>
  <GrandStaff compact snapshot={concealed?undefined:snapshot} caption={caption} captionNode={captionNode} {...(concealed?{}:{hiddenText:''})} staffGap={staffGap} {...(fingerLayout?{fingerLayout}:{})} {...(staffExtent?{fixedExtent:staffExtent}:{})}/>
  <div className="dojo-keyboard" style={{'--target-keyboard-width':`${Math.max(760,Math.ceil((keyboardRange.maxMidiNote-keyboardRange.minMidiNote+1)*7/12)*22)}px`,...(keyHeight===undefined?{}:{'--held-key-height':`${keyHeight}px`})} as CSSProperties}>
   <div className="dojo-keyboard-head"><b>鍵盤</b><span><i className="dojo-held-swatch"/>押している音</span><span><i className="dojo-answer-swatch"/>{concealed?'答え(弾いた後かヒントで出る)':'このカードの音'}</span>{concealed?null:<><span><i className="dojo-left-swatch"/>左手</span><span><i className="dojo-right-swatch"/>右手</span></>}{headExtra}</div>
   <PracticeKeyboard {...(concealed?{}:{colorGuideHands:true})} {...(keyHeight===undefined?{}:{dojoHeight:keyHeight})} {...(markScale===undefined?{}:{markScale})} fingerLabels={concealed?undefined:fingerLabels} leftHandGuideNotes={concealed?[]:left} rightHandGuideNotes={concealed?[]:right} appearance="dojo" hideLegend compactSummary octaveConvention="scientific" range={keyboardRange} guideNotes={concealed?[]:snapshot.midiNotes} allowedPitchClasses={ALL_PITCH_CLASSES} requiredPitchClasses={[]} level={1} matchState="empty"/>
  </div>
 </>;
}
