import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dateKey,emptyStore,emptyItem,type DojoStore,type Task} from '../src/domain/chordDojo/store';
import {builtinChords} from './helpers/p12-3';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * P12.5-01: a hint or a shown answer does not send the player back; the card is played again and the pass goes on.
 * A pass with a hint is not a clear, and the same key goes round once more; the clear itself is unchanged
 * (a pass without hints or a shown answer, even if a card was missed and put right).
 */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const task=(id:string,root=0):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[root],seconds:120});
function file(t:Task,recorded=false){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[t],cursor:{taskIndex:0,stage:'recall',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 f.progressions[t.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z',...(recorded?{keys:{'0':{lastSec:3,bestSec:3,lastAt:'2026-09-01T00:00:00.000Z'}}}:{})};
 return f;
}
async function start(page:Page,data:DojoStore){
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 await openDojo(page);await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
}
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const read=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,KEY);
const cursor=(page:Page)=>page.locator('.dojo').getAttribute('data-dojo-cursor');
const at=(index:number)=>new RegExp(`:recall:0:${index}$`);
const c3=builtinChords('ii-v-i-major',0);
async function playCard(page:Page,notes:readonly number[]){await emit(page,notes);await emit(page,notes,false);}
async function free(page:Page,key:string){await page.locator('body').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});await page.keyboard.press(key);}

test('a name that appears after the delay does not send the player back to the first card',async({page})=>{
 test.setTimeout(60000);
 await start(page,file(task('ii-v-i-major')));
 await playCard(page,c3[0].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(1));
 await expect(page.locator('.dojo-chord-cards>button').nth(1).locator('strong')).toHaveText('G7',{timeout:9000}); // the name of card 2 appears
 expect(await cursor(page)).toMatch(at(1)); // still on card 2, not card 1
 await expect(page.locator('.dojo-chord-cards>button').nth(1)).toHaveAttribute('data-hint','true');
 await playCard(page,c3[1].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(2));
});

test('showing the answer (Space) does not send the player back either, and marks that card',async({page})=>{
 await start(page,file(task('ii-v-i-major')));
 await playCard(page,c3[0].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(1));
 await free(page,'Space');
 await expect(page.locator('.dojo-chord-cards>button').nth(1)).toHaveAttribute('data-hint','true');
 expect(await cursor(page)).toMatch(at(1));
 await playCard(page,c3[1].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(2));
});

test('a pass with a hint is not a clear: it goes straight round again on the same key, with last time\'s mark',async({page})=>{
 await start(page,file(task('ii-v-i-major')));
 await playCard(page,c3[0].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(1));
 await free(page,'Space');
 await playCard(page,c3[1].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(2));
 await playCard(page,c3[2].notes);
 // another pass of the same key: no memorize screen, not finished, nothing cleared
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(0));
 await expect(page.getByRole('button',{name:'覚えた（Enter）'})).toHaveCount(0);
 await expect(page.getByTestId('dojo-card-flags')).toHaveCount(1);
 await expect(page.locator('.dojo-chord-cards>button').nth(1).getByTestId('dojo-card-flags')).toHaveText('前回ヒント');
 await expect(page.getByTestId('dojo-lap-note')).toBeVisible();
 const mid=await read(page);
 expect(mid.today!.finished).toBe(false);
 expect(mid.progressions['builtin:ii-v-i-major:1']!.keys['0']).toBeUndefined();
 // the pass with no hint is the clear
 for(let i=0;i<c3.length;i+=1){await playCard(page,c3[i]!.notes);if(i<c3.length-1)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(i+1),{timeout:8000});}
 await expect(page.locator('[data-dojo-screen=finish]')).toBeVisible({timeout:8000});
 const done=await read(page);
 expect(done.progressions['builtin:ii-v-i-major:1']!.keys['0']).toBeTruthy();
});

test('a miss that is put right, with no hint and no shown answer, is still a clear (the clear is as it was)',async({page})=>{
 await start(page,file(task('ii-v-i-major')));
 await playCard(page,c3[0].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(1));
 const wrong=c3[1].notes.map(n=>n+1);
 await emit(page,wrong);
 await expect(page.locator('.dojo-chord-cards>button').nth(1).getByTestId('dojo-card-flags')).toHaveText('ミス');
 await emit(page,wrong,false);
 await page.waitForTimeout(700);
 await playCard(page,c3[1].notes);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(2));
 await playCard(page,c3[2].notes);
 await expect(page.locator('[data-dojo-screen=finish]')).toBeVisible({timeout:8000});
 const done=await read(page);
 expect(done.progressions['builtin:ii-v-i-major:1']!.keys['0']).toBeTruthy();
});

test('the existing record is read as before',async({page})=>{
 await start(page,file(task('ii-v-i-major'),true));
 await page.getByTestId('dojo-back').click();
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'ii–V–I',exact:true})});
 await expect(card.locator('.dojo-badge')).toHaveText('仮の合格');
});

test('a 15-card form reaches its last card even with a hint on the way',async({page})=>{
 test.setTimeout(90000);
 const expected=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/builtins.p12-4.expected.json',import.meta.url)),'utf-8')) as Record<string,{notes:number[][]}[]>;
 const notes=expected['jf-jazz-blues']![0]!.notes;
 await start(page,file(task('jf-jazz-blues')));
 for(let i=0;i<4;i+=1){await playCard(page,notes[i]!);await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(i+1));}
 await free(page,'Space'); // a hint on card 5
 for(let i=4;i<notes.length;i+=1){
  await playCard(page,notes[i]!);
  if(i<notes.length-1)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(i+1),{timeout:8000});
 }
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',at(0),{timeout:8000}); // another pass, from the first card, after the last
 await expect(page.locator('.dojo-chord-cards>button').nth(4).getByTestId('dojo-card-flags')).toHaveText('前回ヒント');
});

test('the random key: 9 chords and more are out, the 8-chord canon is in, every shorter one is as before',async({page})=>{
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const total=await page.locator('.dojo-builtin-card').count();
 expect(total).toBe(45);
 await expect(page.locator('.dojo-builtin-card').getByRole('button',{name:'ランダムキーで練習'})).toHaveCount(total-3);
 await expect(page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'カノン進行',exact:true})}).getByRole('button',{name:'ランダムキーで練習'})).toHaveCount(1);
});
