import {useId,useState} from 'react';
import type {VaultProgression} from '../../domain/chordDojo/collect';
import type {Task} from '../../domain/chordDojo/store';
import {describeBlockMemo} from '../captureLabels';
import {progressionInRange} from '../../domain/chordDojo/recordScope';

interface Props {progressions:VaultProgression[];stateLabel:(key:string)=>string;themeBusy:boolean;onPractice:(task:Task)=>void;onTheme:(task:Task)=>void;}
export function SavedProgressionList(props:Props){
 return <div className="dojo-list dojo-saved-list">{props.progressions.map(p=><SavedProgressionCard key={p.key} progression={p} {...props}/>)}</div>;
}
function SavedProgressionCard({progression:p,stateLabel,themeBusy,onPractice,onTheme}:Props&{progression:VaultProgression}){
 const id=useId(),[expanded,setExpanded]=useState(false);
 const from=p.range?.startBar??1,to=p.range?.endBar??Math.max(1,...p.chordBars);
 const [start,setStart]=useState(String(from)),[end,setEnd]=useState(String(to));
 const a=Number(start),b=Number(end);
 const reason=!start||!end||!Number.isInteger(a)||!Number.isInteger(b)?'開始・終了小節を整数で入力してください。':a<from||b>to||a>to||b<from?`${from}〜${to}小節の範囲で指定してください。`:a>b?'開始小節は終了小節以下にしてください。':!progressionInRange(p,{startBar:a,endBar:b}).length?'この区間には練習できるコードがありません。':undefined;
 const task:Task={kind:'progression',key:p.key,review:false,roots:[0],seconds:120};
 const themeReason=themeBusy?'今日のレッスンを終了すると選べます。':undefined;
 return <article className="dojo-card dojo-saved-card">
  <h2 className="dojo-saved-title" title={p.displayName??p.name}>{p.displayName??p.name}</h2>
  <p className="dojo-saved-size">全{to-from+1}小節 <span>・ 自分の進行</span></p>
  <p className="dojo-saved-state">練習状況：<span className="dojo-badge">{stateLabel(p.key)}</span></p>
  <button type="button" className="dojo-primary dojo-saved-practice" data-focus-key={`practice:${p.key}`} onClick={()=>onPractice(task)}>全体を練習する</button>
  <div className="dojo-saved-secondary"><button type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>区間を選んで練習</button><details className="dojo-saved-details"><summary>詳細</summary><div>
   <p>進行名：{p.displayName??p.name}</p>
   <p>保存した進行：全{to-from+1}小節（保存内{from}〜{to}小節）</p>
   {p.sourceBarRange?<p>{p.sourceIsMidi?'元MIDI':'元の座標'}：{p.sourceBarRange.startBar}〜{p.sourceBarRange.endBar}小節</p>:null}
   {p.memo?<p>保存メモ：{describeBlockMemo(p.memo)}</p>:null}
   <p>テーマでは保存内の先頭から最大8小節を使います。時間予算や今日の確認枠によって選ばれない場合があります。</p>
  </div></details></div>
  {expanded?<div id={id} className="dojo-section-picker" data-testid={`section-picker:${p.key}`}>
   <label>開始小節<input type="number" min={from} max={to} step="1" value={start} aria-invalid={Boolean(reason)} aria-describedby={reason?`${id}-reason`:undefined} onChange={e=>setStart(e.target.value)}/></label>
   <label>終了小節<input type="number" min={from} max={to} step="1" value={end} aria-invalid={Boolean(reason)} aria-describedby={reason?`${id}-reason`:undefined} onChange={e=>setEnd(e.target.value)}/></label>
   {reason?<p id={`${id}-reason`} role="status">{reason}</p>:null}
   <button type="button" data-testid={`section-practice:${p.key}`} disabled={Boolean(reason)||themeBusy} onClick={()=>onPractice({...task,range:{startBar:a,endBar:b}})}>{a}〜{b}小節を練習する</button>
   {themeReason?<p>{themeReason}</p>:null}
  </div>:null}
  <div className="dojo-saved-theme"><button type="button" disabled={themeBusy} title={themeReason} aria-describedby={themeBusy?`${id}-theme`:undefined} onClick={()=>onTheme(task)}>今日のテーマにする</button>{themeReason?<small id={`${id}-theme`}>{themeReason}</small>:null}</div>
 </article>;
}
