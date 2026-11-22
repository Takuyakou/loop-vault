import { Check, ChevronLeft, Copy, Pencil } from "lucide-react";
import { FavoriteDots, Select, useTransientFlag } from "../components/ui";
import { FavoriteIcon } from "../components/icons";
import { ProgressionMidiControl } from "../components/ProgressionMidiControl";
import { buildProgressionMidi } from "../domain/midiExport";
import { displayKey } from "../domain/displayLabels";
import { formatProgressionText } from "../domain/progressionText";
import { classifyProgression, progressionTagLabel } from "../domain/progressionClassification/mod";
import { isProgressionMidiExportEnabled } from "../midiExport/featureFlag";
import { displayChordLabel } from "../ui/chordText";
import { progressionBars, progressionSourceKind, progressionSourceLabels } from "./vault/progressionFacts";
import { DetailView } from "./DetailView";
import { registerCloseBlocker } from "../store/closeBlocker";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { describeBlockMemo } from "./captureLabels";
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { CorrectionWorkspace, type ProgressionWorkspaceOptions } from '../components/correction-workspace/CorrectionWorkspace';
import { WorkspaceSaveForm } from '../components/correction-workspace/WorkspaceSaveForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { displayManualTag, ProgressionTagsEditor } from '../components/ProgressionTagsEditor';
import { playbackController } from '../audio/playbackController';
import { usePreviewSound } from '../components/PreviewSoundProvider';
import { progressionToWorkspace,workspaceToProgression,progressionChanges,progressionChangeCount,progressionVersion,progressionName,orderedProgressions,splitProgressionMemo,editProgressionMemo } from '../domain/progressionWorkspace/progressionWorkspace';
import { createEditableProgression,quickCandidatesForSlot,buildAuthorReferenceIndex } from '../domain/progressionEditing';
import type { CorrectionModel } from '../domain/correction/correctionModel';
import type { EditResult } from '../domain/correction/edits';
import type { SaveRange } from '../domain/correction/saveCandidate';
import { midiExportDisabledReason,ProgressionAdvancedView,type ProgressionDetailViewProps } from './ProgressionDetailView';

