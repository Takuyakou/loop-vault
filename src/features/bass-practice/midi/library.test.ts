// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { writeMidi, parseMidi as parseRaw } from "midi-file";
import { inspectMidiBass, buildMidiBassSong } from "./import";
import { emptyMidiBassLibrary, midiBassLibrarySchema, midiBassWindow } from "./model";
import { MidiBassLibraryRepository } from "./library";
import { BrowserPracticeStorage } from "../infra/repository/practiceStorage";
function midi(meter=4) {return new Uint8Array(writeMidi({header:{format:1,numTracks:3,ticksPerBeat:480},tracks:[[{deltaTime:0,type:"timeSignature",numerator:meter,denominator:4,metronome:24,thirtyseconds:8},{deltaTime:0,type:"setTempo",microsecondsPerBeat:500000},{deltaTime:0,type:"endOfTrack"}],[{deltaTime:0,type:"trackName",text:"bass"},{deltaTime:0,type:"programChange",channel:0,programNumber:32},{deltaTime:0,type:"noteOn",channel:0,noteNumber:23,velocity:80},{deltaTime:0,type:"noteOn",channel:0,noteNumber:35,velocity:100},{deltaTime:480,type:"noteOff",channel:0,noteNumber:23,velocity:0},{deltaTime:0,type:"noteOff",channel:0,noteNumber:35,velocity:0},{deltaTime:1440,type:"endOfTrack"}],[{deltaTime:0,type:"noteOn",channel:9,noteNumber:36,velocity:90},{deltaTime:480,type:"noteOff",channel:9,noteNumber:36,velocity:0},{deltaTime:0,type:"endOfTrack"}]]}));}
describe("independent MIDI bass library",()=>{
 test("preselects bass, projects simultaneous lowest notes and excludes drums",()=>{const data=inspectMidiBass(midi());expect(data.selectedBass).toBe(1);const song=buildMidiBassSong(data,1,[1,2],"Public fixture",4);expect(song.bass.map(n=>n.pitch)).toEqual([23]);expect(song.transposeOctaves).toBe(1);expect(song.importFacts.mergedSimultaneousNotes).toBe(1);expect(song.accompaniment).toEqual([]);expect(midiBassWindow(song,1,"all",80).bass[0].pitch).toBe(35);});
 test("rejects unsupported meter and byte/note/selected bass budgets",()=>{expect(()=>inspectMidiBass(midi(3))).toThrow("4/4");expect(()=>inspectMidiBass(new Uint8Array(2*1024*1024+1))).toThrow("2MB");const data=inspectMidiBass(midi());data.tracks[0].count=5001;expect(()=>buildMidiBassSong(data,1,[],"Fixture",5)).toThrow("5,000");});
 test("load/edit/save/reload retains source facts and independent namespaces",async()=>{localStorage.clear();const practice=new BrowserPracticeStorage(localStorage);const storage=new BrowserPracticeStorage(localStorage,"bass-midi-library");const repo=new MidiBassLibraryRepository(storage);const empty=await repo.load();const song=buildMidiBassSong(inspectMidiBass(midi()),1,[],"Fixture",5);await repo.save({...empty,songs:[song]});const reloaded=await new MidiBassLibraryRepository(storage).load();expect(reloaded.songs).toEqual([song]);expect(await practice.readCommitted()).toBeUndefined();for(let i=0;i<22;i++)await repo.save({...reloaded,songs:[{...song,favorite:i%2===0}]});expect(await storage.listBackups()).toHaveLength(20);});
 test("corrupt data quarantines and restores only schema-valid backup",async()=>{localStorage.clear();const storage=new BrowserPracticeStorage(localStorage,"bass-midi-library");const repo=new MidiBassLibraryRepository(storage);const file=await repo.load();await repo.save(file);await repo.save({...file,settings:{...file.settings,timingToleranceMs:50}});localStorage.setItem("loop-vault:bass-midi-library-v1:data","corrupt");const recovered=await new MidiBassLibraryRepository(storage).load();expect(recovered.settings.timingToleranceMs).toBe(70);expect(await storage.listRecoveryArtifacts()).toHaveLength(1);expect(localStorage.getItem("loop-vault:bass-midi-library-v1:data")).not.toBe("corrupt");});
 test("quarantined data without backup never silently resets on a later load",async()=>{localStorage.clear();const storage=new BrowserPracticeStorage(localStorage,"bass-midi-library");localStorage.setItem("loop-vault:bass-midi-library-v1:data","bad");await expect(new MidiBassLibraryRepository(storage).load()).rejects.toThrow();await expect(new MidiBassLibraryRepository(storage).load()).rejects.toThrow("隔離");});
 test("version/count/unknown private fields are rejected without migration",()=>{expect(midiBassLibrarySchema.safeParse({...emptyMidiBassLibrary(),version:2}).success).toBe(false);const song=buildMidiBassSong(inspectMidiBass(midi()),1,[],"Fixture",5);expect(midiBassLibrarySchema.safeParse({...emptyMidiBassLibrary(),songs:Array.from({length:201},()=>song)}).success).toBe(false);expect(midiBassLibrarySchema.safeParse({...emptyMidiBassLibrary(),path:"private"}).success).toBe(false);});
});

test("SMF default tempo and a later meter change are handled from raw metadata",()=>{
 const raw=parseRaw(midi());raw.tracks[0]=raw.tracks[0].filter(e=>e.type!=="setTempo");
 const withoutTempo=inspectMidiBass(new Uint8Array(writeMidi(raw)));
 expect(buildMidiBassSong(withoutTempo,1,[],"Default tempo",5).bpm).toBe(120);
 raw.tracks[0].splice(-1,0,{deltaTime:480,type:"timeSignature",numerator:3,denominator:4,metronome:24,thirtyseconds:8});
 expect(()=>inspectMidiBass(new Uint8Array(writeMidi(raw)))).toThrow("4/4");
});
test("tempo changes warn but practice preserves notes at the first tempo",()=>{
 const raw=parseRaw(midi());raw.tracks[0].splice(-1,0,{deltaTime:480,type:"setTempo",microsecondsPerBeat:750000});
 const input=inspectMidiBass(new Uint8Array(writeMidi(raw))),song=buildMidiBassSong(input,1,[],"Tempo changes",5);
 expect(song.bpm).toBe(120);expect(song.importFacts.tempoChanges).toBe(1);expect(song.bass[0]).toMatchObject({startBeat:0,durationBeats:1});
});
test("future library remains byte-identical and is not quarantined",async()=>{
 localStorage.clear();const storage=new BrowserPracticeStorage(localStorage,"bass-midi-library");
 const raw=JSON.stringify({...emptyMidiBassLibrary(),fileVersion:2,version:2});localStorage.setItem("loop-vault:bass-midi-library-v1:data",raw);
 await expect(new MidiBassLibraryRepository(storage).load()).rejects.toThrow("新しい版");expect(localStorage.getItem("loop-vault:bass-midi-library-v1:data")).toBe(raw);expect(await storage.listRecoveryArtifacts()).toEqual([]);
});
