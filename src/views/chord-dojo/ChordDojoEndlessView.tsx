import {ChordCardMark,cardResult} from '../../components/practice/ChordCardResult';
import {DojoBackButton} from './DojoBackButton';
import {whiteKeysIn} from '../ear-practice/earKeyboardHeight';
import {usePracticeLayout} from './practiceLayout';
import {PracticeCard,PracticeHead,PracticeSafeArea,type StageItem} from './PracticeFrame';
import {CHOICE_NAMES} from './dojoNav';
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {useStore} from 'zustand';
import {MidiRequiredNotice} from '../../components/MidiRequiredNotice';
import {usePreviewSound} from '../../components/PreviewSoundProvider';
import {PracticeKeyboard} from '../../components/practice/PracticeKeyboard';
import {playbackController} from '../../audio/playbackController';
import {usePlaybackState} from '../../hooks/usePlaybackState';
import {BUILTINS,buildBuiltin,builtinDisplayName,keyLabel} from '../../domain/chordDojo/builtins';
import {activate,finish,matchChord,nextKey,pause,resumeSameKey,revealChord,selfJudge,skipKey,startEndless,summarize,switchToSelf,type EndlessResult,type EndlessState} from '../../domain/chordDojo/endless';
import {judgeChord,requiredCount} from '../../domain/chordDojo/judging';
import {pc} from '../../domain/chordDojo/recipes';
import {dojoStore} from '../../domain/chordDojo/runtime';
import {snapshotFingerLabels,targetSnapshot} from '../../domain/chordDojo/targetSnapshot';
import {heldNotes} from '../../domain/liveMidi';
import {defaultLiveMidiStore} from '../../liveMidi/defaultLiveMidiStore';
import {GrandStaff} from './GrandStaff';
import {answerKeyboardRange} from './keyboardRange';
import {useDojoFingering} from './useDojoFingering';
import {useDojoMidi} from './useDojoMidi';

/**
 * P12.3 §8–11: random-key endless practice of one standard progression.
 * Nothing here is saved: the state lives in this component and goes away with it.
 */
/** The random key is the second stage (名前を思い出して弾く) played in changing keys: the others cannot be used here. */
const STAGES:readonly StageItem[]=[{num:'①',name:'見て弾く',state:'off',title:'ランダムキーは ② で弾きます'},{num:'②',name:'覚えて弾く',state:'on'},{num:'③',name:'テンポで弾く',state:'off',title:'ランダムキーは ② で弾きます'}];
const NEXT_KEY_WAIT_MS=600;
const SELF_NOTICE='答えを見て、自分で「弾けた／まだ」を押す形で進みます（秒数は測りません）。';
const DROPPED_NOTICE='MIDI が外れました。つなぎ直すと、この課題から続けます。';
const chipText=(r:EndlessResult,mode:'major'|'minor')=>`${keyLabel(r.key,mode)} ${r.skipped?'とばした':r.self?'自分で':r.hint?'ヒント':`${(r.sec??0).toFixed(1)}s`}`;
const chipKind=(r:EndlessResult)=>r.skipped?'skipped':r.self?'self':r.hint?'hint':'ok';

