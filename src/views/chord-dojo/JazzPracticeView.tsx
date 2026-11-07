import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import * as Tone from 'tone';
import {useStore} from 'zustand';
import {ChordCardMark,cardResult} from '../../components/practice/ChordCardResult';
import {playbackController} from '../../audio/playbackController';
import {
  JAZZ_PROGRESSIONS_GROUP_NAME,JAZZ_PROGRESSIONS_NOTE,buildJazzProgression,jazzCardSnapshot,jazzItemMainTonic,jazzItemOf,jazzListenPlan,jazzMainOf,raiseJazzProgression,
  jazzRecordTonic,transposeJazzProgression,
  type JazzCard,type JazzProgression,
} from '../../domain/chordDojo/jazzProgressions';
import {jazzBagKey,nextJazzKey,startJazzKeyBag,type JazzKeyBag} from '../../domain/chordDojo/jazzRandomKey';
import {jazzLapStore} from '../../domain/chordDojo/jazzRecords';
import {dojoStore} from '../../domain/chordDojo/runtime';
import {BpmScrubField} from '../../components/BpmScrubField';
import {heardContextTime,listenBeat,listenCardIndex,listenProgress} from '../../domain/chordDojo/listenPosition';
import {CHOICE_NAMES} from './dojoNav';
import {HeldCardBoard,heldStaffExtent,HeldCardNotices,heldCardHint} from './HeldCardParts';
import {RECALL_LISTENED,RECALL_FOCUS_FOLDED,RECALL_FOCUS_OPENED,recallAnswerVisible} from './heldCardRecall';
import {answerKeyboardRange} from './keyboardRange';
import {usePracticeLayout} from './practiceLayout';
import {PracticeCard,PracticeHead,PracticeSafeArea,RepeatToggle,type StageItem} from './PracticeFrame';
import {readRepeatSetting,writeRepeatSetting} from './practiceRepeat';
import {whiteKeysIn} from '../ear-practice/earKeyboardHeight';
import {useHeldCardRun} from './useHeldCardRun';

/**
 * Jazz Progressions: the cards show the recommended voicing (the notes of each hand with the finger, as the data writes them;
 * not a transcription of anyone's playing). A card passes like an Original Practice card: every note is held, every struck note
 * is pressed again after the card began, other notes are ignored. The key is chosen for the whole item (its main progression: the
 * other versions move with it); with the random key on, the next key (the order of the random key of the other standard
 * progressions) comes as soon as a lap is complete. The laps (完奏) are kept in a record of their own.
 */
/** `G♯3(1)`: a note as written, with the finger. */
const noteText=(card:JazzCard,pitch:number)=>`${card.names.get(pitch)}(${card.labels.get(pitch)!.slice(1)})`;
const plain=(card:JazzCard,pitches:readonly number[])=>pitches.map(n=>card.names.get(n)).join(' ');
/** The degree, with the key it is a degree of when that is not the key of the progression (the second half of item 9 is in Em). */
const degreeOf=(card:JazzCard,key:string)=>card.keyContext===key?card.degree:`${card.degree} · ${card.keyContext}`;
/** 𝄪 and 𝄫 are drawn small and high by the fonts that have them: the character stays in the text, and is drawn as a double sharp / double flat mark. */
function Glyphs({text}:{text:string}){return <>{text.split(/(𝄪|𝄫)/).map((part,i)=>part==='𝄪'?<span key={i} className="dojo-dsharp">𝄪</span>:part==='𝄫'?<span key={i} className="dojo-dflat">𝄫</span>:part)}</>;}
/** The tempo chosen for the listening (kept while the app is open, for every progression); undefined until one is chosen. */
let jazzListenBpm:number|undefined;
/** The octave chosen (0 as written, 1 one octave up): kept while the app is open, for every progression. */
let jazzOctave=0;
/** The notes of a hand: a name with its finger is never broken across lines; a line may break only between notes. */
function Notes({card,pitches}:{card:JazzCard;pitches:readonly number[]}){return <>{pitches.map((n,i)=><Fragment key={n}>{i>0?' ':null}<span className="dojo-jazz-note-name"><Glyphs text={noteText(card,n)}/></span></Fragment>)}</>;}
const lapsOf=(laps:Record<string,{count:number}>|undefined)=>Object.values(laps??{}).reduce((n,l)=>n+l.count,0);
const TONICS=Array.from({length:12},(_,t)=>t);
const newSeed=()=>Math.floor(Math.random()*2**30);

