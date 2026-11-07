import {describe,it,expect} from 'vitest';
import {BrowserPracticeStorage,MemoryPracticeStorage,TauriPracticeStorage} from '../../features/bass-practice/infra/repository/practiceStorage';
import {MemoryPracticeStorage as DojoMemoryStorage,JazzBrowserPracticeStorage} from './storage';
import {DojoRepository,emptyStore,emptyItem,parseDojoStore} from './store';
import {DojoRepository as OldRepository,parseDojoStore as oldParse} from './__fixtures__/preP125Store';
import {OriginalRecordsRepository,emptyOriginalRecords,migrateOriginalLaps,originalRecordsSchema} from './originalRecords';
const ID='op-traditional-passing',OTHER='op-modern-passing',AT='2026-10-12T00:00:00.000Z',PREFIX='loop-vault:original-practice-v1:';
class KV {map=new Map<string,string>();get length(){return this.map.size;}key(i:number){return [...this.map.keys()][i]??null;}getItem(k:string){return this.map.get(k)??null;}setItem(k:string,v:string){this.map.set(k,v);}removeItem(k:string){this.map.delete(k);}}
const repo=(kv:KV)=>new OriginalRecordsRepository(new BrowserPracticeStorage(kv,'original-practice'));
const side=(kv:KV)=>[...kv.map].filter(([k])=>k.startsWith(PREFIX));
describe('Original records isolation and actual pre-P12.5 rollback',()=>{
 it('old reader/save/recovery/rotation retain new laps and all existing ordinary records',async()=>{
  const kv=new KV(),storage=new JazzBrowserPracticeStorage(kv),old=new OldRepository(storage),file=emptyStore();
  file.progressions['ordinary']={...emptyItem(),state:'passed',recent:[{at:AT,ok:true}],keys:{3:{lastAt:AT,bestSec:2}}};
  await old.load();await old.save(file);
  const fresh=new DojoRepository(new JazzBrowserPracticeStorage(kv));const loaded=await fresh.load();expect(loaded.file.progressions).toEqual(file.progressions);
  await repo(kv).record(ID,3,'lap-1',AT);await repo(kv).record(ID,5,'lap-2',AT);await repo(kv).record(OTHER,3,'lap-3',AT);
  const snapshot=side(kv);
  const rollback=new OldRepository(new JazzBrowserPracticeStorage(kv));let current=(await rollback.load()).file;
  for(let i=0;i<22;i++){current={...current,settings:{...current.settings,progBpm:70+i}};current=await rollback.save(current);}
  oldParse(kv.map.get('loop-vault:chord-dojo-txt-jazz-v1:data')!);
  kv.map.set('loop-vault:chord-dojo-txt-jazz-v1:data','broken');
  const recovered=await new OldRepository(new JazzBrowserPracticeStorage(kv)).load();expect(recovered.recovered).toBe(true);expect(recovered.file.progressions).toEqual(file.progressions);
  expect(side(kv)).toEqual(snapshot);
  const records=await repo(kv).load();expect(records.laps[ID]).toEqual({3:{count:1,lastAt:AT},5:{count:1,lastAt:AT}});expect(records.laps[OTHER]?.[3]?.count).toBe(1);
  expect((await new DojoRepository(new JazzBrowserPracticeStorage(kv)).load()).file.progressions).toEqual(file.progressions);
 });
 it('the actual old strict reader rejects the previous candidate laps; new ordinary schema is identical',()=>{
  const file=emptyStore();file.progressions['ordinary']=emptyItem();const raw=JSON.parse(JSON.stringify(file));raw.progressions.ordinary.laps={3:{count:1,lastAt:AT}};
  expect(()=>oldParse(JSON.stringify(raw))).toThrow();expect(()=>parseDojoStore(JSON.stringify(raw))).toThrow();expect(oldParse(JSON.stringify(file))).toEqual(parseDojoStore(JSON.stringify(file)));
 });
 it('serial queued laps persist across restart and a repeated operation cannot count twice',async()=>{
  const kv=new KV(),r=repo(kv);await Promise.all([r.record(ID,3,'a',AT),r.record(ID,3,'b',AT),r.record(ID,3,'a',AT)]);
  expect((await repo(kv).load()).laps[ID]?.[3]?.count).toBe(2);
 });
 it('full replay ledger rolls over without limiting lifetime laps or retry dedup',async()=>{
  const kv=new KV();kv.map.set(PREFIX+'data',JSON.stringify({...emptyOriginalRecords(),laps:{[ID]:{3:{count:10000,lastAt:AT}}},operations:Array.from({length:10000},(_,i)=>`old-${i}`)}));
  const r=repo(kv);await r.record(ID,3,'new',AT);const again=await r.record(ID,3,'new',AT);expect(again.laps[ID]?.[3]?.count).toBe(10001);expect(again.operations).toHaveLength(1000);
 });
 it('own backups restore version1 without touching normal records',async()=>{
  const kv=new KV(),r=repo(kv);await r.record(ID,3,'a',AT);await r.record(ID,3,'b',AT);
  const storage=new BrowserPracticeStorage(kv,'original-practice'),raw=await storage.readCommitted(),backup=(await storage.listBackups())[0]!;
  const restored=await storage.restoreBackup(backup.name,backup.token,raw!.revision,raw!.token);expect(originalRecordsSchema.parse(JSON.parse(restored.contents)).fileVersion).toBe(1);
  expect((await repo(kv).load()).laps[ID]?.[3]?.count).toBe(1);
 });
 it('backup-only and damaged canonical recover; corrupt/future-only states refuse empty fallback',async()=>{
  const kv=new KV(),r=repo(kv);await r.record(ID,3,'a',AT);await r.record(ID,3,'b',AT);kv.map.delete(PREFIX+'data');expect((await repo(kv).load()).laps[ID]?.[3]?.count).toBe(1);
  await repo(kv).record(ID,3,'c',AT);kv.map.set(PREFIX+'data','broken');expect((await repo(kv).load()).laps[ID]?.[3]?.count).toBe(1);
  const bad=new KV();bad.map.set(PREFIX+'data','bad');const before=side(bad);await expect(repo(bad).load()).rejects.toThrow('読めません');expect(side(bad)).toEqual(before);
  bad.map.set(PREFIX+'data',JSON.stringify({...emptyOriginalRecords(),fileVersion:2}));const future=side(bad);await expect(repo(bad).load()).rejects.toThrow('新しい版');expect(side(bad)).toEqual(future);
  bad.map.set(PREFIX+'data',JSON.stringify({...emptyOriginalRecords(),version:2}));bad.map.set(PREFIX+'backup:20261012-000000-000000',JSON.stringify(emptyOriginalRecords()));const futureVersion=side(bad);await expect(repo(bad).load()).rejects.toThrow('新しい版');expect(side(bad)).toEqual(futureVersion);
 });
 it('unsupported or corrupt backup-only records cannot be treated as an empty first run',async()=>{
  for(const contents of ['broken',JSON.stringify({...emptyOriginalRecords(),fileVersion:2}),JSON.stringify({...emptyOriginalRecords(),version:2})]){
   const kv=new KV();kv.map.set(PREFIX+'backup:20261012-000000-000000',contents);const before=side(kv);
   await expect(repo(kv).load()).rejects.toThrow('読めません');await expect(repo(kv).record(ID,3,'new',AT)).rejects.toThrow('読めません');expect(side(kv)).toEqual(before);
  }
 });
 it('candidate migration saves sidecar first, preserves ordinary fields, and is idempotent after main I/O failure',async()=>{
  const kv=new KV(),r=repo(kv),storage=new DojoMemoryStorage(),file=emptyStore(),key=`builtin:${ID}:1`;
  file.progressions.ordinary={...emptyItem(),state:'passed',missingSince:AT};const legacy={...file,progressions:{...file.progressions,[key]:{...emptyItem(),laps:{3:{count:4,lastAt:AT}}}}};storage.committed=JSON.stringify(legacy);storage.failCommit=true;
  const migrate=(contents:string)=>migrateOriginalLaps(contents,r);
  await expect(new DojoRepository(storage,migrate).load()).rejects.toThrow('write failure');expect(JSON.parse(storage.committed).progressions[key].laps[3].count).toBe(4);
  storage.failCommit=false;await new DojoRepository(storage,migrate).load();oldParse(storage.committed!);expect((await r.load()).laps[ID]?.[3]?.count).toBe(4);expect(oldParse(storage.committed!).progressions.ordinary).toEqual(file.progressions.ordinary);
 });
 it('sidecar write/listing/restore failures preserve records and do not initialize or clean the main document',async()=>{
  const s=new MemoryPracticeStorage(),r=new OriginalRecordsRepository(s);s.failCommit=true;await expect(r.record(ID,3,'x',AT)).rejects.toThrow('write failure');expect(s.committed).toBeUndefined();
  s.failCommit=false;await r.record(ID,3,'x',AT);await r.record(ID,3,'y',AT);s.failCommit=true;s.committed='broken';await expect(new OriginalRecordsRepository(s).load()).rejects.toThrow('write failure');expect(s.backups.size).toBeGreaterThan(0);expect(s.corrupt.size).toBe(1);
  s.failListBackups=true;await expect(new OriginalRecordsRepository(s).load()).rejects.toThrow('listing');
 });
 it('namespace envelope is isolated and every Tauri operation carries the fixed namespace',async()=>{
  const kv=new KV(),storage=new BrowserPracticeStorage(kv,'original-practice');await expect(storage.commit(JSON.stringify({app:'loopvault-practice',fileVersion:1,revision:1}),'20261012-000000')).rejects.toThrow('namespace');
  const calls:string[]=[];const adapter=new TauriPracticeStorage(async<T>(command:string,args?:Record<string,unknown>)=>{expect(args?.namespace).toBe('original-practice');calls.push(command);return null as T;},'original-practice');
  await adapter.readCommitted();await adapter.listBackups();await adapter.listRecoveryArtifacts();await adapter.readBackup('x');await adapter.quarantineCommitted('x','x');await adapter.commit('x','x');await adapter.restoreBackup('x','x');expect(calls).toHaveLength(7);
 });
});
