// P12.3-01 evidence screenshots (git-ignored output): the grouped list, the playable cards, the one-chord card and the random-key screens.
import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {openDojo,type MidiControl} from '../../e2e/helpers/p12';
import {builtinChords} from '../../e2e/helpers/p12-3';
import {dateKey,emptyItem,emptyStore,type DojoStore,type Task} from '../../src/domain/chordDojo/store';

const output=join(process.cwd(),'p89-generated',process.env.P89_SCREENS_NAME??'P12.3-01');
const sizes=[[1440,900],[1366,768],[960,1032],[768,640]] as const;
const results:unknown[]=[];
const KEY='loop-vault:chord-dojo-theme-ranges-v1:data';
const SHAPE:Task={kind:'shape',key:'preset:basic|close|self|any:quality:maj',quality:'maj',preset:'basic',bass:'self',review:false,roots:[0,5,2],seconds:60};
const progression=(id:string,root=0):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[root],seconds:120});
function practiceFile(task:Task,stage:'see'|'memorize'|'recall'|'tempo'){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 if(task.kind==='progression')f.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
async function shoot(page:Page,name:string,width:number,height:number){
 mkdirSync(output,{recursive:true});
 await page.mouse.move(width/2,height-2);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
 const overflow=await page.evaluate(()=>{const main=document.querySelector('#main-content');return Math.max(document.documentElement.scrollWidth-innerWidth,(main?.scrollWidth??0)-(main?.clientWidth??0));});
 const filename=`${name}@${width}x${height}.png`;await page.screenshot({path:join(output,filename),animations:'disabled'});
 results.push({name,filename,width,height,overflow});writeFileSync(join(output,'manifest.json'),JSON.stringify({captured:results.length,results},null,2));
 expect(overflow,`${filename} horizontal overflow`).toBe(0);
}
async function playKey(page:Page,id:string,key:number,until:number){
 const chords=builtinChords(id,key).map(c=>c.notes);let previous:number[]=[];
 for(const [i,notes] of chords.entries()){
  if(i>=until)break;
  const off=previous.filter(n=>!notes.includes(n)),on=notes.filter(n=>!previous.includes(n));
  if(off.length)await emit(page,off,false);if(on.length)await emit(page,on,true);
  await expect(page.locator('.dojo-endless-cards>button').nth(i)).toHaveAttribute('data-state','done');previous=notes;
 }
 return previous;
}

for(const [width,height] of sizes)test(`P12.3 evidence ${width}x${height}`,async({context})=>{
 test.setTimeout(300000);
 const fresh=async(file?:DojoStore,mode='midi')=>{const page=await context.newPage();await page.setViewportSize({width,height});if(file)await page.addInitScript(({key,file})=>localStorage.setItem(key,JSON.stringify(file)),{key:KEY,file});await openDojo(page,mode);return page;};
 const startPractice=async(page:Page)=>{await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();};
 const listPage=async(mode='midi',file?:DojoStore)=>{const page=await fresh(file,mode);await page.getByRole('button',{name:'定番の進行',exact:true}).click();await expect(page.locator('.dojo-builtin-card')).toHaveCount(25);return page;};
 const endlessPage=async(mode='midi')=>{const page=await listPage(mode);await page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})}).getByRole('button',{name:'ランダムキーで練習'}).click();await expect(page.locator('[data-dojo-screen=endless]')).toBeVisible();return page;};
 // List: top, and scrolled to the minor group.
 let page=await listPage();await shoot(page,'list-top',width,height);
 await page.getByRole('button',{name:'マイナー 4',exact:true}).click();await page.waitForTimeout(400);await shoot(page,'list-minor',width,height);await page.close();
 // Cards: ① sounding, ② hint, tempo disabled.
 page=await fresh(practiceFile(progression('ouudou'),'memorize'));await startPractice(page);
 await page.locator('.dojo-chord-cards>button').nth(2).click();await expect(page.locator('.dojo-chord-cards>button').nth(2)).toHaveAttribute('data-playing','true');await shoot(page,'cards-memorize-playing',width,height);await page.close();
 page=await fresh(practiceFile(progression('ouudou'),'recall'));await startPractice(page);
 await page.locator('.dojo-chord-cards>button').nth(2).click();await expect(page.locator('.dojo-chord-cards>button').nth(2)).toHaveAttribute('data-hint','true');await shoot(page,'cards-recall-hint',width,height);await page.close();
 // One-chord card.
 page=await fresh(practiceFile(SHAPE,'see'));await startPractice(page);await shoot(page,'prompt-card',width,height);
 await page.locator('.dojo-prompt-play').click();await expect(page.locator('.dojo-prompt-card')).toHaveAttribute('data-playing','true');await shoot(page,'prompt-card-playing',width,height);await page.close();
 // Random key.
 page=await endlessPage();await shoot(page,'endless-ready',width,height);
 await page.locator('.dojo-endless-cards>button').nth(2).click();await expect(page.locator('.dojo-endless-cards>button').nth(2)).toHaveAttribute('data-hint','true');await shoot(page,'endless-hint',width,height);await page.close();
 page=await endlessPage();const key=Number(await page.locator('[data-endless-key]').getAttribute('data-endless-key'));
 await playKey(page,'ouudou',key,4);await expect(page.locator('.dojo-endless-clear')).toBeVisible();await shoot(page,'endless-clear',width,height);
 await emit(page,builtinChords('ouudou',key)[3].notes,false);await expect(page.locator('.dojo-endless-stats')).toContainText('1巡目 2/12');
 await page.getByRole('button',{name:'このキーをとばす'}).click();await page.locator('body').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});await page.keyboard.press('Escape');
 await expect(page.locator('.dojo-endless-summary')).toBeVisible();await shoot(page,'endless-summary',width,height);await page.close();
 page=await endlessPage('no-midi');await page.getByRole('button',{name:'答えを見る（Space）'}).click();await shoot(page,'endless-self',width,height);await page.close();
 page=await endlessPage();await emit(page,builtinChords('ouudou',Number(await page.locator('[data-endless-key]').getAttribute('data-endless-key')))[0].notes);
 await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());await expect(page.locator('[data-dojo-screen=endless]')).toHaveAttribute('data-endless-phase','paused');await shoot(page,'endless-paused',width,height);await page.close();
});
