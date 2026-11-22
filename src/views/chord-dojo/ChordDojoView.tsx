import {displayDegreeLabel} from '../../ui/chordText';
import type {PracticeChoice} from '../../domain/master251/scheduler';
import {LessonFinishSummary} from './LessonFinishSummary';
import {GrandStaff} from './GrandStaff';
import {answerPolicy} from './answerPolicy';
import {targetSnapshot,snapshotRevision,snapshotFingerLabels} from '../../domain/chordDojo/targetSnapshot';
import {freezeLessonDisplay,freezeLegacyDisplay,frozenDisplay} from './lessonFingering';
import {useLessonFingeringOptions} from './useDojoFingering';
import {useDojoFingering} from './useDojoFingering';
import {Master251View} from './Master251View';
import {EarPracticeView} from '../ear-practice/EarPracticeView';
import {ChordDojoEndlessView} from './ChordDojoEndlessView';
import {OriginalPracticeView} from './OriginalPracticeView';
import {JazzPracticeView} from './JazzPracticeView';
import {VoicingDrillListView} from './VoicingDrillListView';
import {VoicingDrillPracticeView} from './VoicingDrillPracticeView';
import {DojoHome} from './DojoHome';
import {rememberRecent, type DojoRecentEntry} from './dojoRecent';
import {recordPracticeOpen} from '../home/practiceOpens';
import {isJazzProgressionId} from '../../domain/chordDojo/jazzProgressions';
import {restoreScroll,scrollerOf} from './scrollRestore';
import {BuiltinProgressionList} from './BuiltinProgressionList';
import {usePracticeLayout} from './practiceLayout';
import {PracticeActions,PracticeCard,PracticeConditions,PracticeGuide,PracticeHead,PracticeLap,PracticeResult,PracticeSafeArea,RepeatToggle,STAFF_HELP,keyed,type StageItem} from './PracticeFrame';
import {degreeFunctionKinds} from '../../domain/earPractice/degreeFunction';
import {readRepeatSetting,writeRepeatSetting} from './practiceRepeat';
import {whiteKeysIn} from '../ear-practice/earKeyboardHeight';
import {SavedProgressionList} from './SavedProgressionList';
import {GuidedCourseView} from './GuidedCourseView';
import {createCourseStorage,CourseRepository} from '../../domain/chordDojo/guidedCourse/store';
import {coursePlan,courseSummary,currentCourseLevel} from '../../domain/chordDojo/guidedCourse/review';
import {AdvancedRepository,createAdvancedStorage} from '../../domain/chordDojo/guidedCourse/advanced/store';
import {advancedHomeSummary} from '../../domain/chordDojo/guidedCourse/advanced/review';
import {isPartialProgression,progressionInRange,progressionEntriesInRange} from '../../domain/chordDojo/recordScope';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {useStore} from 'zustand';
import {PracticeKeyboard} from '../../components/practice/PracticeKeyboard';
import {usePreviewSound} from '../../components/PreviewSoundProvider';
import {playbackController} from '../../audio/playbackController';
import {defaultLiveMidiStore} from '../../liveMidi/defaultLiveMidiStore';
import {liveMidiService} from '../../liveMidi/liveMidiService';
import type {SongIdea} from '../../domain/types';
import {dojoStore} from '../../domain/chordDojo/runtime';
import {collectVault,syncVault} from '../../domain/chordDojo/collect';
import {planToday} from '../../domain/chordDojo/planner';
import {advance,skipTask,recordTempoRound,resetCursor,targetFor} from '../../domain/chordDojo/session';
import {ChordEntry,judgeChord,requiredCount,type Target} from '../../domain/chordDojo/judging';
import {progressionTarget} from '../../domain/chordDojo/progressionTarget';
import {emptyItem,dateKey,type DojoStore,type ItemRecord,type Task} from '../../domain/chordDojo/store';
import {CURRICULUM,NAMES,PRESETS,SUFFIX,shapeKey,pc,type Quality} from '../../domain/chordDojo/recipes';
import {BUILTINS,BUILTIN_GROUPS,builtinDisplayName,keyLabel} from '../../domain/chordDojo/builtins';
import {speedLimit} from '../../domain/chordDojo/progress';
import {Settings2,Star,Volume2} from "lucide-react";
import {usePlaybackState} from "../../hooks/usePlaybackState";
import {useMetronome} from '../../components/MetronomeProvider';
import {tempoPlan} from './tempo';
import {answerKeyboardRange} from './keyboardRange';
import {createLiveNoteState,reduceLiveNoteState,soundingNotes,heldNotes} from '../../domain/liveMidi';
import {DojoKeyGrid} from './DojoKeyGrid';
import {useDojoMidi} from './useDojoMidi';
import {MidiRequiredNotice} from '../../components/MidiRequiredNotice';
import {openMidiPanel} from '../../liveMidi/midiPanel';
import {compositionTiles,daysSincePractice,lastPracticedAt,individualShapeKeys} from './presentation';
import type {ProgressionVoicingTransport} from '../../practice/ProgressionVoicingTransport';
import {ChordCardMark,cardResult,useCardMoment,type ChordCardResult} from '../../components/practice/ChordCardResult';
import {DojoBackButton} from './DojoBackButton';
import {CHOICE_NAMES,HOME_BACK_LABEL,parentOf,placeKey,type DojoChoice,type DojoPlace} from './dojoNav';
import {candidateKeys,isLong,pickKey} from '../../domain/chordDojo/longProgression';
import './chord-dojo.css';
import './practiceTone.css';
const LABEL={new:'まだ',provisional:'仮の合格',passed:'合格','twelve-keys':'12キー習得'};
const STAGE={composition:'構成を知る',see:'① 見て弾く',recall:'② 名前だけで弾く',memorize:'② 覚えて弾く',tempo:'③ テンポで弾く'};
const FLOW=['復習','型を覚える','登録した音を覚える','進行で弾く'];
const CHOICES=CHOICE_NAMES;
type Choice=DojoChoice;
interface Props {ideas:readonly SongIdea[];initialTarget?:{ideaId:string;blockId:string};/** P22-03 §1: the Home's 「続きから」 resumes this remembered practice through the same `resumeRecent`. */initialRecent?:DojoRecentEntry;}
/** `total`: how many questions the current set has (the home shows 「済んだ数 / 全部」 on the current stop). */
type CourseHomeSummary={level:number;block:string;remaining:number;total?:number;label:string;levelText?:string;hint?:string;status?:"start"|"resume"|"done"};
let lastCourseHome:CourseHomeSummary|undefined;

/** P23-47-fix-4: a short read shows nothing; the words appear only when reading takes longer than 400ms. */
function DelayedLoading(){const [shown,setShown]=useState(false);useEffect(()=>{const timer=window.setTimeout(()=>setShown(true),400);return()=>window.clearTimeout(timer);},[]);return <p role="status" aria-busy="true" style={shown?undefined:{visibility:'hidden'}}>練習記録を読み込んでいます…</p>;}

