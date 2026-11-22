import {Select} from '../../components/ui';
import {displayChordLabel} from '../../ui/chordText';
import {useStore} from 'zustand';
import {originalLapStore} from '../../domain/chordDojo/originalRecords';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BUILTINS,BUILTIN_GROUPS,buildBuiltin,builtinDisplayName,keyLabel} from '../../domain/chordDojo/builtins';
import {NAMES} from '../../domain/chordDojo/recipes';
import type {ItemRecord,Task} from '../../domain/chordDojo/store';
import {candidateKeys,choosesOwnKey,isLong,pickKey} from '../../domain/chordDojo/longProgression';
import {DojoBackButton} from './DojoBackButton';
import {DojoKeyGrid} from './DojoKeyGrid';
import {HOME_BACK_LABEL} from './dojoNav';
import {dojoRecentStore} from './dojoRecent';
import {CardHeading,DojoHelp,FnDegrees,FnLegend} from './PracticeFrame';
import {JAZZ_PROGRESSIONS_GROUP_NAME,JAZZ_PROGRESSIONS_ITEMS} from '../../domain/chordDojo/jazzProgressions';
import {JazzProgressionGroup} from './JazzProgressionGroup';
import {ORIGINAL_GROUP_NAME,ORIGINAL_IDS,ORIGINAL_KEYS,buildOriginal,originalTitle,originalTonicOf,pickOriginalShift,totalLaps} from '../../domain/chordDojo/originalPractice';

const LIST_HELP='カードを押すと、上で選んだキーで ① から始まります。「ランダム」をオンにすると、ランダムキーの練習になります（毎回キーが変わります。Original Practice・Jazz Progressions も、それぞれのランダムキーで始まります）。長い進行（8小節以上）は、カードの中でキーを選びます（ランダムはありません）。「…」の「今日のテーマにする」も、上で選んだキーを使います。';

/** Scrolls a group to the top of the list, just under the sticky group row (its height changes with the width). */
function scrollToGroup(id:string){
 const group=document.getElementById(id);if(!group)return;
 group.style.scrollMarginTop=`${(document.querySelector('.dojo-builtin-jump')?.getBoundingClientRect().height??0)+8}px`;
 group.scrollIntoView({block:'start'});
}

/** P22-01 §3-1-3: 「…」 with one item; Esc and a press outside close it, and neither reaches the card or the list. */
function CardMenu({disabled,onTheme}:{disabled:boolean;onTheme:()=>void}){
 const [open,setOpen]=useState(false),wrap=useRef<HTMLSpanElement>(null),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return undefined;
  const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();setOpen(false);toggle.current?.focus();};
  const down=(e:PointerEvent)=>{if(!wrap.current?.contains(e.target as Node))setOpen(false);};
  window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',down,true);
  return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',down,true);};
 },[open]);
 return <span className="dojo-card-menu" ref={wrap}>
  <button type="button" ref={toggle} className="dojo-card-menu-button" aria-label="そのほかの操作" aria-haspopup="menu" aria-expanded={open} data-testid="dojo-card-more" onClick={()=>setOpen(o=>!o)}>…</button>
  {open?<span role="menu" className="dojo-card-menu-list"><button type="button" role="menuitem" className="dojo-builtin-theme" disabled={disabled} onClick={()=>{setOpen(false);onTheme();}}>今日のテーマにする</button></span>:null}
 </span>;
}

/**
 * P12.3 §4: the standard progressions, grouped. P22-01 §3: pressing a card starts its practice — the list's key, or the
 * random key while 「ランダム」 is on; 「今日のテーマにする」 is in the card's 「…」.
 * P12.4-03: a long progression (8 bars or more) has no random-key practice; it chooses its own key from its
 * candidates (six for the jazz forms), with 「おまかせ」 picking one that has no record yet.
 */
