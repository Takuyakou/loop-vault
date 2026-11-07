// P5.26.2 evidence screenshots (git-ignored output): the saved progression's whole-song strip.
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {builtinChords} from '../../e2e/helpers/p12-3';
import {openDojo} from '../../e2e/helpers/p12';
import {dateKey,emptyItem,emptyStore} from '../../src/domain/chordDojo/store';
test('P5.26.2-01 progression strip evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 const audits:{file:string;overflow:number}[]=[];
 for(const [width,height] of [[1440,900],[960,1032],[768,640]] as const){
  await page.setViewportSize({width,height});await page.goto('/?p104=long');
  await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').first().getByRole('button',{name:/進行を開く/}).click();
  await expect(page.getByTestId('correction-piano-roll')).toBeVisible();
  const shot=async(name:string)=>{const file=`${name}@${width}x${height}.png`;const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));expect(overflow).toBe(0);audits.push({file,overflow});await page.screenshot({path:resolve(out,file),animations:'disabled'});};
  await shot('strip-initial');
  await page.getByTestId('correction-timeline-scroll').evaluate(e=>{e.scrollLeft=e.scrollWidth;});await page.waitForTimeout(200);await shot('strip-scrolled');
  await page.getByTestId('correction-play-song').click();await expect(page.getByTestId('correction-overview-playhead')).toBeVisible();await page.waitForTimeout(500);await shot('strip-playing');
  await page.getByTestId('correction-play-song').click();
 }
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify({synthetic:true,audits},null,2));
});

test('P5.26.2-02 voicing loop hand slots evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 for(const [width,height] of [[1440,900],[960,1032]] as const){
  await page.setViewportSize({width,height});await page.goto('/?p527Status=p533-rules');await page.locator('[data-nav="voicing-loop"]').click();
  const events=page.getByTestId('voicing-loop-event');
  for(const index of [0,2]){await events.nth(index).click();await page.waitForTimeout(150);await page.screenshot({path:resolve(out,`hand-slots-${index}@${width}x${height}.png`),animations:'disabled'});}
 }
});

test('P5.26.2-03 chord dojo result mark evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 const KEY='loop-vault:chord-dojo-theme-ranges-v1:data';
 const data=emptyStore();data.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 data.today={date:dateKey(new Date()),tasks:[{kind:'progression',key:'builtin:ii-v-i-major:1',review:false,roots:[0],seconds:120}],cursor:{taskIndex:0,stage:'recall',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 data.progressions['builtin:ii-v-i-major:1']={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 await page.setViewportSize({width:1440,height:900});await openDojo(page,'midi');
 await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 const emit=(notes:number[],on=true)=>page.evaluate(({notes,on})=>(window as unknown as {__p12Midi:{emit:(n:number[],o?:boolean)=>void}}).__p12Midi.emit(notes,on),{notes,on});
 const first=builtinChords('ii-v-i-major',0)[0].notes;await emit(first);await expect(page.locator('.dojo-chord-cards>button').first()).toHaveAttribute('data-moment','correct');
 await page.screenshot({path:resolve(out,'dojo-moment@1440x900.png'),animations:'disabled'});
 await emit(first,false);await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:0:1$/);await page.waitForTimeout(700);
 await page.screenshot({path:resolve(out,'dojo-round@1440x900.png'),animations:'disabled'});
});

test('P5.26.2-04 voicing loop navigator evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 await page.setViewportSize({width:1600,height:900});await page.goto('/?p527Status=long-song');await page.locator('[data-nav="voicing-loop"]').click();
 const workspace=page.getByTestId('voicing-loop-workspace');await expect(workspace.getByTestId('voicing-loop-navigator')).toBeVisible();
 await page.screenshot({path:resolve(out,'navigator-top@1600x900.png'),animations:'disabled'});
 await workspace.getByRole('button',{name:'開始',exact:true}).click();await page.waitForTimeout(2500);
 await page.screenshot({path:resolve(out,'navigator-playing@1600x900.png'),animations:'disabled'});
});
