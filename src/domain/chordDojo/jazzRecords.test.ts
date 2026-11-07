import {describe,expect,it} from 'vitest';
import {BrowserPracticeStorage,TauriPracticeStorage} from '../../features/bass-practice/infra/repository/practiceStorage';
import {JazzBrowserPracticeStorage} from './storage';
import {DojoRepository,emptyItem,emptyStore} from './store';
import {OriginalRecordsRepository,originalRecordsSchema} from './originalRecords';
import {JazzRecordsRepository,emptyJazzRecords,jazzRecordsSchema} from './jazzRecords';
import {JAZZ_PROGRESSIONS_IDS,buildJazzProgression,jazzRecordTonic} from './jazzProgressions';
import {createLapStore} from './lapRecords';

const AT='2026-10-22T00:00:00.000Z';
const ORIGINAL_ID='op-traditional-passing';
const JAZZ_ID='jazz-progressions-001';
const JAZZ_PREFIX='loop-vault:jazz-progressions-v1:',ORIGINAL_PREFIX='loop-vault:original-practice-v1:';
class KV{map=new Map<string,string>();get length(){return this.map.size;}key(i:number){return [...this.map.keys()][i]??null;}getItem(k:string){return this.map.get(k)??null;}setItem(k:string,v:string){this.map.set(k,v);}removeItem(k:string){this.map.delete(k);}}
const jazz=(kv:KV)=>new JazzRecordsRepository(new BrowserPracticeStorage(kv,'jazz-progressions'));
const original=(kv:KV)=>new OriginalRecordsRepository(new BrowserPracticeStorage(kv,'original-practice'));
const outside=(kv:KV,prefix:string)=>[...kv.map].filter(([k])=>!k.startsWith(prefix));

