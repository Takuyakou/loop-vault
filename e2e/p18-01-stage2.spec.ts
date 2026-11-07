import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDojo,type MidiControl} from './helpers/p12';
import {builtinChords} from './helpers/p12-3';
import {emptyStore,dateKey,type DojoStore} from '../src/domain/chordDojo/store';

/**
 * P18-01 Stage 2: the stages of the top row can be pressed (A begun from the list), ① and ② can be repeated
 * (もう一度 … を弾く, R), 「この段階をくり返す」 decides whether the end of a lap continues or asks, the lap
 * counts are shown, and the record of A ② is written once. The practice begun from today's plan keeps its own flow.
 */
const DOJO_KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const ORIG_KEY='loop-vault:original-practice-v1:data';
const JAZZ_KEY='loop-vault:jazz-progressions-v1:data';
interface OrigEvent{expectedPitches:number[];struck:{pitch:number}[];heldFromPrevious:string[];expectedNames:string[]}
const origData=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/originalPractice.json',import.meta.url)),'utf-8')) as {progressions:{id:string;events:OrigEvent[]}[]};
const ORIG_ID='op-traditional-passing';
const origEvents=origData.progressions.find(p=>p.id===ORIG_ID)!.events;
const origExpected=origEvents.map(e=>e.expectedPitches),origStruck=origEvents.map(e=>e.struck.map(s=>s.pitch));
const origCarried=origEvents.map((e,i)=>e.heldFromPrevious.map(n=>origExpected[i]![e.expectedNames.indexOf(n)]!));
interface JazzRow{id:string;itemKey:string;itemTonic:number;key:string;tonic:number;cards:{display:string;expectedPitches:number[];carried:number[];struck:number[]}[]}
const jazzTable=(JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/jazzTranspose.expected.json',import.meta.url)),'utf-8')) as {progressions:JazzRow[]}).progressions;
const JAZZ_ID='jazz-progressions-001';
const jazzRow=(itemTonic:number)=>jazzTable.find(r=>r.id===JAZZ_ID&&r.itemTonic===itemTonic)!;

const emit=(page:Page,notes:readonly number[],on=true,spread=0)=>page.evaluate(({notes,on,spread})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on,spread),{notes:[...notes],on,spread});
const CHORDS=builtinChords('ouudou',0).map(c=>c.notes);
const dojoRecord=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,DOJO_KEY);
const origRecord=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),ORIG_KEY) as Promise<{laps:Record<string,Record<string,{count:number}>>}>;
const jazzRecord=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),JAZZ_KEY) as Promise<{laps:Record<string,Record<string,{count:number}>>}>;
const lapsOf=(laps:Record<string,Record<string,{count:number}>>|undefined,id:string)=>Object.values(laps?.[id]??{}).reduce((n,l)=>n+l.count,0);
const focusBody=async(page:Page)=>{await page.locator('body').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});};

async function list(page:Page){await openDojo(page);await page.getByRole('button',{name:'定番の進行',exact:true}).click();await expect(page.locator('.dojo-builtin-jump')).toBeVisible();}
const ouudou=(page:Page)=>page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})});
async function openA(page:Page){
 await list(page);
 await ouudou(page).getByRole('button',{name:'これを練習する'}).click();
 await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/);
}
/** Plays the progression once in ① or ② (the cards move by themselves). */
async function playRound(page:Page,stage:'see'|'recall'){
 for(let i=0;i<4;i+=1){
  await emit(page,CHORDS[i]!);await emit(page,CHORDS[i]!,false);
  if(i<3)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',new RegExp(`:${stage}:0:${i+1}$`),{timeout:15000});
 }
}
const at=async(page:Page,n:number)=>expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-card',String(n));
const atJazz=async(page:Page,n:number)=>expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-card',String(n));
/** Plays card i of Original Practice as a pianist: let go of everything not carried, press the struck notes. */
async function playOrigCard(page:Page,i:number){
 const keep=origCarried[i]!;
 await emit(page,[...new Set(origExpected.flat())].filter(n=>!keep.includes(n)),false);
 await emit(page,origStruck[i]!,true,40);
}
/** Plays card i of the Jazz row the same way. */
async function playJazzCard(page:Page,row:JazzRow,i:number){
 const keep=row.cards[i]!.carried,all=[...new Set(row.cards.flatMap(c=>c.expectedPitches))];
 await emit(page,all.filter(n=>!keep.includes(n)),false);
 await emit(page,row.cards[i]!.struck,true,40);
}

test('A ①: the lap end asks (もう一度 ① / ② へ), R repeats the lap from the first card',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await expect(page.locator('.dojo-result')).toContainText('① を1周弾きました',{timeout:15000});
 await expect(page.getByRole('button',{name:'もう一度 ① を弾く（R）'})).toBeVisible();
 await expect(page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'})).toBeVisible();
 await focusBody(page);await page.keyboard.press('r');
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:10000});
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
 // the lap is played again, and then Enter (② 覚えて弾くへ) goes on as before
 await playRound(page,'see');
 await expect(page.locator('.dojo-result')).toContainText('① を1周弾きました',{timeout:15000});
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('1周目');
});

