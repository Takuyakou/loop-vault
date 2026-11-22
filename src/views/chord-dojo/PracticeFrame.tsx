import {displayDegreeLabel, displayDegreeList} from '../../ui/chordText';
import {Fragment,useId,useState,type CSSProperties,type ReactNode} from 'react';
import {degreeFunctionKinds} from '../../domain/earPractice/degreeFunction';
import {Volume2} from 'lucide-react';
import {openMidiPanel} from '../../liveMidi/midiPanel';
import {DojoBackButton} from './DojoBackButton';
import {ChordName} from '../../components/ChordName';

/**
 * The parts the four practice screens of 定番の進行 share (the standard progressions, their random key, Original Practice, Jazz Progressions):
 * the top row, the stages, the cards. The rows between them (settings, message, buttons) are written by each screen with the same classes.
 */
export type StageState='on'|'idle'|'off';
export interface StageItem{num:string;name:string;state:StageState;/** What is said when it cannot be pressed (`off`), or where the press goes (`idle`). */title?:string;/** Pressing it (Stage 2). Without it the stage is only shown. */onSelect?:()=>void}

/** P18-01 Stage 2: ① 見て弾く ② 覚えて弾く ③ テンポで弾く: the one that is on shines; the ones that cannot be used here are faint.
 * A stage with `onSelect` is a button (pressing it moves to the head of that stage); the others are only shown. */
export function StageIndicator({stages}:{stages:readonly StageItem[]}){
 return <div className="dojo-stage" aria-label="練習の段階">{stages.map((s,i)=>s.onSelect
  ?<button type="button" key={s.num} data-testid={`dojo-stage-${i+1}`} data-active={s.state==='on'||undefined} data-off={s.state==='off'||undefined} title={s.title??'押すとこの段階の頭へ移ります'} onClick={s.onSelect}>{s.num}<span className="dojo-stage-name"> {s.name}</span></button>
  :<span key={s.num} data-active={s.state==='on'||undefined} data-off={s.state==='off'||undefined} title={s.title}>{s.num}<span className="dojo-stage-name"> {s.name}</span></span>)}</div>;
}

/** P18-01 Stage 2: the switch of 「この段階をくり返す」. On = lap after lap without stopping; off = the end of a lap asks (もう一度 ① を弾く). */
export function RepeatToggle({on,onToggle,testId='practice-repeat'}:{on:boolean;onToggle:(next:boolean)=>void;testId?:string}){
 return <button type="button" className="dojo-repeat-toggle" data-testid={testId} aria-pressed={on} onClick={()=>onToggle(!on)}>この段階をくり返す</button>;
}

/** The top row: back, kind, title, the degrees (cut first when the row is narrow), the stages, how far it is, MIDI, quit. */
export function PracticeHead({backLabel,onBack,kind,title,degrees,degreesTestId,stages,progress,progressLabel,onQuit,quitLabel,extra}:{
 backLabel:string;onBack:()=>void;kind:string;title:string;degrees?:string;degreesTestId?:string;stages:readonly StageItem[];
 progress:ReactNode;progressLabel:string;onQuit?:()=>void;quitLabel?:string;
 /** P23-38: one screen's own control in the same row (the guide's 教材変更); other screens pass nothing. */
 extra?:ReactNode;
}){
 return <div className="dojo-endless-head dojo-practice-head">
  <DojoBackButton label={backLabel} onBack={onBack}/>
  <div className="dojo-endless-name"><span>{kind}</span><b title={title}>{title}</b>{degrees?<i data-testid={degreesTestId}>{displayDegreeList(degrees)}</i>:null}</div>
  <StageIndicator stages={stages}/>
  <div className="dojo-endless-stats" aria-label={progressLabel}>{progress}</div>
  {extra}
  <button type="button" onClick={e=>openMidiPanel(e.currentTarget)}>MIDI 設定</button>
  {onQuit?<button type="button" aria-label={`${quitLabel??"やめる"}（Esc）`} onClick={onQuit}>{quitLabel??"やめる"}<kbd>Esc</kbd></button>:null}
 </div>;
}

