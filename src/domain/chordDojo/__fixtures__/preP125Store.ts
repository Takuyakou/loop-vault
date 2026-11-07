import {lessonSchema,lessonPolicySchema,lessonTargetSchema} from '../lessonModel';
import {masterSchema} from '../../master251/model';
import {z} from 'zod';
import type {PracticeStorage,PracticeStoredDocument} from '../../../features/bass-practice/infra/repository/practiceRepository';
import {createRuntimePracticeStorage} from '../storage';
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const afterDays=(at:string,n:number)=>{const d=new Date(at);d.setDate(d.getDate()+n);return d.toISOString();};
const note=z.number().int().min(0).max(127),pc=z.number().int().min(0).max(11),id=z.string().min(1).max(256);
const attempt=z.object({at:z.string().datetime(),ok:z.boolean(),sec:z.number().finite().nonnegative().optional(),self:z.boolean().optional(),key:pc.optional(),independent:z.boolean().optional()}).strict();
const keyRecord=z.object({lastSec:z.number().finite().nonnegative().optional(),bestSec:z.number().finite().nonnegative().optional(),lastAt:z.string().datetime(),self:z.boolean().optional()}).strict();
export const itemSchema=z.object({state:z.enum(['new','provisional','passed','twelve-keys']),wanted:z.boolean().optional(),provisionalAt:z.string().datetime().optional(),passedAt:z.string().datetime().optional(),nextCheckAt:z.string().datetime().optional(),recent:z.array(attempt).max(20),keys:z.record(keyRecord).default({})}).strict();
const occurrence=z.object({progressionId:id,chordId:id,ideaId:id.optional(),source:z.enum(['saved','source-midi','custom']),harmony:z.object({root:pc,quality:id,bass:pc.optional(),symbol:z.string().max(64)}).strict(),seenAt:z.string().datetime()}).strict();
export const taskSchema=z.object({kind:z.enum(['shape','voicing','progression','composition']),key:id,review:z.boolean(),quality:id.optional(),preset:z.enum(['basic','skeleton','spread','upper-triad']).optional(),bass:z.enum(['self','external']).optional(),roots:z.array(pc).min(1).max(12),seconds:z.number().positive()}).strict();
const session=z.object({taskIndex:z.number().int().nonnegative(),stage:z.enum(['composition','see','recall','memorize','tempo']),keyIndex:z.number().int().nonnegative(),chordIndex:z.number().int().nonnegative(),answerSeen:z.boolean(),hints:z.array(z.number().int().nonnegative()),tempoResults:z.array(z.boolean()),retryRange:z.array(z.number().int().nonnegative()).optional()}).strict();
const taskResult=z.object({taskIndex:z.number().int().nonnegative(),attempts:z.number().int().nonnegative(),matches:z.number().int().nonnegative(),selfChecks:z.number().int().nonnegative(),answerChecks:z.number().int().nonnegative(),completed:z.boolean(),skipped:z.boolean(),lastStage:z.enum(['composition','see','recall','memorize','tempo']),lastResult:z.boolean().optional(),lastAt:z.string().datetime()}).strict();
export const storeSchema=z.object({master251:masterSchema.optional(),app:z.literal('loopvault-chord-dojo'),fileVersion:z.literal(4),version:z.literal(1),revision:z.number().int().positive(),startedAt:z.string().datetime(),knownQualities:z.record(z.object({at:z.string().datetime(),lastRecallAt:z.string().datetime().optional(),nextRecallAt:z.string().datetime(),recallStep:z.union([z.literal(0),z.literal(1),z.literal(2)])}).strict()),shapes:z.record(itemSchema).refine(r=>Object.keys(r).every(k=>k.startsWith('preset:')||k.startsWith('personal:'))),voicings:z.record(itemSchema.extend({notes:z.array(note).min(1).max(128),occurrences:z.array(occurrence).max(10000)})),progressions:z.record(itemSchema.extend({missingSince:z.string().datetime().optional()})),reviewJournal:z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),keys:z.array(id).max(1000)}).strict().optional(),today:z.object({taskResults:z.array(taskResult).max(10000).optional(),lesson:lessonSchema.optional(),planningSkips:z.array(z.object({unit:z.string().max(256),reason:z.string().max(512)}).strict()).optional(),legacyTargets:z.array(lessonTargetSchema).optional(),legacyResumeTask:z.number().int().nonnegative().optional(),legacyOriginalTasks:z.array(taskSchema).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),tasks:z.array(taskSchema),cursor:session,finished:z.boolean(),added:z.array(id),matched:z.number().int().nonnegative(),startedAt:z.string().datetime().optional()}).strict().optional(),settings:z.object({lessonPolicy:lessonPolicySchema.optional(),reviewDays:z.tuple([z.number().int().positive(),z.number().int().positive()]),progBpm:z.number().min(30).max(240),settleMs:z.number().min(0).max(1000),hintSec:z.number().positive(),degrees:z.boolean()}).strict()}).strict();
export type ItemRecord=z.infer<typeof itemSchema>;
export type DojoStore=z.infer<typeof storeSchema>;
export type Task=z.infer<typeof taskSchema>;
export type Occurrence=z.infer<typeof occurrence>;
export const emptyItem=():ItemRecord=>({state:'new',keys:{},recent:[]});
export function emptyStore(now=new Date()):DojoStore{return {app:'loopvault-chord-dojo',fileVersion:4,version:1,revision:1,startedAt:now.toISOString(),knownQualities:{},shapes:{},voicings:{},progressions:{},settings:{reviewDays:[14,30],progBpm:70,settleMs:60,hintSec:5,degrees:false}};}
export class DojoRepository {
 private current?:PracticeStoredDocument;
 private recoveryPending=false;
 constructor(private readonly storage:PracticeStorage & {readLegacy?:()=>Promise<PracticeStoredDocument|undefined>}){}
 async load():Promise<{file:DojoStore;recovered:boolean}>{
  const raw=await this.storage.readCommitted();this.current=raw;
  if(raw){let version:unknown;try{version=JSON.parse(raw.contents)?.fileVersion;}catch{/* damaged JSON uses recovery below */}if(typeof version==='number'&&version>4)throw new Error('この練習記録は新しい版で保存されています。対応するアプリで開いてください。');try{const file=parseDojoStore(raw.contents);this.recoveryPending=false;return {file,recovered:false};}catch{/* Check recovery without discarding damaged bytes. */}}
  this.recoveryPending=true;
  const [backups,artifacts]=await Promise.all([this.storage.listBackups(),this.storage.listRecoveryArtifacts()]);
  if(!raw&&!backups.length&&!artifacts.length){const legacy=await this.storage.readLegacy?.();if(legacy){const file=parseDojoStore(legacy.contents);const saved=await this.persist(file);this.recoveryPending=false;return {file:saved,recovered:false};}this.recoveryPending=false;return {file:emptyStore(),recovered:false};}
  this.recoveryPending=true;
  for(const b of backups){
   let file:DojoStore;
   try{const backup=await this.storage.readBackup(b.name);file=parseDojoStore(backup.contents);}catch{continue;}
   // A failed restore is an I/O failure, not a reason to try an older record or initialize empty.
   if(raw)await this.storage.quarantineCommitted(new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15),raw.token);
   this.current=undefined;
   const saved=await this.persist(file);this.recoveryPending=false;return {file:saved,recovered:true};
  }
  throw new Error('練習記録を読めません。元の記録を保持しています。バックアップを確認してください。');
 }
 async save(file:DojoStore):Promise<DojoStore>{
  if(this.recoveryPending)throw new Error('練習記録の復旧が完了していません。読み込みをもう一度お試しください。');
  return this.persist(file);
 }
 private async persist(file:DojoStore):Promise<DojoStore>{
  const next=storeSchema.parse({...file,revision:(this.current?.revision??0)+1});const contents=JSON.stringify(next,null,2)+'\n';
  await this.storage.commit(contents,new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15),this.current?.revision,this.current?.token);
  this.current=await this.storage.readCommitted();return next;
 }
}
let repository:DojoRepository|undefined;
export const runtimeRepository=()=>repository??=new DojoRepository(createRuntimePracticeStorage());

export function parseDojoStore(contents:string):DojoStore {const parsed=JSON.parse(contents);return storeSchema.parse(parsed?.fileVersion===1||parsed?.fileVersion===2||parsed?.fileVersion===3?{...parsed,fileVersion:4}:parsed);}