test('A ②: pressing ① on the top row returns to the first card of ①',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await expect(page.locator('.dojo-result')).toContainText('① を1周弾きました',{timeout:15000});
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await emit(page,CHORDS[0]!);await emit(page,CHORDS[0]!,false);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:1$/,{timeout:10000});
 // ③ cannot be pressed here (the review's stage): only ① and ② are buttons
 await expect(page.locator('.dojo-stage')).toContainText('③');
 await expect(page.locator('.dojo-stage button')).toHaveCount(2);
 await page.getByTestId('dojo-stage-1').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:10000});
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
});

test('A ②: a clean pass stops before the finish (もう一度 ② / 終わる) and the repeats record nothing',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 await expect(page.locator('.dojo-result')).toContainText('② をヒントなしで通しました');
 const once=await dojoRecord(page);
 expect(once.progressions['builtin:ouudou:1']!.state).toBe('provisional');
 expect(once.progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 await page.getByTestId('dojo-again-recall').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 const twice=await dojoRecord(page);
 expect(twice.progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 expect(twice.progressions['builtin:ouudou:1']!.keys?.[0]?.lastSec).toBe(once.progressions['builtin:ouudou:1']!.keys?.[0]?.lastSec);
 await page.getByRole('button',{name:'終わる（Enter）'}).click();
 await expect(page.getByRole('heading',{name:'今日、自分の語彙に増えたもの'})).toBeVisible();
});

test('A: from the ② end back to ① and a clean ② again still records only once (くり返す off), and ① can be practised from the ② end',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 const once=await dojoRecord(page);
 expect(once.progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 // the task is not over: the stages still work from the ② end
 await page.getByTestId('dojo-stage-1').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:10000});
 await expect(page.locator('.dojo-finish')).toHaveCount(0);
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
 await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(4);
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 const twice=await dojoRecord(page);
 expect(twice.progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 expect(twice.progressions['builtin:ouudou:1']!.state).toBe(once.progressions['builtin:ouudou:1']!.state);
 expect(twice.progressions['builtin:ouudou:1']!.keys?.[0]?.lastSec).toBe(once.progressions['builtin:ouudou:1']!.keys?.[0]?.lastSec);
});

test('A: くり返す on — from ① back to ② a clean pass is still a practice round (the record stays one)',async({page})=>{
 await openA(page);
 await page.getByTestId('dojo-repeat').click();
 await playRound(page,'see');
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:15000});
 await page.getByTestId('dojo-stage-2').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await playRound(page,'recall');
 await expect(page.locator('.dojo-result')).toContainText('② をヒントなしで通しました',{timeout:15000});
 expect((await dojoRecord(page)).progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 // back to ① (it goes on by itself), then ② again: whatever way ② is entered, the day has recorded once
 await page.getByTestId('dojo-stage-1').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:10000});
 await playRound(page,'see');
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:15000});
 await page.getByTestId('dojo-stage-2').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await playRound(page,'recall');
 await expect(page.locator('.dojo-result')).toContainText('② をヒントなしで通しました',{timeout:15000});
 expect((await dojoRecord(page)).progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
});

test('A: leaving with Esc mid-way after the recorded pass records nothing more',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 await page.getByTestId('dojo-stage-1').click();
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await emit(page,CHORDS[0]!);
 await expect(page.locator('.dojo-result')).toContainText('合いました',{timeout:10000});
 await page.keyboard.press('Escape');
 await expect(page.getByRole('heading',{name:'定番の進行',exact:true})).toBeVisible();
 await expect.poll(async()=>(await dojoRecord(page)).progressions['builtin:ouudou:1']!.recent.length,{timeout:5000}).toBe(1);
});

test('A 「この段階をくり返す」 on: the laps go on without stopping and the record stays one',async({page})=>{
 await openA(page);
 await expect(page.getByTestId('dojo-repeat')).toHaveAttribute('aria-pressed','false');
 await page.getByTestId('dojo-repeat').click();
 await expect(page.getByTestId('dojo-repeat')).toHaveAttribute('aria-pressed','true');
 await playRound(page,'see');
 // the ① end does not stop: ① goes on from the first card
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:15000});
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
 await expect(page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'})).toHaveCount(0);
 await page.getByTestId('dojo-stage-2').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 await playRound(page,'recall');
 await expect(page.locator('.dojo-result')).toContainText('② をヒントなしで通しました',{timeout:15000});
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/);
 await expect(page.getByTestId('dojo-progress-lap')).toContainText('2周目');
 expect((await dojoRecord(page)).progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
 await playRound(page,'recall');
 await expect(page.locator('.dojo-result')).toContainText('② をヒントなしで通しました',{timeout:15000});
 expect((await dojoRecord(page)).progressions['builtin:ouudou:1']!.recent).toHaveLength(1);
});

