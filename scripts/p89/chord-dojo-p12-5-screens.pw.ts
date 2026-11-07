// P12.5 evidence screenshots (git-ignored output): the Original Practice group in the list, the practice screen,
// and a lap that was played through (完奏).
import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDojo,type MidiControl} from '../../e2e/helpers/p12';

const ID='op-traditional-passing';
test('P12.5 evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 const audits:{file:string;overflow:number}[]=[];
 const shot=async(name:string,width:number,height:number)=>{
  const file=`${name}@${width}x${height}.png`;
  const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  audits.push({file,overflow});await page.screenshot({path:resolve(out,file)});
 };
 const emit=(n:number[],on=true,spread=0)=>page.evaluate(({n,on,spread})=>(window as unknown as {__p12Midi:MidiControl}).__p12Midi.emit(n,on,spread),{n,on,spread});
 const raw=JSON.parse(readFileSync(resolve('src/domain/chordDojo/originalPractice.json'),'utf-8')) as {progressions:{id:string;events:{expectedPitches:number[];struck:{pitch:number}[]}[]}[]};
 const events=raw.progressions.find(p=>p.id===ID)!.events;
 // The group in the list, and the practice screen.
 for(const [width,height] of [[1440,900],[960,1032],[768,640]] as const){
  await page.setViewportSize({width,height});
  await openDojo(page,'midi');
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.getByRole('button',{name:/^Original Practice/}).click();await page.waitForTimeout(300);
  await shot('list-original',width,height);
  await page.locator(`.dojo-original-card[data-original=${ID}]`).getByRole('button',{name:'これを練習する'}).click();
  await expect(page.getByTestId('dojo-original')).toBeVisible();
  await shot('original-first-card',width,height);
 }
 // A lap with a melody on top, and the lap result.
 await page.setViewportSize({width:1440,height:900});
 await openDojo(page,'midi');
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await page.locator(`.dojo-original-card[data-original=${ID}]`).getByRole('button',{name:'これを練習する'}).click();
 const all=[...new Set(events.flatMap(e=>e.expectedPitches))];
 for(let i=0;i<events.length;i+=1){
  await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-card',String(i));
  const carried=events[i]!.expectedPitches.filter(n=>!events[i]!.struck.some(s=>s.pitch===n));
  await emit(all.filter(n=>!carried.includes(n)),false);
  if(i===3)await shot('original-card-4-of-6',1440,900);
  await emit([...events[i]!.struck.map(s=>s.pitch),84],true,40);
 }
 await expect(page.getByTestId('original-lap')).toBeVisible();
 await shot('original-lap-done',1440,900);
 // Back in the list the record reads 完奏.
 await page.getByTestId('dojo-back').click();
 await page.locator(`.dojo-original-card[data-original=${ID}]`).scrollIntoViewIfNeeded();
 await shot('list-original-after-lap',1440,900);
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify({synthetic:true,audits},null,2));
});