/** One card of the progression: the degree (small, above), the chord (large), the notes of the two hands when there are any. */
export function PracticeCard({degree,name,notes,state,hint,playing,sound=true,mark,flags,status,label,onPress,disabled,extra,testId,degreeTestId,nameTestId,notesTestId,fn,fnBorrowed}:{
 degree?:ReactNode;name:ReactNode;notes?:ReactNode;state:'done'|'current'|'todo';hint?:boolean;playing?:boolean;sound?:boolean;mark?:ReactNode;flags?:ReactNode;
 status?:ReactNode;label:string;onPress:()=>void;disabled?:boolean;extra?:Record<string,string|boolean|undefined>;testId?:string;degreeTestId?:string;nameTestId?:string;notesTestId?:string;
 fn?:'T'|'SD'|'SDm'|'D';fnBorrowed?:boolean;
}){
 const fnName=fn==='T'?'トニック':fn==='SD'?'サブドミナント':fn==='SDm'?'サブドミナントマイナー':fn==='D'?'ドミナント':'';
 return <button type="button" onClick={onPress} disabled={disabled} aria-label={fnName?`${label} ${fnName}`:label} data-state={state} data-hint={hint||undefined} data-playing={playing||undefined} data-fn={fn||undefined} data-fn-borrowed={fnBorrowed||undefined} data-testid={testId} {...extra}>
  {sound?<Volume2 className="dojo-card-sound" size={16} aria-hidden="true"/>:null}
  {mark}
  <span className="dojo-card-degree-row"><small className="dojo-endless-degree" data-testid={degreeTestId}>{typeof degree === "string" ? displayDegreeLabel(degree) : degree}</small>{fn?<span className="dojo-card-fn" aria-hidden="true">{fn}</span>:null}</span>
  <strong className="dojo-endless-chord" data-testid={nameTestId}>{typeof name === "string" ? <ChordName label={name} /> : name}</strong>
  {status?<small className="dojo-card-status">{status}</small>:null}
  {notes?<span className="dojo-original-notes" data-testid={notesTestId}>{notes}</span>:null}
  {flags}
 </button>;
}

/** P22-01 §3-1-8 / §4-4: a long explanation behind a 「?」: pressing opens and closes it; hovering shows it as the title. */
export function DojoHelp({label,text,testId}:{label:string;text:string;testId?:string}){
 const [open,setOpen]=useState(false),id=useId();
 return <span className="dojo-help">
  <button type="button" className="dojo-help-button" aria-label={label} aria-expanded={open} aria-controls={id} title={text} data-testid={testId} onClick={()=>setOpen(o=>!o)}>?</button>
  <span id={id} className="dojo-help-text" role="note" hidden={!open}>{text}</span>
 </span>;
}

/** P22-01 §1-4: the legend of the function colours (small, never the only cue: the cards also carry the letters). */
export function FnLegend({short=false}:{/** The practice screens' conditions row (as the mock): only the letters, the names in the title. */short?:boolean}){
 return <span className="dojo-fn-legend" data-testid="dojo-fn-legend">{([['T','トニック'],['SD','サブドミナント'],['D','ドミナント']] as const).map(([fn,name])=><span key={fn} data-fn={fn} title={`${fn} ${name}`}><i aria-hidden="true"/>{short?<abbr title={name}>{fn}</abbr>:`${fn} ${name}`}</span>)}</span>;
}

/** P22-01 §1-4: the degrees of a list card, each wrapped in its function (the dashes keep their colour). */
export function FnDegrees({degrees,mode}:{degrees:readonly string[];mode:'major'|'minor'}){
 const fns=degreeFunctionKinds(degrees,mode);
 return <>{degrees.map((d,j)=><Fragment key={j}>{j?' – ':null}<span data-fn={fns[j]?.kind||undefined} data-fn-borrowed={fns[j]?.borrowedDominant||undefined}>{displayDegreeLabel(d)}</span></Fragment>)}</>;
}

