import {useStore} from 'zustand';
import {originalLapStore} from '../../domain/chordDojo/originalRecords';
import {useEffect,useMemo,useState} from 'react';
import {BUILTINS,BUILTIN_GROUPS,buildBuiltin,builtinDisplayName,keyLabel} from '../../domain/chordDojo/builtins';
import {NAMES} from '../../domain/chordDojo/recipes';
import type {ItemRecord,Task} from '../../domain/chordDojo/store';
import {candidateKeys,choosesOwnKey,isLong,pickKey} from '../../domain/chordDojo/longProgression';
import {DojoBackButton} from './DojoBackButton';
import {DojoKeyGrid} from './DojoKeyGrid';
import {HOME_NAME} from './dojoNav';
import {JAZZ_PROGRESSIONS_GROUP_NAME,JAZZ_PROGRESSIONS_ITEMS} from '../../domain/chordDojo/jazzProgressions';
import {JazzProgressionGroup} from './JazzProgressionGroup';
import {ORIGINAL_GROUP_NAME,ORIGINAL_IDS,ORIGINAL_KEYS,buildOriginal,originalTitle,originalTonicOf,pickOriginalShift,totalLaps} from '../../domain/chordDojo/originalPractice';

/**
 * P12.3 §4: the standard progressions, grouped. The card buttons are the ways in.
 * P12.4-03: a long progression (8 bars or more) has no random-key practice; it chooses its own key from its
 * candidates (six for the jazz forms), with 「おまかせ」 picking one that has no record yet.
 */
