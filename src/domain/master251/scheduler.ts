import {FORMS,cellKey,type FormId,type CellKey,type MasterCell,type MasterStore,type MasterPractice} from './model';
import {recallThreshold,modeFor} from './policy';
/** The human's source-MIDI key order, expressed as pitch classes, applies only to new learning. */
export const LEARNING_KEYS=[0,10,8,6,4,2,1,11,9,7,5,3] as const;
export const LEARNING_KEY_LABELS=['C','B♭','A♭','G♭','E','D','D♭','B','A','G','F','E♭'] as const;
export type PracticeChoice=Pick<MasterPractice,'kind'|'form'|'scope'>;
/** Only an unassisted Recall success establishes learning. Empty/truncated legacy evidence cannot promote it. */
export function isMasterCellLearned(cell:MasterCell){return Boolean(cell.learnedAt)||cell.recent.some(a=>a.ok&&!a.usedHint&&a.bpm===undefined&&a.recallSec!==undefined);}
export function learningPosition(store:MasterStore,form:FormId){const at=LEARNING_KEYS.findIndex(key=>!isMasterCellLearned(store.cells[cellKey(form,key)]));return at<0?12:at;}
export function masterPractice(store:MasterStore):MasterPractice {
 const choice=store.practice??{scope:'all' as const,kind:store.session?.mode==='learn'||!store.session?'learning':'review',form:store.session?.cell[0] as FormId??'A'};
 return {version:1,kind:choice.kind,form:choice.form,scope:choice.scope??'all',learningStages:store.practice?.learningStages??{A:'study',B:'study',C:'study',D:'study'},learningPositions:Object.fromEntries(FORMS.map(form=>[form,learningPosition(store,form)])) as MasterPractice['learningPositions']};
}
export function withMasterPractice(store:MasterStore,choice:PracticeChoice&Partial<Pick<MasterPractice,'learningStages'>>=masterPractice(store),reviewDays=14):MasterStore {
 const cells=Object.fromEntries(Object.entries(store.cells).map(([id,cell])=>{const recalls=cell.recent.filter(a=>a.ok&&!a.usedHint&&a.bpm===undefined&&a.recallSec!==undefined),first=recalls[0],last=recalls[recalls.length-1],learnedAt=cell.learnedAt??first?.at;if(!learnedAt)return [id,cell];return [id,{...cell,learnedAt,nextReviewAt:cell.nextReviewAt??new Date(Date.parse(last?.at??learnedAt)+reviewDays*86400000).toISOString()}];}));
 const migrated={...store,cells},base=masterPractice(migrated);return {...migrated,practice:{...base,kind:choice.kind,form:choice.form,scope:choice.scope??base.scope,learningStages:choice.learningStages??base.learningStages}};
}
function random(seed:number){let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function reviewPriority(cell:MasterCell,now=Date.now()):number[]{
 const last=cell.recent[cell.recent.length-1],failures=cell.recent.slice(-3).filter(a=>!a.ok),failure=failures[failures.length-1];
 if(failure)return [0,-Date.parse(failure.at)];
 if(last?.recallSec!==undefined&&last.recallSec>recallThreshold(cell))return [1,-last.recallSec];
 if(cell.currentBpm!==80)return [2,cell.currentBpm??0];
 if(cell.reviewDue||cell.nextReviewAt!==undefined&&Date.parse(cell.nextReviewAt)<=now)return [3,Date.parse(cell.lastAt??'1970-01-01')];
 return [4,Date.parse(cell.lastAt??'1970-01-01')];
}
export function selectMasterCell(store:MasterStore,choice:PracticeChoice,seed:number,exclude?:CellKey):CellKey|undefined {
 if(choice.kind==='learning'){const at=learningPosition(store,choice.form);return at<12?cellKey(choice.form,LEARNING_KEYS[at]):undefined;}
 const all=Object.values(store.cells).filter(c=>isMasterCellLearned(c)&&(choice.kind==='mixed'||(choice.scope??'all')==='all'||c.form===choice.scope));
 const candidates=all.filter(c=>cellKey(c.form,c.key)!==exclude);const pool=candidates.length?candidates:all,rnd=random(seed);
 const ranked=pool.sort((a,b)=>cellKey(a.form,a.key).localeCompare(cellKey(b.form,b.key))).map(c=>({c,tie:rnd()}));
 ranked.sort((a,b)=>{const x=reviewPriority(a.c),y=reviewPriority(b.c);const transition=(c:MasterCell)=>choice.kind==='mixed'&&exclude?Number(c.form===exclude[0])+Number(cellKey(c.form,c.key).split(':')[1]===exclude.split(':')[1]):0;return x[0]-y[0]||x[1]-y[1]||transition(a.c)-transition(b.c)||a.tie-b.tie;});
 const c=ranked[0]?.c;return c?cellKey(c.form,c.key):undefined;
}
export function practiceMode(cell:MasterCell,choice:MasterPractice){return choice.kind==='learning'?(choice.learningStages?.[choice.form]==='recall'?'recall':'learn'):modeFor(cell)==='learn'?'recall':modeFor(cell);}
export function resumeMasterCell(store:MasterStore,choice:PracticeChoice,seed:number):CellKey|undefined {
 const saved=store.session?.cell as CellKey|undefined;
 if(choice.kind!=='learning'&&saved&&store.cells[saved]&&isMasterCellLearned(store.cells[saved])&&(choice.kind==='mixed'||(choice.scope??'all')==='all'||saved[0]===choice.scope))return saved;
 return selectMasterCell(store,choice,seed);
}
