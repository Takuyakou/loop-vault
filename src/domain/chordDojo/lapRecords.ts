import {createStore,type StoreApi} from 'zustand/vanilla';
import {z} from 'zod';
import type {PracticeStorage,PracticeStoredDocument} from '../../features/bass-practice/infra/repository/practiceRepository';
const count=z.object({count:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),lastAt:z.string().datetime()}).strict();
/** The key of a lap record: the tonic (0-11) the progression was played through in. */
export const lapKeys=z.record(z.string().regex(/^(?:[0-9]|1[01])$/),count);
/**
 * Laps (完奏) of a set of progressions, kept in a record file of their own: strict version-1 envelope, progression id × tonic.
 * Original Practice and Jazz Progressions each have one (same shape, own `app` and own ids); the normal Dojo record is never touched.
 */
export const lapRecordsSchema=(app:string,ids:readonly string[])=>z.object({app:z.literal(app),fileVersion:z.literal(1),version:z.literal(1),revision:z.number().int().positive(),laps:z.record(z.enum(ids as [string,...string[]]),lapKeys),operations:z.array(z.string().min(1).max(128)).max(10000)}).strict();
export type LapRecordsSchema=ReturnType<typeof lapRecordsSchema>;
export type LapRecords=z.infer<LapRecordsSchema>;
export const emptyLapRecords=(app:string):LapRecords=>({app,fileVersion:1,version:1,revision:1,laps:{},operations:[]});
const timestamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
/** Own canonical/backups/CAS; never reads or writes the normal Dojo namespace. */
export class LapRecordsRepository{
 private current?:PracticeStoredDocument;
 private blocked=true;
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private readonly storage:PracticeStorage,private readonly schema:LapRecordsSchema,private readonly app:string){}
 async load():Promise<LapRecords>{
  const raw=await this.storage.readCommitted();this.current=raw;this.blocked=true;
  if(raw){
   let version:unknown,schemaVersion:unknown;try{const envelope=JSON.parse(raw.contents);version=envelope.fileVersion;schemaVersion=envelope.version;}catch{/* retain and inspect validated backups */}
   if((typeof version==='number'&&version>1)||(typeof schemaVersion==='number'&&schemaVersion>1))throw new Error('完奏記録は新しい版の形式です。元の記録を保持しています。');
   const parsed=this.schema.safeParse(safeJson(raw.contents));
   if(parsed.success){this.blocked=false;return parsed.data;}
  }
  const [backups,artifacts]=await Promise.all([this.storage.listBackups(),this.storage.listRecoveryArtifacts()]);
  if(!raw&&!backups.length&&!artifacts.length){this.blocked=false;return emptyLapRecords(this.app);}
  for(const backup of backups){
   const document=await this.storage.readBackup(backup.name);
   const parsed=this.schema.safeParse(safeJson(document.contents));if(!parsed.success)continue;
   if(raw)await this.storage.quarantineCommitted(timestamp(),raw.token);
   this.current=undefined;
   const restored=await this.persist(parsed.data);this.blocked=false;return restored;
  }
  throw new Error('完奏記録を読めません。元の記録を保持しています。');
 }
 private async persist(file:LapRecords){
  const next=this.schema.parse({...file,revision:(this.current?.revision??0)+1});
  await this.storage.commit(JSON.stringify(next,null,2)+'\n',timestamp(),this.current?.revision,this.current?.token);
  this.current=await this.storage.readCommitted();return next;
 }
 /** Last1000 acknowledged/retry operations, not a cap on lifetime laps. Pending retries run before new laps. */
 record(id:string,tonic:number,operation:string,at=new Date().toISOString()):Promise<LapRecords>{
  return this.mutate(file=>{
   if(file.operations.includes(operation))return file;
   const before=file.laps[id]?.[tonic];
   return {...file,laps:{...file.laps,[id]:{...file.laps[id],[tonic]:{count:(before?.count??0)+1,lastAt:at}}},operations:[...file.operations.slice(-999),operation]};
  });
 }
 importLegacy(laps:LapRecords['laps']):Promise<LapRecords>{
  return this.mutate(file=>{const merged=structuredClone(file);for(const [id,byKey] of Object.entries(laps))for(const [key,value] of Object.entries(byKey)){const prior=merged.laps[id]?.[key];if(!prior||prior.count<value.count){merged.laps[id]??={};merged.laps[id]![key]=value;}}return merged;});
 }
 private mutate(update:(file:LapRecords)=>LapRecords){
  const result=this.queue.then(async()=>{const file=await this.load();if(this.blocked)throw new Error('完奏記録の復旧が必要です。');const next=update(file);if(JSON.stringify(file)===JSON.stringify(next))return file;return this.persist(next);});
  this.queue=result.catch(()=>undefined);return result;
 }
}
function safeJson(contents:string):unknown{try{return JSON.parse(contents);}catch{return undefined;}}
export interface LapState{file:LapRecords;ready:boolean;error?:string;initialize:()=>Promise<void>;complete:(id:string,tonic:number,operation:string)=>Promise<void>;retry:()=>Promise<void>}
/** The screen's view of one set of laps: loads once, keeps a lap that could not be saved until it can be (and says so). */
export function createLapStore(repository:()=>LapRecordsRepository,empty:()=>LapRecords):StoreApi<LapState>{
 let loading:Promise<void>|undefined;
 const pending=new Map<string,{id:string;tonic:number;at:string}>();
 return createStore<LapState>((set,get)=>({file:empty(),ready:false,
  async initialize(){if(get().ready)return;loading??=repository().load().then(file=>{set({file,ready:true,error:undefined});}).catch(()=>{set({error:'完奏記録を開けません。元の記録を保持しています。'});}).finally(()=>{loading=undefined;});await loading;},
  async complete(id,tonic,operation){pending.set(operation,{id,tonic,at:new Date().toISOString()});await get().retry();},
  async retry(){await get().initialize();if(!get().ready)return;for(const [operation,item] of pending){try{const file=await repository().record(item.id,item.tonic,operation,item.at);pending.delete(operation);set({file,error:undefined});}catch{set({error:'完奏記録を保存できません。未保存分はこの画面に保持しています。'});return;}}}
 }));
}
