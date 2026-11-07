import { ChevronRight } from "lucide-react";
import { DetailView } from "./DetailView";
import { registerCloseBlocker } from "../store/closeBlocker";
import { PracticeProgressBadge } from "../components/practice/PracticeProgressBadge";
import { describeBlockMemo } from "./captureLabels";
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { CorrectionWorkspace, type ProgressionWorkspaceOptions } from '../components/correction-workspace/CorrectionWorkspace';
import { WorkspaceSaveForm } from '../components/correction-workspace/WorkspaceSaveForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProgressionTagsEditor } from '../components/ProgressionTagsEditor';
import { playbackController } from '../audio/playbackController';
import { usePreviewSound } from '../components/PreviewSoundProvider';
import { progressionToWorkspace,workspaceToProgression,progressionChanges,progressionChangeCount,progressionVersion,progressionName,orderedProgressions,splitProgressionMemo,editProgressionMemo } from '../domain/progressionWorkspace/progressionWorkspace';
import { createEditableProgression,quickCandidatesForSlot,buildAuthorReferenceIndex } from '../domain/progressionEditing';
import type { CorrectionModel } from '../domain/correction/correctionModel';
import type { EditResult } from '../domain/correction/edits';
import type { SaveRange } from '../domain/correction/saveCandidate';
import { buildVaultChordContextSnapshot,selectVaultChordContextSections } from '../features/bass-practice/domain';
import { ProgressionAdvancedView,type ProgressionDetailViewProps } from './ProgressionDetailView';

