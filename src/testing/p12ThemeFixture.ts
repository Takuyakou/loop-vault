import {normalizedChordKey} from '../domain/voicing';
import {makeIdea} from '../domain/testFactory';
import type {SavedProgressionBlock,SongIdea} from '../domain/types';
/** Public synthetic theme: only G13 has an exact source event in the selected range. */
export function p12ThemeIdeas():SongIdea[]{
 const labels=['Dm9','G13','Cmaj9','B♭maj7'];
 const notes=[[38,53,60,64,69],[43,53,59,64,69],[36,55,62,64,71],[46,58,62,65,69]];
 const block:SavedProgressionBlock={id:'12000000-0000-4000-8000-000000000071',summaryText:'Dm9 G13 Cmaj9',memo:'G13からCmaj9へ',tags:['public-fixture'],capturedAt:'2026-10-05T00:00:00.000Z',analyzerVersion:'synthetic-theme',detectedKey:'C major',bpm:70,timeSignature:'4/4',pinned:true,startBar:1,endBar:9,
 chords:labels.map((label,i)=>{const chord={root:[2,7,0,10][i],quality:(['min9','dom13','maj9','maj7'] as const)[i],tensions:[],label};return {eventId:`theme-${i}`,bar:i===3?9:i+1,beat:1,durationBeats:4,chord,confidence:1,alternatives:[],warnings:[],...(i===1||i===3?{voicingMemory:{sourceVoicing:{schemaVersion:1 as const,source:'midi-extracted' as const,representation:'simultaneous-voicing' as const,midiNotes:notes[i],bassNote:notes[i][0],capturedForChordKey:normalizedChordKey(chord),userVerified:true}}}: {})};})};
 return [makeIdea({id:'12000000-0000-4000-8000-000000000072',title:'Dm9 G13 Cmaj9 合成テーマ',key:'C major',bpm:70,progressionBlocks:[block]})];
}