/** Saved progressions use the correction workspace itself, not a second piano-roll editor. */
export function ProgressionWorkspacePage(props:ProgressionDetailViewProps&{showRomanNumerals?:boolean}){
 const {idea,block,copy,setToast,openProgression}=props;
 const controller=props.controller??playbackController;
 const {sound}=usePreviewSound();
 const [base,setBase]=useState(block);
 const [revision,setRevision]=useState(0);
 const initial=useMemo(()=>{const m=progressionToWorkspace(base);m.bpm=base.bpm??idea.bpm;return m;},[base,idea.bpm]);
 const current=useRef(initial);
 const [more,setMore]=useState(false);
 const [tags,setTags]=useState(false);
 const [memoOpen,setMemoOpen]=useState(false);
 const [advanced,setAdvanced]=useState(false);
 const [songSettings,setSongSettings]=useState(false);
 const [title,setTitle]=useState<string>();
 const [leave,setLeave]=useState<()=>void>();
 const [dirty,setDirty]=useState(false);
 const [selectedCardId,setSelectedCardId]=useState<string>();
 useEffect(()=>{if(!dirty)setBase(block);},[block]);
 const [renderModel,setRenderModel]=useState(initial);
 const onModelChange=useCallback((model:CorrectionModel)=>{current.current=model;setRenderModel(model);},[]);
 const onDirtyChange=useCallback((count:number)=>{setDirty(count>0);props.onDirtyChange?.(count>0);},[props.onDirtyChange]);
 const overwrite=useCallback((model:CorrectionModel)=>{
   const changes=progressionChanges(base,model);
   if(!Object.keys(changes).length) return true;
   const result=props.updateProgressionBlock(idea.id,base.id,changes);
   if(result!==true){if(result===false)setToast('保存できませんでした','error');return false;}
   controller.stop();const saved=workspaceToProgression(base,model);setBase(saved);setRevision(v=>v+1);current.current=progressionToWorkspace(saved);setDirty(false);props.onDirtyChange?.(false);setToast('上書き保存しました','success');return true;
 },[base,controller,idea.id,props.updateProgressionBlock,props.onDirtyChange,setToast]);
 useEffect(()=>()=>controller.stop(),[controller]);
 useEffect(()=>dirty?registerCloseBlocker({title:'変更を保存しますか？',message:'保存して閉じるか、保存せずに閉じるか選んでください。',confirmLabel:'保存せずに閉じる',cancelLabel:'戻る',saveLabel:'保存して閉じる',onSave:()=>overwrite(current.current)}):undefined,[dirty,overwrite]);
 useEffect(()=>{props.onSaveReady?.(()=>overwrite(current.current));return ()=>props.onSaveReady?.(undefined);},[props.onSaveReady,overwrite]);
 const guard=(action:()=>void)=>{if(dirty)setLeave(()=>action);else action();};
 const ordered=orderedProgressions(idea.progressionBlocks??[]);
 const authorIndex=useMemo(()=>buildAuthorReferenceIndex(props.ideas??[idea]),[props.ideas,idea]);
 const namesFor=useCallback((model:CorrectionModel,card:CorrectionModel['cards'][number])=>{
  const b=workspaceToProgression(base,model);b.chords=b.chords.map((c,i)=>({...c,eventId:model.cards[i]!.id}));
  const editable=createEditableProgression(b,model.context.meter);
  return quickCandidatesForSlot({editable,slotId:card.id,keySignature:base.detectedKey??idea.key,authorReferenceIndex:authorIndex}).slice(0,5).map(c=>c.chord);
 },[base,idea.key,authorIndex]);
 const applyRef=useRef<(result:EditResult)=>void>(()=>undefined);
 const editMeta=(model:CorrectionModel,changes:Partial<CorrectionModel>,label:string)=>applyRef.current({model:{...model,...changes},changed:true,kind:'name',label});
 const version=(model:CorrectionModel,name:string,range?:SaveRange)=>{
  const next=progressionVersion(base,model,name,range);
  const id=props.duplicateProgressionBlock(idea.id,base.id,next);
  if(!id){setToast('別の版を保存できませんでした','error');return false;}
  controller.stop();props.onDirtyChange?.(false);setToast('別の版として保存しました（元の進行はそのまま）','success');openProgression(idea.id,id);return true;
 };
 const [midiEnabled]=useState(isProgressionMidiExportEnabled);
 const showMidi=props.midiExportEnabled??midiEnabled;
 const renaming=useRef(false);
 /** H1: the progression's own name, else the song's title with the bars (as the Vault row names it) instead of 「進行」. */
 const shownName=(b:typeof base)=>splitProgressionMemo(b.memo).name??progressionName(b).replace(/^進行/,idea.title.trim()||'進行');
 /** H1/C3: Enter or leaving the field decides; Esc goes back; an empty name keeps the old one. Saved only by 「保存」. */
 const rename=(value:string|undefined)=>{
  if(!renaming.current)return;renaming.current=false;setTitle(undefined);
  const name=value?.trim();const model=current.current;const editing=workspaceToProgression(base,model);
  if(!name||name===shownName(editing))return;
  // A progression without its own name shows the song's title with its bars; a new name keeps those bars.
  const bars=splitProgressionMemo(editing.memo).name?undefined:progressionName(editing).match(/（([^（）]*)）$/)?.[1];
  editMeta(model,{progressionMemo:editProgressionMemo(editing.memo,{name:bars&&!/[）)]$/.test(name)?`${name}（${bars}）`:name})},'題名を変更');
 };
 const [copied,triggerCopied]=useTransientFlag(1100);
 const [favPop,triggerFavPop,clearFavPop]=useTransientFlag(300);
 const copyChords=(chords:Parameters<typeof formatProgressionText>[0])=>{void (async()=>{try{await navigator.clipboard.writeText(formatProgressionText(chords));triggerCopied();setToast('コードをコピーしました','success');}catch{setToast('コピーできませんでした','error');}})();};
 const options:ProgressionWorkspaceOptions={base,namesFor,onModelChange,selectedCardId,onSelectedCardChange:setSelectedCardId,
  header:(model,apply)=>{applyRef.current=apply;const editing=workspaceToProgression(base,model);const name=shownName(editing);const memo=splitProgressionMemo(editing.memo);const key=base.detectedKey??idea.key;
   let midi:{result?:ReturnType<typeof buildProgressionMidi>;disabledReason?:string}|undefined;
   if(showMidi){try{midi={result:buildProgressionMidi(editing,{ideaBpm:idea.bpm})};}catch(error){midi={disabledReason:midiExportDisabledReason(error)};}}
   const autoTags=classifyProgression({block:editing,key});
   const shownTags=[...[...autoTags.sourceTags,...autoTags.featureTags,...autoTags.useTags,...autoTags.moodTags].map(t=>({id:t.tagId,label:progressionTagLabel(t.tagId),mine:false})),...editing.tags.map(t=>({id:t,label:displayManualTag(t),mine:true}))];
   const saved=new Date(base.capturedAt);
   return <div className="lv-cw-file lv-progression-file">
    <div className="lv-progression-row">
     <button type="button" className="lv-progression-back" title="Vault の一覧へ戻る" onClick={()=>guard(props.openVault)}><ChevronLeft size={16} aria-hidden="true"/>Vault</button>
     {title!==undefined
      ?<input className="lv-progression-title-input" aria-label="進行の題名" autoFocus defaultValue={title} onFocus={e=>e.currentTarget.select()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();rename(e.currentTarget.value);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();rename(undefined);}}} onBlur={e=>rename(e.currentTarget.value)}/>
      :<button type="button" className="lv-progression-title" title="押すと題名を変えられます" aria-label={`題名「${name}」を変える`} onClick={()=>{renaming.current=true;setTitle(name);}}><strong data-testid="progression-title">{name}</strong><Pencil size={16} aria-hidden="true"/></button>}
     <button type="button" className="lv-progression-icon lv-fav-btn" data-pop={favPop?"true":undefined} aria-label={block.pinned?'お気に入りから外す':'お気に入りに入れる'} aria-pressed={Boolean(block.pinned)} title="お気に入り" onClick={()=>{if(!block.pinned)triggerFavPop();else clearFavPop();props.updateProgressionBlock(idea.id,base.id,{pinned:!block.pinned});}}><FavoriteIcon size={16} fill={block.pinned?'currentColor':'none'}/><FavoriteDots/></button>
     <button type="button" className="lv-progression-icon" data-copied={copied?"true":undefined} aria-label="コードをコピー" title="コードをコピー" onClick={()=>copyChords(editing.chords)}><span className="lv-copy-icon" aria-hidden="true">{copied?<Check className="lv-copy-icon-ok" size={16}/>:<Copy size={16}/>}</span></button>
     <span className="lv-progression-spacer"/>
     {midi?<ProgressionMidiControl label="MIDI を DAW へ" ariaLabel="MIDI を DAW へ" result={midi.result} disabledReason={midi.disabledReason} setToast={setToast} actions={props.midiExportActions}/>:null}
     <button type="button" className="lv-progression-icon" aria-label="そのほか" aria-expanded={more} onClick={()=>setMore(v=>!v)}>⋯</button>
    </div>
    <div className="lv-progression-row lv-progression-row2">
     <span className="lv-progression-fact">{key?displayChordLabel(displayKey(key)??key):'キー未設定'}</span>
     <span className="lv-progression-fact">{base.timeSignature??'4/4'}</span>
     <span className="lv-progression-fact">{progressionBars(editing)} 小節</span>
     <span className="lv-progression-fact" data-kind="source">{progressionSourceLabels[progressionSourceKind(base)]}</span>
     {Number.isNaN(saved.getTime())?null:<span className="lv-progression-fact">{saved.getMonth()+1}/{saved.getDate()} に保存</span>}
     <PracticeProgressBadge block={base} effectiveKeySignature={key}/>
     <span className="lv-progression-cap">タグ</span>
     <span className="lv-progression-tags" data-testid="progression-tags">{shownTags.map(t=><span key={`${t.mine}:${t.id}`} className="lv-progression-tag" data-mine={t.mine||undefined} title={t.mine?'自分で付けたタグ':'自動で付いたタグ'}>{t.label}</span>)}<button type="button" className="lv-progression-tag" data-add aria-expanded={tags} title="タグを足す・外す" onClick={()=>setTags(v=>!v)}>＋ タグ</button></span>
     {memo.free||memo.codes.length||memoOpen
       ?<label className="lv-progression-memo"><span className="lv-progression-cap">メモ</span><input aria-label="メモ" placeholder="メモを書く（あとで思い出すための一言）" autoFocus={memoOpen&&!memo.free} value={memo.free} onBlur={e=>{if(!e.currentTarget.value)setMemoOpen(false);}} onChange={e=>editMeta(model,{progressionMemo:editProgressionMemo(editing.memo,{free:e.target.value})},'メモを変更')}/>{memo.codes.length?<span className="lv-cw-muted lv-progression-memo-codes">{describeBlockMemo(memo.codes.join("; "))}</span>:null}</label>:<button type="button" className="lv-progression-tag" data-add data-testid="progression-memo-add" title="メモを書く" onClick={()=>setMemoOpen(true)}>＋ メモ</button>}
     {ordered.length>1?<label className="lv-progression-selector">この曲の進行 {ordered.length}<Select aria-label="この曲の進行" value={base.id} onChange={e=>{const id=e.target.value;guard(()=>openProgression(idea.id,id));}}>{ordered.map(b=><option key={b.id} value={b.id}>{progressionName(b)}{b.memo?.includes('別の版')?'・別の版':''}</option>)}</Select></label>:null}
    </div>
    {tags?<div className="lv-progression-pop lv-progression-tag-pop" role="dialog" aria-label="タグを足す・外す"><ProgressionTagsEditor block={editing} keySignature={key} onChange={c=>editMeta(model,{progressionTags:c.tags,progressionSuppressedAutoTags:c.suppressedAutoTags},'タグを変更')}/></div>:null}
    {more?<div className="lv-progression-pop lv-progression-more" role="group" aria-label="そのほかの操作">
      <button type="button" onClick={()=>{setMore(false);guard(()=>{const id=props.duplicateProgressionBlock(idea.id,base.id);if(id)openProgression(idea.id,id);});}}>複製する</button>
      <button type="button" aria-pressed={songSettings} onClick={()=>{setMore(false);setSongSettings(v=>!v);}}>この曲の情報を見る</button>
      <button type="button" aria-pressed={advanced} onClick={()=>{setMore(false);setAdvanced(v=>!v);}}>元の MIDI・以前の操作</button>
      <button type="button" data-danger onClick={()=>{setMore(false);guard(()=>props.requestDelete(idea,base));}}>この進行を削除…</button>
    </div>:null}
  </div>;},
  save:(model,range,reset)=><WorkspaceSaveForm progression={{base,model,range,onOverwrite:()=>overwrite(model),onVersion:(name,scope)=>version(model,name,scope),onDiscard:reset,changes:progressionChangeCount(base,model)}}/>,
 };
 const draft=workspaceToProgression(base,renderModel);
 return <div className="lv-capture-content lv-progression-page" data-progression-detail-view onKeyDownCapture={event=>{if(event.key==='Escape'&&(more||tags)){event.preventDefault();event.stopPropagation();setMore(false);setTags(false);}}}>
  <CorrectionWorkspace key={`${base.id}:${revision}`} model={initial} harmonyKey={block.detectedKey ?? idea.key} timeline={base.chords} fileName={progressionName(base)} previewSound={sound} controller={controller} fullSource={{kind:'detail',id:`idea:${idea.id}:progression:${base.id}`}} onPlaybackError={e=>setToast(e instanceof Error?e.message:'再生できません','error')} onChooseAnotherMidi={()=>undefined} blockCandidates={[]} save={{ideas:[],defaultNextAction:'',copy,titleFor:()=>'',onCreate:()=>undefined,onAppend:()=>false,onCopyMemo:()=>false}} progression={options} onDirtyChange={onDirtyChange} showDegrees={props.showRomanNumerals??true}/>
  {songSettings?<section className="lv-progression-subpanel" aria-label="この曲"><h3>この曲</h3><DetailView metadataOnly idea={idea} updateIdea={props.updateIdea??(()=>false)} removeProgressionBlock={()=>false} requestDelete={entry=>guard(()=>props.requestIdeaDelete?.(entry))} setToast={setToast} copy={copy}/></section>:null}
  {advanced?<ProgressionAdvancedView {...props} block={draft} onDirtyChange={undefined} updateProgressionBlock={(_idea,_block,changes)=>{const next={...draft,...changes};const converted=progressionToWorkspace(next);const changed=new Set(next.chords.flatMap((c,i)=>JSON.stringify(c.voicingMemory)!==JSON.stringify(draft.chords[i]?.voicingMemory)?[converted.cards[i]!.id]:[]));const model={...renderModel,notes:[...renderModel.notes.filter(n=>!changed.has(n.cardId)),...converted.notes.filter(n=>changed.has(n.cardId))],progressionVoicingMemories:{...renderModel.progressionVoicingMemories,...Object.fromEntries(next.chords.flatMap((c,i)=>changed.has(converted.cards[i]!.id)?[[converted.cards[i]!.id,c.voicingMemory]]:[]))}};editMeta(renderModel,model,'以前の操作で変更');return true;}}/>:null}
  <ConfirmDialog open={Boolean(leave)} title="変更を保存しますか？" description="この進行には、まだ保存していない変更があります。保存せずに移ると、その変更は消えます。" confirmLabel="保存して移る" cancelLabel="戻る" secondaryLabel="保存せずに移る" secondaryTone="danger" onConfirm={()=>{if(overwrite(current.current)){const action=leave;setLeave(undefined);action?.();}}} onSecondary={()=>{props.onDirtyChange?.(false);const action=leave;setLeave(undefined);action?.();}} onCancel={()=>setLeave(undefined)}/>
 </div>;
}
