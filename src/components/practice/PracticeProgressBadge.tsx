import {useEffect} from 'react';
import {useStore} from 'zustand';
import {dojoStore} from '../../domain/chordDojo/runtime';
import {vaultKey} from '../../domain/chordDojo/collect';
import type {SavedProgressionBlock} from '../../domain/types';
export function PracticeProgressBadge({block,compact=false}:{block:SavedProgressionBlock;compact?:boolean;effectiveKeySignature?:string}){
 const records=useStore(dojoStore,s=>s.file.progressions);useEffect(()=>{void dojoStore.getState().initialize();},[]);
 const key=vaultKey(block),items=Object.entries(records).filter(([k,v])=>k===key&&!v.missingSince).map(([,v])=>v);
 if(!items.length||items.some(v=>v.state==='new'))return null;
 const due=items.some(v=>v.nextCheckAt&&v.nextCheckAt<=new Date().toISOString()),passed=items.every(v=>v.state==='passed');const label=due?'確認が要る':passed?'合格':'仮の合格';
 return <span className="inline-flex max-w-full rounded border border-teal-600 px-1.5 py-0.5 text-[10px] text-teal-200" title={label} data-practice-state={due?'confirmation-due':passed?'confirmed':'provisional'}>{compact?label:label}</span>;
}
