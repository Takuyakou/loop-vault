import {useMemo,useRef,useState} from 'react';
import {useStore} from 'zustand';
import {ChordCardMark,cardResult} from '../../components/practice/ChordCardResult';
import {playbackController} from '../../audio/playbackController';
import {NAMES,pc} from '../../domain/chordDojo/recipes';
import {ORIGINAL_GROUP_NAME,ORIGINAL_KEYS,buildOriginal,originalTitle,originalTonicOf,pickOriginalShift} from '../../domain/chordDojo/originalPractice';
import {originalLapStore} from '../../domain/chordDojo/originalRecords';
import {targetSnapshot} from '../../domain/chordDojo/targetSnapshot';
import {whiteKeysIn} from '../ear-practice/earKeyboardHeight';
import {answerKeyboardRange} from './keyboardRange';
import {usePracticeLayout} from './practiceLayout';
import {PracticeCard,PracticeHead,PracticeSafeArea,RepeatToggle,type StageItem} from './PracticeFrame';
import {readRepeatSetting,writeRepeatSetting} from './practiceRepeat';
import {CHOICE_NAMES} from './dojoNav';
import {HeldCardBoard,heldStaffExtent,HeldCardNotices,heldCardHint} from './HeldCardParts';
import {useHeldCardRun} from './useHeldCardRun';

/**
 * P12.5-02: Original Practice. The cards show the real voicing (left and right hand) taken from the player's own MIDI.
 * A card passes when every one of its notes is held and every note that was struck in the original is pressed again
 * after the card began; other notes are ignored (a melody may be played on top). There is no "wrong": nothing is
 * marked as a miss, and a lap is called 完奏, never a clear. Laps live in a separate Original Practice record; the strict Dojo document is unchanged.
 * The run itself (the input, the judging, the laps) is shared with Jazz Progressions: useHeldCardRun.
 */
/** Original Practice has the first stage only. */
const STAGES:readonly StageItem[]=[{num:'①',name:'見て弾く',state:'on'}];
const noteName=(n:number)=>`${NAMES[pc(n)]}${Math.floor(n/12)-1}`;
const names=(ns:readonly number[])=>ns.map(noteName).join(' ');

