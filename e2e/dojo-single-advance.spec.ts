import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * One chord played moves the cursor by one card, also on a slow machine: the automatic step to the next card must not run twice for one answer
 * (it used to, when the page was late drawing the next card: the timer of the step ran again with the answer it had already taken).
 * The slowness is made on purpose: the CPU of the page is throttled.
 */
const expected=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/builtins.p12-4.expected.json',import.meta.url)),'utf-8')) as Record<string,{key:number;label:string[];notes:number[][];beats:number[]}[]>;
const F=5;
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const cursor=(page:Page)=>page.locator('.dojo').getAttribute('data-dojo-cursor');

for(const rate of [1,8,20])test(`one chord moves one card (CPU ${rate}× slower)`,async({page})=>{
 test.setTimeout(120000);
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'ジャズブルース',exact:true})});
 await card.getByLabel('ジャズブルースのキー').selectOption(String(F));
 await card.getByRole('button',{name:'これを練習する'}).click();
 await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/);
 if(rate>1)await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate});
 const chords=expected['jf-jazz-blues']![F]!.notes;
 for(let i=0;i<5;i+=1){
  await emit(page,chords[i]!);await emit(page,chords[i]!,false);
  await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',new RegExp(`:see:0:${i+1}$`),{timeout:20000});
  // nothing more happens by itself
  await page.waitForTimeout(1200);
  expect(await cursor(page),`after chord ${i+1}`).toMatch(new RegExp(`:see:0:${i+1}$`));
 }
});
