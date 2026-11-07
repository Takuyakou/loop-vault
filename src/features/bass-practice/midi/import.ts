import { parseMidi } from "../../../domain/midi/parser";
import { parseRawSmf } from "../../../domain/midi/rawSmf";
import type { MidiSongData } from "../../../domain/midi/types";
import { exactBeatFromTicks } from "../../../domain/sourceBassline/exactBeat";
import { projectSourceBasslineNotes } from "../domain/sourceBasslinePractice";
import { midiBassSongSchema, type MidiBassSong } from "./model";
export interface BassTrackOption { index:number; label:string; count:number; min:number; max:number; median:number; drum:boolean; bassHint:boolean; bassProgram:boolean; role:string; }
export interface MidiBassImport { song:MidiSongData; tracks:BassTrackOption[]; selectedBass:number; tempoChanges:number; }
export function inspectMidiBass(bytes:Uint8Array):MidiBassImport {
  if(bytes.byteLength>2*1024*1024) throw new Error("MIDI は2MBまで読み込めます。");
  const song=parseMidi(bytes), raw=parseRawSmf(bytes);
  if(raw.format===2) throw new Error("独立した複数曲を含むMIDIは読み込めません。");
  if(raw.timeSignature[0]!==4||raw.timeSignature[1]!==4||raw.timeSignatureChanges.some(m=>m.numerator!==4||m.denominator!==4)) throw new Error("今は 4/4 の MIDI だけ読めます");
  if(song.notes.length>50000) throw new Error("音は50,000個まで読み込めます。");
  const tracks=song.tracks.flatMap(t=>{ const notes=song.notes.filter(n=>n.trackIndex===t.index); if(!notes.length)return []; const pitches=notes.map(n=>n.pitch).sort((a,b)=>a-b); const drum=t.roleHint==="percussion"||notes.some(n=>n.channel===9); const bassHint=t.roleHint==="bass"||/bass|ベース/i.test(t.name); const bassProgram=notes.some(n=>n.programExplicit&&n.program!==undefined&&n.program>=32&&n.program<=39); const simultaneous=new Set(notes.map(n=>n.startTick)).size<notes.length; return [{index:t.index,label:t.name||`トラック ${t.index+1}`,count:notes.length,min:pitches[0],max:pitches[pitches.length-1],median:pitches[Math.floor(pitches.length/2)],drum,bassHint,bassProgram,role:drum?"ドラム（使わない）":bassHint||bassProgram?"ベースらしい":simultaneous?"和音":"メロディ"}]; });
  const usable=tracks.filter(t=>!t.drum); const selected=usable.find(t=>t.bassHint)??usable.find(t=>t.bassProgram)??[...usable].sort((a,b)=>a.median-b.median||a.index-b.index)[0];
  if(!selected)throw new Error("ベースに選べるトラックがありません。");
  selected.role=selected.bassHint||selected.bassProgram?"ベースらしい":"ベースらしい（いちばん低い）";
  return {song,tracks,selectedBass:selected.index,tempoChanges:Math.max(0,raw.tempoChanges.length-1)};
}
export function buildMidiBassSong(input:MidiBassImport,bassTrack:number,accompanimentTracks:readonly number[],title:string,stringCount:4|5,transpose?:0|1):MidiBassSong {
  const track=input.tracks.find(t=>t.index===bassTrack&&!t.drum); if(!track)throw new Error("ベースを選んでください。");
  if(track.count>5000)throw new Error("ベースの音は5,000個まで読み込めます。");
  const ppq=input.song.ticksPerBeat;
  const notes=input.song.notes.filter(n=>n.trackIndex===bassTrack);
  const projected=projectSourceBasslineNotes(notes.map(n=>({pitch:n.pitch,start:exactBeatFromTicks(n.startTick,ppq),duration:exactBeatFromTicks(n.durationTick,ppq),velocity:n.velocity,continuesFromBefore:false,continuesAfterEnd:false})));
  const bass=projected.targetEvents.map(n=>({pitch:n.midiNote,startBeat:n.startBeat,durationBeats:n.durationBeats,velocity:n.velocity}));
  const accompaniment=input.tracks.filter(t=>accompanimentTracks.includes(t.index)&&t.index!==bassTrack&&!t.drum).map(t=>({trackLabel:`伴奏 ${t.index+1}`,notes:input.song.notes.filter(n=>n.trackIndex===t.index).map(n=>({pitch:n.pitch,startBeat:n.startTick/ppq,durationBeats:n.durationTick/ppq,velocity:n.velocity}))}));
  const trans=transpose??(track.min<(stringCount===4?28:23)?1:0);
  if(bass.some(n=>n.pitch+trans*12>127))throw new Error("移調後の音域を扱えません。");
  return midiBassSongSchema.parse({id:crypto.randomUUID(),title,favorite:false,createdAt:new Date().toISOString(),bpm:input.song.tempoChanges?.[0]?.bpm??120,meter:{numerator:4,denominator:4},lengthBeats:input.song.totalBars*4,transposeOctaves:trans,bass,accompaniment,importFacts:{trackCount:input.song.tracks.length,mergedSimultaneousNotes:projected.omittedSimultaneousNoteCount,tempoChanges:input.tempoChanges},attempts:[]});
}
