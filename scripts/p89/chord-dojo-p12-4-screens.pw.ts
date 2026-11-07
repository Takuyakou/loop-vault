// P12.4 evidence screenshots (git-ignored output): the added groups in the list, a 12-bar form, and the back button.
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {openDojo,type MidiControl} from '../../e2e/helpers/p12';
import {dateKey,emptyItem,emptyStore} from '../../src/domain/chordDojo/store';
const KEY='loop-vault:chord-dojo-theme-ranges-v1:data';
test('P12.4 evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 const audits:{file:string;overflow:number}[]=[];
 const shot=async(name:string,width:number,height:number)=>{const file=`${name}@${width}x${height}.png`;const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));audits.push({file,overflow});await page.screenshot({path:resolve(out,file),animations:'disabled'});};
 for(const [width,height] of [[1440,900],[960,1032],[768,640]] as const){
  await page.setViewportSize({width,height});
  await openDojo(page,'midi');
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await expect(page.locator('.dojo-builtin-card')).toHaveCount(45);
  await shot('list-top',width,height);
  await page.getByRole('button',{name:/^ジャズ基礎/}).click();await page.waitForTimeout(300);await shot('list-jazz',width,height);
  await page.getByRole('button',{name:/^ジャズ・フォーム/}).click();await page.waitForTimeout(300);await shot('list-forms',width,height);
 }
 // A 12-bar form being practised, and the back button on it.
 const data=emptyStore();data.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 const task={kind:'progression' as const,key:'builtin:jf-jazz-blues:1',review:false,roots:[5],seconds:120};
 data.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage:'see' as const,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 data.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 for(const [width,height] of [[1440,900],[960,1032]] as const){
  await page.setViewportSize({width,height});await page.goto('/?p12=midi');await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await shot('blues-12-bars',width,height);
 }
 // One key of a long form played through, and its result (P12.4-03).
 const expected=JSON.parse(readFileSync(resolve('src/domain/chordDojo/builtins.p12-4.expected.json'),'utf-8')) as Record<string,{notes:number[][]}[]>;
 const notes=expected['jf-minor-blues']![5]!.notes;
 const emit=(n:number[],on=true)=>page.evaluate(({n,on})=>(window as unknown as {__p12Midi:MidiControl}).__p12Midi.emit(n,on),{n,on});
 const lap=async()=>{for(let i=0;i<notes.length;i+=1){await emit(notes[i]!);await emit(notes[i]!,false);if(i<notes.length-1)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',new RegExp(`:0:${i+1}$`),{timeout:8000});}};
 await page.addInitScript(()=>localStorage.removeItem('loop-vault:chord-dojo-theme-ranges-v1:data'));
 await page.setViewportSize({width:1440,height:900});await openDojo(page,'midi');
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'マイナーブルース',exact:true})});
 await card.getByLabel('マイナーブルースのキー').selectOption('5');await card.scrollIntoViewIfNeeded();await shot('long-card',1440,900);
 await card.getByRole('button',{name:'これを練習する'}).click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 await lap();await page.getByRole('button',{name:'覚えた（Enter）'}).click();await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/);
 await lap();await expect(page.getByTestId('dojo-keydone')).toBeVisible({timeout:10000});await shot('long-result',1440,900);
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify({synthetic:true,audits},null,2));
});