/** Saved progressions use the correction workspace itself, not a second piano-roll editor. */
export function ProgressionWorkspacePage(props:ProgressionDetailViewProps){
 const {idea,block,copy,setToast,openProgression}=props;
 const controller=props.controller??playbackController;
 const {sound}=usePreviewSound();
 const [base,setBase]=useState(block);
 const [revision,setRevision]=useState(0);
 const initial=useMemo(()=>{const m=progressionToWorkspace(base);m.bpm=base.bpm??idea.bpm;return m;},[base,idea.bpm]);
 const current=useRef(initial);
 const [more,setMore]=useState(false);
 const [tags,setTags]=useState(false);
 const [advanced,setAdvanced]=useState(false);
 const [songSettings,setSongSettings]=useState(false);
 const [title,setTitle]=useState<string>();
 const [leave,setLeave]=useState<()=>void>();
 const [dirty,setDirty]=useState(false);
 const [selectedCardId,setSelectedCardId]=useState<string>();
 useEffect(()=>{if(!dirty)setBase(block);},[block]);
 const [contextSection,setContextSection]=useState<string>();
 const sections=useMemo(()=>{const r=selectVaultChordContextSections(base);return r.ok?r.sections:[];},[base]);
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
 const practice=()=>{
  const section=sections.find(s=>s.id===contextSection)??sections[0];if(!section||!props.openPractice)return;
  guard(()=>{const snapshot=buildVaultChordContextSnapshot({sourceReference:{ideaId:idea.id,blockId:base.id},block:workspaceToProgression(base,current.current),sectionId:section.id});if(snapshot.ok)props.openPractice!(snapshot.snapshot);else setToast('この進行では練習を開けません','error');});
 };
 const options:ProgressionWorkspaceOptions={base,namesFor,onModelChange,selectedCardId,onSelectedCardChange:setSelectedCardId,
  header:(model,apply)=>{applyRef.current=apply;const editing=workspaceToProgression(base,model);return <div className="lv-cw-file lv-progression-file">
    <strong data-testid="progression-title">{progressionName(editing)}</strong>
    <label className="lv-progression-selector">この曲の進行（{ordered.length}）<select aria-label="この曲の進行" value={base.id} onChange={e=>{const id=e.target.value;guard(()=>openProgression(idea.id,id));}}>{ordered.map(b=><option key={b.id} value={b.id}>{progressionName(b)}{b.memo?.includes('別の版')?'・別の版':''}</option>)}</select></label>
    <span className="lv-cw-file-meta">{idea.title}・{base.timeSignature??"4/4"}・{base.detectedKey??idea.key??'キー未設定'}</span>
    <button type="button" className="lv-cw-btn" onClick={()=>setTags(v=>!v)}>＋ タグ</button>
    <input aria-label="メモ" className="lv-progression-memo" value={splitProgressionMemo(editing.memo).free} onChange={e=>editMeta(model,{progressionMemo:editProgressionMemo(editing.memo,{free:e.target.value})},'メモを変更')}/>
    {props.openVoicingPractice?<button type="button" className="lv-cw-btn" data-testid="voicing-loop-handoff" onClick={()=>guard(()=>props.openVoicingPractice!(idea.id,base.id))}>Voicing Loop</button>:null}
    {props.openChordDojo?<button type="button" className="lv-cw-btn" onClick={()=>guard(()=>props.openChordDojo!(idea.id,base.id))}>Chord Dojo</button>:null}
    {props.openPractice?<span data-testid="chord-context-handoff"><button type="button" className="lv-cw-btn" disabled={!sections.length} onClick={practice}>Bass Practice</button></span>:null}
    <button type="button" className="lv-cw-btn" aria-label="そのほか" aria-expanded={more} onClick={()=>setMore(v=>!v)}>⋯</button>
    <PracticeProgressBadge block={base} effectiveKeySignature={base.detectedKey??idea.key}/>
    {splitProgressionMemo(editing.memo).codes.length?<span className="lv-cw-muted">{describeBlockMemo(splitProgressionMemo(editing.memo).codes.join("; "))}</span>:null}
    {tags?<div className="lv-progression-subpanel"><ProgressionTagsEditor block={editing} keySignature={base.detectedKey??idea.key} onChange={c=>editMeta(model,{progressionTags:c.tags,progressionSuppressedAutoTags:c.suppressedAutoTags},'タグを変更')}/></div>:null}
    {more?<div className="lv-progression-more" role="group" aria-label="そのほかの操作">
      <button type="button" className="lv-cw-btn" onClick={()=>setTitle(progressionName(editing))}>題名を変える</button>
      <button type="button" className="lv-cw-btn" onClick={()=>guard(()=>{const id=props.duplicateProgressionBlock(idea.id,base.id);if(id)openProgression(idea.id,id);})}>複製</button>
      <button type="button" className="lv-cw-btn" onClick={()=>guard(()=>props.requestDelete(idea,base))}>この進行を削除…</button>
      <button type="button" className="lv-cw-btn" onClick={()=>setSongSettings(v=>!v)}>この曲・以前の項目を見る</button>
      <button type="button" className="lv-cw-btn" onClick={()=>setAdvanced(v=>!v)}>MIDI書き出し・元MIDI・コピー</button>
      {sections.length>1?<label>練習の区切り<select aria-label="Chord Context のセクション" data-testid="chord-context-section-select" value={contextSection??sections[0]!.id} onChange={e=>setContextSection(e.target.value)}>{sections.map(s=><option key={s.id} value={s.id}>{s.startBar}–{s.endBar}小節</option>)}</select></label>:null}
    </div>:null}
  </div>;},
  save:(model,range,reset)=><WorkspaceSaveForm progression={{base,model,range,onOverwrite:()=>overwrite(model),onVersion:(name,scope)=>version(model,name,scope),onDiscard:reset,changes:progressionChangeCount(base,model)}}/>,
 };
 const draft=workspaceToProgression(base,renderModel);
 return <div className="lv-capture-content lv-progression-page" data-progression-detail-view onKeyDownCapture={event=>{if(event.key==='Escape'&&(more||tags||title!==undefined)){event.preventDefault();event.stopPropagation();setMore(false);setTags(false);setTitle(undefined);}}}>
  <nav className="lv-progression-breadcrumb" aria-label="現在の場所"><button type="button" onClick={()=>guard(props.openVault)}>Vault</button><span><ChevronRight size={16} aria-hidden /> {idea.title} <ChevronRight size={16} aria-hidden /> {progressionName(base)}</span></nav>
  <CorrectionWorkspace key={`${base.id}:${revision}`} model={initial} timeline={base.chords} fileName={progressionName(base)} previewSound={sound} controller={controller} fullSource={{kind:'detail',id:`idea:${idea.id}:progression:${base.id}`}} onPlaybackError={e=>setToast(e instanceof Error?e.message:'再生できません','error')} onChooseAnotherMidi={()=>undefined} blockCandidates={[]} save={{ideas:[],defaultNextAction:'',copy,titleFor:()=>'',onCreate:()=>undefined,onAppend:()=>false,onCopyMemo:()=>false}} progression={options} onDirtyChange={onDirtyChange}/>
  {songSettings?<section className="lv-progression-subpanel" aria-label="この曲"><h3>この曲</h3><DetailView metadataOnly idea={idea} updateIdea={props.updateIdea??(()=>false)} removeProgressionBlock={()=>false} requestDelete={entry=>guard(()=>props.requestIdeaDelete?.(entry))} setToast={setToast} copy={copy}/></section>:null}
  {advanced?<ProgressionAdvancedView {...props} block={draft} onDirtyChange={undefined} updateProgressionBlock={(_idea,_block,changes)=>{const next={...draft,...changes};const converted=progressionToWorkspace(next);const changed=new Set(next.chords.flatMap((c,i)=>JSON.stringify(c.voicingMemory)!==JSON.stringify(draft.chords[i]?.voicingMemory)?[converted.cards[i]!.id]:[]));const model={...renderModel,notes:[...renderModel.notes.filter(n=>!changed.has(n.cardId)),...converted.notes.filter(n=>changed.has(n.cardId))],progressionVoicingMemories:{...renderModel.progressionVoicingMemories,...Object.fromEntries(next.chords.flatMap((c,i)=>changed.has(converted.cards[i]!.id)?[[converted.cards[i]!.id,c.voicingMemory]]:[]))}};editMeta(renderModel,model,'以前の操作で変更');return true;}}/>:null}
  <ConfirmDialog open={Boolean(leave)} title="変更を保存しますか？" description="保存して移るか、保存せずに移るか選んでください。" confirmLabel="保存して移る" cancelLabel="戻る" secondaryLabel="保存せずに移る" onConfirm={()=>{if(overwrite(current.current)){const action=leave;setLeave(undefined);action?.();}}} onSecondary={()=>{props.onDirtyChange?.(false);const action=leave;setLeave(undefined);action?.();}} onCancel={()=>setLeave(undefined)}/>
  {title!==undefined?<section className="lv-progression-subpanel" role="dialog" aria-label="題名を変える"><label>進行の題名<input aria-label="進行の題名" value={title} onChange={e=>setTitle(e.target.value)}/></label><button type="button" className="lv-cw-btn" onClick={()=>{editMeta(current.current,{progressionMemo:editProgressionMemo(workspaceToProgression(base,current.current).memo,{name:title})},'題名を変更');setTitle(undefined);}}>決定</button><button type="button" className="lv-cw-btn" onClick={()=>setTitle(undefined)}>戻る</button></section>:null}
 </div>;
}
