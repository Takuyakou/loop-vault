import {useCallback,useEffect,useRef,useState} from 'react';
import {useStore,type StoreApi} from 'zustand';
import {usePreviewSound} from '../../components/PreviewSoundProvider';
import {playbackController} from '../../audio/playbackController';
import {usePlaybackState} from '../../hooks/usePlaybackState';
import {HeldCardJudge} from '../../domain/practice/heldCardJudge';
import {heldNotes} from '../../domain/liveMidi';
import type {ChordSymbol} from '../../domain/types';
import type {LapState} from '../../domain/chordDojo/lapRecords';
import {defaultLiveMidiStore} from '../../liveMidi/defaultLiveMidiStore';
import {liveMidiService} from '../../liveMidi/liveMidiService';
import {useDojoMidi} from './useDojoMidi';

/** What the run needs to know of a card: the notes (every one held, the struck ones pressed again) and the chord to sound. */
export interface HeldRunCard{expected:readonly number[];struck:readonly number[];chord:ChordSymbol}
/** What the run needs to know of the progression being played now (read when it is needed, so a change of key or version is seen at once). */
export interface HeldRunTarget{cards:readonly HeldRunCard[];/** The tonic its laps are counted under. */tonic:number;/** The id its laps are counted under. */lapId:string}

/**
 * The part of an "every note of the card is held" practice that does not depend on what is practised (Original Practice, Jazz
 * Progressions): MIDI or self-judging, the pause and the reconnect, the card the run is at, the laps of this screen and the
 * record of a lap. It reads raw note events (HeldCardJudge); nothing here marks a wrong note.
 */
