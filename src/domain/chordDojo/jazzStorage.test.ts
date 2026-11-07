import {describe,expect,it} from 'vitest';
import {DojoRepository,emptyStore,parseDojoStore} from './store';
import {planToday} from './planner';
import {JazzBrowserPracticeStorage,JAZZ_DOJO_PREFIX,RangeBrowserPracticeStorage,TauriPracticeStorage} from './storage';

class MemoryKeys {
 files=new Map<string,string>();failCommit=false;
 get length(){return this.files.size;}
 key(i:number){return [...this.files.keys()][i]??null;}
 getItem(key:string){return this.files.get(key)??null;}
 setItem(key:string,value:string){if(this.failCommit&&key===JAZZ_DOJO_PREFIX+'data')throw Error('Injected commit failure');this.files.set(key,value);}
 removeItem(key:string){this.files.delete(key);}
}
const old='loop-vault:chord-dojo-theme-ranges-v1:';
const file=()=>{const result=emptyStore(new Date('2026-10-11T12:00:00Z'));result.today=planToday(result,[],new Date('2026-10-11T12:00:00Z'));return result;};
const alteredFile=()=>{const result=file();const chord=result.today!.lesson!.chords[0].chord;Object.assign(chord,{root:7,quality:'dom7',tensions:[],altered:true,label:'G7alt'});return result;};
const repo=(keys:MemoryKeys)=>new DojoRepository(new JazzBrowserPracticeStorage(keys));

describe('TXT-JAZZ isolated Dojo persistence',()=>{
 it('imports once and never modifies previous data backups temp or corrupt records',async()=>{
  const keys=new MemoryKeys(),raw=JSON.stringify(file());keys.setItem(old+'data',raw);keys.setItem(old+'tmp','retained interrupted old write');keys.setItem(old+'backup:20261011-120000-000000',raw);keys.setItem(old+'corrupt:20261011-120000-000000','retained damaged bytes');
  const before=[...keys.files];const candidate=repo(keys);const loaded=await candidate.load();expect(loaded.recovered).toBe(false);expect(loaded.file.startedAt).toBe(file().startedAt);for(const [key,value]of before)expect(keys.getItem(key)).toBe(value);
  const next=await candidate.save(alteredFile());expect(parseDojoStore(keys.getItem(JAZZ_DOJO_PREFIX+'data')!).today!.lesson!.chords[0].chord).toMatchObject({altered:true,label:'G7alt'});
  keys.setItem(old+'data',JSON.stringify({...file(),settings:{...file().settings,progBpm:100}}));expect((await repo(keys).load()).file).toEqual(next);
 });
 it('an older namespace repository cannot change altered new records or backups',async()=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',JSON.stringify(file()));const candidate=repo(keys);await candidate.load();await candidate.save(alteredFile());
  const newBefore=[...keys.files].filter(([key])=>key.startsWith(JAZZ_DOJO_PREFIX));const older=new DojoRepository(new RangeBrowserPracticeStorage(keys));const loaded=await older.load();loaded.file.settings.progBpm=100;await older.save(loaded.file);
  expect([...keys.files].filter(([key])=>key.startsWith(JAZZ_DOJO_PREFIX))).toEqual(newBefore);
 });
 it.each(['{damaged',JSON.stringify({...file(),fileVersion:99}),JSON.stringify(alteredFile())])('refuses unsafe previous records without touching their bytes',async raw=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',raw);keys.setItem(old+'backup:20261011-120000-000000',JSON.stringify(file()));const before=[...keys.files];await expect(repo(keys).load()).rejects.toBeDefined();expect([...keys.files]).toEqual(before);
 });
 it.each(['tmp','corrupt:20261011-120000-000000','backup:invalid'])('refuses incomplete new %s without empty or legacy fallback',async artifact=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',JSON.stringify(file()));keys.setItem(JAZZ_DOJO_PREFIX+artifact,'retained bytes');const before=[...keys.files];const candidate=repo(keys);await expect(candidate.load()).rejects.toBeDefined();await expect(candidate.load()).rejects.toBeDefined();expect([...keys.files]).toEqual(before);
 });
 it('recovers only a validated new-namespace backup and retains damaged new bytes',async()=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',JSON.stringify(file()));keys.setItem(JAZZ_DOJO_PREFIX+'data','{damaged');const backup=JSON.stringify(alteredFile());keys.setItem(JAZZ_DOJO_PREFIX+'backup:20261011-120000-000000',backup);
  const loaded=await repo(keys).load();expect(loaded.recovered).toBe(true);expect(loaded.file.today!.lesson!.chords[0].chord.altered).toBe(true);expect(keys.getItem(old+'data')).toBe(JSON.stringify(file()));expect([...keys.files.entries()].filter(([key])=>key.startsWith(JAZZ_DOJO_PREFIX+'corrupt:')).map(([,value])=>value)).toContain('{damaged');
 });
 it('recovers a missing new commit from its own validated backup instead of importing old changes',async()=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',JSON.stringify(file()));keys.setItem(JAZZ_DOJO_PREFIX+'backup:20261011-120000-000000',JSON.stringify(alteredFile()));const loaded=await repo(keys).load();expect(loaded.recovered).toBe(true);expect(loaded.file.today!.lesson!.chords[0].chord.altered).toBe(true);
 });
 it('keeps future new records temp and backups untouched',async()=>{
  const keys=new MemoryKeys();keys.setItem(old+'data',JSON.stringify(file()));keys.setItem(JAZZ_DOJO_PREFIX+'data',JSON.stringify({...file(),fileVersion:99}));keys.setItem(JAZZ_DOJO_PREFIX+'tmp','retained interrupted write');keys.setItem(JAZZ_DOJO_PREFIX+'backup:20261011-120000-000000',JSON.stringify(file()));const before=[...keys.files];await expect(repo(keys).load()).rejects.toBeDefined();expect([...keys.files]).toEqual(before);
 });
 it('preserves previous records after failed migration and can safely retry',async()=>{
  const keys=new MemoryKeys(),raw=JSON.stringify(file());keys.setItem(old+'data',raw);keys.failCommit=true;await expect(repo(keys).load()).rejects.toThrow('Injected commit failure');expect(keys.getItem(old+'data')).toBe(raw);expect(keys.getItem(JAZZ_DOJO_PREFIX+'data')).toBeNull();keys.failCommit=false;expect((await repo(keys).load()).file.startedAt).toBe(file().startedAt);expect(keys.getItem(old+'data')).toBe(raw);
 });
 it('native adapter validates old full stores before importing and preserves classification boundary',async()=>{
  const calls:string[]=[];const valid=JSON.stringify(file());
  const adapter=new TauriPracticeStorage(async<T>(command:string)=>{calls.push(command);return {contents:valid,revision:1,token:'synthetic-token'} as T;});
  expect((await adapter.readLegacy())?.contents).toBe(valid);expect(calls).toEqual(['read_previous_theme_chord_dojo_file']);
  for(const contents of ['{damaged',JSON.stringify({...file(),fileVersion:99}),JSON.stringify(alteredFile())]){
   const unsafe=new TauriPracticeStorage(async<T>()=>({contents,revision:1,token:'synthetic-token'}) as T);await expect(unsafe.readLegacy()).rejects.toBeDefined();
  }
 });
});