export function BuiltinProgressionList({root,onRoot,random,onRandom,stateLabel,recordOf,keyLimit,themeDisabled,onBack,onPractice,onEndless,onOriginal,onJazz,onTheme,jumpTo}:{
 root:number;onRoot:(root:number)=>void;
 /** P22-01 §3-1-2: the random switch (only while the list is open; never saved). */
 random:boolean;onRandom:(random:boolean)=>void;
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
 /** P20: the home's Jazz/Original cards open the list at that group. */
 jumpTo?:'original'|'jazz-progressions';
}){
 const originalRecords=useStore(originalLapStore,s=>s.file);
 const recentEntries=useStore(dojoRecentStore,s=>s.entries);
 useEffect(()=>{void originalLapStore.getState().initialize();},[]);
 const byId=useMemo(()=>new Map(BUILTINS.map(b=>[b.id,b])),[]);
 const [ownKeys,setOwnKeys]=useState<Record<string,number>>({});
 /** Original Practice: the key (shift from E♭) picked on each card. */
 const [originalShifts,setOriginalShifts]=useState<Record<string,number>>({});
 useEffect(()=>{if(!jumpTo)return undefined;const id=jumpTo==='original'?'dojo-builtin-original':'dojo-builtin-jazz-progressions';const frame=requestAnimationFrame(()=>scrollToGroup(id));return()=>cancelAnimationFrame(frame);},[jumpTo]);
 const taskOf=(id:string,key:number):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[key],seconds:120});
 /** The key of a card: the list's key, or (for a progression that chooses its own) the one picked on the card. */
 const keyOf=(id:string)=>{const b=byId.get(id)!;if(!choosesOwnKey(b))return root;const options=candidateKeys(b.practiceKeys);return ownKeys[id]??(options.includes(root)?root:options[0]!);};
 const chordNames=useMemo(()=>new Map(BUILTINS.map(b=>[b.id,buildBuiltin(b.id,keyOf(b.id)).chords.map(c=>c.chord.label)])),[root,ownKeys])
 /** P22-01 §3-1-7: the standard progressions practised last (at most three), newest first. */
 const recent=recentEntries.filter(e=>e.kind==='standard'&&byId.has(e.id)).slice(0,3);
 return <div className="dojo-choose-page dojo-builtin-page">
  <div className="dojo-builtin-head">
   <DojoBackButton label={HOME_BACK_LABEL} onBack={onBack}/>
   <h1>定番の進行</h1>
   <span className="dojo-builtin-keypick">
    <label className="dojo-builtin-key"><span>キー</span><Select aria-label="定番のキー" value={root} onChange={e=>onRoot(Number(e.target.value))}>{NAMES.map((name,i)=><option value={i} key={i}>{name}</option>)}</Select></label>
    <button type="button" className="dojo-random-toggle" data-testid="dojo-random-toggle" aria-pressed={random} onClick={()=>onRandom(!random)}>ランダム</button>
   </span>
   <DojoHelp label="キーとランダムの説明" text={LIST_HELP} testId="dojo-list-help"/>
   <FnLegend/>
  </div>
  <nav className="dojo-builtin-jump" aria-label="まとまりへ移る">{BUILTIN_GROUPS.map(g=><button type="button" key={g.group} onClick={()=>scrollToGroup(`dojo-builtin-${g.group}`)}>{g.name} {g.ids.length}</button>)}<button type="button" onClick={()=>scrollToGroup('dojo-builtin-original')}>{ORIGINAL_GROUP_NAME} {ORIGINAL_IDS.length}</button><button type="button" onClick={()=>scrollToGroup('dojo-builtin-jazz-progressions')}>{JAZZ_PROGRESSIONS_GROUP_NAME} {JAZZ_PROGRESSIONS_ITEMS.length}</button></nav>
  {recent.length?<section className="dojo-builtin-group dojo-builtin-recent" data-testid="dojo-recent-row">
   <h2>最近やった</h2>
   <div className="dojo-list">{recent.map(entry=>{const b=byId.get(entry.id)!,key=entry.key??0,name=builtinDisplayName(b),randomKey=Boolean(entry.random)&&!isLong(b);
    return <button type="button" className="dojo-card dojo-recent-card" key={entry.id} data-recent={entry.id} data-focus-key={`recent:${entry.id}`} aria-label={`${name} を練習する（${randomKey?'ランダムキー':keyLabel(key,b.mode)}）`} onClick={()=>randomKey?onEndless(entry.id):onPractice(taskOf(entry.id,key))}>
     <b>{name}</b>
     <span className="dojo-builtin-degrees"><FnDegrees degrees={b.fullDegrees} mode={b.mode}/></span>
     <small>{randomKey?'ランダムキー':`${keyLabel(key,b.mode)}：${buildBuiltin(b.id,key).chords.map(c=>displayChordLabel(c.chord.label)).join(' → ')}`}</small>
    </button>;})}</div>
  </section>:null}
  {BUILTIN_GROUPS.map(g=><section className="dojo-builtin-group" id={`dojo-builtin-${g.group}`} key={g.group}>
   <h2>{g.name}<small>{g.description}</small></h2>
   <div className="dojo-list">{g.ids.map(id=>{const b=byId.get(id)!,own=choosesOwnKey(b),long=isLong(b),key=keyOf(id),task=taskOf(id,key),options=candidateKeys(b.practiceKeys),record=recordOf(task);
    const recorded=new Set(Object.keys(record?.keys??{}).map(Number));
    return <article className="dojo-card dojo-builtin-card dojo-card-whole" data-long={long||undefined} key={id}>
     <div className="dojo-builtin-title"><CardHeading name={builtinDisplayName(b)} focusKey={`practice:${task.key}`} onPress={()=>random&&!long?onEndless(id):onPractice(task)}/><span className="dojo-badge">{stateLabel(task)}</span></div>
     <div className="dojo-builtin-degrees"><FnDegrees degrees={b.fullDegrees} mode={b.mode}/></div>
     {b.usage?<p className="dojo-builtin-usage">{b.usage}</p>:null}
     <p className="dojo-builtin-chords">{keyLabel(key,b.mode)}：{chordNames.get(id)!.map(displayChordLabel).join(' → ')}</p>
     {own?<div className="dojo-builtin-ownkey" data-testid="dojo-ownkey">
      <label><span>キー</span><Select aria-label={`${builtinDisplayName(b)}のキー`} value={key} onChange={e=>setOwnKeys(k=>({...k,[id]:Number(e.target.value)}))}>{options.map(k=><option value={k} key={k}>{NAMES[k]}</option>)}</Select></label>
      <button type="button" data-testid="dojo-omakase" onClick={()=>setOwnKeys(k=>({...k,[id]:pickKey(options,recorded,k[id]??key,Math.random())}))}>おまかせ</button>
      <DojoKeyGrid record={record} limit={keyLimit} current={key} only={options}/>
     </div>:null}
     {b.todayPool?<div className="dojo-builtin-actions"><CardMenu disabled={themeDisabled} onTheme={()=>onTheme(task)}/></div>:null}
    </article>;})}</div>
  </section>)}
  {/* P12.5-02: appended after every group above. Not a candidate of today's plan; a lap is called 完奏 and is kept apart from the clears. */}
  <section className="dojo-builtin-group" id="dojo-builtin-original">
   <h2>{ORIGINAL_GROUP_NAME}<small>自分の MIDI から。左手・右手の実際の音を、そのまま弾きます</small></h2>
   <div className="dojo-list">{ORIGINAL_IDS.map(id=>{
    const laps=originalRecords.laps[id]??{},total=totalLaps(laps),shift=originalShifts[id]??0,p=buildOriginal(id,shift);
    const played=Object.fromEntries(Object.entries(laps).map(([k,v])=>[Number(k),v.count]));
    return <article className="dojo-card dojo-builtin-card dojo-original-card dojo-card-whole" data-original={id} key={id}>
     <div className="dojo-builtin-title"><CardHeading name={originalTitle(id)} focusKey={`original:${id}`} onPress={()=>onOriginal(id,random?pickOriginalShift(played,shift,Math.random()):shift)}/><span className="dojo-badge">{total>0?`完奏 ${total}周`:'まだ'}</span></div>
     <div className="dojo-builtin-degrees"><FnDegrees degrees={p.degrees} mode="major"/></div>
     <p className="dojo-builtin-usage">実際の左手・右手の音を、そのまま覚えて弾きます。メロディなど、ほかの音は重ねて構いません。</p>
     <p className="dojo-builtin-chords">{NAMES[originalTonicOf(shift)]}：{p.cards.map(c=>displayChordLabel(c.label)).join(' → ')}</p>
     <div className="dojo-builtin-ownkey" data-testid="dojo-original-key">
      <label><span>キー</span><Select aria-label={`${originalTitle(id)}のキー`} value={shift} onChange={e=>setOriginalShifts(k=>({...k,[id]:Number(e.target.value)}))}>{ORIGINAL_KEYS.map(k=><option value={k.shift} key={k.tonic}>{NAMES[k.tonic]}{k.shift===0?'（元のキー）':''}</option>)}</Select></label>
      <span className="dojo-original-done" data-testid="dojo-original-done">完奏したキー：{Object.keys(laps).length?ORIGINAL_KEYS.filter(k=>laps[k.tonic]).map(k=>`${NAMES[k.tonic]} ${laps[k.tonic]!.count}`).join('・'):'まだありません'}</span>
     </div>
    </article>;})}</div>
  </section>
  {/* Jazz Progressions: appended after Original Practice. Not among the standard progressions, not a candidate of today's plan; a lap is called 完奏 and is kept in a record of its own. */}
  <JazzProgressionGroup random={random} onOpen={onJazz}/>
 </div>;
}
