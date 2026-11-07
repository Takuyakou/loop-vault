import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {emptyStore,emptyItem,type DojoStore} from '../src/domain/chordDojo/store';
import {openDojo,type MidiControl} from './helpers/p12';

/** P12.4-03: a long progression (8 bars or more) is played through in a chosen key; it never goes on to another key by itself. */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const expected=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/builtins.p12-4.expected.json',import.meta.url)),'utf-8')) as Record<string,{key:number;label:string[];notes:number[][];beats:number[]}[]>;
const F=5;
async function seeded(page:Page,data:DojoStore){await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});await openDojo(page);}
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,KEY);
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const card=(page:Page,title:string)=>page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function playChords(page:Page,id:string,key:number,count:number){
 const chords=expected[id]![key]!.notes;
 for(let i=0;i<count;i+=1){
  await emit(page,chords[i]!);
  await emit(page,chords[i]!,false);
  if(i<chords.length-1)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',new RegExp(`:0:${i+1}$`),{timeout:8000});
 }
}

test.describe('the list',()=>{
 test('short progressions keep the random key; 9 chords and more do not (they choose their key on the card)',async({page})=>{
  await openDojo(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  await expect(card(page,'王道進行').getByRole('button',{name:'ランダムキーで練習'})).toHaveCount(1);
  await expect(card(page,'バックドア')).toHaveCount(0);
  await expect(card(page,'下降ベース').getByRole('button',{name:'ランダムキーで練習'})).toHaveCount(1);
  // P12.5-01: the rule is the number of chords (9 or more). The 8-chord canon has its random key again.
  await expect(card(page,'カノン進行').getByRole('button',{name:'ランダムキーで練習'})).toHaveCount(1);
  await expect(card(page,'カノン進行').getByTestId('dojo-ownkey')).toHaveCount(0);
  for(const title of ['ジャズブルース','マイナーブルース','リズムチェンジ A']){
   await expect(card(page,title).getByRole('button',{name:'ランダムキーで練習'}),title).toHaveCount(0);
   await expect(card(page,title).getByRole('button',{name:'これを練習する'}),title).toHaveCount(1);
  }
  await expect(card(page,'下降ベース').getByTestId('dojo-ownkey')).toHaveCount(0);
 });

 test('the jazz forms offer six keys, F B♭ E♭ A♭ C G, and show a six-key table',async({page})=>{
  await openDojo(page);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  const blues=card(page,'ジャズブルース');
  await expect(blues.getByLabel('ジャズブルースのキー').locator('option')).toHaveText(['F','B♭','E♭','A♭','C','G']);
  await expect(blues.locator('.dojo-keys')).toHaveAttribute('data-keys','6');
  await expect(blues.locator('.dojo-key-status')).toHaveCount(6);
  await expect(page.getByLabel('定番のキー').locator('option')).toHaveCount(12);
 });

 test('おまかせ picks a key with no record yet; with every key recorded it picks from all six',async({page})=>{
  const data=emptyStore();data.progressions['builtin:jf-jazz-blues:1']={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z',keys:Object.fromEntries([5,10,3].map(k=>[String(k),{lastSec:5,bestSec:5,lastAt:'2026-09-01T00:00:00.000Z'}]))};
  await seeded(page,data);
  await page.getByRole('button',{name:'定番の進行',exact:true}).click();
  const blues=card(page,'ジャズブルース');
  const picked=new Set<string>();
  for(let i=0;i<12;i+=1){await blues.getByTestId('dojo-omakase').click();picked.add(await blues.getByLabel('ジャズブルースのキー').inputValue());}
  for(const key of picked)expect(['8','0','7']).toContain(key); // A♭, C, G: the ones without a record
 });
});

/** From the list: the card's key is chosen, the pass is "see → memorize → recall". Leaves the page in the recall pass. */
async function openFromList(page:Page,title:string,id:string,key:number){
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const target=card(page,title);
 await target.getByLabel(`${title}のキー`).selectOption(String(key));
 await target.getByRole('button',{name:'これを練習する'}).click();
 await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 const count=expected[id]![key]!.notes.length;
 await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(count);
 await playChords(page,id,key,count-1);
 const last=expected[id]![key]!.notes[count-1]!;
 await emit(page,last);await emit(page,last,false);
 await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:8000});
 return count;
}

test.describe('playing one key through',()=>{
 test('playing every chord to the end records the key, and then waits: no key follows by itself',async({page})=>{
  const count=await openFromList(page,'マイナーブルース','jf-minor-blues',F);
  await playChords(page,'jf-minor-blues',F,count-1);
  const last=expected['jf-minor-blues']![F]!.notes[count-1]!;
  await emit(page,last);await emit(page,last,false);
  await expect(page.getByTestId('dojo-keydone')).toBeVisible({timeout:10000});
  const after=await saved(page);
  expect(after.progressions['builtin:jf-minor-blues:1']!.keys[String(F)]).toBeTruthy();
  // it stays on the result: nothing starts another key
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('dojo-keydone')).toBeVisible();
  await expect(page.getByTestId('keydone-same')).toBeVisible();
  await expect(page.getByTestId('keydone-next')).toBeVisible();
  await expect(page.getByTestId('dojo-keydone').locator('.dojo-key-status')).toHaveCount(6);
 });

 test('"同じキーでもう一度" starts another pass; the back button goes to the list',async({page})=>{
  const count=await openFromList(page,'マイナーブルース','jf-minor-blues',F);
  await playChords(page,'jf-minor-blues',F,count-1);
  const last=expected['jf-minor-blues']![F]!.notes[count-1]!;
  await emit(page,last);await emit(page,last,false);
  await expect(page.getByTestId('dojo-keydone')).toBeVisible({timeout:10000});
  await page.getByTestId('keydone-same').click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(count);
  await page.getByTestId('dojo-back').click();
  await expect(card(page,'マイナーブルース')).toBeVisible();
 });

 test('"次のキー（おまかせ）" starts a pass in a key that has no record yet',async({page})=>{
  const count=await openFromList(page,'ジャズブルース','jf-jazz-blues',F);
  await playChords(page,'jf-jazz-blues',F,count-1);
  const last=expected['jf-jazz-blues']![F]!.notes[count-1]!;
  await emit(page,last);await emit(page,last,false);
  await expect(page.getByTestId('dojo-keydone')).toBeVisible({timeout:10000});
  await page.getByTestId('keydone-next').click();
  await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
  await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(count);
 });

 test('a pass stopped half way does not record the key',async({page})=>{
  await openFromList(page,'ジャズブルース','jf-jazz-blues',F);
  await playChords(page,'jf-jazz-blues',F,4);
  await page.getByTestId('dojo-back').click();
  await expect(card(page,'ジャズブルース')).toBeVisible();
  const after=await saved(page);
  expect(after.progressions['builtin:jf-jazz-blues:1']?.keys?.[String(F)]).toBeUndefined();
 });

 test('the card being played stays in view when the form wraps onto several rows',async({page})=>{
  await page.setViewportSize({width:768,height:640});
  const count=await openFromList(page,'ジャズブルース','jf-jazz-blues',F);
  await playChords(page,'jf-jazz-blues',F,count-2);
  await expect(page.locator('.dojo-chord-cards>button[data-current=true]')).toBeInViewport();
 });
});
