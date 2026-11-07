import { useMemo,useState } from "react";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { voiceTextChordForAudition } from "../domain/textChordTones";
import { playbackController,type PlaybackController } from "../audio/playbackController";
import { PreviewSoundSelector } from "../components/PreviewSoundSelector";
import { ProgressionMidiControl,type ProgressionMidiControlActions } from "../components/ProgressionMidiControl";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { VoicingPanel } from "../components/voicing/VoicingPanel";
import { applyEditableProgressionToSavedBlock,createEditableProgression,setEditableVoicingMemories } from "../domain/progressionEditing";
import { annotateVoiceRolesV2,beatsPerBar,buildVoices,normalizeNotes } from "../domain/midi";
import type { MidiSongData } from "../domain/midi/types";
import { buildProgressionMidi,ProgressionMidiExportError } from "../domain/midiExport";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock,SongIdea } from "../domain/types";
import { sourceBasslineNoteFacts } from "../domain/sourceBassline";
import type { VaultChordContextSnapshot } from "../features/bass-practice/domain";
import { extractVoicing,setAllEligibleCardsToSource } from "../domain/voicing";
import { isProgressionMidiExportEnabled } from "../midiExport/featureFlag";
import type { AppCopy } from "../i18n";
import type { ToastFn } from "../components/notifications";
export { ProgressionWorkspacePage as ProgressionDetailView } from "./ProgressionWorkspacePage";
export interface ProgressionDetailViewProps {
  idea: SongIdea;
  ideas?: readonly SongIdea[];
  block: SavedProgressionBlock;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => boolean | "pending";
  duplicateProgressionBlock: (ideaId: string, blockId: string, draft?: SavedProgressionBlock) => string | undefined;
  openProgression: (ideaId: string, blockId: string) => void;
  openIdea: (ideaId: string) => void;
  openVault: () => void;
  requestDelete: (idea: SongIdea, block: SavedProgressionBlock) => void;
  openPractice?: (snapshot: VaultChordContextSnapshot) => void;
  openVoicingPractice?: (ideaId: string, blockId: string) => void;
  requestLeave?: (action: () => void) => void;
  onSaveReady?: (save: (() => boolean) | undefined) => void;
  updateIdea?: (id: string,changes: Partial<SongIdea>) => boolean | "pending";
  requestIdeaDelete?: (idea: SongIdea) => void;
  openChordDojo?: (ideaId: string,blockId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  setToast: ToastFn;
  copy: AppCopy;
  controller?: PlaybackController;
  loadMidiSource?: (path: string) => Promise<MidiSongData>;
  midiExportEnabled?: boolean;
  midiExportActions?: ProgressionMidiControlActions;
}

/** Former detail-only operations; all editing is committed through the shared workspace history. */
export function ProgressionAdvancedView(props:ProgressionDetailViewProps) {
  const {idea,block,copy,setToast,loadMidiSource,midiExportActions}=props;
  const controller=props.controller??playbackController;
  const meter=beatsPerBar(block.timeSignature);
  const editable=useMemo(()=>createEditableProgression(block,meter),[block,meter]);
  const [selected,setSelected]=useState(0);
  const selectedItem=block.chords[Math.min(selected,block.chords.length-1)];
  const {sound:previewSound,setSound:setPreviewSound}=usePreviewSound();
  const [reextracting,setReextracting]=useState(false);
  const [enabled]=useState(isProgressionMidiExportEnabled);
  const showMidiExport=props.midiExportEnabled??enabled;
  const sourceAsset=idea.assets.find(asset=>asset.type==='midi'&&(asset.id===block.sourceAssetId||(!block.sourceAssetId&&block.sourceFileName!==undefined&&fileNameFromPath(asset.path)===block.sourceFileName)));
  const setEditable=(update:(current:typeof editable)=>typeof editable)=>{
    const next=update(editable);if(next!==editable)props.updateProgressionBlock(idea.id,block.id,progressionDetailUpdateChanges(block,next));
  };
  const midiExport=useMemo(()=>{if(!showMidiExport)return {};try{return {result:buildProgressionMidi(block,{ideaBpm:idea.bpm})};}catch(error){return {disabledReason:midiExportDisabledReason(error)};}},[block,idea.bpm,showMidiExport]);
  async function reextractSourceVoicings() {
    if (!sourceAsset?.path || !loadMidiSource) {
      setToast("元MIDIファイルを見つけられませんでした。", "error");
      return;
    }
    if (
      editable.slots.some((slot) => slot.voicingMemory?.sourceVoicing)
      && !globalThis.confirm(`現在の進行 ${editable.slots.length} コードの元MIDIボイシングを再取得します。続けますか？`)
    ) {
      return;
    }
    setReextracting(true);
    try {
      const sourceData = await loadMidiSource(sourceAsset.path);
      const normalized = normalizeNotes(sourceData);
      const baseVoices = buildVoices(sourceData);
      const voices = annotateVoiceRolesV2(baseVoices, normalized);
      const updates = editable.slots.flatMap((slot) => {
        const startBeat = (slot.position.bar - 1) * editable.beatsPerBar + slot.position.beat - 1;
        const result = extractVoicing({
          chord: slot.currentChord,
          segment: {
            startBeat,
            endBeat: startBeat + slot.position.durationBeats,
          },
          notes: sourceData.notes,
          ticksPerBeat: sourceData.ticksPerBeat,
          voices,
        });
        return result.snapshot
          ? [{
              slotId: slot.id,
              memory: {
                ...slot.voicingMemory,
                sourceVoicing: result.snapshot,
              },
            }]
          : [];
      });
      setEditable((current) => setEditableVoicingMemories(current, updates));
      setToast(`${updates.length}/${editable.slots.length} コードのボイシングを取得しました。保存すると反映されます。`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : (
        "元MIDIから取得できませんでした。"
      ), "error");
    } finally {
      setReextracting(false);
    }
  }


  return <section className="lv-progression-subpanel" aria-label="MIDIと以前の操作">
    <PreviewSoundSelector value={previewSound} onChange={sound=>{controller.stop();setPreviewSound(sound);}} copy={copy}/>
    {showMidiExport?<ProgressionMidiControl result={midiExport.result} disabledReason={midiExport.disabledReason} setToast={setToast} actions={midiExportActions}/>:null}
    <SourceBasslineStatus block={block} progressionEdited={false}/>
    <p>元ファイル: {block.sourceFileName??block.origin??'Manual'}</p>
    <button type="button" className="lv-cw-btn" onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(formatProgressionText(block.chords));setToast('ChordDrip 用にコピーしました');}catch{setToast('コピーできませんでした','error');}})();}}>ChordDrip 用にコピー</button>
    <button type="button" className="lv-cw-btn" onClick={()=>{const candidates=editable.slots.map(slot=>({id:slot.id,chord:slot.currentChord,voicingMemory:slot.voicingMemory}));const result=setAllEligibleCardsToSource(candidates);if(result.changedCount)setEditable(current=>setEditableVoicingMemories(current,result.cards.filter((card,index)=>card!==candidates[index]).map(card=>({slotId:card.id,memory:card.voicingMemory}))));setToast(`元MIDI再生に変更: ${result.changedCount}件`);}}>対象カードを元MIDI再生に変更</button>
    <label>音の保存設定を見るカード<select aria-label="音の保存設定を見るカード" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{block.chords.map((item,index)=><option key={index} value={index}>{item.bar}小節 {item.chord.label}</option>)}</select></label>
    {selectedItem?<VoicingPanel chord={selectedItem.chord} memory={selectedItem.voicingMemory} generatedNotes={block.textSource?[...voiceTextChordForAudition(selectedItem.chord)]:voiceChordForPreview(selectedItem.chord).notes} sourceAvailable={Boolean(sourceAsset?.path&&loadMidiSource)} reextracting={reextracting} onMemoryChange={memory=>props.updateProgressionBlock(idea.id,block.id,{chords:block.chords.map((item,index)=>index===selected?{...item,voicingMemory:memory}:item)})} onReextract={()=>void reextractSourceVoicings()}/>:null}
  </section>;
}
function fileNameFromPath(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).pop();
}

