import {createStore} from 'zustand/vanilla';
import {emptyStore,runtimeRepository,type DojoStore} from './store';
interface State {file:DojoStore;ready:boolean;error?:string;recovered:boolean;initialize:()=>Promise<void>;save:(file:DojoStore)=>Promise<boolean>;}
let loading:Promise<void>|undefined,queue=Promise.resolve();
export const dojoStore=createStore<State>((set,get)=>({file:emptyStore(),ready:false,recovered:false,async initialize(){if(get().ready)return;if(!loading)loading=runtimeRepository().load().then(({file,recovered})=>{set({file,ready:true,recovered,error:undefined});}).catch(()=>{set({error:'練習記録を開けません。元の記録を保持しています。'});}).finally(()=>{loading=undefined;});await loading;},async save(file){let ok=false;queue=queue.then(async()=>{try{const saved=await runtimeRepository().save(file);set({file:saved,error:undefined});ok=true;}catch{set({file,error:'練習記録を保存できません。変更はこの画面に保持しています。'});}},()=>undefined);await queue;return ok;}}));
