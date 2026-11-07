import {isTauri} from '@tauri-apps/api/core';
import {z} from 'zod';
import {BrowserPracticeStorage,TauriPracticeStorage} from '../../features/bass-practice/infra/repository/practiceStorage';
import type {PracticeStorage} from '../../features/bass-practice/infra/repository/practiceRepository';
import {storeSchema} from './store';
import {ORIGINAL_IDS,originalRecordKey} from './originalPractice';
import {LapRecordsRepository,createLapStore,emptyLapRecords,lapKeys,lapRecordsSchema,type LapRecords} from './lapRecords';
const keys=lapKeys;
const ORIGINAL_APP='loopvault-original-practice';
export const originalRecordsSchema=lapRecordsSchema(ORIGINAL_APP,ORIGINAL_IDS);
export type OriginalRecords=LapRecords;
export const emptyOriginalRecords=():OriginalRecords=>emptyLapRecords(ORIGINAL_APP);
/** Own canonical/backups/CAS (see LapRecordsRepository); never reads or writes the normal Dojo namespace. */
export class OriginalRecordsRepository extends LapRecordsRepository{constructor(storage:PracticeStorage){super(storage,originalRecordsSchema,ORIGINAL_APP);}}
let repository:OriginalRecordsRepository|undefined;
export const runtimeOriginalRepository=()=>repository??=new OriginalRecordsRepository(isTauri()?new TauriPracticeStorage(undefined,'original-practice'):new BrowserPracticeStorage(window.localStorage,'original-practice'));
/** Candidate-only legacy migration: validate everything, durable sidecar first, then caller commits cleaned Dojo.
 * Max-count import is idempotent if the main commit fails. No existing state/keys/recent are changed. */
export async function migrateOriginalLaps(contents:string,repo:OriginalRecordsRepository):Promise<string>{
 const raw=safeJson(contents);if(!raw||typeof raw!=='object')return contents;
 const legacySchema=storeSchema.extend({progressions:z.record(storeSchema.shape.progressions.valueSchema.extend({laps:keys.optional()}))});
 const candidate=legacySchema.safeParse(raw);if(!candidate.success)throw new Error('完奏記録の移行元を検証できません。元の記録を保持しています。');
 const laps:OriginalRecords['laps']={};let changed=false;
 for(const [key,item] of Object.entries(candidate.data.progressions)){
  if(!item.laps)continue;
  const id=ORIGINAL_IDS.find(id=>originalRecordKey(id)===key);if(!id)throw new Error('未対応の完奏記録があります。元の記録を保持しています。');
  laps[id]=item.laps;delete item.laps;changed=true;
 }
 if(!changed)return contents;
 const clean=storeSchema.parse(candidate.data);await repo.importLegacy(laps);
 return JSON.stringify(clean,null,2)+'\n';
}
function safeJson(contents:string):unknown{try{return JSON.parse(contents);}catch{return undefined;}}
export const originalLapStore=createLapStore(runtimeOriginalRepository,emptyOriginalRecords);
