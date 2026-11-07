import type {CSSProperties,ReactNode} from 'react';
import {Volume2} from 'lucide-react';
import {openMidiPanel} from '../../liveMidi/midiPanel';
import {DojoBackButton} from './DojoBackButton';

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
export function PracticeHead({backLabel,onBack,kind,title,degrees,degreesTestId,stages,progress,progressLabel,onQuit}:{
 backLabel:string;onBack:()=>void;kind:string;title:string;degrees?:string;degreesTestId?:string;stages:readonly StageItem[];
 progress:ReactNode;progressLabel:string;onQuit?:()=>void;
}){
 return <div className="dojo-endless-head dojo-practice-head">
  <DojoBackButton label={backLabel} onBack={onBack}/>
  <div className="dojo-endless-name"><span>{kind}</span><b title={title}>{title}</b>{degrees?<i data-testid={degreesTestId}>{degrees}</i>:null}</div>
  <StageIndicator stages={stages}/>
  <div className="dojo-endless-stats" aria-label={progressLabel}>{progress}</div>
  <button type="button" onClick={e=>openMidiPanel(e.currentTarget)}>MIDI 設定</button>
  {onQuit?<button type="button" onClick={onQuit}>やめる（Esc）</button>:null}
 </div>;
}

/** One card of the progression: the degree (small, above), the chord (large), the notes of the two hands when there are any. */
export function PracticeCard({degree,name,notes,state,hint,playing,sound=true,mark,flags,status,label,onPress,disabled,extra,testId,degreeTestId,nameTestId,notesTestId}:{
 degree?:ReactNode;name:ReactNode;notes?:ReactNode;state:'done'|'current'|'todo';hint?:boolean;playing?:boolean;sound?:boolean;mark?:ReactNode;flags?:ReactNode;
 status?:ReactNode;label:string;onPress:()=>void;disabled?:boolean;extra?:Record<string,string|boolean|undefined>;testId?:string;degreeTestId?:string;nameTestId?:string;notesTestId?:string;
}){
 return <button type="button" onClick={onPress} disabled={disabled} aria-label={label} data-state={state} data-hint={hint||undefined} data-playing={playing||undefined} data-testid={testId} {...extra}>
  {sound?<Volume2 className="dojo-card-sound" size={16} aria-hidden="true"/>:null}
  {mark}
  <small className="dojo-endless-degree" data-testid={degreeTestId}>{degree}</small>
  <strong className="dojo-endless-chord" data-testid={nameTestId}>{name}</strong>
  {status?<small className="dojo-card-status">{status}</small>:null}
  {notes?<span className="dojo-original-notes" data-testid={notesTestId}>{notes}</span>:null}
  {flags}
 </button>;
}

/** The free strip under the keyboard (see practiceLayout). */
export function PracticeSafeArea(){return <div className="dojo-practice-safe" aria-hidden="true" data-testid="practice-safe"/>;}

export type {CSSProperties};