export function ChordDojoEndlessView({builtinId,onBack}:{builtinId:string;onBack:()=>void}){
 const builtin=BUILTINS.find(b=>b.id===builtinId)!;
 const settleMs=useStore(dojoStore,s=>s.file.settings.settleMs);
 const {sound}=usePreviewSound();
 const playback=usePlaybackState();
 const playing=playback.status==='starting'||playback.status==='playing';
 const {view,connected,audioState,prepareAudio,resetAudio,retryAudio}=useDojoMidi(true,playing);
 const [state,setRaw]=useState<EndlessState>(()=>startEndless(builtinId,Date.now(),!(view.connected||view.busy)));
 const stateRef=useRef(state);
 const apply=useCallback((change:(s:EndlessState)=>EndlessState)=>{stateRef.current=change(stateRef.current);setRaw(stateRef.current);},[]);
 const connectedRef=useRef(connected);connectedRef.current=connected;
 const [message,setMessage]=useState<string>();           // "✗ …" of the last judgement
 const [selfNo,setSelfNo]=useState(false);                // 「まだ」 was pressed for this card
 const live=useStore(defaultLiveMidiStore,s=>s.notes);
 const heldCount=heldNotes(live).length;

 const key=state.key,mode=builtin.mode;
 const built=useMemo(()=>buildBuiltin(builtinId,key),[builtinId,key]);
 const chords=built.chords;
 const plans=useDojoFingering(chords,80);
 const keyName=keyLabel(key,mode);
 const done=state.phase==='clear'?chords.length:state.chordIndex;
 const summary=summarize(state.results);

 // The message belongs to the card it was made for.
 useEffect(()=>{setMessage(undefined);setSelfNo(false);},[state.key,state.chordIndex,state.phase,state.round]);

 // MIDI session: when MIDI is not connected (it dropped, or it was still connecting at the start) the session waits.
 useEffect(()=>{
  const s=stateRef.current;
  if(!connected&&!s.manual&&s.phase!=='paused'&&s.phase!=='summary')apply(pause);
 },[connected,apply]);
 // …and when it is back and every key is up, the same key starts again from the first card (or the next key, after a clear).
 useEffect(()=>{
  if(!connected||state.phase!=='paused'||state.manual)return;
  const timer=setInterval(()=>{
   if(heldNotes(defaultLiveMidiStore.getState().notes).length>0)return;
   clearInterval(timer);
   apply(s=>s.clearedAt!==undefined?nextKey(s,false):resumeSameKey(s));
  },50);
  return()=>clearInterval(timer);
 },[connected,state.phase,state.manual,apply]);

 // A key starts when it is ready (self: at once; MIDI: when every key is up).
 useEffect(()=>{
  if(state.phase!=='ready')return;
  if(state.manual||(connected&&heldNotes(defaultLiveMidiStore.getState().notes).length===0))apply(s=>activate(s,performance.now()));
 },[state.phase,state.manual,state.key,state.round,connected,apply]);

 // Judging: every Note On / Off, wait the settle time, then judge ALL the keys held now (no need to press again).
 const judge=useCallback((at:number)=>{
  const s=stateRef.current;if(s.phase!=='active'||s.manual)return;
  const b=buildBuiltin(builtinId,s.key),c=b.chords[s.chordIndex];if(!c)return;
  const target={notes:c.notes,chord:c.chord,judge:b.judge,bass:'self' as const};
  const held=heldNotes(defaultLiveMidiStore.getState().notes);
  if(held.length<requiredCount(target)){setMessage(undefined);return;}
  const result=judgeChord(target,held);
  if(result.ok){setMessage(undefined);apply(x=>matchChord(x,at));}else setMessage(`✗ ${result.message}`);
 },[builtinId,apply]);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const unsubscribe=defaultLiveMidiStore.subscribe((now,previous)=>{
   if(now.notes===previous.notes)return;
   const s=stateRef.current;if(s.manual||!connectedRef.current)return;
   const at=performance.now();
   if(s.phase==='ready'){if(heldNotes(now.notes).length===0)apply(x=>activate(x,at));return;}
   if(s.phase!=='active')return;
   clearTimeout(timer);timer=setTimeout(()=>judge(at),settleMs);
  });
  return()=>{unsubscribe();clearTimeout(timer);};
 },[judge,settleMs,apply]);

 // After a clear: the next key comes after 600 ms and (MIDI) when every key is up.
 useEffect(()=>{
  if(state.phase!=='clear')return;
  const timer=setInterval(()=>{
   const s=stateRef.current;if(s.phase!=='clear'||s.clearedAt===undefined)return;
   if(performance.now()-s.clearedAt<NEXT_KEY_WAIT_MS)return;
   if(!s.manual&&heldNotes(defaultLiveMidiStore.getState().notes).length>0)return;
   apply(x=>nextKey(x,!connectedRef.current));
  },30);
  return()=>clearInterval(timer);
 },[state.phase,apply]);

 useEffect(()=>()=>{playbackController.stop();resetAudio();},[resetAudio]);

 // Playing a card.
 const playingIndex=playing&&playback.source?.kind==='practice'&&playback.source.id.startsWith('endless:card:')?Number(playback.source.id.split(':')[2]):undefined;
 const playChord=useCallback(async(index:number)=>{
  const c=buildBuiltin(builtinId,stateRef.current.key).chords[index];if(!c)return;
  prepareAudio();
  try{await playbackController.play({kind:'practice',id:`endless:card:${index}`},{type:'chord',chord:c.chord,sound,explicitMidiNotes:c.notes});}
  catch{setMessage('お手本を再生できません。鍵盤の答えを確認してください');}
 },[builtinId,sound,prepareAudio]);
 const showCard=useCallback((index:number)=>{if(!stateRef.current.revealed.includes(index))apply(s=>revealChord(s,index));},[apply]);
 const pressCard=useCallback((index:number)=>{showCard(index);void playChord(index);},[showCard,playChord]);
 const showAnswer=useCallback(()=>{const s=stateRef.current;if(s.phase==='active'||s.phase==='ready')showCard(s.chordIndex);},[showCard]);
 const hear=useCallback(()=>{const s=stateRef.current;if(s.phase!=='active'&&s.phase!=='ready')return;showCard(s.chordIndex);void playChord(s.chordIndex);},[showCard,playChord]);
 const skip=useCallback(()=>{if(stateRef.current.phase==='summary')return;playbackController.stop();apply(s=>skipKey(s));},[apply]);
 const quit=useCallback(()=>{
  playbackController.stop();
  if(stateRef.current.results.length===0)onBack();else apply(finish);
 },[apply,onBack]);
 const yes=useCallback(()=>{if(stateRef.current.phase==='active'&&stateRef.current.manual)apply(s=>selfJudge(s,true,performance.now()));},[apply]);
 const no=useCallback(()=>{if(stateRef.current.phase==='active'&&stateRef.current.manual)setSelfNo(true);},[]);
 const again=useCallback(()=>{playbackController.stop();apply(()=>startEndless(builtinId,Date.now(),!(connectedRef.current)));},[apply,builtinId]);

 // Keys (this screen has its own: the Dojo's are off while it is open).
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea,button,summary,[role=region][tabindex]'))return;
   if(document.querySelector('[role=dialog]'))return;
   const k=e.key.toLowerCase(),s=stateRef.current;
   if(s.phase==='summary'){if(k==='enter'){e.preventDefault();again();}else if(k==='escape'){e.preventDefault();onBack();}return;}
   if(k==='escape'){e.preventDefault();quit();}
   else if(e.key===' '){e.preventDefault();showAnswer();}
   else if(k==='l'){e.preventDefault();hear();}
   else if(k==='y'){e.preventDefault();yes();}
   else if(k==='n'){e.preventDefault();no();}
  };
  window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
 },[again,onBack,quit,showAnswer,hear,yes,no]);

 // What the score and the keyboard show: the card that is sounding, else the last chord of a clear, else the current card once it is shown.
 const currentShown=state.phase!=='clear'&&state.revealed.includes(state.chordIndex);
 const displayIndex=playingIndex??(state.phase==='clear'?chords.length-1:currentShown?state.chordIndex:undefined);
 const snapshot=useMemo(()=>displayIndex===undefined||!chords[displayIndex]?undefined:targetSnapshot(`endless:${builtinId}:${key}:${displayIndex}`,chords[displayIndex].chord,chords[displayIndex].notes,plans[displayIndex],keyName,false),[displayIndex,chords,plans,builtinId,key,keyName]);
 const fingerLabels=useMemo(()=>snapshotFingerLabels(snapshot),[snapshot]);
 const keyboardRange=answerKeyboardRange(snapshot?.midiNotes??[],Boolean(snapshot));
 const progressionRange=useMemo(()=>answerKeyboardRange(chords.flatMap(c=>c.notes),true),[chords]);
 const {ref:practice,layout,style:layoutStyle}=usePracticeLayout(whiteKeysIn(progressionRange.minMidiNote,progressionRange.maxMidiNote),chords.length);

 const waiting=!state.manual&&state.phase==='paused';
 const hintLine=state.manual
  ?(selfNo?'答えを見て、もう一度':currentShown?'答えのとおりに弾いてみて、合っていたら「弾けた」':'頭の中でコードを決めて、弾いてから「答えを見る」')
  :message??(state.phase==='clear'?'鍵盤を離すと、次のキーが出ます'
   :state.phase==='ready'&&heldCount>0?'鍵盤を全部離すと始まります'
   :state.hinted?'ヒントを見ました。このキーは秒数を数えません'
   :state.chordIndex>0?`${state.chordIndex}番目まで合いました`
   :'度数を見て、このキーのコードを順に弾いてください');
 const lastResult=state.phase==='clear'?state.results[state.results.length-1]:undefined;
 const shownResults=state.results.slice(-12),hiddenResults=state.results.length-shownResults.length;

 if(state.phase==='summary')return <section className="dojo" data-testid="dojo-endless" data-dojo-screen="endless" data-endless-phase="summary" data-midi-kind={view.kind}>
  <div className="dojo-endless-summary-page"><DojoBackButton label={CHOICE_NAMES['builtin-progressions']} onBack={onBack}/><article className="dojo-endless-summary" aria-label="今回のランダムキー">
   <h2>今回のランダムキー</h2>
   <dl>
    <div><dt>クリアしたキー</dt><dd>{summary.cleared}</dd></div>
    <div><dt>ヒントなし</dt><dd>{summary.noHint}</dd></div>
    <div><dt>平均（ヒントなし）</dt><dd>{summary.avgSec===undefined?'—':`${summary.avgSec.toFixed(1)}s`}</dd></div>
    <div><dt>巡目</dt><dd>{state.round} · {state.pos}/12</dd></div>
   </dl>
   {summary.slow.length?<p className="dojo-endless-slow">時間がかかったキー：{summary.slow.map(r=>chipText(r,mode)).join('・')}</p>:null}
   <div className="dojo-endless-history">{state.results.map((r,i)=><span className="dojo-endless-chip" data-kind={chipKind(r)} key={i}>{chipText(r,mode)}</span>)}</div>
   <div className="dojo-endless-summary-actions"><button type="button" className="dojo-primary" autoFocus onClick={again}>もう一度（新しい順番）</button></div>
  </article></div>
 </section>;

 return <section className="dojo" data-testid="dojo-endless" data-dojo-screen="endless" data-practice-frame="b" data-endless-phase={state.phase} data-midi-kind={view.kind}>
  <div className="dojo-practice dojo-endless" ref={practice} data-practice-layout={layout.kind} style={layoutStyle}>
   <PracticeHead backLabel={CHOICE_NAMES['builtin-progressions']} onBack={()=>{playbackController.stop();onBack();}} kind="ランダムキー" title={builtinDisplayName(builtin)} degrees={builtin.fullDegrees.join('–')}
    stages={STAGES} progressLabel="このセッションの集計" onQuit={quit}
    progress={<>
     <span><em>{state.round}</em>巡目 <em>{state.pos+1}/12</em></span>
     <span>クリア <em>{summary.cleared}</em></span>
     {state.manual?<span>自分で判定</span>:<span>ヒントなし <em>{summary.noHint}</em></span>}
    </>}/>
   <div className="dojo-endless-center">
    {audioState==='error'?<p className="dojo-notice" role="alert">入力のピアノ音を開始できませんでした。入力の判定は続けられます。<button type="button" onClick={retryAudio}>入力音をもう一度</button></p>:null}
    {waiting?<MidiRequiredNotice view={view} heading={view.kind==='error'?'MIDI 接続でエラーが起きました。':undefined} description={DROPPED_NOTICE}><button type="button" onClick={()=>apply(switchToSelf)}>自分で判定に切り替える</button></MidiRequiredNotice>
     :state.manual&&!connected?<MidiRequiredNotice compact view={view} description={SELF_NOTICE}/>:null}
    <div className="dojo-practice-set dojo-jazz-bar">
     <span className="dojo-practice-key" data-endless-key={key}>キー<b>{keyName}</b><small>（ランダム）</small></span>
     <span className="dojo-practice-pill">構成とベースが合えばよい（転回は自由）</span>
    </div>
    <div className="dojo-endless-cards">{chords.map((c,i)=>{
     const finished=i<done,shown=finished||state.revealed.includes(i),current=i===state.chordIndex&&state.phase!=='clear';
     const degree=builtin.fullDegrees[i],hint=!state.manual&&state.hinted&&shown&&!finished;
     return <PracticeCard key={i} label={shown?`${c.chord.label}（${degree}）を聴く`:`${i+1}番目のコードをヒントとして聴く`} onPress={()=>pressCard(i)} state={finished?'done':current?'current':'todo'} hint={hint} playing={playingIndex===i}
      degree={degree} name={shown?c.chord.label:'?'} mark={finished?<ChordCardMark result={cardResult(true,state.manual)} layer="set" corner/>:null}/>;})}</div>
    <div className="dojo-practice-say">
     {lastResult?<div className="dojo-endless-clear" role="status"><span>クリア！ {keyName}</span><small>{lastResult.self?'自分で判定':lastResult.hint?'ヒントあり':`${(lastResult.sec??0).toFixed(1)} 秒`}</small></div>:null}
     <p className="dojo-endless-result" role="status" data-error={message?.startsWith('✗')||undefined}>{hintLine}</p>
    </div>
    <div className="dojo-actions dojo-endless-actions">
     <button type="button" onClick={hear} disabled={state.phase==='clear'}>お手本を聴く（L）</button>
     <button type="button" onClick={showAnswer} disabled={state.phase==='clear'}>答えを見る（Space）</button>
     <button type="button" onClick={skip}>このキーをとばす</button>
     {state.manual?<><button type="button" className="dojo-primary" disabled={state.phase!=='active'||!currentShown} onClick={yes}>弾けた（Y）</button><button type="button" disabled={state.phase!=='active'||!currentShown} onClick={no}>まだ（N）</button></>:null}
    </div>
   </div>
   <GrandStaff compact snapshot={snapshot} caption={playingIndex!==undefined&&snapshot?`${snapshot.chordSymbol} を聴いています`:undefined} hiddenText="答えは、弾いた後かヒントの後に出ます"/>
   <div className="dojo-keyboard" style={{'--target-keyboard-width':`${Math.max(760,Math.ceil((keyboardRange.maxMidiNote-keyboardRange.minMidiNote+1)*7/12)*22)}px`,'--held-key-height':`${layout.keyHeight}px`} as CSSProperties}>
    <div className="dojo-keyboard-head"><b>鍵盤</b><span><i className="dojo-held-swatch"/>押している音</span><span><i className="dojo-answer-swatch"/>答え（弾いた後に出る）</span><span><i className="dojo-wrong-swatch"/>違う音</span><span><i className="dojo-missing-swatch"/>不足する音</span>
     {state.results.length>0?<span className="dojo-jazz-keys dojo-endless-history" aria-label="このセッションの記録"><span>このセッション：</span>{hiddenResults>0?<span className="dojo-endless-chip" data-kind="skipped">…ほか {hiddenResults}</span>:null}{shownResults.slice(-6).map((r,i)=><span className="dojo-endless-chip" data-kind={chipKind(r)} key={i}>{chipText(r,mode)}</span>)}</span>:null}</div>
    <PracticeKeyboard dojoHeight={layout.keyHeight} markScale={layout.markScale} fingerLabels={fingerLabels} leftHandGuideNotes={snapshot?.notes.filter(n=>n.hand==='left').map(n=>n.midi)??[]} rightHandGuideNotes={snapshot?.notes.filter(n=>n.hand==='right').map(n=>n.midi)??[]} appearance="dojo" hideLegend compactSummary octaveConvention="scientific" range={keyboardRange} guideNotes={snapshot?.midiNotes??[]} allowedPitchClasses={snapshot?.midiNotes.map(pc)??[]} requiredPitchClasses={snapshot?.midiNotes.map(pc)??[]} interactionMode={snapshot?undefined:'neutral-monitor'} level={snapshot?1:2} matchState={message?.startsWith('✗')?'wrong':state.phase==='clear'?'match':'empty'} concealNoteNames={!snapshot}/>
   </div>
   <PracticeSafeArea/>
  </div>
 </section>;
}