/**
 * P22-01 §3-1: the card's name is its primary: a button whose hit area CSS widens to the whole card (`.dojo-card-whole`).
 * The heading keeps the plain name (aria-labelledby); the button says what it does (「◯◯ を練習する」).
 */
export function CardHeading({level=2,name,label,onPress,focusKey,testId,className,title}:{level?:2|3;name:string;label?:string;onPress:()=>void;focusKey:string;testId?:string;className?:string;title?:string}){
 const id=useId();
 const button=<button type="button" className="dojo-card-primary" aria-label={label??`${name} を練習する`} data-focus-key={focusKey} data-testid={testId} onClick={onPress}><span id={id}>{name}</span></button>;
 return level===3?<h3 aria-labelledby={id} className={className} title={title}>{button}</h3>:<h2 aria-labelledby={id} className={className} title={title}>{button}</h2>;
}

/** The free strip under the keyboard (see practiceLayout). */
/*
 * P22-01 §4-1: the rows between the top row and the staff, in this order on every practice screen:
 * conditions → cards → result → guide → actions. Each is only a box with its class; what goes in stays the screen's.
 */
/** 2. The conditions (key, repeat, 使いたい, the screen's own settings), the 「?」 and the function legend: one row over the cards, centred. */
export function PracticeConditions({children,help,className}:{children:ReactNode;/** §4-4: the long explanation behind the 「?」. */help?:string;className?:string}){
 return <div className={`dojo-practice-set dojo-practice-conditions${className?` ${className}`:''}`} data-testid="practice-conditions">{children}{help?<DojoHelp label="この練習の説明" text={help} testId="practice-help"/>:null}<FnLegend short/></div>;
}
/** 4. The result band: at least one line high even when empty, so a usual result never moves the cards or the buttons. */
export function PracticeResult({children,className,testId}:{children?:ReactNode;className?:string;testId?:string}){
 return <div className={`dojo-practice-result${className?` ${className}`:''}`} data-testid={testId??'practice-result'}>{children}</div>;
}
/** 5. The one-line guide (what to do now). */
export function PracticeGuide({children}:{children?:ReactNode}){
 return <div className="dojo-practice-guide" data-testid="practice-guide">{children}</div>;
}
/** 6. The buttons: advance → listen → hint/answer → skip. */
export function PracticeActions({children,className}:{children:ReactNode;className?:string}){
 return <div className={`dojo-actions dojo-endless-actions dojo-practice-actions${className?` ${className}`:''}`} data-testid="practice-actions">{children}</div>;
}
/** §4-5: the end of a lap, the same box everywhere: what was played on the left, the buttons (もう 1 周 → 次の段階へ → 一覧へ) on the right. */
export function PracticeLap({summary,children,testId}:{summary:ReactNode;children:ReactNode;testId?:string}){
 return <div className="dojo-practice-lap" data-testid={testId??'practice-lap'}><div className="dojo-practice-lap-summary">{summary}</div><div className="dojo-practice-lap-actions">{children}</div></div>;
}
/** §4-4: what the staff used to say under and over itself, now behind the 「?」 of the conditions. */
export const STAFF_HELP='楽譜は構成音の表示です（リズムの指定はありません）。指の番号の「左」は左手、「右」は右手。1 親指・2 人差し指・3 中指・4 薬指・5 小指。運指の候補がない音には番号を付けていません。音の高さが代表例のときは、構成の練習はどの高さでも判定します。';
/** §4-3: a button's key as a <kbd>; the accessible name stays 「◯◯（L）」. Spread on the <button>. */
export const keyed=(text:string,key:string)=>({'aria-label':`${text}（${key}）`,children:<>{text}<kbd>{key}</kbd></>});

export function PracticeSafeArea(){return <div className="dojo-practice-safe" aria-hidden="true" data-testid="practice-safe"/>;}

export type {CSSProperties};