export function JazzPracticeView({progressionId,onBack,random=false}:{progressionId:string;onBack:()=>void;/** Begin with the random key on (the first key is the first of a shuffled round). */random?:boolean}){
 const item=jazzItemOf(progressionId)!;
 const mainTonic=jazzItemMainTonic(item);
 const [start]=useState(()=>{const bag=random?startJazzKeyBag(newSeed()):undefined;return {tonic:bag?jazzBagKey(bag):mainTonic,bag};});
 const [activeId,setActiveId]=useState(progressionId);
 const [itemTonic,setItemTonic]=useState(start.tonic);
 /** The random key: defined while it is on. */
 const [bag,setBag]=useState<JazzKeyBag|undefined>(start.bag);
 const [lapNote,setLapNote]=useState<{from:string;to?:string}>();
 // One octave up (+1) or as written (0): added to the result of the transposition, kept for the item (and the key, the version, the random key) and while the app is open.
 const [octave,setOctave]=useState(jazzOctave);
 const octaveRef=useRef(octave);octaveRef.current=octave;
 const build=(id:string,tonic:number)=>raiseJazzProgression(transposeJazzProgression(id,tonic),octaveRef.current);
 const prog:JazzProgression=useMemo(()=>raiseJazzProgression(transposeJazzProgression(activeId,itemTonic),octave),[activeId,itemTonic,octave]);
 // what a lap that is complete changes has to be known at once (before the screen is drawn again): the refs keep the latest
 const progRef=useRef(prog),idRef=useRef(activeId),tonicRef=useRef(itemTonic),bagRef=useRef(bag);
 progRef.current=prog;idRef.current=activeId;tonicRef.current=itemTonic;bagRef.current=bag;
 /** Another key for the item, the current version in it: one place that keeps the refs and the state the same. */
 const goTo=(id:string,tonic:number,nextBag?:JazzKeyBag|null)=>{
  progRef.current=build(id,tonic);idRef.current=id;tonicRef.current=tonic;
  if(nextBag!==undefined){bagRef.current=nextBag??undefined;setBag(nextBag??undefined);}
  setActiveId(id);setItemTonic(tonic);
 };
 const run=useHeldCardRun({kind:'jazz',lapStore:jazzLapStore,onBack,target:()=>({cards:progRef.current.cards,tonic:jazzRecordTonic(progRef.current),lapId:progRef.current.id}),
  onLap(){
   playbackController.stop();
   const from=progRef.current.key,current=bagRef.current;
   if(!current){setLapNote({from});return;}
   const next=nextJazzKey(current,tonicRef.current);
   goTo(idRef.current,next.key,next.state);
   setLapNote({from,to:progRef.current.key});
  },
  // P18-01 Stage 2 「この段階をくり返す」: on = lap after lap (what this screen has always done, the random key moves on);
  // off = the end of a lap asks (もう一度 ① を弾く). The lap is recorded either way.
  stopAtLap:()=>!repeatRef.current,
  // P18-02: the stage decides what a lap that is complete does (see jazzLapOutcome): a ② round with a hint goes round
  // again on the same key and is not counted; the clean ② rounds feed ② ヒントなし n.
  lap:()=>({stage:stageRef.current,hinted:()=>hintsRef.current.length>0||listenHintedRef.current,clean:()=>writeRecallCleanLaps(n=>n+1)}),
  // P18-02: Space in ② shows the answer of the current card (the same guards as L and R).
  onSpace:()=>{if(stageRef.current==='recall')showAnswerRef.current();}});
 // P18-01 Stage 2: the switch on the row of the settings, remembered for this screen kind.
 const [repeat,writeRepeat]=useState(()=>readRepeatSetting('d'));
 const repeatRef=useRef(repeat);repeatRef.current=repeat;
 const toggleRepeat=()=>writeRepeat(r=>{writeRepeatSetting('d',!r);return !r;});
 // P18-02 ②: the fold button of この進行で学ぶこと (the text carries note names of the original key).
 // P18-02: the ② 覚えて弾く stage. Kept on this screen only: the key, the version, the octave, the random key and
 // くり返す stay when it changes. The hints of the round, the answer shown (until the current card moves) and the
 // counts of this screen (② ヒントなし n; the round numbers of the top row use the laps of the key as ① does) live here too.
 const [stage,writeStage]=useState<'see'|'recall'>('see');
 const stageRef=useRef(stage);stageRef.current=stage;
 const [hints,writeHints]=useState<readonly number[]>([]),hintsRef=useRef<readonly number[]>([]);hintsRef.current=hints;
 const [listenHinted,writeListenHinted]=useState(false),listenHintedRef=useRef(false);listenHintedRef.current=listenHinted;
 const [revealed,writeRevealed]=useState<{card:number}|undefined>();
 const [recallCleanLaps,writeRecallCleanLaps]=useState(0);
 const [lapStopStage,writeLapStopStage]=useState<'see'|'recall'|undefined>();
 const [hintNotice,writeHintNotice]=useState<'listen'|'focus'|undefined>();
 const recall=stage==='recall';
 /** P18-02: in ② the folded この進行で学ぶこと (the text carries note names of the original key); at the lap end and in ① it shows as before. */
 /** The two stages of the top row (P18-02): pressing one moves to the head of it (the key, the version, the octave, the random key and くり返す stay). */
 const jazzStages:readonly StageItem[]=[
  {num:'①',name:'見て弾く',state:stage==='see'?'on':'idle',onSelect:()=>switchStage('see')},
  {num:'②',name:'覚えて弾く',state:stage==='recall'?'on':'idle',onSelect:()=>switchStage('recall')}];
 /** The other stage of the top row: from its first card. The key, the version, the octave, the random key and くり返す stay (restart keeps them). */
 const switchStage=(next:'see'|'recall')=>{
  playbackController.stop();
  run.restart(()=>{writeStage(next);});
  writeHints([]);writeListenHinted(false);writeRevealed(undefined);writeHintNotice(undefined);setLapNote(undefined);
 };
 const {index,session,lastLap,manual,waiting,playingIndex,playedNotes,view,playCard,yes,playback,playing}=run;
 // P18-02: what a round that begins again clears: the marks of the hints, the shown answer and the 通して聴く of the last round (and the folded focus opens again).
 const forgetRound=()=>{
  writeHints([]);writeListenHinted(false);writeRevealed(undefined);writeHintNotice(undefined);setFocusOpen(false);
 };
 const forgetRoundRef=useRef(forgetRound);forgetRoundRef.current=forgetRound;
 /** Opening the folded この進行で学ぶこと in ② makes the round a hinted one (the same treatment as 通して聴く). */
 const openFocus=()=>{
  setFocusOpen(true);
  if(!hintsRef.current.length&&!listenHintedRef.current){writeListenHinted(true);writeHintNotice('focus');}
 };
const focusButton=<button type="button" className="dojo-jazz-focus-more" data-testid="jazz-focus-toggle" onClick={openFocus}>{RECALL_FOCUS_FOLDED}</button>;
 // P18-02: playing the sample of a card in ② shows its answer (it is a hint); the cards whose answer is already shown stay unmarked.
 const playCardHinted=async(i:number)=>{if(recall&&i>=index)showAnswer(i);await playCard(i);};
 const saved=useStore(jazzLapStore,s=>s.file).laps[activeId];
 const total=lapsOf(saved);
 const restart=()=>{forgetRound();run.restart();};
 /** Another version of the progression: from its first card, and the laps of this screen start again. The key of the item and the random key stay. */
 const switchTo=(id:string)=>{if(id===activeId)return;forgetRound();run.restart(()=>goTo(id,itemTonic));run.resetSession();setLapNote(undefined);};
 /** Another key chosen by hand: from the first card. With the random key on, the round goes on from there. */
 const chooseKey=(tonic:number)=>{
  if(tonic===itemTonic)return;
  forgetRound();
  run.restart(()=>goTo(activeId,tonic,bag?{...startJazzKeyBag(newSeed(),tonic),round:bag.round}:undefined));setLapNote(undefined);
 };
 const toggleRandom=()=>{forgetRound();if(bag)goTo(activeId,itemTonic,null);else goTo(activeId,itemTonic,startJazzKeyBag(newSeed(),itemTonic));setLapNote(undefined);};
 /** The other octave: from the first card (the cards are other notes); the key, the version and the random key stay. */
 const chooseOctave=(next:number)=>{
  if(next===octave)return;
  forgetRound();
  run.restart(()=>{jazzOctave=next;octaveRef.current=next;progRef.current=build(idRef.current,tonicRef.current);setOctave(next);});setLapNote(undefined);
 };
 const keyName=(tonic:number)=>transposeJazzProgression(jazzMainOf(item),tonic).key;
 const versionKey=prog.key!==keyName(itemTonic)?prog.key:undefined;

 // The room the screen has decides how it is laid out (see practiceLayout): small windows keep the compact stack, bigger ones grow.
 const whiteKeys=useMemo(()=>{const range=answerKeyboardRange(prog.cards.flatMap(c=>c.expected),true);return whiteKeysIn(range.minMidiNote,range.maxMidiNote);},[prog]);
 const {ref:practice,layout,style:layoutStyle}=usePracticeLayout(whiteKeys,prog.cards.length);
 const focusBelow=layout.kind!=='compact';
 const [focusOpen,setFocusOpen]=useState(false);
 /** P18-02: in ② the folded この進行で学ぶこと (the text carries note names of the original key); at the lap end and in ① it shows as before. */
 const foldedFocus=recall&&!run.lapStop&&!focusOpen;
 useEffect(()=>setFocusOpen(false),[activeId]);
 // 続き is shown only when the two lines of what is taught do not hold all of it (measured while it is closed)
 const focusText=useRef<HTMLParagraphElement>(null);
 const [focusClipped,setFocusClipped]=useState(false);
 useEffect(()=>{
  const text=focusText.current;if(!text)return;
  const measure=()=>{if(!text.parentElement?.hasAttribute('data-open'))setFocusClipped(text.scrollHeight>text.clientHeight+1);};
  measure();const observer=new ResizeObserver(measure);observer.observe(text);
  return()=>observer.disconnect();
 },[focusBelow,prog.focus,layout.kind,focusOpen,foldedFocus]);
 const card=prog.cards[index]!,before=index>0?prog.cards[index-1]:undefined;
 const [listeningIndex,setListeningIndex]=useState<number>();
 // P18-02 ②: the answer of the shown card (until the current card moves) takes the board when there is no sound of a card going.
 const displayIndex=listeningIndex??playingIndex??revealed?.card??index;
 const shown=prog.cards[displayIndex]??card;
 const snapshot=useMemo(()=>jazzCardSnapshot(prog,displayIndex),[prog,displayIndex]);
 // The staff is drawn over one extent for the whole item (every version, key and card), so that it keeps its size and place from card to card.
 const staffExtent=useMemo(()=>heldStaffExtent(item.progressions.flatMap(id=>TONICS.flatMap(t=>{const p=raiseJazzProgression(transposeJazzProgression(id,t),octave);return p.cards.map((_,i)=>jazzCardSnapshot(p,i));})),true),[item,octave]);
 const hint=heldCardHint({run,before,card,names:ns=>plain(card,ns),recall});
 const lapNo=(session[jazzRecordTonic(prog)]??0)+1;
 const allId=`jazz:all:${activeId}`;
 const showAnswer=(card=index)=>{
  writeRevealed({card});
  if(!hintsRef.current.includes(card))writeHints(h=>[...h,card]);
 };
 const showAnswerRef=useRef(showAnswer);showAnswerRef.current=showAnswer;
 const revealedRef=useRef(revealed);revealedRef.current=revealed;
 // The round that wraps (1枚目 へ) begins without the marks of the hints; the shown answer closes whenever the current card moves.
 const prevIndexRef=useRef(index);
 useEffect(()=>{writeRevealed(undefined);if(index===0&&prevIndexRef.current>0)forgetRoundRef.current();prevIndexRef.current=index;},[index]);
 // Which lap ended at the stop (the message and the buttons of the two stages differ).
 useEffect(()=>{if(run.lapStop)writeLapStopStage(stageRef.current);else writeLapStopStage(undefined);},[run.lapStop]);
 // Stopping too long on a card (hintSec, the same value that A reads from the Dojo settings) shows the answer of that card only.
 // (It is set up after `listening` below: the stall does not run while the whole progression is sounding.)
 const hintSec=useStore(dojoStore,s=>s.file.settings.hintSec);
 const cardStartAt=useRef(performance.now());
 useEffect(()=>{cardStartAt.current=performance.now();},[index,stage]);

 // The tempo of the whole-progression listening: the progression's own until it is chosen, then the chosen one for as long as the app is open (every progression).
 const [chosenBpm,setChosenBpm]=useState(jazzListenBpm);
 const bpm=chosenBpm??prog.tempoBpm;
 const listening=playing&&playback.source?.id===allId;
 /** The audio time of beat 0 of the listening that is on: where the seek bar starts from (set when the sound starts). */
 const listenStart=useRef<number>();
 const seek=useRef<HTMLDivElement>(null);
 const plan=useMemo(()=>jazzListenPlan(prog,bpm),[prog,bpm]);
 /** A new tempo: what is sounding stops (the next listening is at the new tempo). */
 const changeBpm=(value:number)=>{if(listening)playbackController.stop();jazzListenBpm=value;setChosenBpm(value);};
 const listenAll=async()=>{
  if(listening){playbackController.stop();return;}
  if(recall){const first=!listenHintedRef.current;writeListenHinted(true);if(first)writeHintNotice('listen');} // P18-02: the whole progression can be heard, so this round cannot be a clean one
  run.prepareAudio();
  listenStart.current=undefined;
  if(import.meta.env.VITE_P527_E2E_FIXTURE==='1')(window as typeof window&{__lvJazzListen?:{pitches:number[];bpm:number}}).__lvJazzListen={pitches:[...new Set(plan.notes.map(n=>n.pitch))].sort((a,b)=>a-b),bpm:plan.bpm};
  try{await playbackController.play({kind:'practice',id:allId},{type:'notes',notes:plan.notes,bpm:plan.bpm,sound:run.sound},{onStarted(){listenStart.current=Tone.now();}});}catch{/* the cards can still be played one by one */}
 };
 // Stopping too long on a card (hintSec) shows the answer of that card only: not while the whole progression is sounding.
 useEffect(()=>{
  if(!recall||waiting||listening)return undefined;
  const timer=setInterval(()=>{
   if(revealedRef.current!==undefined)return;
   if(performance.now()-cardStartAt.current<hintSec*1000)return;
   showAnswerRef.current();
  },300);
  return()=>clearInterval(timer);
 },[recall,waiting,listening,hintSec]);
 // The seek bar and the card that is sounding come from the clock of the sound (what is coming out of the speakers now), not from a count kept on the screen.
 useEffect(()=>{
  if(!listening)return undefined;
  const context=Tone.getContext().rawContext as unknown as Parameters<typeof heardContextTime>[0];
  const totalBeats=plan.totalBeats;
  let frame=0,shownCard:number|undefined,percent=-1;
  const tick=()=>{
   const startAt=listenStart.current,bar=seek.current;
   if(startAt!==undefined&&bar){
    const beat=listenBeat(heardContextTime(context),startAt,plan.bpm),progress=listenProgress(beat,totalBeats);
    bar.style.setProperty('--seek',`${(progress*100).toFixed(2)}%`);
    const whole=Math.round(progress*100);
    if(whole!==percent){percent=whole;bar.setAttribute('aria-valuenow',String(whole));}
    const sounding=listenCardIndex(beat,prog.cards);
    if(sounding!==shownCard){shownCard=sounding;setListeningIndex(sounding);}
   }
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);setListeningIndex(undefined);};
 },[listening,prog,plan]);
 // The keys that have been played through (this progression, this version), in the line above the keyboard.
 const keysDone=TONICS.map(t=>({t,name:keyName(t),count:saved?.[transposeJazzProgression(activeId,t).tonic]?.count??0}));
 return <section className="dojo" data-testid="dojo-jazz" data-dojo-screen="original" data-held-kind="jazz" data-practice-frame="d" data-focus-place={focusBelow?'below':'staff'} data-jazz-id={activeId} data-jazz-card={index} data-jazz-stage={stage} data-jazz-lap={lapNo} data-jazz-key={itemTonic} data-jazz-random={bag?'on':undefined} data-jazz-octave={octave} data-lap-stop={run.lapStop||undefined} data-midi-kind={view.kind} data-input-mode={run.inputMode} data-paused={waiting||undefined} data-played-notes={playedNotes}>
  <div className="dojo-practice dojo-endless" ref={practice} data-practice-layout={layout.kind} style={layoutStyle}>
   <PracticeHead backLabel={CHOICE_NAMES['builtin-progressions']} onBack={()=>{playbackController.stop();onBack();}} kind={`${JAZZ_PROGRESSIONS_GROUP_NAME} ${item.no}`} title={prog.title}
    degrees={prog.cards.map(c=>degreeOf(c,prog.key)).join('–')} degreesTestId="jazz-degrees" stages={jazzStages} progressLabel="この画面の周回" onQuit={()=>{playbackController.stop();onBack();}}
    progress={<>
     {bag?<span data-testid="jazz-round"><em>{bag.round}</em>巡目 <em>{Math.max(0,bag.pos+1)}/12</em> · </span>:null}
     <span data-testid="jazz-progress-stage">{stage==='see'?'①':'②'} <em>{lapNo}</em>周目 · <em>{index+1}/{prog.cards.length}</em></span>
     <span>完奏 <em data-testid="jazz-laps">{total}</em></span>
     {recall?<span data-testid="jazz-recall-clean">② ヒントなし <em>{recallCleanLaps}</em></span>:null}
     {manual?<span>自分で判定</span>:null}
    </>}/>
   <div className="dojo-endless-center">
    <div className="dojo-jazz-notices"><HeldCardNotices run={run} lapStore={jazzLapStore}/></div>
    <div className="dojo-jazz-bar dojo-practice-set">
     {item.progressions.length>1
      ?<div className="dojo-jazz-versions" role="group" aria-label="進行の版">{item.progressions.map(id=>{const v=buildJazzProgression(id);
       return <button type="button" key={id} aria-pressed={id===activeId} data-testid="jazz-version" data-jazz-version={id} onClick={()=>switchTo(id)}>{v.variantLabel}</button>;})}</div>
      :null}
     <label className="dojo-jazz-keyselect"><span>キー</span><select aria-label="項目のキー" data-testid="jazz-key-select" value={itemTonic} onChange={e=>chooseKey(Number(e.target.value))}>{TONICS.map(t=><option value={t} key={t}>{keyName(t)}{t===mainTonic?'（元のキー）':''}</option>)}</select></label>
     <button type="button" data-testid="jazz-random" aria-pressed={Boolean(bag)} onClick={toggleRandom}>ランダムキー</button>
     {versionKey?<span className="dojo-jazz-key" data-testid="jazz-version-key">この版のキー <b>{versionKey}</b></span>:null}
     <button type="button" data-testid="jazz-restart" onClick={restart}>最初から</button>
     <BpmScrubField idPrefix="jazz-bpm" inputTestId="jazz-bpm-input" label="BPM" dragLabel="上下にドラッグしてBPMを変更" value={bpm} onChange={changeBpm}/>
     <div className="dojo-jazz-octave" role="group" aria-label="オクターブ" data-testid="jazz-octave"><span>オクターブ</span>{[0,1].map(o=><button type="button" key={o} aria-pressed={octave===o} data-testid={`jazz-octave-${o}`} onClick={()=>chooseOctave(o)}>{o===0?'標準':'+1'}</button>)}</div>
     <RepeatToggle on={repeat} onToggle={toggleRepeat} testId="jazz-repeat"/>
    </div>
    <div className="dojo-endless-cards dojo-original-cards dojo-jazz-cards">{prog.cards.map((c,i)=>{
     const done=i<index,current=i===index;
     // P18-02 ②: the degree and the name of the chord stay; the notes of the hands are ? until the card was played through or its answer was shown (until the current card moves).
     const showNotes=!recall||recallAnswerVisible(i,index,revealed?.card);
     return <PracticeCard key={i} label={`${c.display}（${degreeOf(c,prog.key)}）を聴く`} onPress={()=>void playCardHinted(i)} state={done?'done':current?'current':'todo'} playing={playingIndex===i} extra={{'data-listening':listeningIndex===i||undefined}}
      testId="jazz-card" degreeTestId="jazz-degree" nameTestId="jazz-chord" notesTestId="jazz-notes" degree={degreeOf(c,prog.key)} name={c.display}
      hint={recall&&hints.includes(i)||undefined}
      mark={recall&&hints.includes(i)?<span className="dojo-jazz-hint-chip">ヒント</span>:done?<ChordCardMark result={cardResult(true,manual)} layer="set" corner/>:null}
      notes={showNotes?<><i>左</i> <Notes card={c} pitches={c.left}/><br/><i>右</i> <Notes card={c} pitches={c.right}/></>:<><i>左</i> {c.left.map((_,k)=><Fragment key={k}>{k>0?' ':null}?</Fragment>)}<br/><i>右</i> {c.right.map((_,k)=><Fragment key={k}>{k>0?' ':null}?</Fragment>)}</>}/>;})}</div>
    <div className="dojo-jazz-seek" ref={seek} role="progressbar" aria-label="通して聴く位置" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} data-active={listening||undefined} data-testid="jazz-seek">
     <div className="dojo-jazz-seek-fill"/>
     {prog.cards.slice(1).map(c=><i key={c.startBeat} style={{left:`${c.startBeat/(prog.cards[prog.cards.length-1]!.startBeat+prog.cards[prog.cards.length-1]!.durationBeats)*100}%`}}/>)}
    </div>
    <div className="dojo-jazz-status dojo-practice-say">
    {run.lapStop&&lastLap
     ?(lapStopStage==='recall'
      ?<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="jazz-lap-stop"><b>② をヒントなしで通しました</b>{lapNote?.to?` · ${lapNote.from} → 次は ${lapNote.to}`:''} · 完奏 {total} · 「もう一度 ② を弾く（R）」で続けます</p>
      :<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="jazz-lap-stop"><b>完奏！{lapNote?.to?` ${lapNote.from} → 次は ${lapNote.to}`:` ${lapNote?.from??''}`}</b> · {lastLap.n}周 · 「もう一度 ① を弾く（R）」で続けます</p>)
     :lastLap&&index===0&&lapNote
     ?(recall
      ?<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="jazz-lap"><b>② をヒントなしで通しました</b> · 完奏！{lapNote.to?` ${lapNote.from} → 次は ${lapNote.to}`:` ${lapNote.from}`} · {lapNote.to?'続けて、次のキーで':'続けて、もう1周'}弾けます</p>
      :<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="jazz-lap"><b>完奏！{lapNote.to?` ${lapNote.from} → 次は ${lapNote.to}`:''}</b> · {lastLap.n}周 · {lapNote.to?'続けて、次のキーで弾けます':'続けて、もう1周弾けます'}</p>)
      :<p className="dojo-endless-result" role="status" data-testid={recall&&hintNotice==='listen'?'jazz-listen-hint':recall&&hintNotice==='focus'?'jazz-focus-hint':'jazz-hint'}><Glyphs text={recall&&hintNotice==='listen'?RECALL_LISTENED:recall&&hintNotice==='focus'?RECALL_FOCUS_OPENED:hint}/></p>}
     <small className="dojo-jazz-note" data-testid="jazz-note">{JAZZ_PROGRESSIONS_NOTE}</small>
    </div>
    <div className="dojo-actions dojo-endless-actions">
     {recall?<button type="button" data-testid="jazz-reveal" disabled={revealed!==undefined} onClick={()=>showAnswer()}>答えを見る（Space）</button>:null}
     <button type="button" onClick={()=>void playCardHinted(index)}>お手本を聴く（L）</button>
     <button type="button" data-testid="jazz-listen-all" aria-pressed={listening} onClick={()=>void listenAll()}>{listening?'止める':'通して聴く'}</button>
     {run.lapStop?<button type="button" className="dojo-primary" data-testid="jazz-lap-again" onClick={run.againLap}>{lapStopStage==='recall'?'もう一度 ② を弾く（R）':'もう一度 ① を弾く（R）'}</button>:null}
     {run.lapStop&&lapStopStage==='see'?<button type="button" data-testid="jazz-lap-next" onClick={()=>switchStage('recall')}>② 覚えて弾くへ（Enter）</button>:null}
     {manual&&!run.lapStop?<button type="button" className="dojo-primary" onClick={yes}>弾けた（Y）</button>:null}
    </div>
     {focusBelow?(foldedFocus
      ?<div className="dojo-jazz-focus" data-testid="jazz-focus">{focusButton}</div>
      :<div className="dojo-jazz-focus" data-testid="jazz-focus" data-open={focusOpen||undefined}><b>この進行で学ぶこと</b><p ref={focusText}>{prog.focus}</p>{focusClipped||focusOpen?<button type="button" className="dojo-jazz-focus-more" aria-expanded={focusOpen} onClick={()=>setFocusOpen(o=>!o)}>{focusOpen?'閉じる':'続き'}</button>:null}{recall&&!run.lapStop?<button type="button" className="dojo-jazz-focus-more" onClick={()=>setFocusOpen(false)}>畳む</button>:null}</div>)
      :null}
    </div>
    <HeldCardBoard snapshot={snapshot} concealed={recall&&playingIndex===undefined&&listeningIndex===undefined&&revealed===undefined} left={shown.left} right={shown.right}
     caption={playingIndex!==undefined||listeningIndex!==undefined?`${snapshot.chordSymbol} を聴いています`:foldedFocus?undefined:focusBelow?undefined:`この進行で学ぶこと:${prog.focus}`}
     captionNode={!foldedFocus&&recall&&!run.lapStop&&focusOpen&&!focusBelow?<>この進行で学ぶこと:{prog.focus}<button type="button" className="dojo-jazz-focus-more" onClick={()=>setFocusOpen(false)}>畳む</button></>:foldedFocus&&!focusBelow?focusButton:undefined}
     keyHeight={layout.keyHeight} markScale={layout.markScale} fingerLayout="aligned" staffExtent={staffExtent}
    headExtra={<span className="dojo-jazz-keys" data-testid="jazz-keys" aria-label="弾き終えたキー"><span>完奏したキー：</span>{keysDone.map(k=><span className="dojo-endless-chip" key={k.t} data-testid="jazz-key-chip" data-key={k.t} data-current={k.t===itemTonic||undefined} data-kind={k.count>0?'ok':'skipped'} data-done={k.count>0||undefined}>{k.name}{k.count>0?` ${k.count}`:''}</span>)}</span>}/>
   <PracticeSafeArea/>
  </div>
 </section>;
}
