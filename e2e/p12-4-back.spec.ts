import {test,expect,type Page} from '@playwright/test';
import {dateKey,emptyStore,emptyItem,type DojoStore,type Task} from '../src/domain/chordDojo/store';
import {builtinChords} from './helpers/p12-3';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * P12.4-01: one back button, top left, one level up. Esc steps one level outward.
 * Where each screen sits is in `dojoNav.ts`; the label of the button is derived from it.
 */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const progression:Task={kind:'progression',key:'builtin:ii-v-i-major:1',review:false,roots:[0],seconds:120};
const SHAPE:Task={kind:'shape',key:'preset:basic|close|self|any:quality:maj',quality:'maj',preset:'basic',bass:'self',review:false,roots:[0],seconds:60};
function file(task:Task,stage:'see'|'recall'='recall'){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 if(task.kind==='progression')f.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
async function open(page:Page,data?:DojoStore,mode='midi'){
 if(data)await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 await openDojo(page,mode);
}
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,KEY);
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const back=(page:Page)=>page.getByTestId('dojo-back');
const top=(page:Page)=>page.getByRole('heading',{name:'今日の練習',exact:true});

test.describe('the back button: where it is and where it goes',()=>{
 test('the top screen has none; every list below has one, named for the top',async({page})=>{
  await open(page);
  await expect(top(page)).toBeVisible();
  await expect(back(page)).toHaveCount(0);
  for(const choice of ['型の一覧','登録した音','自分の進行','定番の進行']){
   await page.getByRole('button',{name:choice,exact:true}).click();
   await expect(back(page)).toHaveCount(1);
   await expect(back(page)).toHaveText(/今日の練習/);
   await expect(back(page)).toHaveAttribute('aria-label','今日の練習へ戻る');
   await back(page).click();
   await expect(back(page)).toHaveCount(0);
  }
 });

 test('a practice opened from a list goes back to that list, and a list goes back to the top',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.locator('.dojo-builtin-card').first().getByRole('button',{name:'これを練習する'}).click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await expect(back(page)).toHaveAttribute('aria-label','定番の進行へ戻る');
  await back(page).click();
  await expect(page.locator('.dojo-builtin-card').first()).toBeVisible();
  await expect(back(page)).toHaveAttribute('aria-label','今日の練習へ戻る');
  await back(page).click();
  await expect(top(page)).toBeVisible();
 });

 test('today\'s practice goes back to the top; random key goes back to the list; 2-5-1 Master to the top',async({page})=>{
  await open(page,file(progression));
  await page.getByTestId('practice-start').click();
  await expect(back(page)).toHaveAttribute('aria-label','今日の練習へ戻る');
  await back(page).click();
  await expect(top(page)).toBeVisible();
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.locator('.dojo-builtin-card').first().getByRole('button',{name:'ランダムキーで練習'}).click();
  await expect(page.locator('[data-dojo-screen=endless]')).toBeVisible();
  await expect(back(page)).toHaveAttribute('aria-label','定番の進行へ戻る');
  await back(page).click();
  await expect(page.locator('.dojo-builtin-card').first()).toBeVisible();
  await back(page).click();
  await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();
  await expect(page.getByTestId('master251')).toBeVisible();
  await expect(back(page)).toHaveAttribute('aria-label','今日の練習へ戻る');
  await back(page).click();
  await expect(top(page)).toBeVisible();
 });

 test('the old ways back, the ones that only moved, are gone',async({page})=>{
  await open(page,file(progression));
  await page.getByTestId('practice-start').click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  for(const name of ['Chord Dojoに戻る','やめる（続きは次に）','はじめの画面へ','定番の進行に戻る'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(back(page)).toHaveCount(1);
 });
});

test.describe('leaving a practice',()=>{
 test('a clear that was judged just before going back is saved (it used to be lost)',async({page})=>{
  await open(page,file(progression));
  await page.getByTestId('practice-start').click();
  await emit(page,builtinChords('ii-v-i-major',0)[0].notes); // still held: the clear waits for the release
  await expect(page.locator('.dojo-chord-cards>button').first()).toHaveAttribute('data-moment','correct');
  await back(page).click();
  await expect(top(page)).toBeVisible();
  const after=await saved(page);
  expect(after.today!.cursor.chordIndex).toBe(1);
  expect(after.today!.matched).toBeGreaterThanOrEqual(1);
 });

 test('a clear judged just before leaving Chord Dojo from the sidebar is saved too',async({page})=>{
  await open(page,file(progression));
  await page.getByTestId('practice-start').click();
  await emit(page,builtinChords('ii-v-i-major',0)[0].notes);
  await expect(page.locator('.dojo-chord-cards>button').first()).toHaveAttribute('data-moment','correct');
  await page.locator('[data-nav="home"]').click();
  await expect.poll(async()=>(await saved(page)).today!.cursor.chordIndex).toBe(1);
 });

 test('a practice nobody played leaves the day exactly as it was', async({page})=>{
  await open(page,undefined,'no-midi');
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.locator('.dojo-builtin-card').first().getByRole('button',{name:'これを練習する'}).click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  const before=await saved(page);
  await back(page).click();
  const after=await saved(page);
  expect(after.today).toEqual(before.today);
 });

 test('going back stops the sound, and keeps the MIDI connection',async({page})=>{
  await open(page,file(progression,'recall'));
  await page.getByTestId('practice-start').click();
  await page.locator('.dojo-chord-cards>button').nth(1).click();
  await expect(page.locator('.dojo-chord-cards>button').nth(1)).toHaveAttribute('data-playing','true');
  await back(page).click();
  await expect(top(page)).toBeVisible();
  await expect(page.locator('[data-dojo-screen]').first()).toHaveAttribute('data-midi-kind','connected');
  await page.getByTestId('practice-start').click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await expect(page.locator('.dojo-chord-cards>button[data-playing=true]')).toHaveCount(0);
 });
});

test.describe('Esc steps one level outward',()=>{
 test('at the top it does nothing; in a practice it is the back button',async({page})=>{
  await open(page,file(progression));
  await page.locator('body').press('Escape');
  await expect(top(page)).toBeVisible();
  await page.getByTestId('practice-start').click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(top(page)).toBeVisible();
 });

 test('an open panel closes first; the next Esc goes back',async({page})=>{
  await open(page,file(progression));
  await page.getByTestId('practice-start').click();
  await page.getByRole('button',{name:'練習の設定'}).click();
  await expect(page.getByLabel('BPM')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(page.getByLabel('BPM')).toHaveCount(0);
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(top(page)).toBeVisible();
 });

 test('a list goes back to the top by Esc, with the focus on what opened it',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await expect(page.locator('.dojo-builtin-card').first()).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(top(page)).toBeVisible();
  await expect(page.getByRole('button',{name:'定番の進行',exact:true})).toBeFocused();
 });

 test('2-5-1 Master: the first Esc pauses, the second goes back',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();
  await expect(page.getByTestId('master251')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
  await page.locator('body').press('Escape');
  await expect(top(page)).toBeVisible();
 });

 test('random key: Esc leaves (nothing was cleared, so there is no summary to show)',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.locator('.dojo-builtin-card').first().getByRole('button',{name:'ランダムキーで練習'}).click();
  await expect(page.locator('[data-dojo-screen=endless]')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(page.locator('.dojo-builtin-card').first()).toBeVisible();
 });
});

test.describe('the focus goes back to what opened the screen',()=>{
 test('a practice opened from a list returns to that card\'s button; the top returns to the list button',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await page.locator('.dojo-builtin-card').nth(2).getByRole('button',{name:'これを練習する'}).click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await back(page).click();
  await expect(page.locator('.dojo-builtin-card').nth(2).getByRole('button',{name:'これを練習する'})).toBeFocused();
  await back(page).click();
  await expect(page.getByRole('button',{name:'定番の進行',exact:true})).toBeFocused();
 });

 test('2-5-1 Master returns to the button that opened it',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();
  await expect(page.getByTestId('master251')).toBeVisible();
  await back(page).click();
  await expect(page.getByRole('button',{name:'2-5-1 Master 続きから'})).toBeFocused();
 });
});

test('the finish screen goes back to the top',async({page})=>{
 await open(page,file(SHAPE,'recall'));
 await page.getByTestId('practice-start').click();
 await page.getByRole('button',{name:'とばす',exact:true}).click(); // the only task: skipping it ends today's plan
 await expect(page.locator('[data-dojo-screen=finish]')).toBeVisible({timeout:10000});
 await expect(back(page)).toHaveAttribute('aria-label','今日の練習へ戻る');
 await back(page).click();
 await expect(top(page)).toBeVisible();
});