export function OriginalPracticeView({originalId,shift:initialShift,onBack}:{originalId:string;shift:number;onBack:()=>void}){
 const [shift,setShift]=useState(initialShift);
 const saved=useStore(originalLapStore,s=>s.file).laps[originalId];
 const prog=useMemo(()=>buildOriginal(originalId,shift),[originalId,shift]);
 const tonic=originalTonicOf(shift),keyName=NAMES[tonic];
 const shiftRef=useRef(shift),progRef=useRef(prog);
 shiftRef.current=shift;progRef.current=prog;
 // P18-01 Stage 2 「この段階をくり返す」: on = lap after lap (what this screen has always done); off = the end of a lap asks (もう一度 ① を弾く).
 const [repeat,writeRepeat]=useState(()=>readRepeatSetting('c'));
 const repeatRef=useRef(repeat);repeatRef.current=repeat;
 const toggleRepeat=()=>writeRepeat(r=>{writeRepeatSetting('c',!r);return !r;});
 const run=useHeldCardRun({kind:'original',lapStore:originalLapStore,onBack,target:()=>({cards:progRef.current.cards,tonic:originalTonicOf(shiftRef.current),lapId:originalId}),stopAtLap:()=>!repeatRef.current});
 const {index,session,lastLap,manual,waiting,playingIndex,playedNotes,view,playCard,yes}=run;
 const restart=(next?:number)=>run.restart(()=>{if(next!==undefined){shiftRef.current=next;setShift(next);}});
 const randomKey=()=>restart(pickOriginalShift(run.sessionRef.current,shiftRef.current,Math.random()));

 const whiteKeys=useMemo(()=>{const range=answerKeyboardRange(prog.cards.flatMap(c=>c.expected),true);return whiteKeysIn(range.minMidiNote,range.maxMidiNote);},[prog]);
 const {ref:practice,layout,style:layoutStyle}=usePracticeLayout(whiteKeys,prog.cards.length);
 const card=prog.cards[index]!,before=index>0?prog.cards[index-1]:undefined;
 const displayIndex=playingIndex??index;
 const shown=prog.cards[displayIndex]??card;
 // The staff is drawn over one extent for the whole progression (every key and card): its size does not change from card to card.
 const staffExtent=useMemo(()=>heldStaffExtent(ORIGINAL_KEYS.flatMap(k=>{const p=buildOriginal(originalId,k.shift);return p.cards.map((c,i)=>targetSnapshot(`original:${originalId}:${k.shift}:${i}`,c.chord,c.expected,{hands:{left:c.left,right:c.right}},NAMES[k.tonic],false));})),[originalId]);
 const snapshot=useMemo(()=>targetSnapshot(`original:${originalId}:${shift}:${displayIndex}`,shown.chord,shown.expected,{hands:{left:shown.left,right:shown.right}},keyName,false),[originalId,shift,displayIndex,shown,keyName]);
 // What to do on this card: which keys may stay down, and when the same notes as the card before must be played again.
 const hint=heldCardHint({run,before,card,names});
 const lapNo=(session[tonic]??0)+1;
 const keysDone=ORIGINAL_KEYS.map(k=>({...k,count:saved?.[k.tonic]?.count??0}));
 const inputMode=run.inputMode;
 return <section className="dojo" data-testid="dojo-original" data-dojo-screen="original" data-practice-frame="c" data-original-card={index} data-original-key={shift} data-original-lap={lapNo} data-lap-stop={run.lapStop||undefined} data-midi-kind={view.kind} data-input-mode={inputMode} data-paused={waiting||undefined} data-played-notes={playedNotes}>
  <div className="dojo-practice dojo-endless" ref={practice} data-practice-layout={layout.kind} style={layoutStyle}>
   <PracticeHead backLabel={CHOICE_NAMES['builtin-progressions']} onBack={()=>{playbackController.stop();onBack();}} kind={ORIGINAL_GROUP_NAME} title={originalTitle(originalId)} degrees={prog.degrees.join('–')}
    stages={STAGES} progressLabel="この画面の周回" onQuit={()=>{playbackController.stop();onBack();}}
    progress={<>
     <span>① <em>{lapNo}</em>周目 · <em>{index+1}/{prog.cards.length}</em></span>
     <span>完奏 <em>{session[tonic]??0}</em></span>
     {manual?<span>自分で判定</span>:null}
    </>}/>
   <div className="dojo-endless-center">
    <HeldCardNotices run={run} lapStore={originalLapStore}/>
    <div className="dojo-original-key dojo-practice-set">
     <label><span>キー</span><select aria-label="Original Practice のキー" value={shift} onChange={e=>restart(Number(e.target.value))}>{ORIGINAL_KEYS.map(k=><option value={k.shift} key={k.tonic}>{NAMES[k.tonic]}{k.shift===0?'（元のキー）':''}</option>)}</select></label>
     <button type="button" data-testid="original-random" onClick={randomKey}>ランダムキー</button>
     <button type="button" data-testid="original-restart" onClick={()=>restart()}>最初から</button>
     <RepeatToggle on={repeat} onToggle={toggleRepeat} testId="original-repeat"/>
    </div>
    <div className="dojo-endless-cards dojo-original-cards">{prog.cards.map((c,i)=>{
     const done=i<index,current=i===index;
     return <PracticeCard key={i} label={`${c.label}（${c.degree}）を聴く`} onPress={()=>void playCard(i)} state={done?'done':current?'current':'todo'} playing={playingIndex===i} testId="original-card" notesTestId="original-notes"
      degree={c.degree} name={c.label} mark={done?<ChordCardMark result={cardResult(true,manual)} layer="set" corner/>:null}
      notes={<><i>左</i> {names(c.left)}<br/><i>右</i> {names(c.right)}</>}/>;})}</div>
    <div className="dojo-practice-say">
    {run.lapStop&&lastLap
     ?<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="original-lap-stop"><b>完奏！ {NAMES[lastLap.tonic]}</b> {lastLap.n}周 · 「もう一度 ① を弾く（R）」で続けます</p>
     :lastLap&&index===0
     ?<p className="dojo-endless-result dojo-original-lap" role="status" data-testid="original-lap"><b>完奏！ {NAMES[lastLap.tonic]}</b> {lastLap.n}周 · 続けて、もう1周弾けます</p>
     :<p className="dojo-endless-result" role="status" data-testid="original-hint">{hint}</p>}
    </div>
    <div className="dojo-actions dojo-endless-actions">
     <button type="button" onClick={()=>void playCard(index)}>お手本を聴く（L）</button>
     {run.lapStop?<button type="button" className="dojo-primary" data-testid="original-lap-again" onClick={run.againLap}>もう一度 ① を弾く（R）</button>:null}
     {manual&&!run.lapStop?<button type="button" className="dojo-primary" onClick={yes}>弾けた（Y）</button>:null}
    </div>
   </div>
   <HeldCardBoard snapshot={snapshot} left={shown.left} right={shown.right} staffExtent={staffExtent} keyHeight={layout.keyHeight} markScale={layout.markScale} caption={playingIndex!==undefined?`${snapshot.chordSymbol} を聴いています`:undefined}
    headExtra={<span className="dojo-jazz-keys" data-testid="original-record" aria-label="完奏の記録"><span>完奏したキー：</span>{keysDone.map(r=><span className="dojo-endless-chip" key={r.shift} data-kind={r.count>0?'ok':'skipped'} data-done={r.count>0||undefined}>{NAMES[r.tonic]}{r.count>0?` ${r.count}`:''}</span>)}</span>}/>
   <PracticeSafeArea/>
  </div>
 </section>;
}
