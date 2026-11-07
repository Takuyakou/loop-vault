import {describe,it,expect} from 'vitest';
import {DojoRepository,emptyStore,emptyItem,type DojoStore} from './store';
import {MemoryPracticeStorage,BrowserPracticeStorage} from './storage';
import {planToday} from './planner';
import {CURRICULUM,shapeKey} from './recipes';
import type {VaultProgression} from './collect';
const at='2026-10-04T00:00:00.000Z';
function passed(){const f=emptyStore(new Date(at));f.shapes['personal:retained']={...emptyItem(),state:'passed',passedAt:at,keys:{0:{lastAt:at,bestSec:1}}};return f;}
describe('independent review: recovery must finish before initialization',()=>{
 it('keeps a passed backup through repeated failed restoration and a new repository instance',async()=>{const s=new MemoryPracticeStorage(),r=new DojoRepository(s);await r.load();await r.save(passed());await r.save(passed());const backups=[...s.backups.entries()];s.committed='broken';s.failCommit=true;await expect(r.load()).rejects.toThrow('write failure');expect(s.committed).toBeUndefined();expect(s.corrupt.size).toBe(1);await expect(r.save(emptyStore())).rejects.toThrow('復旧');await expect(r.load()).rejects.toThrow('write failure');const restarted=new DojoRepository(s);await expect(restarted.load()).rejects.toThrow('write failure');expect([...s.backups.entries()]).toEqual(backups);s.failCommit=false;const restored=await restarted.load();expect(restored.recovered).toBe(true);expect(restored.file.shapes['personal:retained']).toEqual(passed().shapes['personal:retained']);expect(JSON.parse(s.committed!).shapes['personal:retained'].state).toBe('passed');});
 it('browser restart retries a quarantined restore instead of writing an empty record',async()=>{const map=new Map<string,string>();let fail=false;const kv={get length(){return map.size},key:(i:number)=>[...map.keys()][i]??null,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(fail&&k==='loop-vault:chord-dojo-v1:data')throw new Error('disk full');map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};let r=new DojoRepository(new BrowserPracticeStorage(kv));await r.load();await r.save(passed());await r.save(passed());map.set('loop-vault:chord-dojo-v1:data','broken');fail=true;await expect(r.load()).rejects.toThrow('disk full');expect(map.has('loop-vault:chord-dojo-v1:data')).toBe(false);r=new DojoRepository(new BrowserPracticeStorage(kv));await expect(r.load()).rejects.toThrow('disk full');fail=false;expect((await r.load()).file.shapes['personal:retained'].state).toBe('passed');});
 it('missing canonical data with only quarantine artifacts refuses empty initialization across restarts',async()=>{const s=new MemoryPracticeStorage();s.committed='broken';const raw=await s.readCommitted();await s.quarantineCommitted('20261004-000000',raw!.token);for(let i=0;i<2;i++)await expect(new DojoRepository(s).load()).rejects.toThrow('バックアップ');expect(s.committed).toBeUndefined();expect(s.corrupt.size).toBe(1);});
 it('a genuinely new namespace initializes, but failed recovery listings cannot initialize it',async()=>{const s=new MemoryPracticeStorage();expect((await new DojoRepository(s).load()).recovered).toBe(false);s.failListBackups=true;await expect(new DojoRepository(s).load()).rejects.toThrow('listing');s.failListBackups=false;s.failListRecoveryArtifacts=true;const blocked=new DojoRepository(s);await expect(blocked.load()).rejects.toThrow('listing');await expect(blocked.save(emptyStore())).rejects.toThrow('復旧');expect(s.committed).toBeUndefined();});
});
const progression:VaultProgression={key:'vault:synthetic',blockId:'b',ideaId:'i',name:'合成',legacyConfirmed:false,pinned:true,capturedAt:at,chords:[{chord:{root:0,quality:'maj',tensions:[],label:'C'},notes:[48,60,64,67],beats:4}],chordBars:[1]};
function withVoicing():DojoStore{const s=emptyStore(new Date(at));s.voicings['notes:48,60,64,67']={...emptyItem(),notes:[48,60,64,67],occurrences:[{progressionId:'b',chordId:'c',source:'saved',harmony:{root:0,quality:'maj',symbol:'C'},seenAt:at}]};s.progressions[progression.key]=emptyItem();return s;}
describe('theme amendment: unrelated saved notes do not consume new-task slots',()=>{
 it('uses only a related basic shape and the fixed source progression when no event proves the saved notes',()=>{const p=planToday(withVoicing(),[progression],new Date(at));expect(p.tasks.map(t=>t.kind)).toEqual(['shape','progression']);expect(p.lesson?.skips.some(s=>s.reason==='この範囲には保存した音がありません')).toBe(true);});
 it('does not introduce an unproven saved voicing beside a learned progression review',()=>{const s=withVoicing();s.progressions[progression.key]={...emptyItem(),state:'passed',passedAt:at};const p=planToday(s,[progression],new Date(at));expect(p.tasks.filter(t=>!t.review).map(t=>t.kind)).toEqual(['shape']);expect(p.tasks.slice(-1)[0].review).toBe(true);});
 it('keeps only the finish when all its related shapes are learned and no saved event is proven',()=>{const s=withVoicing();for(const c of CURRICULUM)s.shapes[shapeKey(c.quality,c.preset,c.bass)]={...emptyItem(),state:'passed',recent:[{at,ok:true,independent:true}]};const p=planToday(s,[progression],new Date(at));expect(p.tasks.map(t=>t.kind)).toEqual(['progression']);});
 it('allows all three needed basic shapes before the first-day standard progression',()=>{const p=planToday(emptyStore(new Date(at)),[],new Date(at));expect(p.tasks.filter(t=>!t.review).map(t=>t.kind)).toEqual(['shape','shape','shape','progression']);expect(p.lesson?.related.map(r=>r.kind)).toEqual(['shape','shape','shape']);});
});