export function progressionDetailUpdateChanges(
  block: SavedProgressionBlock,
  editable: Parameters<typeof applyEditableProgressionToSavedBlock>[1],
): Partial<SavedProgressionBlock> {
  const edited = applyEditableProgressionToSavedBlock(block, editable);
  const { sourceBassline, ...mutableChanges } = edited;
  void sourceBassline;
  return mutableChanges;
}

export function SourceBasslineStatus({
  block,
  progressionEdited,
}: {
  block: SavedProgressionBlock;
  progressionEdited: boolean;
}) {
  const snapshot = block.sourceBassline;
  if (!snapshot) {
    return (
      <section className="border-b border-[var(--lv-border)] py-3 text-sm" data-testid="source-bassline-detail-status">
        <p className="font-semibold text-[var(--lv-text-secondary)]">
          {"元ベースライン: 未保存"}
        </p>
      </section>
    );
  }
  const bars = formatExactBars(snapshot.length);
  const relationship = "unavailable" as const;
  const noteFacts = sourceBasslineNoteFacts(snapshot.notes);
  const harmonyCopy = "保存時の和声比較は利用できません。";
  return (
    <section
      className="min-w-0 border-b border-[var(--lv-border)] py-3 text-sm"
      aria-labelledby="source-bassline-detail-title"
      data-testid="source-bassline-detail-status"
      data-harmony-relationship={relationship}
    >
      <h3 id="source-bassline-detail-title" className="font-semibold text-[var(--lv-text)]">
        {"元ベースライン: 保存済み"}
      </h3>
      <p className="mt-1 break-words text-[var(--lv-text-secondary)]">
        {`${snapshot.notes.length}音・${bars}小節・Vault書き出しに含まれます`}
      </p>
      <p className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {`${noteFacts.simultaneous ? "同時発音あり" : "同時発音なし"}・${noteFacts.overlap ? "重なりあり" : "重なりなし"}`}
      </p>
      <p className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {harmonyCopy}
      </p>
      {progressionEdited ? (
        <p className="mt-1 break-words text-xs text-amber-100" aria-live="polite">
          {"コード進行を編集中です。保存済みの元ベースラインは変更されません。"}
        </p>
      ) : null}
    </section>
  );
}

function formatExactBars(length: { numerator: number; denominator: number }): string {
  let numerator = BigInt(length.numerator);
  let denominator = BigInt(length.denominator) * 4n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  return denominator === 1n ? numerator.toString() : `${numerator}/${denominator}`;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}
function midiExportDisabledReason(
  error: unknown,
): string {
  if (error instanceof ProgressionMidiExportError) {
    const position = error.eventIndex === undefined
      ? ""
      : (`コード${error.eventIndex + 1}: `);
    return `${position}${"MIDIに書き出せない内容があります。"}`;
  }
  return "この進行はMIDIに書き出せません。";
}