export function BuiltinProgressionList({root,onRoot,stateLabel,recordOf,keyLimit,themeDisabled,onBack,onPractice,onEndless,onOriginal,onJazz,onTheme}:{
 root:number;onRoot:(root:number)=>void;
 /** The record badge of a progression ("まだ" / "仮の合格" …). */
 stateLabel:(task:Task)=>string;
 /** The record, for the keys that have been played. */
 recordOf:(task:Task)=>ItemRecord|undefined;keyLimit:number;
 themeDisabled:boolean;
 onBack:()=>void;onPractice:(task:Task)=>void;onEndless:(builtinId:string)=>void;
 /** Original Practice: the progression and the shift (semitones from E♭, −6…+5). */
 onOriginal:(id:string,shift:number)=>void;
 /** Jazz Progressions: the progression, and whether to begin with the random key. */
 onJazz:(id:string,random:boolean)=>void;onTheme:(task:Task)=>void;
}){
 const originalRecords=useStore(originalLapStore,s=>s.file);
 useEffect(()=>{void originalLapStore.getState().initialize();},[]);
 const byId=useMemo(()=>new Map(BUILTINS.map(b=>[b.id,b])),[]);
 const [ownKeys,setOwnKeys]=useState<Record<string,number>>({});
 /** Original Practice: the key (shift from E♭) picked on each card. */
 const [originalShifts,setOriginalShifts]=useState<Record<string,number>>({});
 const taskOf=(id:string,key:number):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[key],seconds:120});
 /** The key of a card: the list's key, or (for a progression that chooses its own) the one picked on the card. */
 const keyOf=(id:string)=>{const b=byId.get(id)!;if(!choosesOwnKey(b))return root;const options=candidateKeys(b.practiceKeys);return ownKeys[id]??(options.includes(root)?root:options[0]!);};
 const chordNames=useMemo(()=>new Map(BUILTINS.map(b=>[b.id,buildBuiltin(b.id,keyOf(b.id)).chords.map(c=>c.chord.label)])),[root,ownKeys])
 return <div className="dojo-choose-page dojo-builtin-page">
  <div className="dojo-builtin-head">
   <DojoBackButton label={HOME_NAME} onBack={onBack}/>
   <h1>定番の進行</h1>
   <label className="dojo-builtin-key"><span>キー</span><select aria-label="定番のキー" value={root} onChange={e=>onRoot(Number(e.target.value))}>{NAMES.map((name,i)=><option value={i} key={i}>{name}</option>)}</select></label>
   <span className="dojo-builtin-note">「これを練習する」「今日のテーマにする」で使うキー。ランダムキーは毎回変わります。長い進行（8小節以上）は、カードの中でキーを選びます。</span>
  </div>
  <nav className="dojo-builtin-jump" aria-label="まとまりへ移る">{BUILTIN_GROUPS.map(g=><button type="button" key={g.group} onClick={()=>document.getElementById(`dojo-builtin-${g.group}`)?.scrollIntoView({block:'start'})}>{g.name} {g.ids.length}</button>)}<button type="button" onClick={()=>document.getElementById('dojo-builtin-original')?.scrollIntoView({block:'start'})}>{ORIGINAL_GROUP_NAME} {ORIGINAL_IDS.length}</button><button type="button" onClick={()=>document.getElementById('dojo-builtin-jazz-progressions')?.scrollIntoView({block:'start'})}>{JAZZ_PROGRESSIONS_GROUP_NAME} {JAZZ_PROGRESSIONS_ITEMS.length}</button></nav>
  {BUILTIN_GROUPS.map(g=><section className="dojo-builtin-group" id={`dojo-builtin-${g.group}`} key={g.group}>
   <h2>{g.name}<small>{g.description}</small></h2>
   <div className="dojo-list">{g.ids.map(id=>{const b=byId.get(id)!,own=choosesOwnKey(b),long=isLong(b),key=keyOf(id),task=taskOf(id,key),options=candidateKeys(b.practiceKeys),record=recordOf(task);
    const recorded=new Set(Object.keys(record?.keys??{}).map(Number));
    return <article className="dojo-card dojo-builtin-card" data-long={long||undefined} key={id}>
     <div className="dojo-builtin-title"><h2>{builtinDisplayName(b)}</h2><span className="dojo-badge">{stateLabel(task)}</span></div>
     <p className="dojo-builtin-degrees">{b.fullDegrees.join(' – ')}</p>
     {b.usage?<p className="dojo-builtin-usage">{b.usage}</p>:null}
     <p className="dojo-builtin-chords">{keyLabel(key,b.mode)}：{chordNames.get(id)!.join(' → ')}</p>
     {own?<div className="dojo-builtin-ownkey" data-testid="dojo-ownkey">
      <label><span>キー</span><select aria-label={`${builtinDisplayName(b)}のキー`} value={key} onChange={e=>setOwnKeys(k=>({...k,[id]:Number(e.target.value)}))}>{options.map(k=><option value={k} key={k}>{NAMES[k]}</option>)}</select></label>
      <button type="button" data-testid="dojo-omakase" onClick={()=>setOwnKeys(k=>({...k,[id]:pickKey(options,recorded,k[id]??key,Math.random())}))}>おまかせ</button>
      <DojoKeyGrid record={record} limit={keyLimit} current={key} only={options}/>
     </div>:null}
     <div className="dojo-builtin-actions">
      <button type="button" data-focus-key={`practice:${task.key}`} onClick={()=>onPractice(task)}>これを練習する</button>
      {long?null:<button type="button" className="dojo-builtin-endless" data-focus-key={`endless:${id}`} onClick={()=>onEndless(id)}>ランダムキーで練習</button>}
      {b.todayPool?<button type="button" className="dojo-builtin-theme" disabled={themeDisabled} onClick={()=>onTheme(task)}>今日のテーマにする</button>:null}
     </div>
    </article>;})}</div>
  </section>)}
  {/* P12.5-02: appended after every group above. Not a candidate of today's plan; a lap is called 完奏 and is kept apart from the clears. */}
  <section className="dojo-builtin-group" id="dojo-builtin-original">
   <h2>{ORIGINAL_GROUP_NAME}<small>自分の MIDI から。左手・右手の実際の音を、そのまま弾きます</small></h2>
   <div className="dojo-list">{ORIGINAL_IDS.map(id=>{
    const laps=originalRecords.laps[id]??{},total=totalLaps(laps),shift=originalShifts[id]??0,p=buildOriginal(id,shift);
    const played=Object.fromEntries(Object.entries(laps).map(([k,v])=>[Number(k),v.count]));
    return <article className="dojo-card dojo-builtin-card dojo-original-card" data-original={id} key={id}>
     <div className="dojo-builtin-title"><h2>{originalTitle(id)}</h2><span className="dojo-badge">{total>0?`完奏 ${total}周`:'まだ'}</span></div>
     <p className="dojo-builtin-degrees">{p.degrees.join(' – ')}</p>
     <p className="dojo-builtin-usage">実際の左手・右手の音を、そのまま覚えて弾きます。メロディなど、ほかの音は重ねて構いません。</p>
     <p className="dojo-builtin-chords">{NAMES[originalTonicOf(shift)]}：{p.cards.map(c=>c.label).join(' → ')}</p>
     <div className="dojo-builtin-ownkey" data-testid="dojo-original-key">
      <label><span>キー</span><select aria-label={`${originalTitle(id)}のキー`} value={shift} onChange={e=>setOriginalShifts(k=>({...k,[id]:Number(e.target.value)}))}>{ORIGINAL_KEYS.map(k=><option value={k.shift} key={k.tonic}>{NAMES[k.tonic]}{k.shift===0?'（元のキー）':''}</option>)}</select></label>
      <span className="dojo-original-done" data-testid="dojo-original-done">完奏したキー：{Object.keys(laps).length?ORIGINAL_KEYS.filter(k=>laps[k.tonic]).map(k=>`${NAMES[k.tonic]} ${laps[k.tonic]!.count}`).join('・'):'まだありません'}</span>
     </div>
     <div className="dojo-builtin-actions">
      <button type="button" data-focus-key={`original:${id}`} onClick={()=>onOriginal(id,shift)}>これを練習する</button>
      <button type="button" className="dojo-builtin-endless" data-focus-key={`original-random:${id}`} onClick={()=>onOriginal(id,pickOriginalShift(played,shift,Math.random()))}>ランダムキーで練習</button>
     </div>
    </article>;})}</div>
  </section>
  {/* Jazz Progressions: appended after Original Practice. Not among the standard progressions, not a candidate of today's plan; a lap is called 完奏 and is kept in a record of its own. */}
  <JazzProgressionGroup onOpen={onJazz}/>
 </div>;
}