describe('independent re-review: builtin and Vault share every daily limit',()=>{
 it('keeps a learned builtin inside the six-review cap after six due shapes',()=>{
  const s=emptyStore(new Date(at));
  for(const c of CURRICULUM.slice(0,6))s.shapes[shapeKey(c.quality,c.preset,c.bass)]={...emptyItem(),state:'passed',nextCheckAt:at,recent:[{at,ok:true}]};
  s.progressions['builtin:i-v-vi-iv:1']={...emptyItem(),state:'passed',recent:[{at,ok:true}]};
  const p=planToday(s,[],new Date(at),{preferredKey:'builtin:i-v-vi-iv:1'});
  expect(p.tasks.filter(t=>t.review)).toHaveLength(6);
  expect(p.tasks.find(t=>t.key==='builtin:i-v-vi-iv:1')?.review).toBe(true);
  expect(p.tasks[0].key).toBe(shapeKey(CURRICULUM[0].quality,CURRICULUM[0].preset,CURRICULUM[0].bass));
 });
 it.each(['builtin','vault'] as const)('%s respects mixed-source new, review and time limits',source=>{
  for(const dueCount of [0,2,4,6])for(const learned of [false,true])for(const bpm of [30,70,240]){
   const s=withVoicing();s.settings.progBpm=bpm;
   const wantedKey='notes:48,60,63,67';
   s.voicings[wantedKey]={...s.voicings['notes:48,60,64,67'],wanted:true,state:'passed',recent:[{at:'2026-09-01T00:00:00.000Z',ok:true}]};
   s.knownQualities.maj={at,nextRecallAt:at,recallStep:0};
   for(const c of CURRICULUM.slice(0,dueCount))s.shapes[shapeKey(c.quality,c.preset,c.bass)]={...emptyItem(),state:'passed',nextCheckAt:at,recent:[{at,ok:true}]};
   const prior=planToday(emptyStore(new Date(at)),[],new Date(at));
   prior.date='2026-10-03';prior.tasks=[{kind:'voicing',key:'notes:prior',review:false,roots:[0],seconds:40}];
   s.voicings['notes:prior']={...emptyItem(),notes:[50,62,65,69],occurrences:[]};s.today=prior;
   const key=source==='builtin'?'builtin:i-v-vi-iv:1':progression.key;
   s.progressions={};if(learned)s.progressions[key]={...emptyItem(),state:'passed',recent:[{at,ok:true}]};
   const p=planToday(s,source==='vault'?[progression]:[],new Date(at),{preferredKey:key});
   expect(p.tasks.filter(t=>t.review).length).toBeLessThanOrEqual(6);
   expect(p.lesson?.budget.estimatedSeconds).toBe(p.tasks.reduce((n,t)=>n+t.seconds,0));
   expect(p.tasks.reduce((n,t)=>n+t.seconds,0)).toBeLessThanOrEqual(900);
   expect(new Set(p.tasks.map(t=>t.key)).size).toBe(p.tasks.length);
   expect(p.tasks[0].key).toBe(wantedKey);
   expect(p.tasks.find(t=>t.key===key)?.review).toBe(learned);
   expect(new Set(p.tasks.map(t=>t.kind))).toEqual(new Set(['composition','shape','voicing','progression']));
   expect(p.tasks.find(t=>t.key==='notes:prior')).toBeUndefined();
  }
 });
 it('reduces a low-BPM mixed review day with several long Vault progressions to fifteen minutes',()=>{
  const s=withVoicing();s.settings.progBpm=30;
  s.voicings['notes:48,60,64,67'].wanted=true;
  s.voicings['notes:48,60,64,67'].recent=[{at:'2026-09-01T00:00:00.000Z',ok:true}];
  s.knownQualities.maj={at,nextRecallAt:at,recallStep:0};
  const c=CURRICULUM[0];s.shapes[shapeKey(c.quality,c.preset,c.bass)]={...emptyItem(),state:'passed',nextCheckAt:at,recent:[{at,ok:true}]};
  const ps=Array.from({length:4},(_,i)=>({...progression,key:'vault:long-'+i,chords:Array.from({length:8},()=>({...progression.chords[0],beats:4}))}));
  for(const p of ps)s.progressions[p.key]={...emptyItem(),state:'passed',nextCheckAt:at,recent:[{at,ok:true}]};
  const p=planToday(s,ps,new Date(at),{preferredKey:ps[0].key});
  expect(p.tasks.filter(t=>t.review).length).toBeLessThanOrEqual(6);
  expect(p.lesson?.budget.estimatedSeconds).toBe(p.tasks.reduce((n,t)=>n+t.seconds,0));
  expect(p.tasks.reduce((n,t)=>n+t.seconds,0)).toBeLessThanOrEqual(900);
  expect(p.tasks[0].key).toBe('notes:48,60,64,67');
  expect(new Set(p.tasks.filter(t=>t.kind==='progression').map(t=>t.key))).toEqual(new Set(['vault:long-0','vault:long-1','vault:long-2']));expect(p.tasks.slice(-1)[0].key).toBe('vault:long-0');
  expect(p.tasks.filter(t=>!t.review)).toHaveLength(0);
  expect(new Set(p.tasks.map(t=>t.kind))).toEqual(new Set(['composition','shape','voicing','progression']));
 });
});