test('the practice begun from today’s plan keeps its own flow (no stage press, no R)',async({page})=>{
 const f=emptyStore();
 f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[{kind:'progression',key:'builtin:i-v-vi-iv:1',review:false,roots:[0],seconds:120}],cursor:{taskIndex:0,stage:'see',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 await page.addInitScript(file=>localStorage.setItem('loop-vault:chord-dojo-txt-jazz-v1:data',JSON.stringify(file)),f);
 await openDojo(page);
 console.log('DEBUG seeded-keys:',await page.evaluate(()=>Object.keys(window.localStorage).filter(k=>k.includes('dojo'))));
 await page.getByTestId('practice-start').click();
 await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:see:0:0$/,{timeout:10000});
 const chords=builtinChords('i-v-vi-iv',0).map(c=>c.notes);
 for(let i=0;i<4;i+=1){await emit(page,chords[i]!);await emit(page,chords[i]!,false);await expect(page.locator('.dojo-result')).toContainText('合いました');await page.getByRole('button',{name:'次へ（Enter）',exact:true}).click();}
 await expect(page.getByRole('button',{name:'覚えた（Enter）'})).toBeVisible();
 await expect(page.getByTestId('dojo-again-see')).toHaveCount(0);
 await expect(page.getByTestId('dojo-repeat')).toHaveCount(0);
 await expect(page.locator('.dojo-stage button')).toHaveCount(0);
});

test('R does nothing while typing, or while a dialog is open',async({page})=>{
 await openA(page);
 await playRound(page,'see');
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await playRound(page,'recall');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'練習の設定'}).click();
 await page.getByLabel('BPM').focus();
 await page.keyboard.press('r');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible();
 await page.getByRole('button',{name:'MIDI 設定'}).click();
 await expect(page.getByTestId('midi-panel')).toBeVisible();
 await page.keyboard.press('r');
 await expect(page.getByTestId('dojo-again-recall')).toBeVisible();
 await page.keyboard.press('Escape');
});

test('C Original Practice: くり返す off stops at the lap end (the lap is still recorded), R goes on; the switch is remembered',async({page})=>{
 await list(page);
 await page.locator(`.dojo-original-card[data-original=${ORIG_ID}]`).getByRole('button',{name:'これを練習する'}).click();
 await expect(page.getByTestId('dojo-original')).toBeVisible();
 await expect(page.getByTestId('original-repeat')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('original-repeat').click();
 await expect(page.getByTestId('original-repeat')).toHaveAttribute('aria-pressed','false');
 await page.getByTestId('dojo-back').click();
 await expect(page.getByRole('heading',{name:'定番の進行',exact:true})).toBeVisible();
 await page.locator(`.dojo-original-card[data-original=${ORIG_ID}]`).getByRole('button',{name:'これを練習する'}).click();
 await expect(page.getByTestId('original-repeat')).toHaveAttribute('aria-pressed','false');
 for(let i=0;i<6;i+=1){await at(page,i);await playOrigCard(page,i);}
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-lap-stop','true',{timeout:10000});
 await expect(page.getByTestId('original-lap-stop')).toBeVisible();
 await expect(page.getByTestId('original-lap-again')).toBeVisible();
 await expect.poll(async()=>lapsOf((await origRecord(page)).laps,ORIG_ID)).toBe(1);
 await page.getByTestId('original-lap-again').click();
 await expect(page.getByTestId('dojo-original')).not.toHaveAttribute('data-lap-stop','true');
 await at(page,0);
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-lap','2');
});

test('D Jazz: くり返す off stops at the lap end, and もう一度 continues in the next key of the random round',async({page})=>{
 await list(page);
 await page.locator(`[data-jazz-item=${JAZZ_ID}]`).getByTestId('jazz-open').click();
 await expect(page.getByTestId('dojo-jazz')).toBeVisible();
 await expect(page.getByTestId('jazz-repeat')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('jazz-random').click();
 await page.getByTestId('jazz-repeat').click();
 await expect(page.getByTestId('jazz-repeat')).toHaveAttribute('aria-pressed','false');
 const key=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
 const row=jazzRow(key);
 for(let i=0;i<row.cards.length;i+=1){await atJazz(page,i);await playJazzCard(page,row,i);}
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-lap-stop','true',{timeout:10000});
 await expect(page.getByTestId('jazz-lap-stop')).toBeVisible();
 await expect(page.getByTestId('jazz-lap-again')).toBeVisible();
 expect(Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'))).not.toBe(key);
 await expect.poll(async()=>lapsOf((await jazzRecord(page)).laps,JAZZ_ID)).toBe(1);
 await page.getByTestId('jazz-lap-again').click();
 await expect(page.getByTestId('dojo-jazz')).not.toHaveAttribute('data-lap-stop','true');
 await atJazz(page,0);
});