describe('Jazz Progressions records',()=>{
 it('a lap is counted by progression × tonic, in a record file of its own',async()=>{
  const kv=new KV(),tonic=jazzRecordTonic(buildJazzProgression(JAZZ_ID));
  expect(tonic).toBe(3);
  const records=await jazz(kv).record(JAZZ_ID,tonic,'a',AT);
  expect(records.laps[JAZZ_ID]).toEqual({[tonic]:{count:1,lastAt:AT}});
  await jazz(kv).record(JAZZ_ID,tonic,'b',AT);await jazz(kv).record(JAZZ_ID,5,'c',AT);await jazz(kv).record('jazz-progressions-004-a',2,'d',AT);
  const again=await jazz(kv).load();
  expect(again.laps[JAZZ_ID]).toEqual({3:{count:2,lastAt:AT},5:{count:1,lastAt:AT}});expect(again.laps['jazz-progressions-004-a']![2]!.count).toBe(1);
  expect([...kv.map.keys()].every(k=>k.startsWith(JAZZ_PREFIX))).toBe(true);
  expect(jazzRecordsSchema.parse(JSON.parse(kv.map.get(JAZZ_PREFIX+'data')!)).app).toBe('loopvault-jazz-progressions');
 });
 it('a lap that is told twice counts once; every id of the data is accepted and nothing else is',async()=>{
  const kv=new KV(),r=jazz(kv);
  await Promise.all([r.record(JAZZ_ID,3,'x',AT),r.record(JAZZ_ID,3,'x',AT),r.record(JAZZ_ID,3,'y',AT)]);
  expect((await jazz(kv).load()).laps[JAZZ_ID]![3]!.count).toBe(2);
  for(const id of JAZZ_PROGRESSIONS_IDS)expect(jazzRecordsSchema.safeParse({...emptyJazzRecords(),laps:{[id]:{3:{count:1,lastAt:AT}}}}).success,id).toBe(true);
  expect(jazzRecordsSchema.safeParse({...emptyJazzRecords(),laps:{[ORIGINAL_ID]:{3:{count:1,lastAt:AT}}}}).success).toBe(false);
  expect(jazzRecordsSchema.safeParse({...emptyJazzRecords(),laps:{[JAZZ_ID]:{12:{count:1,lastAt:AT}}}}).success).toBe(false);
  // and the Original record does not take a Jazz id (its content is as it was)
  expect(originalRecordsSchema.safeParse({...emptyJazzRecords(),app:'loopvault-original-practice',laps:{[JAZZ_ID]:{3:{count:1,lastAt:AT}}}}).success).toBe(false);
 });
 it('11: adding Jazz laps leaves the Original Practice laps and the Dojo record exactly as they were',async()=>{
  const kv=new KV(),storage=new JazzBrowserPracticeStorage(kv),file=emptyStore();
  file.progressions['ordinary']={...emptyItem(),state:'passed',recent:[{at:AT,ok:true}],keys:{3:{lastAt:AT,bestSec:2}}};
  await new DojoRepository(storage).load();await new DojoRepository(storage).save(file);
  await original(kv).record(ORIGINAL_ID,3,'o1',AT);
  const before=new Map(kv.map);
  await jazz(kv).record(JAZZ_ID,3,'j1',AT);await jazz(kv).record('jazz-progressions-009',4,'j2',AT);
  for(const [key,value] of before)expect(kv.map.get(key),key).toBe(value);
  expect(outside(kv,JAZZ_PREFIX)).toEqual([...before]);
  expect((await original(kv).load()).laps).toEqual({[ORIGINAL_ID]:{3:{count:1,lastAt:AT}}});
  expect((await new DojoRepository(new JazzBrowserPracticeStorage(kv)).load()).file.progressions).toEqual(file.progressions);
  // and the other way round
  const jazzBefore=[...kv.map].filter(([k])=>k.startsWith(JAZZ_PREFIX));
  await original(kv).record(ORIGINAL_ID,5,'o2',AT);
  expect([...kv.map].filter(([k])=>k.startsWith(JAZZ_PREFIX))).toEqual(jazzBefore);
  expect([...kv.map.keys()].some(k=>k.startsWith(ORIGINAL_PREFIX))).toBe(true);
 });
 it('11: a broken or newer Jazz record is kept as it is, says so, and does not touch anything else',async()=>{
  const kv=new KV();
  await original(kv).record(ORIGINAL_ID,3,'o1',AT);
  const otherBefore=outside(kv,JAZZ_PREFIX);
  // broken, with no backup to go back to
  kv.map.set(JAZZ_PREFIX+'data','broken');
  await expect(jazz(kv).load()).rejects.toThrow('完奏記録を読めません');
  await expect(jazz(kv).record(JAZZ_ID,3,'z',AT)).rejects.toThrow();
  expect(kv.map.get(JAZZ_PREFIX+'data')).toBe('broken');
  // written by a newer version: kept byte for byte
  const newer=JSON.stringify({...emptyJazzRecords(),version:2});
  kv.map.set(JAZZ_PREFIX+'data',newer);
  await expect(jazz(kv).load()).rejects.toThrow('新しい版');
  expect(kv.map.get(JAZZ_PREFIX+'data')).toBe(newer);
  expect(outside(kv,JAZZ_PREFIX)).toEqual(otherBefore);
  expect((await original(kv).load()).laps[ORIGINAL_ID]![3]!.count).toBe(1);
 });
 it('11: a broken committed record goes back to the last good backup, and the broken one is kept aside',async()=>{
  const kv=new KV();
  await jazz(kv).record(JAZZ_ID,3,'a',AT);await jazz(kv).record(JAZZ_ID,3,'b',AT);
  kv.map.set(JAZZ_PREFIX+'data','broken');
  const restored=await jazz(kv).load();
  expect(restored.laps[JAZZ_ID]![3]!.count).toBeGreaterThanOrEqual(1);
  expect([...kv.map.keys()].some(k=>k.startsWith(JAZZ_PREFIX+'corrupt:'))).toBe(true);
  expect([...kv.map.keys()].every(k=>k.startsWith(JAZZ_PREFIX))).toBe(true);
 });
 it('the screen’s store keeps a lap that could not be saved and says so, then saves it when it can',async()=>{
  let fail=true;const kv=new KV(),real=jazz(kv);
  const failing=new Proxy(real,{get(target,prop){if(prop==='record'&&fail)return async()=>{throw new Error('disk');};const v=Reflect.get(target,prop,target) as unknown;return typeof v==='function'?v.bind(target):v;}});
  const store=createLapStore(()=>failing,emptyJazzRecords);
  await store.getState().initialize();expect(store.getState().ready).toBe(true);
  await store.getState().complete(JAZZ_ID,3,'lap-1');
  expect(store.getState().error).toContain('保存できません');expect(store.getState().file.laps[JAZZ_ID]).toBeUndefined();
  fail=false;await store.getState().retry();
  expect(store.getState().error).toBeUndefined();expect(store.getState().file.laps[JAZZ_ID]![3]!.count).toBe(1);
  await store.getState().retry();expect((await jazz(kv).load()).laps[JAZZ_ID]![3]!.count).toBe(1);
 });
 it('the native app and the browser use the same separate namespace',()=>{
  const calls:unknown[][]=[];
  const tauri=new TauriPracticeStorage(async(command:string,args?:Record<string,unknown>)=>{calls.push([command,args]);return null as never;},'jazz-progressions');
  void tauri.readCommitted();
  expect(JSON.stringify(calls)).toContain('jazz-progressions');
 });
});
