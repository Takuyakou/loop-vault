import {useEffect,useState} from 'react';
import {CardHeading,FnDegrees} from './PracticeFrame';
import {useStore} from 'zustand';
import {
  JAZZ_PROGRESSIONS_GROUP_NAME,JAZZ_PROGRESSIONS_ITEMS,JAZZ_PROGRESSIONS_NOTE,buildJazzProgression,jazzMainOf,
} from '../../domain/chordDojo/jazzProgressions';
import {jazzLapStore} from '../../domain/chordDojo/jazzRecords';

/**
 * Jazz Progressions in the list of standard progressions: one card per item (12). A card with other versions lets one be chosen
 * (the main progression otherwise). Not among the standard progressions (BUILTINS) and not part of today's plan: its laps
 * (完奏) are kept in a record of their own and are not clears.
 */
export function JazzProgressionGroup({random,onOpen}:{random:boolean;onOpen:(progressionId:string,random:boolean)=>void}){
 const records=useStore(jazzLapStore,s=>s.file);
 useEffect(()=>{void jazzLapStore.getState().initialize();},[]);
 const [chosen,setChosen]=useState<Record<string,string>>({});
 return <section className="dojo-jazz-group" id="dojo-builtin-jazz-progressions" data-testid="dojo-jazz-group">
  <h2>{JAZZ_PROGRESSIONS_GROUP_NAME}<small>{JAZZ_PROGRESSIONS_NOTE}</small></h2>
  <div className="dojo-list">{JAZZ_PROGRESSIONS_ITEMS.map(item=>{
   const id=chosen[item.id]??jazzMainOf(item),prog=buildJazzProgression(id);
   const total=item.progressions.reduce((n,pid)=>n+Object.values(records.laps[pid]??{}).reduce((m,l)=>m+l.count,0),0);
   return <article className="dojo-card dojo-jazz-card dojo-card-whole" data-jazz-item={item.id} data-jazz-selected={id} key={item.id}>
    <div className="dojo-builtin-title"><CardHeading level={3} name={`${String(item.no).padStart(2,'0')} ${item.title}`} focusKey={`jazz:${item.id}`} testId="jazz-open" onPress={()=>onOpen(id,random)}/><span className="dojo-badge" data-testid="jazz-item-laps">{total>0?`完奏 ${total}周`:'まだ'}</span></div>
    <div className="dojo-builtin-degrees"><FnDegrees degrees={prog.degrees} mode="major"/></div>
    {item.progressions.length>1
     ?<div className="dojo-jazz-list-versions" role="group" aria-label={`${item.title}の版`}>{item.progressions.map(pid=><button type="button" key={pid} aria-pressed={pid===id} data-testid="jazz-list-version" data-jazz-version={pid} onClick={()=>setChosen(c=>({...c,[item.id]:pid}))}>{buildJazzProgression(pid).variantLabel}</button>)}</div>
     :null}
    <p className="dojo-builtin-chords">{prog.key}：{prog.cards.map(c=>c.display).join(' → ')}</p>
   </article>;})}</div>
 </section>;
}