export function useHeldCardRun({kind,target,lapStore,onBack,onLap,stopAtLap,lap,onSpace}:{
 /** The kind of practice: the id of the card that is sounded (`original:card:0`) and the record are told apart by it. */
 kind:'original'|'jazz';
 target:()=>HeldRunTarget;
 lapStore:StoreApi<LapState>;
 onBack:()=>void;
 /** Called at once when a lap is complete (after it is recorded), before the screen is drawn again: what has to change with the lap (the next key) can be set so that the next card is already the new one. */
 onLap?:()=>void;
 /** P18-01 Stage 2 「この段階をくり返す」= off: when it returns true the run stops at the end of a lap (the lap is recorded as before) and もう一度 ① を弾く (R) starts the next one. */
 stopAtLap?:()=>boolean;
 /** P18-02: what the screen is practising now and whether this round has seen a hint. Without it (Original Practice) every lap is counted as before. A ② round with a hint goes round again on the same key: it is not counted, so nothing is recorded and the random key does not move. */
 lap?:()=>{stage:'see'|'recall';hinted:()=>boolean;/** Called when a ② lap was counted. */clean?:()=>void};
 /** P18-02: Space in the ② stage shows the answer of the current card. */
 onSpace?:()=>void;
}){
 const {sound}=usePreviewSound();
 const playback=usePlaybackState();
 const playing=playback.status==='starting'||playback.status==='playing';
 const {view,connected,audioState,prepareAudio,resetAudio,retryAudio}=useDojoMidi(true,playing);
 const [inputMode,setInputMode]=useState<'pending'|'midi'|'manual'>(()=>view.busy?'pending':connected?'midi':'manual');
 const manual=inputMode==='manual',waiting=inputMode==='midi'&&!connected;
 const inputModeRef=useRef(inputMode);inputModeRef.current=inputMode;
 useEffect(()=>{if(inputMode==='pending'&&!view.busy)setInputMode(connected?'midi':'manual');},[inputMode,view.busy,connected]);
 const records=useStore(lapStore);
 useEffect(()=>{void lapStore.getState().initialize();},[lapStore]);
 const [index,setIndex]=useState(0);
 const [session,setSession]=useState<Record<number,number>>({}),[lastLap,setLastLap]=useState<{tonic:number;n:number}>();
 const onLapRef=useRef(onLap);onLapRef.current=onLap;
 const stopAtLapRef=useRef(stopAtLap);stopAtLapRef.current=stopAtLap;
 const lapRef=useRef(lap);lapRef.current=lap;
 const onSpaceRef=useRef(onSpace);onSpaceRef.current=onSpace;
 const [lapStop,writeLapStop]=useState(false),lapStopRef=useRef(false);
 const targetRef=useRef(target),indexRef=useRef(0),connectedRef=useRef(connected),sessionRef=useRef(session),judge=useRef<HeldCardJudge>();
 targetRef.current=target;connectedRef.current=connected;sessionRef.current=session;
 if(!judge.current){
  judge.current=new HeldCardJudge();
  // Keys that are already down when the screen opens are held, but they were not pressed for the first card.
  for(const n of heldNotes(defaultLiveMidiStore.getState().notes))judge.current.noteOn(n);
  judge.current.startCard();
 }
 // The input went away or came back: no key is held as far as we know (nothing stays stuck).
 const connectionKey=connected?defaultLiveMidiStore.getState().selected?.backendId:undefined;
 const lastConnection=useRef({connected,key:connectionKey});
 if(lastConnection.current.connected!==connected||lastConnection.current.key!==connectionKey){lastConnection.current={connected,key:connectionKey};judge.current!.reset();}
 const chooseMode=(mode:'midi'|'manual')=>{judge.current!.reset();inputModeRef.current=mode;setInputMode(mode);};
 useEffect(()=>()=>{playbackController.stop();resetAudio();},[resetAudio]);

 /** The current card is played: the next one begins (the last one is followed by the first: a lap is complete).
  * P18-01 Stage 2: with 「この段階をくり返す」 off the lap is recorded as before, and then the screen stops here:
  * もう一度 ① を弾く (R) starts the next lap.
  * P18-02: when the screen tells the stage (Jazz ① ②), a ② round with a hint goes round again on the same key and is
  * not counted: nothing is recorded, the random key does not move (the marks of the round are cleared by the screen). */
 const pass=useCallback(()=>{
  judge.current!.startCard();
  const t=targetRef.current();
  const last=indexRef.current>=t.cards.length-1;
  indexRef.current=last?0:indexRef.current+1;setIndex(indexRef.current);
  if(!last){setLastLap(undefined);return;}
  const context=lapRef.current?.();
  if(context&&context.stage==='recall'&&context.hinted()){setLastLap(undefined);return;}
  const at=t.tonic,n=(sessionRef.current[at]??0)+1;
  sessionRef.current={...sessionRef.current,[at]:n};setSession(sessionRef.current);setLastLap({tonic:at,n});
  void lapStore.getState().complete(t.lapId,at,crypto.randomUUID());
  if(context&&context.stage==='recall')context.clean?.();
  onLapRef.current?.();
  if(stopAtLapRef.current?.()){lapStopRef.current=true;writeLapStop(true);return;}
 },[lapStore]);
 /** もう一度 ① を弾く (R): from the first card, the laps go on as they do. */
 const againLap=useCallback(()=>{
  playbackController.stop();lapStopRef.current=false;writeLapStop(false);judge.current!.startCard();indexRef.current=0;setIndex(0);setLastLap(undefined);
 },[]);
 /** Back to the first card. `change` is what else changes with it (the key, the version): it is done before the screen is drawn again. */
 const restart=useCallback((change?:()=>void)=>{
  playbackController.stop();lapStopRef.current=false;writeLapStop(false);judge.current!.startCard();indexRef.current=0;setIndex(0);setLastLap(undefined);
  change?.();
 },[]);
 /** The laps counted on this screen start again (another version of the progression). */
 const resetSession=useCallback(()=>{sessionRef.current={};setSession({});},[]);

 // Raw note events decide; the held keys and the keys pressed since this card began are kept by the judge.
 useEffect(()=>{
  const unsubscribe=liveMidiService.subscribeBatches(batch=>{
   for(const e of batch.events){
    if(!connectedRef.current||inputModeRef.current!=='midi')continue;
    judge.current!.event(e.status,e.channel,e.data1,e.data2);
    if(lapStopRef.current)continue; // the lap end asks: what is pressed stays known to the judge, but nothing is judged
    if((e.status&0xf0)!==0x90||e.data2===0)continue;
    const card=targetRef.current().cards[indexRef.current];
    if(card&&judge.current!.judge(card.expected,card.struck).ok)pass();
   }
  });
  return unsubscribe;
 },[pass]);

 // Playing a card plays the notes of the card.
 const prefix=`${kind}:card:`;
 const playingIndex=playing&&playback.source?.kind==='practice'&&playback.source.id.startsWith(prefix)?Number(playback.source.id.split(':')[2]):undefined;
 const playedNotes=playing&&playback.request?.type==='chord'?playback.request.explicitMidiNotes?.join(','):undefined;
 const playCard=useCallback(async(i:number)=>{
  const c=targetRef.current().cards[i];if(!c)return;
  prepareAudio();
  try{await playbackController.play({kind:'practice',id:`${prefix}${i}`},{type:'chord',chord:c.chord,sound,explicitMidiNotes:c.expected});}catch{/* the answer is on the keyboard */}
 },[sound,prepareAudio,prefix]);
 const yes=useCallback(()=>{if(inputModeRef.current==='manual'&&!lapStopRef.current)pass();},[pass]);

 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea,button,summary,[role=region][tabindex]'))return;
   if(document.querySelector('[role=dialog]'))return;
   const k=e.key.toLowerCase();
   if(k==='escape'){e.preventDefault();playbackController.stop();onBack();}
   else if(k==='l'){e.preventDefault();void playCard(indexRef.current);}
   else if(k==='y'){e.preventDefault();yes();}
   else if(k==='r'&&lapStopRef.current){e.preventDefault();againLap();}
   else if(k===' '&&onSpaceRef.current){e.preventDefault();onSpaceRef.current();}
  };
  window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
 },[onBack,playCard,yes,againLap]);

 return {sound,playback,playing,view,connected,audioState,retryAudio,prepareAudio,inputMode,manual,waiting,chooseMode,records,index,indexRef,session,sessionRef,lastLap,lapStop,pass,againLap,restart,resetSession,playingIndex,playedNotes,playCard,yes};
}
export type HeldCardRun=ReturnType<typeof useHeldCardRun>;
