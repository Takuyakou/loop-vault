import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, IconButton, SegmentedControl, Select } from "../../../components/ui";
import { useMetronome } from "../../../components/MetronomeProvider";
import { STANDARD_BASS_TUNINGS } from "../domain/constants";
import { fretboardPositions } from "../domain/mapping";
import { DegreeFretboard } from "../ui/DegreeFretboard";
import { EchoPracticeFrame, EchoRail } from "../ui/EchoPracticeFrame";
import { EchoPracticeProgress } from "../ui/EchoPracticeChrome";
import { RecordCompareSection, type MidiRecordingCommands } from "../recording/ui/RecordCompareSection";
import type { RecordingTake } from "../recording/application/ports";
import { MidiBassPlayback } from "./playback";
import { analyzeMidiBassRecording } from "./analyzeRecording";
import { MIDI_BASS_FEEDBACK_QUALIFIED } from "./qualification";
import type { BassAnalysis } from "./analysis";
import { midiBassWindow, bestMidiBassAttempt, type MidiBassSong, type MidiBassSettings, type MidiBassNote } from "./model";
import { noteName } from "./noteName";
import type { DegreeUiSettings } from "../ui/BassPracticeView";
export interface MidiBassPracticeProps { song:MidiBassSong; settings:MidiBassSettings; instrument:DegreeUiSettings; onBack:()=>void; onSongChange:(song:MidiBassSong)=>Promise<void>; onSettingsChange:(settings:MidiBassSettings)=>Promise<void>; }
export function MidiBassPractice({song,settings,instrument,onBack,onSongChange,onSettingsChange}:MidiBassPracticeProps) {
  const [startBar,setStartBar]=useState(1),[bars,setBars]=useState(settings.defaultWindowBars),[tempo,setTempo]=useState(settings.defaultTempoPercent);
  const [showFret,setShowFret]=useState(false),[reference,setReference]=useState(true),[accompaniment,setAccompaniment]=useState(true),[playing,setPlaying]=useState(false),[recording,setRecording]=useState(false),[counting,setCounting]=useState(false),[analyzing,setAnalyzing]=useState(false),[beat,setBeat]=useState(0),[result,setResult]=useState<BassAnalysis>(),[error,setError]=useState<string>();
  const playback=useMemo(()=>new MidiBassPlayback(),[]),commands=useRef<MidiRecordingCommands|null>(null),analysisRef=useRef<AbortController>(),softwareOffset=useRef(0),scrollRef=useRef<HTMLDivElement>(null),countTimer=useRef<ReturnType<typeof setTimeout>>(),[count,setCount]=useState(4);
  const {enabled:click,setEnabled:setClick}=useMetronome();
  const window=useMemo(()=>midiBassWindow(song,startBar,bars,tempo),[song,startBar,bars,tempo]);const signature=`${song.id}:${window.startBar}:${bars}:${tempo}`;const totalBars=Math.ceil(song.lengthBeats/4);const locked=recording||counting||analyzing;const best=bestMidiBassAttempt(song);
  const [laneWidth,setLaneWidth]=useState(0);
  const beatWidth=Math.max(showFret?64:48,Math.max(0,laneWidth-90)/window.lengthBeats);
  const chordLabels=song.chordLabels?.filter(c=>c.startBeat>=window.startBeat&&c.startBeat<window.startBeat+window.lengthBeats)??[];
  useEffect(()=>{const element=scrollRef.current;if(!element)return;const measure=()=>setLaneWidth(element.clientWidth);measure();if(typeof ResizeObserver==="undefined")return;const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  const stop=()=>{playback.stop();setPlaying(false);setRecording(false);setCounting(false);setAnalyzing(false);if(countTimer.current)clearTimeout(countTimer.current);analysisRef.current?.abort();};
  useEffect(()=>()=>{playback.stop();analysisRef.current?.abort();if(countTimer.current)clearTimeout(countTimer.current);},[playback]);
  const audioOptions=useRef({reference,accompaniment,click});audioOptions.current={reference,accompaniment,click};
  const playPrepared=(record=false,onEnded=()=>undefined)=>playback.start(!record&&audioOptions.current.reference?window.bass:[],audioOptions.current.accompaniment?window.accompaniment.flatMap(t=>t.notes):[],window.bpm,window.lengthBeats,audioOptions.current.click,setBeat,()=>{setPlaying(false);onEnded();});
  const listen=async()=>{if(locked)return;if(playing){stop();return;}try{if(await playback.prepare()){setBeat(0);setPlaying(true);playPrepared();}}catch{setError("お手本を再生できませんでした。");}};
  const cancelRecording=()=>{stop();setResult(undefined);setError("途中で止めたため、判定・記録は行っていません。");};
  const completed=async(take:RecordingTake)=>{setRecording(false);setPlaying(false);setCounting(false);setAnalyzing(true);setError(undefined);const controller=new AbortController();analysisRef.current?.abort();analysisRef.current=controller;
    try{if(!MIDI_BASS_FEEDBACK_QUALIFIED){setError("音の判定は資格確認が未完了のため表示しません。録音を聴き比べできます。");return;}
      const measured=await analyzeMidiBassRecording({...take,metadata:{...take.metadata,startOffsetMs:take.metadata.startOffsetMs+softwareOffset.current}},window.bass,window.bpm,settings,controller.signal);if(controller.signal.aborted)return;setResult(measured);
      const attempt={completedAt:new Date().toISOString(),window:{startBar:window.startBar,bars:window.bars},tempoPercent:tempo,toleranceMs:settings.timingToleranceMs,counts:measured.counts,meanOffsetMs:measured.meanOffsetMs,latencyCorrectionMs:measured.latencyCorrectionMs,marks:measured.marks.map(m=>m.kind)};
      await onSongChange({...song,lastPracticedAt:attempt.completedAt,attempts:[attempt,...song.attempts].slice(0,200)});
    }catch(c){if(!controller.signal.aborted)setError(c instanceof Error?c.message:"録音を判定できませんでした。");}finally{if(!controller.signal.aborted)setAnalyzing(false);}
  };
  const changeWindow=(nextStart:number,nextBars=bars,nextTempo=tempo)=>{if(locked)return;stop();setResult(undefined);setBeat(0);setError(undefined);setStartBar(nextStart);setBars(nextBars);setTempo(nextTempo);void onSettingsChange({...settings,defaultWindowBars:nextBars,defaultTempoPercent:nextTempo}).catch(()=>setError("設定を保存できませんでした。"));};
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target instanceof HTMLElement&&(event.target.closest("input,select,textarea,[contenteditable='true']")||event.key!=="Escape"&&event.target.closest("button")))return;const key=event.key.toLowerCase();if(key===" "){event.preventDefault();void listen();}else if(key==="r"){event.preventDefault();if(!locked&&window.bass.length>0&&window.durationMs<=59800)commands.current?.start();}else if(key==="escape"){event.preventDefault();if(locked)commands.current?.stop();else stop();}else if(key==="n"&&!locked){event.preventDefault();changeWindow(window.startBar+window.bars<=totalBars?window.startBar+window.bars:1);}};globalThis.window.addEventListener("keydown",handler);return()=>globalThis.window.removeEventListener("keydown",handler);});
  useEffect(()=>{if(!playing&&!recording)return;const viewport=scrollRef.current;if(!viewport)return;const x=64+beat*beatWidth;if(x>viewport.scrollLeft+viewport.clientWidth-100||x<viewport.scrollLeft)viewport.scrollLeft=Math.max(0,x-viewport.clientWidth*.3);},[beat,playing,recording,beatWidth]);
  const countDown=()=>{setCounting(true);setCount(4);playback.countIn(window.bpm);let left=4;const tick=()=>{left--;setCount(Math.max(1,left));if(left>0)countTimer.current=setTimeout(tick,60000/window.bpm);};countTimer.current=setTimeout(tick,60000/window.bpm);};
  const resetKey=signature; const currentNote=window.bass.find(n=>beat>=n.startBeat&&beat<n.startBeat+n.durationBeats);
  const nextWindow=()=>changeWindow(window.startBar+window.bars<=totalBars?window.startBar+window.bars:1);
  return <EchoPracticeFrame><div className="bass-midi-layout" data-testid="midi-bass-practice"><div className="bass-midi-content">
    <div className="bass-echo-task bass-midi-task">
      <div className="bass-midi-task-heading"><div className="bass-midi-song-heading"><h2>{song.title}</h2><span>{totalBars}小節 · 元のテンポ {song.bpm} BPM · 4/4</span></div><div className="flex items-center gap-2"><Chip selected={song.favorite} disabled={locked} onClick={()=>void onSongChange({...song,favorite:!song.favorite}).catch(()=>setError("保存できませんでした。"))}>☆ お気に入り</Chip><Button size="sm" disabled={locked} onClick={()=>{stop();onBack();}}>一覧へ</Button></div></div>
      <div className="bass-midi-task-controls">
        <div className="bass-midi-control-group"><span>区間</span><IconButton label="前の区間" size="sm" disabled={locked||window.startBar===1} onClick={()=>changeWindow(Math.max(1,window.startBar-window.bars))}>‹</IconButton><Select aria-label="開始小節" value={window.startBar} disabled={locked} onChange={e=>changeWindow(Number(e.target.value))}>{Array.from({length:totalBars},(_,i)=><option key={i} value={i+1}>{i+1}〜{Math.min(totalBars,i+(bars==="all"?totalBars:bars))}小節</option>)}</Select><IconButton label="次の区間" size="sm" disabled={locked||window.startBar+window.bars>totalBars} onClick={()=>changeWindow(window.startBar+window.bars)}>›</IconButton></div>
        <span className="bass-midi-separator" aria-hidden="true" />
        <div className="bass-midi-control-group"><span>長さ</span><SegmentedControl label="区間の長さ" value={String(bars)} options={[1,2,4,8,"all"].map(b=>({value:String(b),label:b==="all"?"全部":b,disabled:locked}))} onChange={b=>changeWindow(startBar,b==="all"?"all":Number(b) as 1|2|4|8)} /></div>
        <span className="bass-midi-separator" aria-hidden="true" />
        <div className="bass-midi-control-group"><span>テンポ</span><SegmentedControl label="MIDI練習テンポ" value={String(tempo)} options={[60,80,100].map(t=>({value:String(t),label:`${t}%`,disabled:locked}))} onChange={t=>changeWindow(startBar,bars,Number(t) as 60|80|100)} /><span>{Math.round(window.bpm)} BPM</span></div>
        <span className="bass-midi-separator" aria-hidden="true" /><Chip aria-label="弦とフレットを出す" selected={showFret} disabled={locked} onClick={()=>setShowFret(v=>!v)}>弦とフレット</Chip>
      </div>
      <div className="bass-midi-overview" style={{gridTemplateColumns:`repeat(${Math.min(128,totalBars)},minmax(0,1fr))`}} role="group" aria-label="曲全体の帯">{Array.from({length:Math.min(128,totalBars)},(_,bin)=>{const i=Math.floor(bin*totalBars/Math.min(128,totalBars));return <button type="button" key={i} data-best={Boolean(best&&i+1>=best.window.startBar&&i+1<best.window.startBar+best.window.bars)} aria-label={`${i+1}小節から練習`} aria-pressed={i+1>=window.startBar&&i+1<window.startBar+window.bars} disabled={locked} onClick={()=>changeWindow(i+1)}>{i+1}<span aria-hidden="true">{song.bass.some(n=>n.startBeat>=i*4&&n.startBeat<(i+1)*4)?"••":"·"}</span></button>;})}</div>
    </div>
    <EchoPracticeProgress ariaLabel="MIDI のベースラインの進行" currentIndex={result?2:locked?1:0} steps={["聴く","弾く（録音）","結果"]} />
    {result?<div className="bass-midi-result" data-testid="midi-bass-result"><div className="bass-midi-result-main"><strong>{result.counts.correct}/{result.counts.total} 合いました</strong><span data-tone="danger">音が違う {result.counts.wrongPitch}</span><span data-tone="warning">早い・遅い {result.counts.timing}</span><span>抜け {result.counts.missed}</span><span data-tone="danger">余分な音 {result.counts.extra}</span><span>タイミング 平均 {result.meanOffsetMs>=0?"+":""}{Math.round(result.meanOffsetMs)}ms（{Math.abs(result.meanOffsetMs)<=15?"ちょうど":result.meanOffsetMs>0?"少し遅め":"少し早め"}）</span></div><div className="bass-midi-result-detail"><span>音のずれの補正 {settings.autoLatencyCorrection?`自動（${Math.round(result.latencyCorrectionMs)}ms）`:"切る"} · 判定は目安です</span><span>✓ 合った · ✗ 音が違う · ＋ 余分 · 早い／遅い · 抜け</span></div></div>:<p role="status" aria-live="polite" className="bass-midi-status">{analyzing?"判定しています…（音の高さとタイミング）":counting?`カウント ${count} …`:recording?"録音中 ・ 伴奏に合わせて弾いてください":"お手本を聴いてから、伴奏に合わせて弾いてください。"}</p>}
    <div className="bass-midi-lanes" ref={scrollRef}><div className="bass-midi-lanes-inner" style={{width:64+window.lengthBeats*beatWidth}}>
      <div className="bass-midi-track bass-midi-bars"><span /><div className="bass-midi-lane">{Array.from({length:window.bars},(_,i)=><span key={i} style={{position:"absolute",left:i*4*beatWidth}} className="text-xs">{window.startBar+i}小節</span>)}</div></div>
      {chordLabels.length?<div className="bass-midi-track bass-midi-accompaniment" role="group" aria-label="伴奏の段"><span className="bass-midi-track-label">伴奏</span><div className="bass-midi-lane">{chordLabels.map(c=><span key={c.startBeat} style={{position:"absolute",left:(c.startBeat-window.startBeat)*beatWidth}}>{c.label}</span>)}</div></div>:null}
      <BassNoteLane label="お手本" notes={window.bass} beatWidth={beatWidth} beat={beat} instrument={instrument} showFret={showFret} />
      <BassNoteLane label="自分" notes={window.bass} beatWidth={beatWidth} result={result} bpm={window.bpm} instrument={instrument} showFret={showFret} />
    </div></div>
    {showFret?<DegreeFretboard rawNotes={currentNote?[currentNote.pitch]:window.bass.map(n=>n.pitch)} rawTuning={STANDARD_BASS_TUNINGS[instrument.stringCount]} rawFretRange={instrument.fretRange} handedness={instrument.handedness} hintLevel={4} />:null}
    {error?<p role="alert">{error}</p>:null}
    </div><div className="bass-echo-task bass-midi-actions"><div className="bass-midi-audio-chips"><Chip selected={reference} disabled={locked} onClick={()=>setReference(v=>!v)}>お手本</Chip>{song.accompaniment.length?<Chip selected={accompaniment} disabled={locked} onClick={()=>setAccompaniment(v=>!v)}>伴奏</Chip>:null}<Chip selected={click} disabled={locked} onClick={()=>setClick(!click)}>クリック</Chip></div><div className="bass-midi-action-buttons">
      {analyzing?<span role="status">判定しています…</span>:locked?<Button variant="primary" size="sm" onClick={()=>commands.current?.stop()}>■ 止める（Esc）</Button>:result?<><Button size="sm" onClick={()=>commands.current?.playTake()}>▶ 自分の演奏</Button><Button size="sm" onClick={()=>commands.current?.playOverlay()}>▶ お手本と重ねて</Button><Button size="sm" disabled={window.bass.length===0||window.durationMs>59800} onClick={()=>commands.current?.start()}>● もう一度録る（R）</Button><Button variant="primary" size="sm" onClick={nextWindow}>次の区間へ（N）</Button></>:<><Button size="sm" onClick={()=>void listen()}>{playing?"■ 止める（Space）":"▶ 聴く（Space）"}</Button><Button variant="primary" size="sm" disabled={window.bass.length===0||window.durationMs>59800} onClick={()=>commands.current?.start()}>● 録って弾く（R）</Button></>}
    </div></div>
    <RecordCompareSection mode="midi-bassline" resetKey={resetKey} countInMs={4*60000/window.bpm} midiRecording={{statusText:analyzing?"判定しています…":counting?`カウント ${count}…`:recording?`● 録音中 ${formatRecordingTime(beat*60000/window.bpm)} / ${formatRecordingTime(window.durationMs)}`:undefined,durationMs:window.durationMs,startOffsetMs:()=>softwareOffset.current,commands,onCompleted:take=>void completed(take),onCanceled:cancelRecording,onCountIn:countDown}}
      recordStartDisabledReason={window.bass.length===0?"この区間にはベースの音がありません。別の区間を選んでください。":window.durationMs>59800?"録音は60秒までです。区間を短くするかテンポを上げてください。":analyzing?"判定中です。":undefined}
      onRecordingPrepare={async()=>{setResult(undefined);setError(undefined);setPlaying(false);setBeat(0);return playback.prepare();}}
      onRecordingStart={()=>{setCounting(false);setRecording(true);setPlaying(true);softwareOffset.current=playPrepared(true);}}
      onRecordingStop={()=>{playback.stop();setPlaying(false);}}
      onRecordingActivityChange={active=>{if(!active){setRecording(false);setCounting(false);}}}
      onPlaybackStart={()=>{playback.stop();setPlaying(false);}}
      targetPlayer={{prepare:()=>playback.prepare(),play:onEnded=>{const delay=playback.start(window.bass,[],window.bpm,window.lengthBeats,false,setBeat,onEnded,softwareOffset.current);return {stop:()=>playback.stop(),audioDelayMs:Math.max(0,delay-softwareOffset.current)};}}} />
    <EchoRail><section className="space-y-3"><h3 className="font-semibold">この区間の記録</h3>{song.attempts.filter(a=>a.window.startBar===window.startBar&&a.window.bars===window.bars).slice(0,5).map((a,i)=><p className="text-xs" key={`${a.completedAt}-${i}`}>{new Date(a.completedAt).toLocaleString("ja-JP")} · {a.counts.correct}/{a.counts.total} 合いました</p>)}
      <details><summary>判定の決まり</summary><div className="space-y-2 text-xs"><label>タイミングの許し<Select aria-label="タイミングの許し" value={settings.timingToleranceMs} disabled={locked} onChange={e=>void onSettingsChange({...settings,timingToleranceMs:Number(e.target.value) as 50|70|100})}><option value={50}>きびしい ±50ms</option><option value={70}>ふつう ±70ms</option><option value={100}>ゆるい ±100ms</option></Select></label><label className="block"><input type="checkbox" checked={settings.octaveCountsAsCorrect} disabled={locked} onChange={e=>void onSettingsChange({...settings,octaveCountsAsCorrect:e.target.checked})} />オクターブ違いを合いにする</label><label className="block"><input type="checkbox" checked={settings.autoLatencyCorrection} disabled={locked} onChange={e=>void onSettingsChange({...settings,autoLatencyCorrection:e.target.checked})} />音のずれの補正 自動</label></div></details>
      <p className="text-xs text-[var(--lv-text-muted)]">単音の演奏を対象にした目安です。録音は「残す」を押した時だけ保存します。</p>
    </section></EchoRail>
  </div></EchoPracticeFrame>;
}
function BassNoteLane({label,notes,beatWidth,beat,result,bpm=120,instrument,showFret=false}:{label:string;notes:MidiBassNote[];beatWidth:number;beat?:number;result?:BassAnalysis;bpm?:number;instrument?:DegreeUiSettings;showFret?:boolean}){
  return <div className="bass-midi-track" role="group" aria-label={`${label}の段`}><span className="bass-midi-track-label">{label}</span><div className="bass-midi-lane">{(label==="自分"&&!result?[]:notes).map((n,i)=>{
    const mark=result?.marks[i];
    const pitch=mark?.played?.pitch??n.pitch;
    const position=instrument?fretboardPositions(pitch,STANDARD_BASS_TUNINGS[instrument.stringCount],instrument.fretRange)[0]:undefined;
    const fullName=noteName(pitch)+(position?` ${instrument!.stringCount-position.stringIndex}弦 ${position.fret}`:"");
    const width=Math.max(1,n.durationBeats*beatWidth);
    const text=mark?mark.kind==="ok"?"✓":mark.kind==="pitch"?`✗ ${noteName(pitch)}`:mark.kind==="miss"?"抜け":`${mark.kind==="late"?"遅い":"早い"} ${Math.abs(Math.round(mark.offsetMs??0))}ms`:noteName(pitch);
    return <span key={i} className="bass-midi-note" data-mark={mark?.kind} title={`${text} ${fullName}`} aria-label={`${text} ${fullName}`} style={{left:n.startBeat*beatWidth,width,outline:beat!==undefined&&beat>=n.startBeat&&beat<n.startBeat+n.durationBeats?"2px solid var(--lv-accent)":undefined}}>{(mark?.kind==="ok"?width>=12:fitsNoteText(text,width,24))?<span className="bass-midi-note-text">{text}</span>:null}{showFret&&position&&width>=44?<small>{instrument!.stringCount-position.stringIndex}弦 {position.fret}</small>:null}</span>;
  })}{result?.extras.map((n,i)=>{const width=Math.max(1,(n.offsetMs-n.onsetMs)*bpm/60000*beatWidth);const position=instrument?fretboardPositions(n.pitch,STANDARD_BASS_TUNINGS[instrument.stringCount],instrument.fretRange)[0]:undefined;const text=`＋${noteName(n.pitch)}`;const fullName=text+(position?` ${instrument!.stringCount-position.stringIndex}弦 ${position.fret}`:"");return <span key={`extra-${i}`} className="bass-midi-note" data-mark="extra" title={fullName} aria-label={fullName} style={{left:Math.max(0,n.onsetMs*bpm/60000*beatWidth),width}}>{fitsNoteText(text,width,24)?<span className="bass-midi-note-text">{text}</span>:null}{showFret&&position&&width>=44?<small>{instrument!.stringCount-position.stringIndex}弦 {position.fret}</small>:null}</span>;})}{beat!==undefined?<span className="bass-midi-playhead" style={{left:beat*beatWidth}} />:null}</div></div>;
}

function formatRecordingTime(ms:number){const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;}

// Conservative 12px-font glyph bounds prevent partial/ellipsized note labels.
// The complete description remains in title/aria even when text is omitted.
function fitsNoteText(text:string,width:number,minimum:number){return width>=minimum&&[...text].reduce((sum,ch)=>sum+(/[A-Za-z0-9 +−]/.test(ch)?8:12),4)<=width;}