export function ChordDojoView({ideas,initialTarget,initialRecent}:Props){
 const liveNotes=useStore(defaultLiveMidiStore,s=>s.notes);const heldPitchClasses=new Set(heldNotes(liveNotes).map(pc));
 const runtime=useStore(dojoStore);const {sound}=usePreviewSound();const {enabled:metronomeEnabled}=useMetronome();const musicalClock=useRef<ProgressionVoicingTransport>();
 const collection=useMemo(()=>collectVault(ideas,new Date().toISOString()),[ideas]);
 const [masterChoice,setMasterChoice]=useState<PracticeChoice>();
 const [file,setFile]=useState<DojoStore>(runtime.file),[screen,setScreen]=useState<'home'|'practice'|'finish'|'choose'|'master251'|'endless'|'ear'|'original'|'voicing-drill'>('home'),[endlessId,setEndlessId]=useState<string>(),[drillSetId,setDrillSetId]=useState<string>(),[originalCfg,setOriginalCfg]=useState<{id:string;shift:number;random?:boolean;key?:number;stage?:'see'|'recall'}>(),[choose,setChoose]=useState<Choice>('shape'),[practiceFrom,setPracticeFrom]=useState<Choice>();
 const [standardJump,setStandardJump]=useState<'original'|'jazz-progressions'|undefined>(),[earInitialView,setEarInitialView]=useState<'records'|undefined>(),[drillStart,setDrillStart]=useState<{key?:number;stage?:'see'|'recall';random?:boolean}>(),[drillStage,setDrillStage]=useState<1|2|3|4|undefined>();
 const [resultRaw,writeResult]=useState<{ok:boolean;message:string;sec?:number;self?:boolean;scope:string}>(),[visibleScope,writeVisible]=useState<string>(),[nameHintScope,setNameHintScope]=useState<string>(),[elapsed,setElapsed]=useState(0),[busy,setBusy]=useState(false),[tempoRunning,setTempoRunning]=useState(false),[tempoSummary,setTempoSummary]=useState<boolean[]>();
 const [cardReveal,setCardReveal]=useState<{scope:string;indices:number[]}>();const answerScopeRef=useRef('');const setResult=useCallback((value:{ok:boolean;message:string;sec?:number;self?:boolean}|undefined)=>writeResult(value?{...value,scope:answerScopeRef.current}:undefined),[]);const setVisible=useCallback((value:boolean)=>writeVisible(value?answerScopeRef.current:undefined),[]);
 const lessonFingering=useLessonFingeringOptions();
 const [history,setHistory]=useState<{name:string;ok:boolean;sec?:number;self:boolean}[]>([]),[settings,setSettings]=useState(false),[standardRoot,setStandardRoot]=useState(0);
 /** P22-01 §3-1-2: the list's random switch; only while the list is open (off again from the home). */
 const [listRandom,setListRandom]=useState(false);
 useEffect(()=>{if(screen==='home')setListRandom(false);},[screen]);
 /** P23-40: the guided course replaces the P23-38 single-session guide behind the same home card. */
 const [guideOpen,setGuideOpen]=useState(false);
 // P23-47-fix-4: the guide band shows the last known summary at once (kept for this app session) while it is read again.
 const [courseHome,setCourseHomeState]=useState<CourseHomeSummary|undefined>(()=>lastCourseHome);
 const setCourseHome=(next:CourseHomeSummary)=>{lastCourseHome=next;setCourseHomeState(next);};
 const guideReturnFocus=useRef(false);
 useEffect(()=>{if(guideOpen)return;let active=true;const basicRepo=new CourseRepository(createCourseStorage());const advancedRepo=new AdvancedRepository(createAdvancedStorage());void Promise.all([basicRepo.load(),advancedRepo.load()]).then(([basic,advanced])=>{if(!active)return;const basicLevel=basic.kind==='unreadable'?1:currentCourseLevel(basic.store);if(basicLevel<4){const summary=basic.kind==='unreadable'?undefined:courseSummary(basic.store,new Date());const plan=basic.kind==='unreadable'?undefined:coursePlan(basic.store,new Date());const started=basic.kind!=='unreadable'&&basic.store.trials.length>0;const total=plan?.kind==='question'?plan.total:summary&&summary.remaining>0?summary.remaining:undefined;setCourseHome({level:basicLevel,block:summary?.block??'sameDay',remaining:summary?.remaining??0,...(total!==undefined?{total}:{}),label:summary?.label??`Lv${basicLevel}`,levelText:`Lv${basicLevel}`,hint:started?'続きから':'最初の響き C を見本で聴けます',status:started?'resume':'start'});return;}if(advanced.kind==='unreadable'){setCourseHome({level:4,block:'sameDay',remaining:0,label:'高度コースの保存データを読めません',levelText:'Lv4',hint:'ガイド練習で確認してください',status:'start'});return;}const home=advancedHomeSummary(advanced.store);const activeTotal=home.status==='resume'?advanced.store.attempts.find(attempt=>attempt.attemptId===advanced.store.active)?.itemIds.length:home.status==='start'&&home.remaining>0?home.remaining:undefined;setCourseHome({level:home.level===undefined||home.level==='capstone'?8:home.level,block:'sameDay',remaining:home.remaining,...(activeTotal!==undefined?{total:activeTotal}:{}),label:home.label,levelText:home.levelText,hint:home.status==='resume'?'続きから':home.status==='done'?'自由練習で続けられます':'最初の見本を聴けます',status:home.status});}).catch(()=>{});return()=>{active=false;};},[guideOpen]);
 useEffect(()=>{if(guideOpen||!guideReturnFocus.current)return;guideReturnFocus.current=false;const frame=requestAnimationFrame(()=>document.querySelector<HTMLElement>('[data-focus-key="home:guide:open"]')?.focus());return()=>cancelAnimationFrame(frame);},[guideOpen]);
 // P18-01 Stage 2: 「この段階をくり返す」 (a practice begun from the list: the first value is off, remembered per screen kind),
 // the lap counts of the two stages (counted on this screen, never saved), the end-of-lap choice of ② (くり返す off) and
 // its note (くり返す on). A ② round begun with もう一度 is practice: it moves the cards and records nothing.
 const [repeatA,writeRepeatA]=useState(()=>readRepeatSetting('a')),repeatARef=useRef(false);repeatARef.current=repeatA;
 const [stageLaps,writeStageLaps]=useState({see:0,recall:0}),stageEnteredRef=useRef({see:false,recall:false});
 const [recallStop,writeRecallStop]=useState(false),recallStopRef=useRef(false);
 const [passNote,writePassNote]=useState<string>();
 const repeatRecallRef=useRef(false),recordedRecallRef=useRef(false);
 const toggleRepeatA=()=>writeRepeatA(r=>{writeRepeatSetting('a',!r);return !r;});
 const tempoTarget=useRef<Target>();
 const latest=useRef(file),currentScreen=useRef(screen),promptAt=useRef(performance.now()),entry=useRef<ChordEntry>(),releaseGate=useRef(true),rawNotes=useRef(structuredClone(defaultLiveMidiStore.getState().notes)),automaticTransition=useRef(false),consumedResult=useRef<object>(),feedbackAt=useRef(0),tempoMatch=useRef(false),tempoValues=useRef<boolean[]>([]),outside=useRef<DojoStore['today']>(),outsideActive=useRef(false),outsideMatches=useRef(0),targetHandled=useRef('');
 const recentRemembered=useRef(false),practiceFromRef=useRef<Choice|undefined>(practiceFrom);practiceFromRef.current=practiceFrom;
 latest.current=file;currentScreen.current=screen;
 const {view,resetAudio,prepareAudio,connected,connectionKey,audioState,retryAudio}=useDojoMidi(guideOpen||screen==='home'||screen==='practice');
 // P14 5.1: a practice that started with MIDI (or while it was still connecting) waits for MIDI when it drops; it never turns into self-rating by itself.
 const midiSession=useRef(false),previousScreen=useRef(screen),[selfChosen,setSelfChosen]=useState(false);
 if(screen!=='practice')midiSession.current=false;else if(connected)midiSession.current=true;else if(previousScreen.current!=='practice')midiSession.current=view.busy;
 useEffect(()=>{previousScreen.current=screen;if(screen!=='practice')setSelfChosen(false);},[screen]);
 const waiting=screen==='practice'&&midiSession.current&&!connected&&!selfChosen;const manual=!connected&&!waiting;const previousConnection=useRef(connectionKey);
 const today=file.today,cursor=today?.cursor,task=today?.tasks[cursor?.taskIndex??0];
 const target=useMemo(()=>task&&today?targetFor(file,task,collection.progressions):undefined,[file,task,today,collection.progressions]);
 const key=cursor?`${cursor.taskIndex}:${cursor.stage}:${cursor.keyIndex}:${cursor.chordIndex}`:'';
 const answerScope=screen+':'+key+':'+(task?.key??'')+':'+snapshotRevision(target?.target.notes??[]);answerScopeRef.current=answerScope;const result=resultRaw?.scope===answerScope?resultRaw:undefined,visible=visibleScope===answerScope,nameHint=nameHintScope===answerScope;
 const record=task?itemFor(file,task):undefined;
 const partialProgression=task?isPartialProgression(file,task,collection.progressions):false;
 // P5.26.2-03: what the card says about the last judgement. The moment goes away by itself; the cleared mark stays for the round.
 const moment=useCardMoment(useMemo(()=>result?cardResult(result.ok,Boolean(result.self)):undefined,[result]));
 const [cleared,setCleared]=useState<{scope:string;sources:Record<number,'midi'|'self'>}>({scope:'',sources:{}});
 const clearScope=`${task?.key}:${cursor?.keyIndex}`;
 const clearedResult=(i:number):ChordCardResult=>cardResult(true,cleared.scope===clearScope&&cleared.sources[i]==='self');
 // P12.5-01: which cards of this pass had a hint or a miss, and of the pass before it. A display only: it never decides a clear.
 const lapRef=useRef({scope:'',seen:new Set<number>(),missed:new Set<number>(),prevSeen:new Set<number>(),prevMissed:new Set<number>(),last:0});
 const [,lapTick]=useState(0);
 const lapMark=useCallback((kind:'seen'|'missed',index:number)=>{if(!lapRef.current.scope||lapRef.current[kind].has(index))return;lapRef.current[kind].add(index);lapTick(n=>n+1);},[]);
 const policy=answerPolicy({kind:'dojo',stage:cursor?.stage??'',active:screen==='practice',compositionIntroduction:task?.kind!=='composition',hint:visible,feedback:result?(result.ok?'success':'wrong'):undefined,tempoRunning});const showAnswer=policy.answer;
 const playback=usePlaybackState();
 // P12.3 5: the card that is sounding now (derived from the shared playback state, so it can never get stuck).
 const playingCardIndex=(playback.status==='starting'||playback.status==='playing')&&playback.source?.kind==='practice'&&playback.source.id.startsWith('chord-dojo:card:')?Number(playback.source.id.split(':')[2]):undefined;
 const answerPlaying=(playback.status==='starting'||playback.status==='playing')&&playback.source?.id==='chord-dojo:answer';
 const cardScope=`${task?.key}:${cursor?.stage}:${cursor?.keyIndex}:${cursor?.chordIndex}`;
 const revealed=cardReveal?.scope===cardScope?cardReveal.indices:[];
 const keyboardAnswerVisible=showAnswer||playingCardIndex!==undefined;
 const fingerChords=useMemo(()=>!target||target.frozen?[]:target.chords.length?target.chords:[{chord:target.target.chord,notes:[...target.target.notes],beats:4}],[target]);
 const fingerPlans=useDojoFingering(fingerChords,file.settings.progBpm);
 const fingerPlan=useMemo(()=>target?.frozen?frozenDisplay(target.frozen.chord):fingerPlans[task?.kind==='progression'?cursor?.chordIndex??0:0],[target?.frozen,fingerPlans,task?.kind,cursor?.chordIndex]);
 const snapshot=useMemo(()=>target?targetSnapshot(target.frozen?.targetId??answerScope,target.target.chord,target.target.notes,fingerPlan,today?.lesson?.source.keyContext,target.target.judge==='composition'):undefined,[target,fingerPlan,answerScope,today?.lesson?.source.keyContext]);const cardSnapshot=useMemo(()=>{if(playingCardIndex===undefined||!target)return undefined;const c=target.chords[playingCardIndex];if(!c)return undefined;return targetSnapshot(`${answerScope}:card:${playingCardIndex}`,c.chord,c.notes,target.frozen?frozenDisplay(c):fingerPlans[playingCardIndex],today?.lesson?.source.keyContext,false);},[playingCardIndex,target,answerScope,fingerPlans,today?.lesson?.source.keyContext]);const visibleSnapshot=cardSnapshot??(showAnswer?snapshot:undefined);
 const fingerLabels=useMemo(()=>snapshotFingerLabels(visibleSnapshot),[visibleSnapshot]);
 const keyboardRange=answerKeyboardRange(visibleSnapshot?.midiNotes??[],keyboardAnswerVisible);
 // A practice begun from the list of 定番の進行 has the common frame of the four practice screens (the practice begun from today's plan keeps its own).
 const fromList=screen==='practice'&&practiceFrom==='builtin-progressions'&&task?.kind==='progression';
 // P18-01 Stage 2: a long progression (9 chords or more) keeps its own end screen (dojo-keydone); the ② end of this work does not take its place.
 const longKey=Boolean(task&&task.kind==='progression'&&task.key.startsWith('builtin:')&&BUILTINS.find(x=>x.id===task.key.split(':')[1]&&isLong(x)));
 const frameRange=answerKeyboardRange(target?target.chords.flatMap(c=>c.notes):[],true);
 const frame=usePracticeLayout(whiteKeysIn(frameRange.minMidiNote,frameRange.maxMidiNote),target?.chords.length??4);
 const commit=useCallback(async(next:DojoStore)=>{setFile(next);latest.current=next;setBusy(true);if(outsideActive.current&&outside.current){outside.current={...outside.current,matched:outside.current.matched+Math.max(0,(next.today?.matched??0)-outsideMatches.current)};outsideMatches.current=next.today?.matched??0;}const saved=outsideActive.current?{...next,today:outside.current}:next;await dojoStore.getState().save(saved);setBusy(false);},[]);
 useEffect(()=>{void runtime.initialize();},[runtime.initialize]);
 useEffect(()=>{if(!runtime.ready)return;const prepared={...runtime.file,today:runtime.file.today&&!runtime.file.today.lesson?planToday(runtime.file,collection.progressions,new Date()):runtime.file.today};const synced=syncVault(prepared,collection,new Date().toISOString());synced.today=planToday(synced,collection.progressions,new Date());setFile(synced);latest.current=synced;void dojoStore.getState().save(synced);},[runtime.ready,collection]);
 useEffect(()=>()=>{playbackController.stop();musicalClock.current?.stop();},[]);
 const resetAttempt=useCallback(()=>{if(tempoRunning&&tempoTarget.current)return;setResult(undefined);setVisible(false);setNameHintScope(undefined);setElapsed(0);promptAt.current=performance.now();entry.current=target?new ChordEntry(requiredCount(target.target),file.settings.settleMs):undefined;releaseGate.current=soundingNotes(rawNotes.current).length===0;tempoMatch.current=false;},[target,file.settings.settleMs,tempoRunning]);
 useEffect(()=>{resetAttempt();},[key,screen]);
 useEffect(()=>{if(previousConnection.current===connectionKey)return;previousConnection.current=connectionKey;tempoTarget.current=undefined;rawNotes.current=connected?structuredClone(defaultLiveMidiStore.getState().notes):createLiveNoteState();setTempoSummary(undefined);setTempoRunning(false);musicalClock.current?.stop();tempoMatch.current=false;tempoValues.current=[];if(!result)resetAttempt();},[connectionKey,resetAttempt,result]);
 const start=useCallback(async()=>{recentRemembered.current=false;setPracticeFrom(undefined);prepareAudio();const next=structuredClone(latest.current);if(!next.today||next.today.finished)next.today=planToday(next,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true});const at=new Date().toISOString();if(next.today.lesson)next.today.lesson=freezeLessonDisplay(next.today.lesson,at,lessonFingering.options,lessonFingering.preferences,next.settings.progBpm);if(next.today.legacyTargets)next.today.legacyTargets=freezeLegacyDisplay(next.today.legacyTargets,lessonFingering.options,lessonFingering.preferences,next.settings.progBpm);next.today.startedAt??=at;const date=dateKey(new Date()),used=new Set(next.reviewJournal?.date===date?next.reviewJournal.keys:[]);for(const t of next.today.tasks.filter(t=>t.review))used.add(t.kind+':'+t.key);next.reviewJournal={date,keys:[...used]};await commit(next);setScreen(next.today.finished?'finish':'practice');},[commit,collection.progressions,prepareAudio,lessonFingering]);
 const one=useCallback(async(t:Task,from?:Choice,base?:DojoStore)=>{recentRemembered.current=false;prepareAudio();setPracticeFrom(from);writeStageLaps({see:0,recall:0});stageEnteredRef.current={see:true,recall:false};repeatRecallRef.current=false;recordedRecallRef.current=false;recallStopRef.current=false;writeRecallStop(false);writePassNote(undefined);const source=base??latest.current;if(t.kind==='shape')t={...t,roots:individualShapeKeys(source,t.key,new Date())};outside.current=source.today;outsideActive.current=true;outsideMatches.current=0;const next=structuredClone(source);next.today={date:new Date().toLocaleDateString('en-CA'),tasks:[t],cursor:{taskIndex:0,stage:'see',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};resetCursor(next,0);setFile(next);setScreen('practice');},[prepareAudio]);
 const openChoose=(choice:Choice)=>{setChoose(choice);setScreen('choose');};
 const openStandard=()=>{setStandardJump(undefined);openChoose('builtin-progressions');};
 const openJazzList=()=>{setStandardJump('jazz-progressions');openChoose('builtin-progressions');};
 const openOriginalList=()=>{setStandardJump('original');openChoose('builtin-progressions');};
 const openMaster=(choice?:PracticeChoice)=>{setMasterChoice(choice);prepareAudio();setScreen('master251');};
 const openEar=(records?:boolean)=>{setEarInitialView(records?'records':undefined);prepareAudio();setScreen('ear');};
 const openDrill=(stage?:1|2|3|4)=>{setDrillStage(stage);openChoose('voicing-drill');};
 const openWanted=(task:Task)=>{void one(task,task.kind==='shape'?'shape':task.kind==='voicing'?'voicing':'saved-progressions');};
 const recentHandled=useRef<DojoRecentEntry|undefined>(undefined);
 useEffect(()=>{if(!runtime.ready||!initialRecent||recentHandled.current===initialRecent)return;recentHandled.current=initialRecent;resumeRecent(initialRecent);},[runtime.ready,initialRecent]);
 const resumeRecent=(entry:DojoRecentEntry)=>{switch(entry.kind){
  case 'standard':{const builtin=BUILTINS.find(b=>b.id===entry.id);if(!builtin)return;if(entry.random){setEndlessId(entry.id);setScreen('endless');}else void one({kind:'progression',key:`builtin:${entry.id}:1`,review:false,roots:[entry.key??0],seconds:120},'builtin-progressions');return;}
  case 'jazz':setOriginalCfg({id:entry.id,shift:0,random:entry.random,key:entry.key,stage:entry.stage});setScreen('original');return;
  case 'original':setOriginalCfg({id:entry.id,shift:entry.key??0});setScreen('original');return;
  case 'master':setMasterChoice(entry.master as PracticeChoice|undefined);prepareAudio();setScreen('master251');return;
  case 'ear':setEarInitialView(undefined);prepareAudio();setScreen('ear');return;
  case 'drill':setDrillSetId(entry.id);setDrillStart({key:entry.key,stage:entry.stage,random:entry.random});setScreen('voicing-drill');return;
  case 'saved':{const p=collection.progressions.find(p=>p.key===entry.id);if(p)void one({kind:'progression',key:p.key,roots:[0],review:false,seconds:120},'saved-progressions');return;}
  case 'voicing':void one({kind:'voicing',key:entry.id,review:false,roots:[0],seconds:40},'voicing');return;
  case 'shape':{const shape=CURRICULUM.find(c=>shapeKey(c.quality,c.preset,c.bass)===entry.id);if(shape)void one({kind:'shape',key:entry.id,review:false,...shape,roots:[0,5,2],seconds:60},'shape');return;}
  case 'today':void start();return;
 }};
 const changeBudget=(minutes:number)=>{const policy=latest.current.settings.lessonPolicy;const next={...latest.current,settings:{...latest.current.settings,lessonPolicy:{budgetSeconds:minutes*60,reviewLimit:policy?.reviewLimit??6}}};next.today=planToday(next,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true});void commit(next);};
 const changeReviewLimit=(limit:number)=>{const policy=latest.current.settings.lessonPolicy;const next={...latest.current,settings:{...latest.current.settings,lessonPolicy:{budgetSeconds:policy?.budgetSeconds??900,reviewLimit:limit}}};next.today=planToday(next,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true});void commit(next);};
 useLayoutEffect(()=>{document.getElementById('main-content')?.scrollTo({top:0});},[screen]);
 useEffect(()=>{if(!runtime.ready||!initialTarget)return;const id=initialTarget.ideaId+':'+initialTarget.blockId;if(targetHandled.current===id)return;const p=collection.progressions.find(p=>p.ideaId===initialTarget.ideaId&&p.blockId===initialTarget.blockId);if(p){targetHandled.current=id;void one({kind:'progression',key:p.key,roots:[0],review:false,seconds:120});}},[runtime.ready,initialTarget,collection.progressions,one]);
 const hear=useCallback(async(reveal=true)=>{if(!target)return;writePassNote(undefined);if(reveal&&(cursor?.stage==='recall'||cursor?.stage==='tempo')){const next=structuredClone(latest.current);next.today!.cursor.answerSeen=true;if(cursor?.stage==='recall'&&!manual)lapMark('seen',next.today!.cursor.chordIndex);await commit(next);setVisible(true);}try{await playbackController.play({kind:'practice',id:'chord-dojo:answer'},{type:'chord',chord:target.target.chord,sound,explicitMidiNotes:target.target.notes});}catch{setResult({ok:false,message:'お手本を再生できません。鍵盤の答えを確認してください'});}},[target,cursor?.stage,commit,sound,lapMark,manual]);
 const reveal=useCallback(async()=>{const next=structuredClone(latest.current);if(!next.today)return;writePassNote(undefined);next.today.cursor.answerSeen=true;writePassNote(undefined);if(next.today.cursor.stage==='recall'&&!manual)lapMark('seen',next.today.cursor.chordIndex);await commit(next);setVisible(true);},[commit,lapMark,manual]);
 // P12.3 5: a progression card is a button. A name that is visible, or already revealed by pressing, is not a hint.
 const cardFullSeen=(i:number)=>!tempoSummary&&Boolean(cursor)&&(policy.theme||showAnswer&&i===cursor!.chordIndex);
 const cardSeen=(i:number)=>cardFullSeen(i)||!tempoSummary&&nameHint&&i===cursor?.chordIndex||revealed.includes(i);
 // P12.5-01: small flags on a card (a miss in this pass; a hint or a miss in the pass before). A display only.
 const lapFlags=(i:number)=>{const lap=lapRef.current,flags=[lap.missed.has(i)?'ミス':'',lap.prevSeen.has(i)?'前回ヒント':'',lap.prevMissed.has(i)?'前回ミス':''].filter(Boolean);return flags.length?<span className="dojo-card-flags" data-testid="dojo-card-flags">{flags.map(f=><i key={f} data-flag={f}>{f}</i>)}</span>:null;};
 const lapBand=Boolean(recallStop||fromList&&cursor?.stage==='memorize');
 const lapNote=cursor?.stage==='recall'&&(lapRef.current.prevSeen.size>0)?<p className="dojo-lap-note" role="status" data-testid="dojo-lap-note">前の周でヒントを見たカードに印があります。ヒントなしで最後まで通すとクリアです</p>:null;
 const cardDegree=(i:number)=>{const b=task?.key.startsWith('builtin:')?BUILTINS.find(b=>b.id===task.key.split(':')[1]):undefined;return b?b.fullDegrees[i]:target?.chords[i]?.degree;};
 const playCard=async(i:number)=>{
  if(!target||!cursor||!task)return;const c=target.chords[i];if(!c)return;
  if(cursor.stage==='tempo'&&tempoRunning)return;
  const hidden=!cardSeen(i)&&!(cursor.stage==='recall'&&i<cursor.chordIndex);
  if(cursor.stage==='recall'&&!tempoSummary&&hidden){
   setCardReveal({scope:cardScope,indices:[...revealed,i]});
   const next=structuredClone(latest.current);const cur=next.today!.cursor;if(!cur.hints.includes(i))cur.hints.push(i);if(i===cur.chordIndex){cur.answerSeen=true;setVisible(true);}await commit(next);
  }else if(cursor.stage==='tempo'&&!tempoSummary){const next=structuredClone(latest.current);next.today!.cursor.answerSeen=true;await commit(next);setVisible(true);}
  try{await playbackController.play({kind:'practice',id:`chord-dojo:card:${i}`},{type:'chord',chord:c.chord,sound,explicitMidiNotes:c.notes});}catch{setResult({ok:false,message:'お手本を再生できません。鍵盤の答えを確認してください'});}
 };
 const wanted=useCallback(async(t=task)=>{if(!t||t.kind==='composition')return;const next=structuredClone(latest.current),map=t.kind==='shape'?next.shapes:t.kind==='voicing'?next.voicings:next.progressions;if(!map[t.key])map[t.key]=emptyItem();map[t.key].wanted=!map[t.key].wanted;await commit(next);},[task,commit]);
 const submit=useCallback(async(ok:boolean,message:string,sec?:number,self=manual)=>{if(busy||!task||!cursor||result)return;
  if(!recentRemembered.current){recentRemembered.current=true;const from=practiceFromRef.current;
   if(task.kind==='progression'&&from==='builtin-progressions')rememberRecent({kind:'standard',id:task.key.split(':')[1]!,key:task.roots[0]??0,random:false});
   else if(task.kind==='progression'&&from==='saved-progressions'){rememberRecent({kind:'saved',id:task.key});const p=collection.progressions.find(p=>p.key===task.key);if(p)recordPracticeOpen({ideaId:p.ideaId,blockId:p.blockId},'chord-dojo');}
   else if(from==='shape')rememberRecent({kind:'shape',id:task.key});
   else if(from==='voicing')rememberRecent({kind:'voicing',id:task.key});
   else if(task.kind==='progression'&&from===undefined&&outsideActive.current&&task.key.startsWith('vault:'))rememberRecent({kind:'saved',id:task.key});
   else rememberRecent({kind:'today',id:'today'});}
  writePassNote(undefined);if(cursor.stage==='tempo'&&tempoRunning){if(ok)tempoMatch.current=true;return;}sec=cursor.answerSeen?undefined:sec;feedbackAt.current=performance.now();setResult({ok,message,sec,self});if(!ok&&cursor.stage==='recall'&&task.kind==='progression')lapMark('missed',cursor.chordIndex);if(ok){const scope=`${task.key}:${cursor.keyIndex}`;setCleared(c=>({scope,sources:{...(c.scope===scope?c.sources:{}),[cursor.chordIndex]:self?'self':'midi'}}));}setVisible(true);setHistory(h=>[...h,{name:target?.target.chord.label??'',ok,sec,self}]);if(!ok&&!repeatRecallRef.current){await commit(advance(latest.current,{ok:false,self,at:new Date().toISOString(),sec},collection.progressions));}},[busy,task,cursor,result,manual,tempoRunning,target,commit,collection.progressions]);
 const next=useCallback(async()=>{if(!task||!cursor||busy)return;if(result&&!result.ok){resetAttempt();return;}
  // P18-01 Stage 2: at the ② end (くり返す off) Enter goes on to the finish screen, as the flow has always done.
  // P23-59-fix-3: only from the question itself (no result on screen). A second call with the answer that set the stop
  // (the automatic step while the save is still going, on a slow machine) must not skip the question.
  if(recallStopRef.current&&!result){recallStopRef.current=false;writeRecallStop(false);setScreen('finish');return;}
  if(cursor.stage==='memorize'){const f=structuredClone(latest.current);f.today!.cursor.stage='recall';f.today!.cursor.chordIndex=f.today!.cursor.retryRange?.[0]??0;f.today!.cursor.answerSeen=false;if(fromList){// P18-01 Stage 2: whatever way ② is entered, a day that has recorded its clean pass once goes on with practice rounds.
   if(recordedRecallRef.current)repeatRecallRef.current=true;if(stageEnteredRef.current.recall)writeStageLaps(s=>({...s,recall:s.recall+1}));else stageEnteredRef.current.recall=true;}await commit(f);return;}if(!result)return;
  // One answer moves the cursor once. The timer of the automatic step (and a key press) can call this again with the screen of the answer that was already taken, before the screen has been drawn again (a slow machine): that call is dropped.
  const live=latest.current.today?.cursor;if(consumedResult.current===result||!live||live.taskIndex!==cursor.taskIndex||live.stage!==cursor.stage||live.keyIndex!==cursor.keyIndex||live.chordIndex!==cursor.chordIndex)return;consumedResult.current=result;
  // P18-01 Stage 2: a ② round begun with もう一度 is practice: it moves the cards and records nothing (today has the first pass already).
  if(repeatRecallRef.current&&cursor.stage==='recall'){
   const count=target?.chords.length??0,clean=!cursor.hints.length&&!cursor.answerSeen,f=structuredClone(latest.current),c=f.today!.cursor;
   if(cursor.chordIndex+1>=count){
    c.chordIndex=0;c.hints=[];c.answerSeen=false;
    if(clean&&repeatARef.current){writeStageLaps(s=>({...s,recall:s.recall+1}));writePassNote('② をヒントなしで通しました');}
    else if(!clean){writeStageLaps(s=>({...s,recall:s.recall+1}));writePassNote(undefined);}
    else{recallStopRef.current=true;writeRecallStop(true);}
   }else c.chordIndex=cursor.chordIndex+1;
   try{await commit(f);}catch(error){consumedResult.current=undefined;throw error;}
   setResult(undefined);setVisible(false);
   return;
  }
  const f=advance(latest.current,{ok:true,self:result.self??manual,at:new Date().toISOString(),sec:result.sec,recordedTempo:cursor.stage==='tempo'&&Boolean(tempoSummary?.length)},collection.progressions);
  // P18-01 Stage 2 (a practice begun from the list): the end of ① (くり返す on continues ① at once) and the clean pass of ②
  // (the record is written here, once: くり返す on goes on as a practice round, off stops here to ask). A long progression
  // keeps its own end screen (dojo-keydone) instead.
  const count=target?.chords.length??0;
  if(fromList&&cursor.stage==='recall'&&cursor.chordIndex===count-1&&f.today!.cursor.chordIndex===0&&!f.today!.cursor.retryRange&&!longKey){
   if(f.today!.finished){
    recordedRecallRef.current=true;
    if(repeatARef.current){f.today!.finished=false;const c=f.today!.cursor;c.taskIndex=0;c.chordIndex=0;c.hints=[];c.answerSeen=false;repeatRecallRef.current=true;writeStageLaps(s=>({...s,recall:s.recall+1}));writePassNote('② をヒントなしで通しました');}
    else{recallStopRef.current=true;writeRecallStop(true);f.today!.cursor.taskIndex=0;}
    try{await commit(f);}catch(error){consumedResult.current=undefined;throw error;}
    setResult(undefined);setVisible(false);
    return;
   }
   writeStageLaps(s=>({...s,recall:s.recall+1}));writePassNote(undefined);
  }
  if(fromList&&cursor.stage==='see'&&cursor.chordIndex===count-1&&f.today!.cursor.stage==='memorize'){
   if(repeatARef.current){f.today!.cursor.stage='see';f.today!.cursor.answerSeen=false;writeStageLaps(s=>({...s,see:s.see+1}));}
   try{await commit(f);}catch(error){consumedResult.current=undefined;throw error;}
   setResult(undefined);setVisible(false);
   return;
  }
  try{await commit(f);}catch(error){consumedResult.current=undefined;throw error;}if(!f.today!.finished&&f.today!.cursor.taskIndex===cursor.taskIndex&&f.today!.cursor.stage===cursor.stage&&f.today!.cursor.keyIndex===cursor.keyIndex&&f.today!.cursor.chordIndex===cursor.chordIndex)resetAttempt();else {setResult(undefined);setVisible(false);}if(f.today!.finished)setScreen('finish');},[task,cursor,busy,result,resetAttempt,commit,manual,collection.progressions,connected,tempoSummary,fromList,longKey,target]);
 // P18-01 Stage 2: the presses of the stages on the top row (A begun from the list): they move to the head of that stage.
 const goToStage=useCallback((stage:'see'|'recall')=>{
  if(!task||!cursor||busy)return;
  playbackController.stop();setResult(undefined);setVisible(false);setNameHintScope(undefined);writePassNote(undefined);
  recallStopRef.current=false;writeRecallStop(false);
  if(stage==='recall')repeatRecallRef.current=repeatRecallRef.current||recordedRecallRef.current;else repeatRecallRef.current=false;
  const f=structuredClone(latest.current),c=f.today!.cursor;
  // P18-01 Stage 2: from the ② end the task looks finished (the pass was recorded); a stage press goes on practising, as もう一度 does.
  f.today!.finished=false;c.taskIndex=0;
  c.stage=stage;c.chordIndex=0;c.answerSeen=false;c.hints=[];
  if(stage==='see'){if(stageEnteredRef.current.see)writeStageLaps(s=>({...s,see:s.see+1}));else stageEnteredRef.current.see=true;}
  else if(stageEnteredRef.current.recall)writeStageLaps(s=>({...s,recall:s.recall+1}));else stageEnteredRef.current.recall=true;
  void commit(f);
 },[task,cursor,busy,commit]);
 // P18-01 Stage 2: もう一度 ① を弾く (R) at the ① end (the memorize stop of a practice begun from the list).
 const repeatSee=useCallback(async()=>{
  if(!task||!cursor)return;
  playbackController.stop();setResult(undefined);setVisible(false);setNameHintScope(undefined);writePassNote(undefined);
  const f=structuredClone(latest.current),c=f.today!.cursor;
  c.stage='see';c.chordIndex=0;c.answerSeen=false;c.hints=[];
  writeStageLaps(s=>({...s,see:s.see+1}));
  await commit(f);
 },[task,cursor,commit]);
 // P18-01 Stage 2: もう一度 ② を弾く (R) at the ② end: a round of practice that records nothing (today has the first pass already).
 const startRepeatRecall=useCallback(async()=>{
  if(!task||!cursor)return;
  playbackController.stop();setResult(undefined);setVisible(false);setNameHintScope(undefined);writePassNote(undefined);
  repeatRecallRef.current=true;recallStopRef.current=false;writeRecallStop(false);
  const f=structuredClone(latest.current),c=f.today!.cursor;
  f.today!.finished=false;c.taskIndex=0;c.stage='recall';c.chordIndex=0;c.answerSeen=false;c.hints=[];
  writeStageLaps(s=>({...s,recall:s.recall+1}));
  await commit(f);
 },[task,cursor,commit]);
 // P18-01 Stage 2: the R key at the two lap ends (the same rule as Enter and L: not while typing or in a dialog).
 const againRound=useCallback(()=>{if(recallStopRef.current)void startRepeatRecall();else if(cursor?.stage==='memorize'&&fromList)void repeatSee();},[cursor?.stage,fromList,startRepeatRecall,repeatSee]);
 useEffect(()=>{
  const eligible=()=>screen==='practice'&&!manual&&connected&&Boolean(target&&cursor)&&cursor?.stage!=='memorize'&&!result;
  const arm=()=>{const current=tempoRunning?tempoTarget.current:target?.target;entry.current=current?new ChordEntry(requiredCount(current),file.settings.settleMs):undefined;promptAt.current=performance.now();setElapsed(0);};
  const unsubscribe=liveMidiService.subscribeBatches(batch=>{for(const e of batch.events){
   rawNotes.current=reduceLiveNoteState(rawNotes.current,e);
   if(!eligible())continue;if((busy||automaticTransition.current)&&cursor?.stage!=='tempo'){releaseGate.current=false;continue;}
   if(!releaseGate.current){releaseGate.current=soundingNotes(rawNotes.current).length===0;if(releaseGate.current)arm();continue;}
   const status=e.status&240;if(status!==128&&status!==144)continue;entry.current?.event(e.channel,e.data1,status===144&&e.data2>0,performance.now()-Math.max(0,(batch.events[batch.events.length-1]?.timestampMs??e.timestampMs)-e.timestampMs));
  }});
  const timer=setInterval(()=>{const current=tempoRunning?tempoTarget.current:target?.target;if(!eligible()||!current||!cursor)return;if((busy||automaticTransition.current)&&cursor.stage!=='tempo')return;
   if(!releaseGate.current&&soundingNotes(rawNotes.current).length===0){releaseGate.current=true;arm();}
   const response=entry.current?.poll(performance.now());if(response){const r=judgeChord(current,response.notes);if(cursor.stage==='tempo'&&tempoRunning){if(r.ok)tempoMatch.current=true;entry.current=new ChordEntry(requiredCount(current),file.settings.settleMs);releaseGate.current=soundingNotes(rawNotes.current).length===0;}else void submit(r.ok,r.message,Math.max(0,(response.lastOnMs-promptAt.current)/1000),false);}
  },10);return()=>{unsubscribe();clearInterval(timer);};
 },[screen,manual,connected,target,cursor,result,tempoRunning,file.settings.settleMs,submit,busy]);
 useEffect(()=>{if(screen!=='practice'||manual||!result||result.self!==false||busy||cursor?.stage==='tempo')return;const timer=setInterval(()=>{if(performance.now()-feedbackAt.current<450||soundingNotes(rawNotes.current).length||automaticTransition.current)return;automaticTransition.current=true;void next().finally(()=>{automaticTransition.current=false;});},20);return()=>clearInterval(timer);},[screen,manual,result,busy,cursor?.stage,next]);

 useEffect(()=>{if(screen!=='practice'||result||waiting)return;const timer=setInterval(()=>{const sec=(performance.now()-promptAt.current)/1000;setElapsed(sec);if(!today?.lesson&&task?.kind==='progression'&&cursor?.stage==='recall'&&sec>=file.settings.hintSec&&!visible&&!nameHint){const f=structuredClone(latest.current);f.today!.cursor.answerSeen=true;if(!f.today!.cursor.hints.includes(cursor.chordIndex))f.today!.cursor.hints.push(cursor.chordIndex);setNameHintScope(answerScopeRef.current);void commit(f);}},100);return()=>clearInterval(timer);},[screen,result,waiting,task,cursor,today?.lesson,file.settings.hintSec,visible,nameHint,commit]);
 // P12.4-01: leaving a practice. A clear that is judged but not yet recorded (it is recorded when the next card is
 // asked for) is written out first, so a clear is never lost by going back. Sound, metronome and tempo stop; MIDI stays connected.
 // The control that opened a screen gets the focus back when that screen is left.
 const lastTrigger=useRef<string>(),lastFallback=useRef<string>(),originFocus=useRef<Record<string,string>>({}),originFocusFallback=useRef<Record<string,string>>({}),pendingFocus=useRef<string>(),pendingFocusFallback=useRef<string>();
 /** Where the list of 定番の進行 was scrolled to when each of its buttons was pressed (by focus key): coming back puts it there again (the other places open at their top). */
 const scrollAtPress=useRef<Record<string,number>>({});
 const place:DojoPlace=screen==='choose'?{screen:'choose',choose}:screen==='practice'?{screen:'practice',from:practiceFrom}:screen==='finish'?{screen:'finish',from:practiceFrom}:screen==='voicing-drill'?{screen:'voicing-drill',setId:drillSetId??''}:{screen};
 const currentPlace=useRef(place),endlessIdRef=useRef(endlessId);currentPlace.current=place;endlessIdRef.current=screen==='original'?originalCfg?.id:endlessId;
 const pendingClear=useRef<()=>DojoStore|undefined>(()=>undefined),flushedFor=useRef('');
 pendingClear.current=()=>{if(screen!=='practice'||!task||!cursor||!result?.ok||cursor.stage==='memorize'||tempoRunning||repeatRecallRef.current||recallStopRef.current||recordedRecallRef.current)return undefined;return advance(latest.current,{ok:true,self:result.self??manual,at:new Date().toISOString(),sec:result.sec,recordedTempo:cursor.stage==='tempo'&&Boolean(tempoSummary?.length)},collection.progressions);};
 const leave=useCallback(async(to:DojoPlace={screen:'home'})=>{
  resetAudio();setNameHintScope(undefined);setVisible(false);setTempoSummary(undefined);setTempoRunning(false);musicalClock.current?.stop();playbackController.stop();
  const pending=pendingClear.current();
  if(pending&&flushedFor.current!==answerScopeRef.current){flushedFor.current=answerScopeRef.current;await commit(pending);}
  setResult(undefined);
  const key=placeKey(currentPlace.current,endlessIdRef.current);pendingFocus.current=originFocus.current[key];pendingFocusFallback.current=originFocusFallback.current[key];
  if(to.screen==='choose')setChoose(to.choose);
  setScreen(to.screen==='practice'?'home':to.screen);
  if(outsideActive.current){outsideActive.current=false;setFile({...dojoStore.getState().file,today:outside.current});}
 },[resetAudio,commit]);
 const stop=useCallback(()=>{void leave();},[leave]);
 // Leaving Chord Dojo from outside (the sidebar, closing the window) is a leave too: a judged clear is not lost.
 useEffect(()=>()=>{
  const pending=pendingClear.current();if(!pending||flushedFor.current===answerScopeRef.current)return;
  const saved=outsideActive.current&&outside.current?{...pending,today:{...outside.current,matched:outside.current.matched+Math.max(0,(pending.today?.matched??0)-outsideMatches.current)}}:pending;
  void dojoStore.getState().save(saved);
 },[]);
 const goBack=useCallback(()=>{const parent=parentOf(currentPlace.current);if(parent)void leave(parent.place);},[leave]);
 const goBackRef=useRef(goBack);goBackRef.current=goBack;

 const toggleTempo=useCallback(async()=>{if(!task||!target)return;if(tempoRunning){setTempoRunning(false);return;}tempoValues.current=[];tempoMatch.current=false;setNameHintScope(undefined);setVisible(false);setTempoSummary(undefined);setResult(undefined);const f=structuredClone(latest.current);f.today!.cursor.chordIndex=0;f.today!.cursor.tempoResults=[];await commit(f);if(defaultLiveMidiStore.getState().status==='connected'&&currentScreen.current==='practice')setTempoRunning(true);},[task,target,tempoRunning,commit]);
 useEffect(()=>{if(!tempoRunning||!target||!task)return;let active=true;const chords=target.chords,total=chords.reduce((n,c)=>n+c.beats,0);let index=0;
  const armTempo=()=>{tempoTarget.current=progressionTarget(chords[index],task.key);entry.current=new ChordEntry(requiredCount(tempoTarget.current),file.settings.settleMs);releaseGate.current=soundingNotes(rawNotes.current).length===0;};
  armTempo();
  const close=()=>{const candidate=entry.current,current=progressionTarget(chords[index],task.key);if(!manual&&candidate&&!candidate.done&&candidate.lastOnMs!==undefined&&candidate.snapshot.length>=requiredCount(current)&&judgeChord(current,candidate.snapshot).ok)tempoMatch.current=true;tempoValues.current.push(tempoMatch.current);tempoMatch.current=false;};
  try{const clock=tempoPlan(chords,file.settings.progBpm);musicalClock.current=clock.transport;void clock.transport.start({...clock,bpm:file.settings.progBpm,countInBars:0,metronomeEnabled,referenceSoundEnabled:false,sound,onTransportBeat:beat=>{
   if(!active)return;let nextIndex=0,end=chords[0].beats;while(beat>=end-1e-6&&nextIndex+1<chords.length){nextIndex++;end+=chords[nextIndex].beats;}
   while(index<nextIndex){close();index++;armTempo();const f=structuredClone(latest.current);f.today!.cursor.chordIndex=index;void commit(f);}
   if(beat>=total-1e-6){close();active=false;clock.transport.stop();setTempoRunning(false);setTempoSummary([...tempoValues.current]);const f=recordTempoRound(latest.current,{results:tempoValues.current,self:manual,at:new Date().toISOString()});void commit(f);const ok=tempoValues.current.every(Boolean);setResult({ok,message:`${tempoValues.current.filter(Boolean).length}/${chords.length} 合いました`,self:manual});setHistory(h=>[...h,{name:target.name,ok,self:manual}]);}
  }}).catch(()=>{if(active){setTempoRunning(false);setResult({ok:false,message:'テンポの練習を開始できません。もう一度お試しください'});}});}
  catch{setTempoRunning(false);setResult({ok:false,message:'この進行はテンポでの練習に対応していません。'});}
  return()=>{active=false;tempoTarget.current=undefined;musicalClock.current?.stop();};
 },[tempoRunning]);
 useEffect(()=>{musicalClock.current?.setMetronomeEnabled(metronomeEnabled);},[metronomeEnabled]);

 const skip=useCallback(async()=>{if(!task||busy)return;const f=skipTask(latest.current,new Date().toISOString(),result?.ok&&!(cursor?.stage==='tempo'&&tempoSummary?.length)?{self:result.self??manual}:undefined,collection.progressions);await commit(f);if(f.today?.finished)setScreen('finish');},[task,commit,result,manual,busy,cursor?.stage,tempoSummary,collection.progressions]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{
  // P23-35: while the guide is open its own keys apply; the normal practice keys must not move its
  // cursor or write anything behind it.
  if(guideOpen)return;
  if(screen==='master251'||screen==='endless'||screen==='ear'||screen==='original'||screen==='voicing-drill')return;
  // P12.4-01: Esc steps one level outward: a panel that is open closes first, otherwise it is the back button. The top does nothing.
  if(e.key==='Escape'){if(e.repeat||document.querySelector('[role=dialog]')||(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea')))return;if(screen==='home')return;e.preventDefault();if(settings){setSettings(false);return;}const records=document.querySelector('.dojo-practice-records[open]');if(records){records.removeAttribute('open');return;}goBackRef.current();return;}
  if(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea,button,a,summary,[contenteditable=true],[role=region][tabindex]'))return;if(document.querySelector('[role=dialog]')||e.isComposing||e.repeat)return;const k=e.key.toLowerCase();if(k==='enter'){e.preventDefault();if(screen==='home')return;void next();}else if(screen==='practice'){if(k==='s')void wanted();if(k==='l')void hear();if(k===' '){e.preventDefault();if(cursor?.stage==='tempo'&&!manual)toggleTempo();else void reveal();}if(manual&&showAnswer&&k==='y')void submit(true,'合いました（自分で判定）',undefined,true);if(manual&&showAnswer&&k==='n')void submit(false,'答えを見て、もう一度（自分で判定）',undefined,true);if(fromList&&k==='r')void againRound();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[screen,start,next,stop,wanted,hear,reveal,manual,showAnswer,submit,cursor,toggleTempo,settings,againRound,fromList,guideOpen]);
 // The pass boundary: when the pass starts over after a hint or a miss, what was marked becomes the "last time" marks.
 useEffect(()=>{
  const lap=lapRef.current,scope=`${task?.key}:${cursor?.keyIndex}`;
  if(screen!=='practice'||task?.kind!=='progression'||cursor?.stage!=='recall'){if(lap.scope){lapRef.current={scope:'',seen:new Set(),missed:new Set(),prevSeen:new Set(),prevMissed:new Set(),last:0};lapTick(n=>n+1);}return;}
  if(lap.scope!==scope){lapRef.current={scope,seen:new Set(),missed:new Set(),prevSeen:new Set(),prevMissed:new Set(),last:cursor.chordIndex};lapTick(n=>n+1);return;}
  for(const index of cursor.hints)lap.seen.add(index);
  if(cursor.chordIndex===0&&lap.last>0&&(lap.seen.size||lap.missed.size)){lap.prevSeen=new Set(lap.seen);lap.prevMissed=new Set(lap.missed);lap.seen=new Set();lap.missed=new Set();}
  lap.last=cursor.chordIndex;lapTick(n=>n+1);
 },[screen,task?.key,task?.kind,cursor?.keyIndex,cursor?.stage,cursor?.chordIndex,cursor?.hints.length]);
 // Which control opened this place, and giving it the focus back when we are returned to its parent (without moving the page: it opens at its top).
 useEffect(()=>{if(lastTrigger.current){const key=placeKey(currentPlace.current,endlessIdRef.current);originFocus.current[key]=lastTrigger.current;if(lastFallback.current)originFocusFallback.current[key]=lastFallback.current;else delete originFocusFallback.current[key];lastTrigger.current=undefined;lastFallback.current=undefined;}},[screen,choose,endlessId,originalCfg]);
 useEffect(()=>{const key=pendingFocus.current,fallback=pendingFocusFallback.current;if(!key&&!fallback)return undefined;pendingFocus.current=undefined;pendingFocusFallback.current=undefined;let stopWatch:(()=>void)|undefined;const frame=requestAnimationFrame(()=>{const find=(candidate?:string)=>candidate?document.querySelector<HTMLElement>(`[data-focus-key="${candidate}"]`):null;const button=find(key)??find(fallback)??document.querySelector<HTMLElement>("[data-focus-key=\"home:resume:go\"]")??document.querySelector<HTMLElement>(".dojo-home-p20 [data-focus-key]");if(!button)return;button.focus({preventScroll:true});const saved=scrollAtPress.current[key??fallback??""];if(saved!==undefined)stopWatch=restoreScroll(button,saved);});return()=>{cancelAnimationFrame(frame);stopWatch?.();};},[screen,choose]);
 const grids=(r?:ItemRecord,current?:number)=><DojoKeyGrid record={r} limit={speedLimit(file)} current={current}/>;
 const qualityName=(quality:string)=>quality==='maj'?'メジャー':quality==='min'?'マイナー':SUFFIX[quality as Quality]??quality;
 const shapeTitle=(t:Task)=>`${t.review?NAMES[t.roots[0]??0]:''}${t.review?SUFFIX[t.quality as Quality]??t.quality:qualityName(t.quality??'maj')}`;
 const title=(t:Task)=>t.kind==='shape'?`${shapeTitle(t)}・${PRESETS[t.preset??'basic']}`:t.kind==='voicing'?today?.lesson?.targets.find(x=>x.taskKey===t.key)?.chord.chord.label??file.voicings[t.key]?.occurrences.slice(-1)[0]?.harmony.symbol??'登録した音':t.kind==='composition'?`${NAMES[t.roots[0]??0]}${SUFFIX[t.quality as Quality]??t.quality}`:(()=>{const b=BUILTINS.find(b=>t.key.split(':')[1]===b.id);return b?builtinDisplayName(b):undefined;})()??(today?.lesson?.source.key===t.key?today.lesson.source.name:undefined)??collection.progressions.find(p=>p.key===t.key)?.name??'進行';
 const origin=(t:Task)=>{if(screen==='practice'&&!policy.theme)return '';const v=t.kind==='voicing'?file.voicings[t.key]?.occurrences.slice(-1)[0]:undefined;const p=collection.progressions.find(p=>p.key===t.key||p.blockId===v?.progressionId);const idea=ideas.find(i=>i.id===p?.ideaId||i.progressionBlocks?.some(b=>b.id===v?.progressionId));const block=idea?.progressionBlocks?.find(b=>b.id===(p?.blockId??v?.progressionId));return [idea?.title,block?.memo?.trim()].filter(Boolean).join('・');};
 const groupFor=(t:Task)=>t.review?0:t.kind==='shape'?1:t.kind==='voicing'?2:3;
 const detail=(t:Task)=>t.kind==='shape'?`${PRESETS[t.preset??'basic']}${t.review?'':`・${t.bass==='external'?'ベースは別のパート':'ベースは自分で'}`}`:t.kind==='composition'?'構成を思い出す':origin(t);
 const star=(t=task)=>t&&t.kind!=='composition'?<button className="dojo-star dojo-chip" aria-label="使いたい" aria-pressed={Boolean(itemFor(file,t)?.wanted)} onClick={()=>void wanted(t)}><Star size={16} aria-hidden="true" fill={itemFor(file,t)?.wanted?"currentColor":"none"}/>使いたい</button>:null;
 const taskFromKey=(kind:Task['kind'],key:string):Task=>{const shape=CURRICULUM.find(c=>shapeKey(c.quality,c.preset,c.bass)===key);return {kind,key,review:false,roots:[0],seconds:60,...(kind==='shape'?shape:{})};};
 const wantedItems=[...Object.entries(file.shapes).map(([key,value])=>({t:taskFromKey('shape',key),value})),...Object.entries(file.voicings).map(([key,value])=>({t:taskFromKey('voicing',key),value})),...Object.entries(file.progressions).filter(([,v])=>!v.missingSince).map(([key,value])=>({t:taskFromKey('progression',key),value}))].filter(i=>i.value.wanted).sort((a,b)=>(lastPracticedAt(a.value)??'').localeCompare(lastPracticedAt(b.value)??''));
 const isComposition=cursor?.stage==='composition'||task?.kind==='composition';
 const freshQuality=task?.kind==='shape'&&!task.review&&(!file.knownQualities[task.quality!]?.at||dateKey(new Date(file.knownQualities[task.quality!].at))===today?.date);
 const stages=task?.kind==='composition'?[{stage:'composition',label:'構成を思い出す'}]:task?.kind==='progression'?[{stage:'see',label:STAGE.see},{stage:'recall',label:'② 覚えて弾く'},{stage:'tempo',label:STAGE.tempo}]:[...(freshQuality?[{stage:'composition',label:STAGE.composition}]:[]),{stage:'see',label:STAGE.see},{stage:'recall',label:STAGE.recall}];
 const stageIndex=stages.findIndex(s=>s.stage===(cursor?.stage==='memorize'?'recall':cursor?.stage));
 const homeShape=today?.tasks.find(t=>t.kind==='shape');const sourceChanged=Boolean(today?.lesson?.source.kind==='vault'&&(!collection.progressions.some(p=>p.key===today.lesson!.source.key&&snapshotRevision(progressionInRange(p,today.lesson!.source.range))===today.lesson!.revision)));const unavailableLegacy=Boolean(today?.legacyTargets&&task&&!target?.target.notes.length);
 // P12.4-03: a long progression (8 bars or more) played through from the list ends with a short result — it never goes on to another key by itself.
 const keyDone=screen==='finish'&&outsideActive.current&&today&&today.tasks.length===1&&today.tasks[0]!.kind==='progression'&&today.tasks[0]!.key.startsWith('builtin:')?(()=>{const b=BUILTINS.find(x=>x.id===today.tasks[0]!.key.split(':')[1]);return b&&isLong(b)?{builtin:b,task:today.tasks[0]!}:undefined;})():undefined;
  const barProgress=(()=>{if(!task||task.kind!=='progression'||!cursor)return undefined;const p=collection.progressions.find(x=>x.key===task.key);if(!p)return undefined;const range=task.range,bars=progressionEntriesInRange(p,range).map(e=>e.bar),start=range?.startBar??p.range?.startBar??1,end=range?.endBar??p.range?.endBar??bars[bars.length-1]??start,bar=bars[cursor.chordIndex];return bar===undefined?undefined:{current:bar-start+1,total:Math.max(1,end-start+1)};})();
 const playKeyAgain=(next:'same'|'omakase')=>{
  if(!keyDone)return;
  const base={...dojoStore.getState().file,today:outside.current} as DojoStore;outsideActive.current=false;setFile(base);
  const recorded=new Set(Object.keys(base.progressions[keyDone.task.key]?.keys??{}).map(Number));
  const key=next==='same'?keyDone.task.roots[0]!:pickKey(candidateKeys(keyDone.builtin.practiceKeys),recorded,keyDone.task.roots[0],Math.random());
  void one({...keyDone.task,roots:[key]},practiceFrom,base);
 };
 // The card being played stays in view when a long form wraps onto more rows than fit.
 useEffect(()=>{if(screen!=='practice'||task?.kind!=='progression')return;document.querySelector('.dojo-chord-cards>button[data-current=true]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});},[screen,task?.kind,cursor?.chordIndex]);
 if(screen==='original'&&originalCfg){const back=()=>{const focusKey=placeKey({screen:'original'},originalCfg.id);pendingFocus.current=originFocus.current[focusKey];pendingFocusFallback.current=originFocusFallback.current[focusKey];setFile(dojoStore.getState().file);latest.current=dojoStore.getState().file;setChoose('builtin-progressions');setScreen('choose');};return isJazzProgressionId(originalCfg.id)?<JazzPracticeView key={originalCfg.id} progressionId={originalCfg.id} random={originalCfg.random} initialKey={originalCfg.key} initialStage={originalCfg.stage} onBack={back}/>:<OriginalPracticeView key={originalCfg.id} originalId={originalCfg.id} shift={originalCfg.shift} onBack={back}/>;}
 if(screen==='endless'&&endlessId)return <ChordDojoEndlessView builtinId={endlessId} onBack={()=>{const focusKey=placeKey({screen:'endless'},endlessId);pendingFocus.current=originFocus.current[focusKey];pendingFocusFallback.current=originFocusFallback.current[focusKey];setChoose('builtin-progressions');setScreen('choose');}}/>;
 if(screen==='voicing-drill'&&drillSetId)return <VoicingDrillPracticeView key={drillSetId} setId={drillSetId} initialKey={drillStart?.key} initialStage={drillStart?.stage} initialRandom={drillStart?.random} onBack={()=>{setChoose('voicing-drill');setScreen('choose');}}/>;
 if(screen==='ear')return <EarPracticeView ideas={ideas} initialView={earInitialView} onExit={()=>{pendingFocus.current='home:ear:start';pendingFocusFallback.current='home:resume:go';setScreen('home');}}/>;
 if(screen==='master251')return <Master251View initialChoice={masterChoice} onExit={()=>{pendingFocus.current=originFocus.current[placeKey({screen:'home'})]??'master:continue';pendingFocusFallback.current=originFocusFallback.current[placeKey({screen:'home'})]??'home:standard:open';setFile(dojoStore.getState().file);latest.current=dojoStore.getState().file;setScreen('home');}}/>;
 if(!runtime.ready||!today)return <section className="dojo">{runtime.error?<p role="status">{runtime.error}</p>:<DelayedLoading/>}{runtime.error?<button onClick={()=>void runtime.initialize()}>もう一度</button>:null}</section>;
 const homeWanted=wantedItems.map(({t,value})=>({task:t,label:title(t),days:daysSincePractice(value,new Date())}));
 const homeShapeRecord=homeShape?file.shapes[homeShape.key]:undefined;
 const homeShapeLabel=homeShape?title({...homeShape,review:false}):'弱いキー';
 const homePlanRows=FLOW.map((name,index)=>({name,tasks:today.tasks.filter(t=>groupFor(t)===index).map(t=>({key:t.key,label:title(t),detail:detail(t)}))}));
 const homeStartLabel=today.finished?'新しいテーマで始める':today.startedAt||today.cursor.taskIndex||today.cursor.stage!=='composition'&&today.matched?'続きから始める':'始める';
 const budgetMinutes=Math.round((file.settings.lessonPolicy?.budgetSeconds??900)/60);
 const reviewLimit=file.settings.lessonPolicy?.reviewLimit??6;
 const budgetDisabled=Boolean(today.startedAt&&!today.finished);
 // P23-35: a guided session is a screen of its own. It is opened before the ordinary `one()` path,
 // so nothing here writes today/cursor/taskResults; the normal engine is not entered at all.
 if(guideOpen)return <section className="dojo" data-testid="practice-layout" data-dojo-screen="guided-course"><GuidedCourseView settleMs={file.settings.settleMs} onExit={()=>{guideReturnFocus.current=true;setGuideOpen(false);}}/></section>;
 return <section className="dojo" data-testid="practice-layout" data-practice-frame={fromList?'a':undefined} onClickCapture={e=>{const key=(e.target as HTMLElement).closest?.('[data-focus-key]')?.getAttribute('data-focus-key');const fallback=(e.target as HTMLElement).closest?.('[data-focus-fallback]')?.getAttribute('data-focus-fallback');if(key){lastTrigger.current=key;lastFallback.current=fallback??undefined;const target=e.target as HTMLElement,scroller=target.closest('.dojo-builtin-page')?scrollerOf(target):undefined;if(scroller)scrollAtPress.current[key]=scroller.scrollTop;else delete scrollAtPress.current[key];}}} data-dojo-screen={screen} data-dojo-midi-audio={audioState} data-dojo-cursor={key} data-dojo-midi-mode={manual?'self':'midi'} data-midi-kind={view.kind}>
 {audioState==='error'?<p className="dojo-notice" role="alert">入力のピアノ音を開始できませんでした。入力の判定は続けられます。<button onClick={retryAudio}>入力音をもう一度</button></p>:null}
 {runtime.error?<p className="dojo-notice" role="alert">{runtime.error}<button onClick={()=>void commit(latest.current)}>保存をもう一度</button></p>:null}{runtime.recovered?<p className="dojo-notice" role="status">バックアップから練習記録を戻しました。</p>:null}
 {sourceChanged&&screen!=='home'&&screen!=='choose'&&screen!=='practice'?<p className="dojo-notice" role="status">元の進行が変更または削除されています。この練習は開始時に固定した音で続けます。</p>:null}{unavailableLegacy?<p className="dojo-notice">以前の目標音を復元できません。記録を残して、新しいテーマを組み直せます。<button onClick={()=>void commit({...latest.current,today:planToday(latest.current,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true})})}>新しいテーマを組み直す</button></p>:null}{screen==='home'?<DojoHome sourceChanged={sourceChanged} file={file} today={today} progressions={collection.progressions} connected={connected} midiBusy={view.busy} midiError={view.error} wanted={homeWanted} shapeRecord={homeShapeRecord} homeShapeLabel={homeShapeLabel} keyLimit={speedLimit(file)} planRows={homePlanRows} startLabel={homeStartLabel} budgetMinutes={budgetMinutes} reviewLimit={reviewLimit} budgetDisabled={budgetDisabled} startToday={()=>void start()} onStandard={openStandard} onJazz={openJazzList} onOriginal={openOriginalList} onMaster={openMaster} onEar={openEar} onDrill={openDrill} onSaved={()=>openChoose('saved-progressions')} onVoicing={()=>openChoose('voicing')} onShape={()=>openChoose('shape')} onWanted={openWanted} onResume={resumeRecent} onChangeBudget={changeBudget} onChangeReviewLimit={changeReviewLimit} course={courseHome} onGuide={()=>setGuideOpen(true)}/>:null}
 {screen==='choose'&&choose==='builtin-progressions'?<BuiltinProgressionList root={standardRoot} onRoot={setStandardRoot} random={listRandom} onRandom={setListRandom} stateLabel={t=>LABEL[itemFor(file,t)?.state??'new']} recordOf={t=>itemFor(file,t)} keyLimit={speedLimit(file)} themeDisabled={Boolean(today.startedAt&&!today.finished)} onBack={goBack} onPractice={t=>void one(t,'builtin-progressions')} onEndless={id=>{setEndlessId(id);setScreen('endless');}} onOriginal={(id,shift)=>{setOriginalCfg({id,shift});setScreen('original');}} onJazz={(id,random)=>{setOriginalCfg({id,shift:0,random});setScreen('original');}} onTheme={t=>{const next={...latest.current,today:planToday(latest.current,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true,preferredKey:t.key,standardKey:t.roots[0]})};void commit(next);setScreen('home');}} jumpTo={standardJump}/>:screen==='choose'&&choose==='voicing-drill'?<VoicingDrillListView onBack={goBack} initialStage={drillStage} onOpen={id=>{setDrillStart(undefined);setDrillSetId(id);setScreen('voicing-drill');}}/>:screen==='choose'?<div className="dojo-choose-page"><div className="dojo-page-head"><DojoBackButton label={HOME_BACK_LABEL} onBack={goBack}/><h1>{CHOICES[choose]}</h1></div>{choose==='voicing'&&wantedItems.length?<section className="dojo-wanted-home" data-testid="wanted-home-list"><h2>使いたい <small>{wantedItems.length}件</small></h2><div>{wantedItems.map(({t,value})=><button type="button" key={t.key} data-testid="wanted-home-item" onClick={()=>openWanted(t)}><span>{title(t)}</span><small>{daysSincePractice(value,new Date())===0?'今日':`${daysSincePractice(value,new Date())}日前`}</small></button>)}</div></section>:null}<div className={choose==='saved-progressions'?'dojo-saved-empty':'dojo-list'}>{(choose==='shape'?CURRICULUM.map(c=>({kind:'shape' as const,key:shapeKey(c.quality,c.preset,c.bass),review:false,...c,roots:[0,5,2],seconds:60})):choose==='voicing'?Object.keys(file.voicings).filter(k=>file.voicings[k].occurrences.length).map(key=>({kind:'voicing' as const,key,review:false,roots:[0],seconds:40})):[] as Task[]).map(t=><article className="dojo-card" key={t.key}><h2>{title(t)}</h2><span className="dojo-badge">{LABEL[itemFor(file,t)?.state??'new']}</span>{t.kind==='shape'?grids(itemFor(file,t)):null}<button data-focus-key={`practice:${t.key}`} onClick={()=>void one(t,choose)}>これを練習する</button>{t.kind==='progression'?<button disabled={Boolean(today.startedAt&&!today.finished)} onClick={()=>{const next={...latest.current,today:planToday(latest.current,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true,preferredKey:t.key,standardKey:t.roots[0]})};void commit(next);setScreen('home');}}>今日のテーマにする</button>:null}</article>)}</div>{choose==='saved-progressions'?<SavedProgressionList progressions={collection.progressions} stateLabel={key=>LABEL[file.progressions[key]?.state??'new']} themeBusy={Boolean(today.startedAt&&!today.finished)} onPractice={t=>void one(t,choose)} onTheme={t=>{const next={...latest.current,today:planToday(latest.current,collection.progressions,new Date(),{forceNew:true,replaceLegacy:true,preferredKey:t.key,standardKey:t.roots[0]})};void commit(next);setScreen('home');}}/>:null}{choose==='saved-progressions'&&!collection.progressions.length?<p>自分の進行はまだありません。Vaultに進行を保存すると、ここから練習できます。定番の進行は、Chord Dojoに戻って「定番の進行」から選べます。</p>:null}{choose==='voicing'&&!Object.values(file.voicings).some(v=>v.occurrences.length)?<p>登録した音はまだありません。進行ページで保存した音・元MIDI・カスタムを使ったコードがここに出ます。</p>:null}</div>:null}
 {fromList&&task&&cursor&&target?(()=>{
  const builtin=BUILTINS.find(b=>task.key.split(':')[1]===b.id),group=BUILTIN_GROUPS.find(g=>builtin&&g.ids.includes(builtin.id));
  const aStages:StageItem[]=[{num:'①',name:'見て弾く',state:cursor.stage==='see'?'on':'idle',onSelect:()=>void goToStage('see')},{num:'②',name:'覚えて弾く',state:cursor.stage==='recall'||cursor.stage==='memorize'?'on':'idle',onSelect:()=>void goToStage('recall')},{num:'③',name:'テンポで弾く',state:cursor.stage==='tempo'?'on':'off',title:'③ は覚えた次の日の復習で出ます'}];
  return <div className="dojo-practice dojo-endless" ref={frame.ref} data-practice-layout={frame.layout.kind} style={frame.style}>
  <PracticeHead backLabel={parentOf(place)?.label??HOME_BACK_LABEL} onBack={goBack} kind={group?.name??'定番の進行'} title={builtin?builtinDisplayName(builtin):`進行の練習（${target.chords.length}コード）`} degrees={builtin?.fullDegrees.join('–')}
   stages={aStages} progressLabel="この練習の進み具合"
   progress={cursor.stage==='memorize'?<span data-testid="dojo-progress-lap">① <em>{stageLaps.see+1}</em>周目</span>:<span data-testid="dojo-progress-lap">{cursor.stage==='see'?'①':'②'} <em>{(cursor.stage==='recall'?stageLaps.recall:stageLaps.see)+1}</em>周目 · <em>{cursor.chordIndex+1}/{target.chords.length}</em></span>}/>
  <div className="dojo-endless-center">
   {waiting?<MidiRequiredNotice view={view} heading={view.kind==='error'?'MIDI 接続でエラーが起きました。':undefined} description="MIDI が外れました。つなぎ直すと、この課題から続けます。"><button onClick={()=>setSelfChosen(true)}>自分で判定に切り替える</button></MidiRequiredNotice>:null}
   <PracticeConditions className="dojo-jazz-bar" help={STAFF_HELP}>
    <span className="dojo-practice-key">キー<b>{keyLabel(task.roots[0]??0,builtin?.mode??'major')}</b></span>
    <span className="dojo-practice-pill">{target.target.judge==='exact'?(target.chords[cursor.chordIndex]?.source?'保存した音・元の音域で':'表示された音・同じ音域で'):'構成とベースが合えばよい（転回は自由）'}</span>
    {star()}
    <RepeatToggle on={repeatA} onToggle={toggleRepeatA} testId="dojo-repeat"/>
    <button className="dojo-settings-button" aria-expanded={settings} aria-label="練習の設定" onClick={()=>setSettings(!settings)}><Settings2 size={16} aria-hidden="true"/></button>
    {settings?<label className="dojo-settings">BPM <input type="number" min="30" max="240" value={file.settings.progBpm} disabled={tempoRunning} onChange={e=>{const value=Number(e.target.value);if(value>=30&&value<=240)void commit({...file,settings:{...file.settings,progBpm:value}});}}/></label>:null}
   </PracticeConditions>
   <div className="dojo-chord-cards dojo-endless-cards">{target.chords.map((c,i)=>{
    const fn=degreeFunctionKinds(target.chords.map((_c,j)=>cardDegree(j)??''),builtin?.mode??'major')[i];
    const fullSeen=cardFullSeen(i),seen=cardSeen(i),degree=fullSeen?cardDegree(i):undefined,done=!tempoSummary&&cursor.stage==='recall'&&i<cursor.chordIndex,hinted=!tempoSummary&&(cursor.hints.includes(i)||lapRef.current.seen.has(i));
    return <PracticeCard key={i} disabled={cursor.stage==='tempo'&&tempoRunning} label={seen?`${c.chord.label}${degree?`（${degree}）`:''}を聴く`:done?`${i+1}番目のコードを聴く`:`${i+1}番目のコードをヒントとして聴く`} onPress={()=>void playCard(i)}
     state={done||(cursor.stage==='see'&&i<cursor.chordIndex)?'done':cursor.chordIndex===i?'current':'todo'} hint={hinted} playing={playingCardIndex===i}
     extra={{'data-current':cursor.chordIndex===i,'data-result':tempoSummary?(tempoSummary[i]?'ok':'ng'):undefined,'data-hidden':!seen||undefined,'data-moment':!tempoSummary&&i===cursor.chordIndex&&moment.state!=='idle'?moment.state:undefined}}
     degree={degree??i+1} name={seen?c.chord.label:'?'} status={hinted?'ヒント':undefined} fn={fn?.kind||undefined} fnBorrowed={fn?.borrowedDominant}
     mark={!tempoSummary&&i===cursor.chordIndex&&moment.state!=='idle'?<ChordCardMark result={moment} layer="moment" corner/>:tempoSummary?<ChordCardMark result={cardResult(Boolean(tempoSummary[i]),false)} layer="set" corner/>:done?<ChordCardMark result={clearedResult(i)} layer="set" corner/>:null}
     flags={lapFlags(i)}/>;})}</div>
   {/* P22-01 §4-1: result → guide → actions; §4-5: the end of a lap (① from the list, ② without hints) is the band. */}
   <PracticeResult className="dojo-response" testId={tempoSummary?'dojo-tempo-result':undefined}>{lapBand
    ?<PracticeLap summary={<div className="dojo-result" role="status" data-ok={tempoSummary?tempoSummary.every(Boolean):result?.ok} data-partial={tempoSummary&&tempoSummary.some(Boolean)&&!tempoSummary.every(Boolean)||undefined}>{tempoSummary?`${tempoSummary.filter(Boolean).length}/${tempoSummary.length} 合いました`:result?`${result.ok?'✓':'✗'} ${result.message}`:fromList&&cursor.stage==='memorize'?<>① を1周弾きました<small>覚えたら ② へ。手が追いつかなければ、もう一度 ① を弾けます</small></>:recallStop?<>② をヒントなしで通しました — 仮の合格<small>記録はこの1回だけ。もう一度弾いても記録は増えません</small></>:passNote?<>② をヒントなしで通しました</>:nameHint&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目は ${target.target.chord.label} です。最初には戻らず続けます`:visible&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目：${target.target.chord.label} · 最初には戻らず続けます`:null}</div>}>
     {recallStop?<><button className="dojo-primary" data-testid="dojo-again-recall" onClick={()=>void startRepeatRecall()} {...keyed('もう一度 ② を弾く','R')}/><button data-testid="dojo-finish-enter" onClick={()=>{recallStopRef.current=false;writeRecallStop(false);setScreen('finish');}} {...keyed('終わる','Enter')}/></>:<><button className="dojo-primary" data-testid="dojo-again-see" disabled={busy} onClick={()=>void repeatSee()} {...keyed('もう一度 ① を弾く','R')}/><button disabled={busy} onClick={()=>void next()} {...keyed('② 覚えて弾くへ','Enter')}/></>}
     <button onClick={goBack}>一覧へ</button>
    </PracticeLap>
    :<div className="dojo-feedback-row">{!manual&&!isComposition&&(task.kind==='shape'||task.kind==='voicing')&&cursor.stage==='recall'?<div className="dojo-timer" aria-label="経過秒数">{result?result.ok&&result.sec!==undefined?`${result.sec.toFixed(1)}s`:'':`${elapsed.toFixed(1)}s`}</div>:null}<div className="dojo-result" role="status" data-ok={tempoSummary?tempoSummary.every(Boolean):result?.ok} data-partial={tempoSummary&&tempoSummary.some(Boolean)&&!tempoSummary.every(Boolean)||undefined}>{tempoSummary?`${tempoSummary.filter(Boolean).length}/${tempoSummary.length} 合いました`:result?`${result.ok?'✓':'✗'} ${result.message}`:fromList&&cursor.stage==='memorize'?<>① を1周弾きました<small>覚えたら ② へ。手が追いつかなければ、もう一度 ① を弾けます</small></>:recallStop?<>② をヒントなしで通しました — 仮の合格<small>記録はこの1回だけ。もう一度弾いても記録は増えません</small></>:passNote?<>② をヒントなしで通しました</>:nameHint&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目は ${target.target.chord.label} です。最初には戻らず続けます`:visible&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目：${target.target.chord.label} · 最初には戻らず続けます`:null}</div></div>}</PracticeResult>
   <PracticeGuide>{lapNote}{lapBand?null:<p className="dojo-practice-guide-line">{manual?showAnswer?'答えのとおりに弾いてみて、合っていたら「弾けた」':'頭の中で形を決めて、弾いてから「答えを見る」':isComposition?'構成の音を押してください（どの高さでも）':cursor.stage==='recall'?task.kind==='progression'?today.lesson?'頭から弾いてください。必要なら「答えを見る」で今のコードを確認できます':'頭から弾いてください。止まると、そのカードだけ名前が出ます':'答えは弾いた後に出ます':cursor.stage==='memorize'?'進行を覚えてください。覚えたら名前を隠して、頭から弾きます':cursor.stage==='tempo'?'隠したまま、テンポで弾きます':'鍵盤の答えを見ながら弾いてください'}</p>}</PracticeGuide>
   <PracticeActions>{cursor.stage==='memorize'&&!fromList?<button className="dojo-primary" disabled={busy} onClick={()=>void next()} {...keyed('覚えた','Enter')}/>:cursor.stage==='tempo'&&!manual?tempoSummary?<button className="dojo-primary" onClick={()=>{const f=advance(latest.current,{ok:tempoSummary.every(Boolean),self:result?.self??manual,at:new Date().toISOString(),recordedTempo:true},collection.progressions);void commit(f);setResult(undefined);setTempoSummary(undefined);if(f.today!.finished)setScreen('finish');}}>結果を確認して次へ</button>:<button className="dojo-primary" onClick={toggleTempo} {...keyed(tempoRunning?'止める':'テンポで始める','Space')}/>:result?<button className="dojo-primary" disabled={busy} onClick={()=>void next()} {...keyed(result.ok?'次へ':'もう一度','Enter')}/>:manual&&showAnswer?<><button className="dojo-primary" disabled={busy} onClick={()=>void submit(true,'合いました（自分で判定）')} {...keyed('弾けた','Y')}/><button disabled={busy} onClick={()=>void submit(false,'答えを見て、もう一度（自分で判定）')} {...keyed('まだ','N')}/></>:null}{!recallStop&&(cursor.stage!=='tempo'||manual)?<button onClick={()=>void hear()} {...keyed('お手本を聴く','L')}/>:null}{!recallStop&&!result&&(manual&&!showAnswer||!manual&&cursor.stage!=='memorize'&&cursor.stage!=='tempo'&&elapsed>speedLimit(file))?<button onClick={()=>void reveal()} {...keyed('答えを見る','Space')}/>:null}{cursor.stage==='recall'&&task.kind==='shape'?<button onClick={()=>void reveal()}>もう一度見る</button>:null}{tempoSummary&&!tempoSummary.every(Boolean)?tempoSummary.filter(ok=>!ok).length<=3?tempoSummary.map((ok,i)=>!ok?<button key={i} onClick={async()=>{const f=structuredClone(latest.current);f.today!.cursor.chordIndex=i;await commit(f);setVisible(true);}}>{i+1}番目の答えを見る</button>:null):<details className="dojo-tempo-result"><summary>一致しなかったコードを確認（{tempoSummary.filter(ok=>!ok).length}）</summary><div className="dojo-tempo-panel">{tempoSummary.map((ok,i)=>!ok?<button key={i} onClick={async()=>{const f=structuredClone(latest.current);f.today!.cursor.chordIndex=i;await commit(f);setVisible(true);}}>{i+1}番目の答えを見る</button>:null)}</div></details>:null}{!recallStop&&!(fromList&&cursor.stage==='memorize')?<button disabled={busy} onClick={()=>void skip()}>とばす</button>:null}</PracticeActions>
  </div>
 <GrandStaff quiet compact snapshot={visibleSnapshot} caption={cardSnapshot?`${cardSnapshot.chordSymbol} を聴いています`:undefined}/><div className="dojo-keyboard" style={{'--target-keyboard-width':`${Math.max(760,Math.ceil((keyboardRange.maxMidiNote-keyboardRange.minMidiNote+1)*7/12)*22)}px`,'--held-key-height':`${frame.layout.keyHeight}px`} as CSSProperties}><div className="dojo-keyboard-head"><b>鍵盤</b><span><i className="dojo-held-swatch"/>押している音</span><span><i className="dojo-answer-swatch"/>答え（弾いた後に出る）</span><span><i className="dojo-wrong-swatch"/>違う音</span><span><i className="dojo-missing-swatch"/>不足する音</span>{keyboardAnswerVisible&&(keyboardRange.minMidiNote<36||keyboardRange.maxMidiNote>84)?<p className="dojo-range-notice" data-testid="dojo-range-expanded">C2〜C6外の音も表示しています</p>:null}</div><PracticeKeyboard dojoHeight={frame.layout.keyHeight} markScale={frame.layout.markScale} fingerLabels={fingerLabels} leftHandGuideNotes={visibleSnapshot?.notes.filter(n=>n.hand==='left').map(n=>n.midi)??[]} rightHandGuideNotes={visibleSnapshot?.notes.filter(n=>n.hand==='right').map(n=>n.midi)??[]} appearance="dojo" hideLegend compactSummary octaveConvention="scientific" range={keyboardRange} guideNotes={visibleSnapshot?.midiNotes??[]} allowedPitchClasses={visibleSnapshot?.midiNotes.map(pc)??[]} requiredPitchClasses={visibleSnapshot?.midiNotes.map(pc)??[]} interactionMode={keyboardAnswerVisible?undefined:'neutral-monitor'} level={keyboardAnswerVisible?1:2} matchState={result?result.ok?'match':'wrong':'empty'} concealNoteNames={!keyboardAnswerVisible}/></div>
  <PracticeSafeArea/>
  </div>;})():null}
 {screen==='practice'&&!fromList&&task&&cursor&&target?<div className="dojo-practice"><div className="dojo-flow" role="group" aria-label="練習の流れ">{(()=>{const parent=parentOf(place);return parent?<DojoBackButton label={parent.label} onBack={goBack}/>:null;})()}{FLOW.map((name,i)=>{const tasks=today.tasks.filter(t=>groupFor(t)===i),current=i===groupFor(task),done=tasks.length>0&&tasks.every(t=>today.tasks.indexOf(t)<cursor.taskIndex);return <span className="dojo-flow-part" key={name}>{i?<span className="dojo-arrow">→</span>:null}<span className="dojo-flow-step" data-active={current||undefined} data-done={done||undefined}>{done?'✓ ':''}{name}{current?<em>{Math.max(1,tasks.findIndex(t=>t.key===task.key)+1)}/{tasks.length}</em>:null}</span></span>;})}<span className="dojo-flow-summary">{sourceChanged?<span role="status" className="dojo-source-status">変更前の音で練習中</span>:<>今日 合った {today.matched}・あと約 {Math.ceil(today.tasks.slice(cursor.taskIndex).reduce((n,t)=>n+t.seconds,0)/60)}分{barProgress?<>・小節 {barProgress.current}/{barProgress.total}</>:null}</>}</span><button onClick={e=>openMidiPanel(e.currentTarget)}>MIDI 設定</button><details className="dojo-practice-records"><summary>課題と練習の記録</summary><div className="dojo-record-panel">{sourceChanged?<><p className="dojo-notice" role="status">元の進行が変更または削除されています。この練習は開始時に固定した音で続けます。</p><p className="dojo-muted">今日 合った {today.matched}・あと約 {Math.ceil(today.tasks.slice(cursor.taskIndex).reduce((n,t)=>n+t.seconds,0)/60)}分</p></>:null}{task.kind==='progression'&&policy.theme?<p className="dojo-record-context">{target.name}</p>:null}{(cursor.stage==='see'||cursor.stage==='memorize')&&target.pointText?<p className="dojo-muted">今日のポイント：{target.pointText}</p>:null}{today.lesson?<p className="dojo-theme-practice" data-testid="dojo-theme-practice">{policy.theme?`${today.lesson.source.name} · ${today.lesson.source.keyContext??'元のキー'} · ${today.lesson.source.rangeLabel}`:`テーマ1 · ${today.lesson.source.rangeLabel}`}</p>:null}<div className="dojo-practice-right" role="region" aria-label="練習の記録"><div><h2>{partialProgression?'進行全体の習熟度':'この練習'} <small>{task.kind==='shape'?`${qualityName(task.quality!)}・${PRESETS[task.preset??'basic']}`:task.kind==='voicing'?'登録した音':task.kind==='composition'?'構成を思い出す':'進行・元のキー'}</small></h2>{task.kind==='progression'?<div className="dojo-progression-states"><div><span>覚えて弾く（②）</span><span className="dojo-badge" data-state={record?.provisionalAt?'provisional':'new'}>{record?.provisionalAt?'仮の合格':'まだ'}</span></div><div><span>テンポで弾く（③）</span><span className="dojo-badge" data-state={record?.state==='passed'?'passed':'new'}>{record?.state==='passed'?'合格':'まだ'}</span></div></div>:null}{task.kind==='shape'?grids(record,task.roots[cursor.keyIndex]):<p className="dojo-muted">{task.kind==='voicing'?`登録した音は元の音域で覚えます。同じ配置は1つの練習。${file.voicings[task.key]?.occurrences.length??0}か所に出てきた音。${origin(task)}`:task.kind==='composition'?'コードの種類の構成を、ときどき答えなしで思い出します。合えば間隔を空け、外したら明日もう一度。':'②で名前を出してもらわずに1周できたら仮の合格。名前が出ても最初には戻らず、その場で直して続け、その周はもう1周します。次の日以降に③（隠したままテンポ）で合格。自分の進行は元のキーで覚えます。'}</p>}{task.kind!=='progression'?<span className="dojo-badge">{LABEL[record?.state??'new']}</span>:null}</div><div><h2>今日の記録</h2><div className="dojo-log">{history.slice(-8).map((h,i)=><div key={i}><span>{!policy.theme?'—':h.name}</span><em data-ok={h.ok} data-self={h.self}>{h.ok?'✓':'✗'} {h.self?'自分で判定':h.sec===undefined?'':`${h.sec.toFixed(1)}s`}</em></div>)}{!history.length?<p className="dojo-muted">まだありません</p>:null}</div></div></div></div></details></div>{waiting?<MidiRequiredNotice view={view} heading={view.kind==='error'?'MIDI 接続でエラーが起きました。':undefined} description="MIDI が外れました。つなぎ直すと、この課題から続けます。"><button onClick={()=>setSelfChosen(true)}>自分で判定に切り替える</button></MidiRequiredNotice>:null}<article className="dojo-center">{task.kind==='progression'?<><h1 className="dojo-progression-title">{task.kind==='progression'&&!policy.theme?`進行の確認（${target.chords.length}コード）`:task.kind==='progression'?(()=>{const b=BUILTINS.find(b=>task.key.split(':')[1]===b.id);return b?builtinDisplayName(b):undefined;})()??`進行の練習（${target.chords.length}コード）`:target.target.chord.label}</h1>{(()=>{const b=policy.theme?BUILTINS.find(b=>task.key.split(':')[1]===b.id):undefined;return b?.title?<p className="dojo-progression-degrees">{b.name}</p>:null;})()}</>:<div className="dojo-prompt-card" data-playing={answerPlaying||undefined} data-moment={moment.state!=='idle'?moment.state:undefined} onClick={()=>void hear()}>{moment.state!=='idle'?<ChordCardMark result={moment} layer="moment" corner/>:result?.ok?<ChordCardMark result={cardResult(true,Boolean(result.self))} layer="set" corner/>:null}<h1 className="dojo-prompt">{target.target.chord.label}</h1><button type="button" className="dojo-prompt-play" aria-label={`${target.target.chord.label}を聴く（L）`} title="押すと鳴ります（L）"><Volume2 size={16} aria-hidden="true"/></button></div>}<div className="dojo-task-context"><div className="dojo-chips">{isComposition?<>{task.kind!=='composition'?<span className="dojo-chip">新しい種類</span>:null}<span className="dojo-chip">オクターブ・順番・一番下は自由</span></>:<>{task.kind==='shape'?<span className="dojo-chip">{PRESETS[task.preset??'basic']}</span>:null}<span className="dojo-chip">{task.kind==='voicing'?'元の音域で':task.kind==='progression'?target.target.judge==='exact'?(target.chords[cursor.chordIndex]?.source?'保存した音・元の音域で':'表示された音・同じ音域で'):'構成とベースが合えばよい（転回は自由）':task.bass==='external'?'ベースは別のパート':'ベースは自分で'}</span>{task.kind==='shape'?<span className="dojo-chip">キー {NAMES[task.roots[cursor.keyIndex]]}</span>:null}</>}{star()}</div><div className="dojo-stage-row"><div className="dojo-stage" aria-label="練習の段階">{stages.map((s,i)=><span key={s.stage} data-active={i===stageIndex||undefined} data-done={i<stageIndex||undefined}>{s.label}{s.stage==='recall'&&task.kind==='shape'&&cursor.stage==='recall'?` キー ${cursor.keyIndex+1}/${task.roots.length}`:''}</span>)}</div>{cursor.stage==='memorize'?<span className="dojo-muted">覚えたら名前を隠します</span>:null}{task.kind==='progression'?<button className="dojo-settings-button" aria-expanded={settings} aria-label="練習の設定" onClick={()=>setSettings(!settings)}><Settings2 size={16} aria-hidden="true"/></button>:null}</div></div>
 {isComposition&&showAnswer?<div className="dojo-composition" aria-label="構成の音程と音名">{compositionTiles(target.target.chord.root,task.quality as Quality).map(({note,label})=>{const pressed=heldPitchClasses.has(note);return <div className="dojo-tone" data-pitch-class={note} data-pressed={pressed||undefined} key={note}><b>{label}</b><span>{NAMES[note]}{pressed?' ✓':''}</span></div>;})}</div>:freshQuality&&showAnswer?<div className="dojo-formline">構成 {compositionTiles(target.target.chord.root,task.quality as Quality).map(t=>t.label).join(' ')}</div>:null}

 {settings?<div className="dojo-settings"><label>BPM <input type="number" min="30" max="240" value={file.settings.progBpm} disabled={tempoRunning} onChange={e=>{const value=Number(e.target.value);if(value>=30&&value<=240)void commit({...file,settings:{...file.settings,progBpm:value}});}}/></label></div>:null}
 {task.kind==='progression'?<><div className="dojo-chord-cards">{target.chords.map((c,i)=>{const fullSeen=cardFullSeen(i),seen=cardSeen(i),degree=fullSeen?cardDegree(i):undefined,done=!tempoSummary&&cursor.stage==='recall'&&i<cursor.chordIndex;return <button type="button" key={i} disabled={cursor.stage==='tempo'&&tempoRunning} aria-label={seen?`${c.chord.label}${degree?`（${degree}）`:''}を聴く`:done?`${i+1}番目のコードを聴く`:`${i+1}番目のコードをヒントとして聴く`} onClick={()=>void playCard(i)} data-current={cursor.chordIndex===i} data-hint={!tempoSummary&&(cursor.hints.includes(i)||lapRef.current.seen.has(i))||undefined} data-result={tempoSummary?(tempoSummary[i]?'ok':'ng'):undefined} data-hidden={!seen||undefined} data-playing={playingCardIndex===i||undefined} data-moment={!tempoSummary&&i===cursor.chordIndex&&moment.state!=='idle'?moment.state:undefined}><Volume2 className="dojo-card-sound" size={16} aria-hidden="true"/>{!tempoSummary&&i===cursor.chordIndex&&moment.state!=='idle'?<ChordCardMark result={moment} layer="moment" corner/>:null}<strong>{seen?c.chord.label:i+1}</strong><small>{tempoSummary?<ChordCardMark result={cardResult(Boolean(tempoSummary[i]),false)} layer="set"/>:cursor.hints.includes(i)||lapRef.current.seen.has(i)?'ヒント':done?<ChordCardMark result={clearedResult(i)} layer="set"/>:seen?' ':'?'}</small>{degree?<small>{typeof degree === "string" ? displayDegreeLabel(degree) : degree}</small>:null}{lapFlags(i)}</button>;})}</div>{lapNote}</>:null}

 <div className="dojo-response" data-testid={tempoSummary?'dojo-tempo-result':undefined}><div className="dojo-feedback-row">{!manual&&!isComposition&&(task.kind==='shape'||task.kind==='voicing')&&cursor.stage==='recall'?<div className="dojo-timer" aria-label="経過秒数">{result?result.ok&&result.sec!==undefined?`${result.sec.toFixed(1)}s`:'':`${elapsed.toFixed(1)}s`}</div>:null}<div className="dojo-result" role="status" data-ok={tempoSummary?tempoSummary.every(Boolean):result?.ok} data-partial={tempoSummary&&tempoSummary.some(Boolean)&&!tempoSummary.every(Boolean)||undefined}>{tempoSummary?`${tempoSummary.filter(Boolean).length}/${tempoSummary.length} 合いました`:result?`${result.ok?'✓':'✗'} ${result.message}`:nameHint&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目は ${target.target.chord.label} です。最初には戻らず続けます`:visible&&cursor.stage==='recall'&&task.kind==='progression'?`${cursor.chordIndex+1}番目：${target.target.chord.label} · 最初には戻らず続けます`:manual?showAnswer?'答えのとおりに弾いてみて、合っていたら「弾けた」':'頭の中で形を決めて、弾いてから「答えを見る」':isComposition?'構成の音を押してください（どの高さでも）':cursor.stage==='recall'?task.kind==='progression'?today.lesson?'頭から弾いてください。必要なら「答えを見る」で今のコードを確認できます':'頭から弾いてください。止まると、そのカードだけ名前が出ます':'答えは弾いた後に出ます':cursor.stage==='memorize'?'進行を覚えてください。覚えたら名前を隠して、頭から弾きます':cursor.stage==='tempo'?'隠したまま、テンポで弾きます':'鍵盤の答えを見ながら弾いてください'}</div></div>
 <div className="dojo-actions">{cursor.stage==='memorize'?<button className="dojo-primary" disabled={busy} onClick={()=>void next()}>覚えた（Enter）</button>:cursor.stage==='tempo'&&!manual?tempoSummary?<button className="dojo-primary" onClick={()=>{const f=advance(latest.current,{ok:tempoSummary.every(Boolean),self:result?.self??manual,at:new Date().toISOString(),recordedTempo:true},collection.progressions);void commit(f);setResult(undefined);setTempoSummary(undefined);if(f.today!.finished)setScreen('finish');}}>結果を確認して次へ</button>:<button className="dojo-primary" onClick={toggleTempo}>{tempoRunning?'止める':'テンポで始める'}（Space）</button>:result?<button className="dojo-primary" disabled={busy} onClick={()=>void next()}>{result.ok?'次へ':'もう一度'}（Enter）</button>:manual&&showAnswer?<><button className="dojo-primary" disabled={busy} onClick={()=>void submit(true,'合いました（自分で判定）')}>弾けた（Y）</button><button disabled={busy} onClick={()=>void submit(false,'答えを見て、もう一度（自分で判定）')}>まだ（N）</button></>:null}{!result&&(manual&&!showAnswer||!manual&&cursor.stage!=='memorize'&&cursor.stage!=='tempo'&&elapsed>speedLimit(file))?<button onClick={()=>void reveal()}>答えを見る（Space）</button>:null}{cursor.stage!=='tempo'||manual?<button onClick={()=>void hear()}>お手本を聴く（L）</button>:null}{cursor.stage==='recall'&&task.kind==='shape'?<button onClick={()=>void reveal()}>もう一度見る</button>:null}{tempoSummary&&!tempoSummary.every(Boolean)?tempoSummary.filter(ok=>!ok).length<=3?tempoSummary.map((ok,i)=>!ok?<button key={i} onClick={async()=>{const f=structuredClone(latest.current);f.today!.cursor.chordIndex=i;await commit(f);setVisible(true);}}>{i+1}番目の答えを見る</button>:null):<details className="dojo-tempo-result"><summary>一致しなかったコードを確認（{tempoSummary.filter(ok=>!ok).length}）</summary><div className="dojo-tempo-panel">{tempoSummary.map((ok,i)=>!ok?<button key={i} onClick={async()=>{const f=structuredClone(latest.current);f.today!.cursor.chordIndex=i;await commit(f);setVisible(true);}}>{i+1}番目の答えを見る</button>:null)}</div></details>:null}<button disabled={busy} onClick={()=>void skip()}>とばす</button></div>
</div></article>
 <GrandStaff compact snapshot={visibleSnapshot} caption={cardSnapshot?`${cardSnapshot.chordSymbol} を聴いています`:undefined}/><div className="dojo-keyboard" style={{'--target-keyboard-width':`${Math.max(760,Math.ceil((keyboardRange.maxMidiNote-keyboardRange.minMidiNote+1)*7/12)*22)}px`} as CSSProperties}><div className="dojo-keyboard-head"><b>鍵盤</b><span><i className="dojo-held-swatch"/>押している音</span><span><i className="dojo-answer-swatch"/>答え（弾いた後に出る）</span><span><i className="dojo-wrong-swatch"/>違う音</span><span><i className="dojo-missing-swatch"/>不足する音</span>{keyboardAnswerVisible&&(keyboardRange.minMidiNote<36||keyboardRange.maxMidiNote>84)?<p className="dojo-range-notice" data-testid="dojo-range-expanded">C2〜C6外の音も表示しています</p>:null}</div><PracticeKeyboard fingerLabels={fingerLabels} leftHandGuideNotes={visibleSnapshot?.notes.filter(n=>n.hand==='left').map(n=>n.midi)??[]} rightHandGuideNotes={visibleSnapshot?.notes.filter(n=>n.hand==='right').map(n=>n.midi)??[]} appearance="dojo" hideLegend compactSummary octaveConvention="scientific" range={keyboardRange} guideNotes={visibleSnapshot?.midiNotes??[]} allowedPitchClasses={visibleSnapshot?.midiNotes.map(pc)??[]} requiredPitchClasses={visibleSnapshot?.midiNotes.map(pc)??[]} interactionMode={keyboardAnswerVisible?undefined:'neutral-monitor'} level={keyboardAnswerVisible?1:2} matchState={result?result.ok?'match':'wrong':'empty'} concealNoteNames={!keyboardAnswerVisible}/></div>
 </div>:null}
 {screen==='finish'&&keyDone?<article className="dojo-finish dojo-keydone" data-testid="dojo-keydone">
  <div className="dojo-page-head"><DojoBackButton label={parentOf(place)?.label??HOME_BACK_LABEL} onBack={goBack}/><h1>{builtinDisplayName(keyDone.builtin)}・{keyLabel(keyDone.task.roots[0]!,keyDone.builtin.mode)}</h1></div>
  <p className="dojo-keydone-lead" role="status">最後まで通しました。<span className="dojo-muted">コード {keyDone.builtin.chords.length} 個・合った判定 {today.matched}</span></p>
  <DojoKeyGrid record={file.progressions[keyDone.task.key]} limit={speedLimit(file)} current={keyDone.task.roots[0]} only={candidateKeys(keyDone.builtin.practiceKeys)}/>
  <div className="dojo-actions"><button data-testid="keydone-same" className="dojo-primary" autoFocus onClick={()=>playKeyAgain('same')}>同じキーでもう一度</button><button data-testid="keydone-next" onClick={()=>playKeyAgain('omakase')}>次のキー（おまかせ）</button></div>
 </article>:null}
 {screen==='finish'&&!keyDone?<article className="dojo-finish"><div className="dojo-page-head"><DojoBackButton label={HOME_BACK_LABEL} onBack={goBack}/><h1>今日、自分の語彙に増えたもの</h1></div><div className="dojo-vocab">{today.added.length?today.added.map(k=>{const t=today.tasks.find(t=>t.key===k)!;return <div className="dojo-added" key={k}><div><strong>{t?title(t):'覚えた音'}</strong><p className="dojo-muted">{t?detail(t):''}</p></div>{star(t)}<span className="dojo-badge" data-state={t?itemFor(file,t)?.state:'new'}>{t?LABEL[itemFor(file,t)?.state??'new']:''}</span></div>;}):<p className="dojo-muted">今回は新しく増えたものはありません。詳しい記録は下で見られます。</p>}</div><div className="dojo-card dojo-finish-summary"><p>かかった時間：{today.startedAt?Math.max(1,Math.round((Date.now()-Date.parse(today.startedAt))/60000)):0}分・合った数：{today.matched}</p><p>また明日：{today.tasks.filter(t=>t.kind!=='composition'&&(itemFor(file,t)?.state??'new')==='new').map(title).join('・')||'確認の日に、また出ます'}</p>{today.tasks.some((t,index)=>t.review&&today.taskResults?.some(r=>r.taskIndex===index&&r.completed&&!r.skipped))?<p>今回の確認完了：{today.tasks.filter((t,index)=>t.review&&today.taskResults?.some(r=>r.taskIndex===index&&r.completed&&!r.skipped)).length}</p>:null}</div><div className="dojo-actions"><button className="dojo-primary" onClick={()=>void start()}>もう少しやる（次のテーマ）</button></div><details className="dojo-finish-log"><summary>今回の練習の詳しい記録（テーマ・型・登録した音・進行・入れなかったもの）</summary><LessonFinishSummary file={file} title={title}/></details></article>:null}
 </section>;
}
function itemFor(file:DojoStore,t:Task):ItemRecord|undefined{return t.kind==='shape'?file.shapes[t.key]:t.kind==='voicing'?file.voicings[t.key]:t.kind==='progression'?file.progressions[t.key]:undefined;}
