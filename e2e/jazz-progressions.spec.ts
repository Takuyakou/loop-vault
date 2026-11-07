import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * Jazz Progressions: recommended voicings (not a transcription of anyone's playing), played like Original Practice cards:
 * every note held, every struck note pressed again, other notes ignored. Original key only. Laps are 完奏 in a record of their own.
 */
const KEY='loop-vault:jazz-progressions-v1:data';
const DOJO_KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
interface Event{display:string;expectedPitches:number[];struck:{pitch:number}[];heldFromPrevious:string[];expectedNames:string[]}
const data=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/jazzProgressions.json',import.meta.url)),'utf-8')) as {progressions:{id:string;events:Event[]}[]};
interface Row{id:string;itemKey:string;itemTonic:number;key:string;tonic:number;cards:{display:string;expectedPitches:number[];carried:number[];struck:number[]}[]}
const table=(JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/jazzTranspose.expected.json',import.meta.url)),'utf-8')) as {progressions:Row[]}).progressions;
const rowOf=(id:string,itemTonic:number)=>table.find(r=>r.id===id&&r.itemTonic===itemTonic)!;
const events=(id:string)=>data.progressions.find(p=>p.id===id)!.events;
const ID='jazz-progressions-001';
const expectedOf=(id:string)=>events(id).map(e=>e.expectedPitches);
const struckOf=(id:string)=>events(id).map(e=>e.struck.map(s=>s.pitch));
const carriedOf=(id:string)=>events(id).map((e,i)=>e.heldFromPrevious.map(n=>expectedOf(id)[i]![e.expectedNames.indexOf(n)]!));
const emit=(page:Page,notes:readonly number[],on=true,spread=0)=>page.evaluate(({notes,on,spread})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on,spread),{notes:[...notes],on,spread});
const at=async(page:Page,n:number)=>expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-card',String(n));
const record=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY) as Promise<{laps:Record<string,Record<string,{count:number}>>}>;

async function openList(page:Page,mode='midi'){
 await openDojo(page,mode);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
}
async function openJazz(page:Page,item='001',mode='midi'){
 await openList(page,mode);
 await page.locator(`[data-jazz-item=jazz-progressions-${item}]`).getByTestId('jazz-open').click();
 await expect(page.getByTestId('dojo-jazz')).toBeVisible();
}
/** Plays card i of the progression in the key of the table row. */
async function playRow(page:Page,row:Row,i:number){
 const all=[...new Set(row.cards.flatMap(c=>c.expectedPitches))],keep=row.cards[i]!.carried;
 await emit(page,all.filter(n=>!keep.includes(n)),false);
 await emit(page,row.cards[i]!.struck,true,40);
}
const itemKeyOf=async(page:Page)=>Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
/** Plays card i as a pianist would: let go of everything that is not carried, then press the struck notes. */
async function playCard(page:Page,id:string,i:number,extra:number[]=[]){
 const keep=carriedOf(id)[i]!;
 await emit(page,[...new Set(expectedOf(id).flat())].filter(n=>!keep.includes(n)),false);
 await emit(page,[...struckOf(id)[i]!,...extra],true,40);
}

test('the list has the Jazz Progressions group after Original Practice: 12 items, with the main progression and a choice of versions',async({page})=>{
 await openList(page);
 const jump=page.getByRole('navigation',{name:'まとまりへ移る'}).getByRole('button');
 await expect(jump.last()).toHaveText('Jazz Progressions 12');
 await jump.last().click();
 const cards=page.locator('.dojo-jazz-card');
 await expect(cards).toHaveCount(12);
 await expect(page.locator('#dojo-builtin-jazz-progressions')).toContainText('推奨ボイシング(元の演奏の書き起こしではない)');
 await expect(cards.nth(0).getByRole('heading',{name:'01 ii–V–I と 6/9 への解決'})).toBeVisible();
 await expect(cards.nth(0).locator('.dojo-builtin-chords')).toHaveText('E♭：Fm9 → B♭13 → E♭6/9');
 await expect(cards.nth(0).getByTestId('jazz-item-laps')).toHaveText('まだ');
 await expect(cards.nth(0).getByTestId('jazz-list-version')).toHaveCount(0);
 // item 4 has two versions: the main one is chosen; the other can be chosen and is the one that opens
 const four=page.locator('[data-jazz-item=jazz-progressions-004]');
 await expect(four.getByTestId('jazz-list-version')).toHaveCount(2);
 await expect(four.locator('.dojo-builtin-chords')).toHaveText('D：Asus(11)13 → A13');
 await four.getByTestId('jazz-list-version').nth(1).click();
 await expect(four.locator('.dojo-builtin-chords')).toHaveText('D：Em9 → A13');
 await four.getByTestId('jazz-open').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-id','jazz-progressions-004-a');
 // the standard progressions above are as they were
 await page.getByTestId('dojo-back').click();
 await expect(page.locator('.dojo-builtin-card')).toHaveCount(45);
});

test('001 played through goes round, counts one 完奏 in the Jazz record only, and the right hand of B♭13 is kept down',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 await expect(page.getByTestId('jazz-card')).toHaveCount(3);
 await expect(page.getByTestId('dojo-jazz')).toContainText('推奨ボイシング(元の演奏の書き起こしではない)');
 await playCard(page,ID,0);await at(page,1);
 // B♭13: the right hand (A♭3 C4 G4) stays down, only the left hand is played again
 expect(carriedOf(ID)[1]!.length).toBe(3);
 await expect(page.getByTestId('jazz-hint')).toContainText('A♭3 C4 G4 は押さえたままで構いません');
 await playCard(page,ID,1);await at(page,2);
 await playCard(page,ID,2);await at(page,0);
 await expect(page.getByTestId('jazz-lap')).toContainText('完奏！');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-lap','2');
 await expect.poll(async()=>(await record(page)).laps[ID]?.['3']?.count).toBe(1);
 await expect(page.getByTestId('jazz-laps')).toHaveText('1');
 const dojo=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),DOJO_KEY);
 expect(JSON.stringify(dojo?.progressions??{})).not.toContain('jazz-progressions');
 expect(await page.evaluate(()=>localStorage.getItem('loop-vault:original-practice-v1:data'))).toBeNull();
 await page.reload();await page.locator('[data-nav=chord-dojo]').click();await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await expect(page.locator(`[data-jazz-item=${ID}] [data-testid=jazz-item-laps]`)).toHaveText('完奏 1周');
});

test('extra notes still pass; a missing note, or letting go of a note that is kept down, does not',async({page})=>{
 await openJazz(page);
 await playCard(page,ID,0,[84,88]);await at(page,1);   // a melody on top
 const keep=carriedOf(ID)[1]!;
 // the left hand only, and the kept right hand let go of: not a pass
 await emit(page,[...new Set(expectedOf(ID).flat())],false);
 await emit(page,struckOf(ID)[1]!,true,0);await at(page,1);
 // the kept notes pressed again do not make it a pass without ... they are all there now: pass
 await emit(page,keep,true,0);await at(page,2);
 // one struck note short (the kept one stays down)
 const last=carriedOf(ID)[2]!;
 await emit(page,[...new Set(expectedOf(ID).flat())].filter(n=>!last.includes(n)),false);
 await emit(page,struckOf(ID)[2]!.slice(1),true,0);await at(page,2);
 await emit(page,struckOf(ID)[2]!.slice(0,1),true,0);await at(page,0);
});

test('the key of the item is chosen from twelve (the original one marked), the card names and notes move with it, and the key stays when the version is switched',async({page})=>{
 await openJazz(page,'004');
 const select=page.getByTestId('jazz-key-select');
 await expect(select.locator('option')).toHaveCount(12);
 await expect(select.locator('option:checked')).toHaveText('D（元のキー）');
 await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText('Asus(11)13');
 await select.selectOption('3');   // E♭
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key','3');
 const main=rowOf('jazz-progressions-004',3),second=rowOf('jazz-progressions-004-a',3);
 await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText(main.cards[0]!.display);
 await expect(page.getByTestId('jazz-chord').nth(1)).toHaveText('B♭13');
 // another version: the key of the item stays, and a chord the two versions share is the same notes
 await page.getByTestId('jazz-version').nth(1).click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-id','jazz-progressions-004-a');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key','3');
 await expect(page.getByTestId('jazz-chord').nth(1)).toHaveText(second.cards[1]!.display);
 expect(second.cards[1]!.expectedPitches).toEqual(main.cards[1]!.expectedPitches);
 await at(page,0);
 // the card is played with the notes of that key
 await playRow(page,second,0);await at(page,1);
 // there is a random key switch, and it is off until it is turned on
 await expect(page.getByTestId('jazz-random')).toHaveAttribute('aria-pressed','false');
 await expect(page.getByTestId('dojo-jazz')).not.toHaveAttribute('data-jazz-random','on');
});

test('009: the second half is in Em under G♯m and in G♯m under Cm, and the screen says the key of the version',async({page})=>{
 await openJazz(page,'009');
 await expect(page.getByTestId('jazz-version-key')).toHaveCount(0);   // the main version is in the key of the item
 await page.getByTestId('jazz-version').nth(2).click();
 await expect(page.getByTestId('jazz-version-key')).toHaveText('この版のキー Em');
 await page.getByTestId('jazz-key-select').selectOption('0');
 await expect(page.getByTestId('jazz-version-key')).toHaveText('この版のキー G♯m');
 const row=rowOf('jazz-progressions-009-b',0);
 await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText(row.cards[0]!.display);
 await expect(page.getByTestId('jazz-chord').nth(1)).toHaveText(row.cards[1]!.display);
});

test('the random key: a lap goes on to the next key at once, in the order of a shuffled round; the keys played through are marked; the laps are counted by the key played',async({page})=>{
 test.setTimeout(120000);
 await openList(page);
 await expect(page.locator('[data-jazz-item=jazz-progressions-001]').getByTestId('jazz-open-random')).toHaveText('ランダムキーで練習');
 await page.locator('[data-jazz-item=jazz-progressions-001]').getByTestId('jazz-open-random').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-random','on');
 await expect(page.getByTestId('jazz-random')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('jazz-round')).toContainText('1巡目 1/12');
 const played:number[]=[];
 for(let lap=0;lap<3;lap+=1){
  const key=await itemKeyOf(page);played.push(key);
  const row=rowOf(ID,key);
  await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText(row.cards[0]!.display);
  for(let i=0;i<3;i+=1){await playRow(page,row,i);if(i<2)await at(page,i+1);}
  // at once: the next key, from the first card
  await expect.poll(async()=>itemKeyOf(page)).not.toBe(key);
  await at(page,0);
  await expect(page.getByTestId('jazz-lap')).toContainText('→ 次は');
  await expect(page.getByTestId('jazz-round')).toContainText(`1巡目 ${lap+2}/12`);
 }
 played.push(await itemKeyOf(page));
 expect(new Set(played).size).toBe(4);                    // no key twice in the round
 // the keys played through are marked, with their counts
 const chips=page.getByTestId('jazz-key-chip');
 await expect(chips).toHaveCount(12);
 for(const k of played.slice(0,3))await expect(chips.nth(k)).toHaveAttribute('data-done','true');
 await expect(chips.nth(played[3]!)).toHaveAttribute('data-current','true');
 // the record: one lap in each key played, by the tonic of the key
 const laps=(await record(page)).laps[ID]!;
 for(const k of played.slice(0,3))expect(laps[String(rowOf(ID,k).tonic)]?.count).toBe(1);
 expect(Object.keys(laps).length).toBe(3);
 // turning the random key off: a lap does not change the key
 await page.getByTestId('jazz-random').click();
 await expect(page.getByTestId('jazz-random')).toHaveAttribute('aria-pressed','false');
 const stay=await itemKeyOf(page),row=rowOf(ID,stay);
 for(let i=0;i<3;i+=1)await playRow(page,row,i);
 await at(page,0);
 expect(await itemKeyOf(page)).toBe(stay);
 await expect(page.getByTestId('jazz-lap')).toContainText('完奏！');
 await expect(page.getByTestId('jazz-lap')).not.toContainText('次は');
});

test('the key chosen by hand with the random key on starts the round from that key',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 await page.getByTestId('jazz-random').click();
 await page.getByTestId('jazz-key-select').selectOption('9');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key','9');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-random','on');
 const row=rowOf(ID,9);
 for(let i=0;i<3;i+=1)await playRow(page,row,i);
 await expect.poll(async()=>itemKeyOf(page)).not.toBe(9);
 await expect.poll(async()=>(await record(page)).laps[ID]?.[String(row.tonic)]?.count).toBe(1);
});

test('a lap in the original key is counted under the original tonic, and the Original Practice record is not touched',async({page})=>{
 await openJazz(page);
 const row=rowOf(ID,3);
 for(let i=0;i<3;i+=1)await playRow(page,row,i);
 await expect.poll(async()=>(await record(page)).laps[ID]?.['3']?.count).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('loop-vault:original-practice-v1:data'))).toBeNull();
});

test('the notes are written as the data writes them, with the finger of each; 009 has 𝄪, 010 has C♭',async({page})=>{
 await openJazz(page,'001');
 await expect(page.getByTestId('jazz-notes').nth(0)).toHaveText('左 F2(5) E♭3(1)右 A♭3(1) C4(2) G4(5)');
 await expect(page.getByTestId('jazz-chord').nth(2)).toHaveText('E♭6/9');
 // the keyboard and the staff carry the fingers of the data
 await expect(page.locator('.dojo-keyboard')).toContainText('左5');
 await expect(page.locator('.dojo-keyboard')).toContainText('右5');
 await page.getByTestId('dojo-back').click();
 await page.locator('[data-jazz-item=jazz-progressions-009]').getByTestId('jazz-open').click();
 await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText('D♯7(♯9)');
 await expect(page.getByTestId('jazz-notes').nth(0)).toContainText('F𝄪3(1)');
 await expect(page.getByTestId('jazz-notes').nth(0)).toContainText('E𝄪4(5)');
 // the second half reads its degrees in Em
 await expect(page.getByTestId('jazz-degree').nth(1)).toHaveText('♭Ⅵmaj9');
 await expect(page.getByTestId('jazz-degree').nth(2)).toHaveText('♭Ⅲmaj7 · Em');
 await expect(page.getByTestId('jazz-degree').nth(3)).toHaveText('♭Ⅵmaj9 · Em');
 // the staff writes the data's spelling: two double sharps drawn
 await expect(page.locator('.dojo-score-dsharp')).toHaveCount(2);
 await page.getByTestId('dojo-back').click();
 await page.locator('[data-jazz-item=jazz-progressions-010]').getByTestId('jazz-open').click();
 await expect(page.getByTestId('jazz-notes').nth(1)).toContainText('C♭4(1)');
 await page.getByTestId('dojo-back').click();
 await page.locator('[data-jazz-item=jazz-progressions-011]').getByTestId('jazz-open').click();
 await expect(page.getByTestId('jazz-chord').nth(1)).toHaveText('Dm6/9');
});

test('what the progression teaches and the note about the voicings are on the screen; a version can be switched to from the first card',async({page})=>{
 await openJazz(page,'004');
 await expect(page.getByTestId('jazz-version')).toHaveCount(2);
 await expect(page.getByTestId('dojo-score')).toContainText('この進行で学ぶこと:');
 await expect(page.getByTestId('dojo-score')).toContainText('左手の A と G、右手の E と F♯ は押さえたまま');
 await expect(page.getByTestId('jazz-note')).toHaveText('推奨ボイシング(元の演奏の書き起こしではない)');
 await playCard(page,'jazz-progressions-004',0);await at(page,1);
 await page.getByTestId('jazz-version').nth(1).click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-id','jazz-progressions-004-a');
 await at(page,0);
 await expect(page.getByTestId('jazz-chord').nth(0)).toHaveText('Em9');
 await expect(page.getByTestId('dojo-score')).toContainText('同じ A13 に ii(Em9)から入る');
 await expect(page.getByTestId('jazz-version').nth(1)).toHaveAttribute('aria-pressed','true');
});

test('listening to the whole progression: a seek bar follows the sound, the sounding card has a ring and the staff and keyboard show it; stopping clears it',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 const button=page.getByTestId('jazz-listen-all'),seek=page.getByTestId('jazz-seek'),sounding=page.locator('[data-testid=jazz-card][data-listening=true]');
 await expect(button).toHaveText('通して聴く');
 await expect(seek).toBeHidden();await expect(sounding).toHaveCount(0);
 await button.click();
 await expect(button).toHaveText('止める');
 await expect(seek).toBeVisible();
 // the ring is on the first card, then moves on to the second (the card lines are 4 beats = 3.3 s apart at 72)
 await expect(sounding).toHaveCount(1);
 await expect(page.getByTestId('jazz-card').nth(0)).toHaveAttribute('data-listening','true');
 await expect(page.getByTestId('dojo-score')).toContainText('Fm9 を聴いています');
 const first=Number(await seek.getAttribute('aria-valuenow'));
 await expect(page.getByTestId('jazz-card').nth(1)).toHaveAttribute('data-listening','true',{timeout:8000});
 const second=Number(await seek.getAttribute('aria-valuenow'));
 expect(second).toBeGreaterThan(first);expect(second).toBeGreaterThanOrEqual(30);expect(second).toBeLessThanOrEqual(70);
 await expect(page.getByTestId('dojo-score')).toContainText('B♭13 を聴いています');
 // the practice card keeps its own mark: the first card is still the one to play
 await expect(page.getByTestId('jazz-card').nth(0)).toHaveAttribute('data-state','current');
 await button.click();
 await expect(button).toHaveText('通して聴く');
 await expect(seek).toBeHidden();await expect(sounding).toHaveCount(0);
 await expect(page.getByTestId('dojo-score')).not.toContainText('を聴いています');
});

test('the seek bar goes to the end and the ring goes out with the last card; playing one card instead ends the listening',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 await page.getByTestId('jazz-listen-all').click();
 await expect(page.getByTestId('jazz-seek')).toBeVisible();
 await page.getByTestId('jazz-card').nth(2).click();   // another playback replaces it
 await expect(page.getByTestId('jazz-listen-all')).toHaveText('通して聴く');
 await expect(page.getByTestId('jazz-seek')).toBeHidden();
 await expect(page.locator('[data-testid=jazz-card][data-listening=true]')).toHaveCount(0);
});

test('the keyboard marks the left hand orange and the right hand light blue, with the hand written on the mark, and says so in its legend',async({page})=>{
 await openJazz(page);
 const e=events(ID)[0]!;
 const pitch=(n:string)=>e.expectedPitches[e.expectedNames.indexOf(n)]!;
 const left=(e as unknown as {leftHand:string[]}).leftHand.map(pitch),right=(e as unknown as {rightHand:string[]}).rightHand.map(pitch);
 for(const n of left){const key=page.locator(`.dojo-keyboard [data-midi-note="${n}"]`);await expect(key.locator('[data-answer-marker]')).toHaveAttribute('fill','#f59e0b');await expect(key.locator('[data-finger-label]')).toContainText('左');}
 for(const n of right){const key=page.locator(`.dojo-keyboard [data-midi-note="${n}"]`);await expect(key.locator('[data-answer-marker]')).toHaveAttribute('fill','#22d3ee');await expect(key.locator('[data-finger-label]')).toContainText('右');}
 await expect(page.locator('.dojo-keyboard-head')).toContainText('左手');
 await expect(page.locator('.dojo-keyboard-head')).toContainText('右手');
});

test('Escape and the back button go back to the Jazz card in the list',async({page})=>{
 await openJazz(page,'005');
 await page.keyboard.press('Escape');
 await expect(page.locator('.dojo-jazz-card')).toHaveCount(12);
 await expect(page.locator('[data-jazz-item=jazz-progressions-005] [data-testid=jazz-open]')).toBeFocused();
});

test('the ear practice has no Jazz Progressions',async({page})=>{
 await openDojo(page,'midi');
 await page.getByTestId('ear-open').click();
 await expect(page.getByTestId('ear-start')).toBeVisible();
 await expect(page.locator('body')).not.toContainText('Jazz Progressions');
 await expect(page.locator('body')).not.toContainText('6/9 への解決');
});

const SIZES=[[1280,720],[1366,768],[1440,900],[1660,1035],[1920,1080],[768,640]] as const;
for(const [w,h] of SIZES){
 test(`the cards, what is taught, the seek bar, the staff and the keyboard fit at ${w}x${h}`,async({page})=>{
  await page.setViewportSize({width:w,height:h});
  for(const item of ['002','009','001']){
   await openJazz(page,item);
   const m=await page.evaluate(()=>{
    const r=(s:string)=>{const e=document.querySelector(s)!.getBoundingClientRect();return {top:e.top,bottom:e.bottom,left:e.left,right:e.right,width:e.width,height:e.height};};
    const c=document.querySelector('.dojo-endless-center') as HTMLElement;
    const bar=[...document.querySelectorAll('.dojo-jazz-bar>*')].map(e=>e.getBoundingClientRect());
    const overlap=bar.some((a,i)=>bar.some((b,j)=>j>i&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));
    const focus=document.querySelector('[data-testid=jazz-focus]');
    return {overflowX:document.documentElement.scrollWidth-innerWidth,centerScroll:c.scrollHeight-c.clientHeight,center:r('.dojo-endless-center'),cards:r('.dojo-jazz-cards'),card:r('[data-testid=jazz-card]'),seek:r('[data-testid=jazz-seek]'),hint:r('[data-testid=jazz-hint]'),
     score:r('[data-testid=dojo-score]'),keyboard:r('.dojo-keyboard'),head:r('.dojo-endless-head'),layout:document.querySelector('.dojo-practice')!.getAttribute('data-practice-layout'),
     focus:focus?{...(()=>{const b=focus.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};})(),text:focus.textContent}:null,
     buttonsWrap:[...document.querySelectorAll('.dojo-endless-head>button')].some(b=>b.getBoundingClientRect().height>40),overlap,
     fingerFont:Math.min(...[...document.querySelectorAll('.dojo-keyboard [data-finger-label]')].map(e=>e.getBoundingClientRect().height)),
     blackBottom:Math.max(...[...document.querySelectorAll('.dojo-keyboard g[data-key-kind=black] rect')].map(e=>e.getBoundingClientRect().bottom)),
     barRows:new Set([...document.querySelectorAll('.dojo-jazz-bar>*')].map(e=>Math.round(e.getBoundingClientRect().top/6))).size,
     column:(()=>{const rects=['.dojo-jazz-bar','.dojo-jazz-cards','[data-testid=jazz-seek]','[data-testid=jazz-hint]'].map(s=>document.querySelector(s)!.getBoundingClientRect());return rects.every((r,i)=>i===0||r.top>=rects[i-1]!.bottom-1);})(),
     bpm:(()=>{const e=document.querySelector('[data-testid=jazz-bpm-input]');if(!e)return null;const b=e.getBoundingClientRect(),c=document.querySelector('.dojo-endless-center')!.getBoundingClientRect();return {inside:b.left>=c.left&&b.right<=c.right+1&&b.top>=c.top&&b.bottom<=c.bottom+1,value:(e as HTMLInputElement).value};})(),
     whiteLabelGap:Math.min(...[...document.querySelectorAll('.dojo-keyboard g[data-key-kind=white]')].filter(g=>g.querySelector('[data-finger-label]')).map(g=>g.querySelector('circle')!.getBoundingClientRect().top-g.querySelector('[data-finger-label]')!.getBoundingClientRect().bottom)),
     whiteLabelTop:Math.min(...[...document.querySelectorAll('.dojo-keyboard g[data-key-kind=white] [data-finger-label]')].map(e=>e.getBoundingClientRect().top))};
   });
   const stacked=w===768;
   expect(m.overflowX,item).toBe(0);
   // everything the player needs is visible without scrolling the centre: the cards, the seek bar, the hint
   expect(m.centerScroll,`${item} centre scroll`).toBe(0);
   expect(m.cards.bottom,item).toBeLessThanOrEqual(m.center.bottom+1);
   expect(m.seek.bottom,item).toBeLessThanOrEqual(m.center.bottom+1);
   expect(m.hint.bottom,item).toBeLessThanOrEqual(m.center.bottom+1);
   expect(m.score.bottom,item).toBeLessThanOrEqual(m.keyboard.top+1);
   if(!stacked)expect(m.keyboard.bottom,item).toBeLessThanOrEqual(h+1); // narrower: the screen is stacked and the page scrolls
   expect(m.buttonsWrap,'header buttons stay on one line').toBe(false);
   expect(m.overlap,'the buttons of the bar do not overlap').toBe(false);
   // the finger marks on the keyboard can be read (their height, in pixels)
   expect(m.fingerFont,`${item} finger marks`).toBeGreaterThanOrEqual(9);
   // the tempo of the listening is in the row of the controls, whole and at the tempo of the progression
   expect(m.bpm,`${item} BPM field`).toEqual({inside:true,value:'72'});
   // and clear of the mark under it
   expect(m.whiteLabelGap,`${item} white-key marks apart from the circle`).toBeGreaterThanOrEqual(0.5);
   // the label of a white key stands under the black keys, which would cut it
   expect(m.whiteLabelTop,`${item} white-key marks under the black keys`).toBeGreaterThanOrEqual(m.blackBottom-4); // the box of the text has a little room above the glyph
   if(m.layout==='compact'){
    // what is taught is in the caption of the staff, all of it
    const caption=await page.locator('.dojo-score-caption b').evaluate(e=>({client:e.scrollHeight,box:e.getBoundingClientRect().height}));
    expect(caption.client).toBeLessThanOrEqual(caption.box+1);
   }else{
    // what is taught is next to the cards, in text of a size that can be read; the long ones are two lines and open with 続き (stacked) or all there when it fits
    expect(m.focus,item).not.toBeNull();
    expect(m.focus!.text).toContain('この進行で学ぶこと');
    expect(m.focus!.bottom,item).toBeLessThanOrEqual(m.center.bottom+1);
    expect(await page.getByTestId('jazz-focus').locator('p').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(13);
   }
   // a screen of the size it has: the layout the size calls for
   expect(m.layout,`${w}x${h}`).toBe(w>=1100&&h>=860&&!stacked?'stacked':'compact');
   // one column from the top (the row of controls, the cards, the seek bar, the hint, what is taught); on a big screen the row of controls is one line
   if(m.layout==='stacked'){
    expect(m.column,`${item} one column`).toBe(true);
    if(w>=1500)expect(m.barRows,`${item} the row of controls is one line`).toBe(1);
   }
   await page.getByTestId('dojo-back').click();
  }
 });
}

test('a larger screen grows the cards and their text, and the group does not leave great spaces above and below',async({page})=>{
 const measure=async(w:number,h:number)=>{
  await page.setViewportSize({width:w,height:h});
  await openJazz(page,'001');
  return page.evaluate(()=>{
   const c=document.querySelector('.dojo-endless-center')!.getBoundingClientRect(),first=document.querySelector('[data-testid=jazz-bar],.dojo-jazz-bar')!.getBoundingClientRect(),notes=document.querySelector('[data-testid=jazz-notes]')!;
   const focusEnd=document.querySelector('[data-testid=jazz-focus]')?.getBoundingClientRect().bottom??0,last=document.querySelector('[data-testid=jazz-hint]')!.getBoundingClientRect(),cards=document.querySelector('.dojo-jazz-cards')!.getBoundingClientRect(),card=document.querySelector('[data-testid=jazz-card]')!.getBoundingClientRect();
   return {cardWidth:card.width,notesFont:parseFloat(getComputedStyle(notes).fontSize),chordFont:parseFloat(getComputedStyle(document.querySelector('[data-testid=jazz-chord]')!).fontSize),titleFont:parseFloat(getComputedStyle(document.querySelector('.dojo-endless-name b')!).fontSize),
    above:Math.min(first.top,cards.top)-c.top,below:c.bottom-Math.max(last.bottom,cards.bottom,focusEnd)};
  });
 };
 const small=await measure(1280,720),big=await measure(1920,1080),medium=await measure(1440,900),large=await measure(1660,1035);
 expect(big.cardWidth).toBeGreaterThan(small.cardWidth);expect(large.cardWidth).toBeGreaterThan(small.cardWidth);expect(medium.cardWidth).toBeGreaterThan(small.cardWidth);
 expect(big.notesFont).toBeGreaterThan(small.notesFont);expect(big.chordFont).toBeGreaterThan(small.chordFont);expect(big.titleFont).toBeGreaterThan(small.titleFont);
 // the space above and below the group stays under 120 px on every size that grows (before: 173 px each at 1660x1035)
 for(const grown of [medium,large,big]){expect(grown.above).toBeLessThan(120);expect(grown.below).toBeLessThan(120);}
});

test('the staff: no two notes of a card overlap (001: A♭3 and C4), the marks of the fingers stand in the order of the notes with short level lines that cannot cross, and no mark covers another',async({page})=>{
 for(const [w,h] of [[1280,720],[1660,1035]] as const){
  await page.setViewportSize({width:w,height:h});
  for(const item of ['001','009','002','010']){
   await openJazz(page,item);
   const cards=await page.getByTestId('jazz-card').count();
   for(let c=0;c<cards;c+=1){
    // the card that is sounding (clicked) is the one on the staff
    await page.getByTestId('jazz-card').nth(c).click();await page.waitForTimeout(150);
    const g=await page.evaluate(()=>{
     const notes=[...document.querySelectorAll('.dojo-score-note')].map(e=>({hand:e.querySelector('title')!.textContent!.includes('左手')?'left':'right',head:e.querySelector('ellipse')!.getBoundingClientRect(),mark:e.querySelector('.dojo-score-finger')!.getBoundingClientRect(),line:e.querySelector('.dojo-score-leader')!.getBoundingClientRect()}));
     return notes.map(n=>({hand:n.hand,head:[n.head.left,n.head.top,n.head.right,n.head.bottom],mark:[n.mark.left,n.mark.top,n.mark.right,n.mark.bottom],lineLength:n.line.width,lineHeight:n.line.height}));
    });
    // heads of a third on one staff touch, and those of a second stand side by side (as in any score); a real overlap covers most of the width and well over a third of the height
    const headsOverlap=(a:number[],b:number[])=>Math.min(a[2]!,b[2]!)-Math.max(a[0]!,b[0]!)>0.5*(a[2]!-a[0]!)&&Math.min(a[3]!,b[3]!)-Math.max(a[1]!,b[1]!)>0.35*(a[3]!-a[1]!);
    const inter=(a:number[],b:number[])=>Math.min(a[2]!,b[2]!)-Math.max(a[0]!,b[0]!)>1.5&&Math.min(a[3]!,b[3]!)-Math.max(a[1]!,b[1]!)>1.5;
    g.forEach((a,i)=>g.forEach((b,j)=>{if(j>i){expect(headsOverlap(a.head,b.head),`${item} card ${c+1}: notes ${i} and ${j} overlap`).toBe(false);expect(inter(a.mark,b.mark),`${item} card ${c+1}: marks ${i} and ${j} overlap`).toBe(false);}}));
    for(const hand of ['left','right']){
     const own=g.filter(n=>n.hand===hand).sort((a,b)=>a.head[1]!-b.head[1]!);
     // the marks stand in the order of the notes (the line from a note to its mark cannot cross the line of another)
     own.slice(1).forEach((n,k)=>expect(n.mark[1]!,`${item} card ${c+1} ${hand}`).toBeGreaterThan(own[k]!.mark[1]!));
    }
    // right-hand lines are short and level
    for(const n of g.filter(n=>n.hand==='right'))expect(n.lineLength,`${item} card ${c+1}`).toBeLessThan(w>=1500?90:75);
   }
  }
 }
});

test('the names of the notes on a card are not broken in the middle: a line breaks only between notes',async({page})=>{
 for(const [w,h] of [[1660,1035],[1280,720],[1920,1080]] as const){
  await page.setViewportSize({width:w,height:h});
  for(const item of ['009','002','007']){
   await openJazz(page,item);
   const broken=await page.evaluate(()=>[...document.querySelectorAll('.dojo-jazz-note-name')].filter(e=>e.getBoundingClientRect().height>parseFloat(getComputedStyle(e).fontSize)*2).map(e=>e.textContent));
   expect(broken,`${item} ${w}x${h}`).toEqual([]);
   await page.getByTestId('dojo-back').click();
  }
 }
});

test('続き is shown only when the two lines do not hold what is taught',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 // at this size every progression is seen whole in two lines: no button
 for(const item of ['001','009','002']){
  await openJazz(page,item);
  await expect(page.getByTestId('jazz-focus')).toBeVisible();
  expect(await page.locator('.dojo-jazz-focus-more').count(),`${item}: no 続き when all of it is seen`).toBe(0);
  await page.getByTestId('dojo-back').click();
 }
 // a narrower column cuts the text: the button appears, opens all of it, and closes it again
 await openJazz(page,'009');
 await page.addStyleTag({content:'.dojo-jazz-focus{max-width:320px !important;}'});
 await expect(page.locator('.dojo-jazz-focus-more')).toHaveText('続き');
 await page.locator('.dojo-jazz-focus-more').click();
 await expect(page.locator('.dojo-jazz-focus-more')).toHaveText('閉じる');
 expect(await page.getByTestId('jazz-focus').locator('p').evaluate(p=>p.scrollHeight<=p.clientHeight+1)).toBe(true);
 await page.locator('.dojo-jazz-focus-more').click();
 await expect(page.locator('.dojo-jazz-focus-more')).toHaveText('続き');
});

test('the tempo of the listening: a BPM field next to 通して聴く, the first value is that of the progression, it stays on the next progression, the seek bar and the ring go at that speed, and changing it while listening stops',async({page})=>{
 test.setTimeout(90000);
 await openJazz(page,'001');
 const field=page.getByTestId('jazz-bpm-input'),button=page.getByTestId('jazz-listen-all'),seek=page.getByTestId('jazz-seek');
 await expect(field).toBeVisible();await expect(field).toHaveValue('72');
 // in the row of the settings; 通して聴く is in the row of the buttons under the cards (P18-01: the same place on every practice screen)
 const box=async(id:string)=>(await page.getByTestId(id).boundingBox())!;
 const f=await box('jazz-bpm-field'),l=await box('jazz-listen-all');
 expect(l.y).toBeGreaterThan(f.y);
 await field.fill('240');await field.press('Enter');
 await expect(field).toHaveValue('240');
 // the next progression opens at the tempo that was chosen
 const openInApp=async(item:string)=>{await page.getByTestId('dojo-back').click();await page.locator(`[data-jazz-item=jazz-progressions-${item}]`).getByTestId('jazz-open').click();await expect(page.getByTestId('dojo-jazz')).toBeVisible();};
 await openInApp('002');
 await expect(page.getByTestId('jazz-bpm-input')).toHaveValue('240');
 await openInApp('001');
 await expect(page.getByTestId('jazz-bpm-input')).toHaveValue('240');
 // at 240 a card (4 beats) is 1 s: the ring is on the second card in under two seconds (at 72 it takes 3.3 s)
 await button.click();
 await expect(page.getByTestId('jazz-card').nth(0)).toHaveAttribute('data-listening','true');
 const began=Date.now();
 await expect(page.getByTestId('jazz-card').nth(1)).toHaveAttribute('data-listening','true',{timeout:8000});
 expect(Date.now()-began).toBeLessThan(2400);
 // the seek bar runs over the whole in about 3 s (3 cards, 4 beats each, at 240)
 await expect.poll(async()=>Number(await seek.getAttribute('aria-valuenow')),{timeout:6000}).toBeGreaterThanOrEqual(60);
 // changing the tempo while it sounds stops it
 await button.click();
 await expect(button).toHaveText('通して聴く');
 await button.click();
 await expect(button).toHaveText('止める');
 await field.fill('120');await field.press('Enter');
 await expect(button).toHaveText('通して聴く');
 await expect(seek).toBeHidden();
 await expect(field).toHaveValue('120');
 // the card played alone and the practice do not depend on it: a card sounds and the judging works as before
 await page.getByTestId('jazz-card').nth(0).click();
 await expect(page.getByTestId('jazz-card').nth(0)).toHaveAttribute('data-playing','true');
});

test('after a card is played, the heading of the staff goes back from 〜を聴いています',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page,'001');
 const score=page.getByTestId('dojo-score');
 await page.getByTestId('jazz-card').nth(1).click();
 await expect(score).toContainText('B♭13 を聴いています');
 await expect(score).not.toContainText('を聴いています',{timeout:15000});
 await expect(page.getByTestId('jazz-card').nth(1)).not.toHaveAttribute('data-playing','true');
});
/** The staff as it is drawn now: its size, the place of its lines (from the top of the drawing), and how many of its marks are outside what is shown. */
const staffSample=()=>{
 const svg=document.querySelector('.dojo-grand-staff')!,box=svg.getBoundingClientRect(),scroll=document.querySelector('.dojo-score-scroll')!.getBoundingClientRect();
 const lines=[...document.querySelectorAll('.dojo-score-staff line')].map(l=>Math.round((l.getBoundingClientRect().top-box.top)*10)/10);
 const out=(r:DOMRect)=>r.top<scroll.top-1||r.bottom>scroll.bottom+1||r.left<scroll.left-1||r.right>scroll.right+1;
 const cut=[...document.querySelectorAll('.dojo-score-note ellipse, .dojo-score-note .dojo-score-finger, .dojo-score-note .dojo-score-ledger, .dojo-score-note .dojo-score-accidental')].filter(e=>out(e.getBoundingClientRect())).length;
 return {viewBox:svg.getAttribute('viewBox'),size:[Math.round(box.width*10)/10,Math.round(box.height*10)/10],lines,cut};
};

test('the staff keeps its size and place from card to card, from key to key and from version to version, and nothing of it is cut (001, 009)',async({page})=>{
 test.setTimeout(240000);
 for(const [w,h] of [[1280,720],[1660,1035]] as const){
  await page.setViewportSize({width:w,height:h});
  for(const item of ['001','009']){
   await openJazz(page,item);
   const versions=await page.getByTestId('jazz-version').count();
   const first:{viewBox:string|null;size:number[];lines:number[]}[]=[];
   for(let v=0;v<Math.max(1,versions);v+=1){
    if(versions)await page.getByTestId('jazz-version').nth(v).click();
    for(let t=0;t<12;t+=1){
     await page.getByTestId('jazz-key-select').selectOption(String(t));
     const cards=await page.getByTestId('jazz-card').count();
     for(let c=0;c<cards;c+=1){
      await page.getByTestId('jazz-card').nth(c).click();await page.waitForTimeout(60);
      const s=await page.evaluate(staffSample);
      const where=`${item} ${w}x${h} version ${v} key ${t} card ${c+1}`;
      expect(s.cut,`${where}: a note, a finger mark or a ledger line is cut`).toBe(0);
      if(first.length===0)first.push(s);else{expect(s.viewBox,where).toBe(first[0]!.viewBox);expect(s.size,where).toEqual(first[0]!.size);expect(s.lines,where).toEqual(first[0]!.lines);}
     }
    }
   }
  }
 }
});

// ---- one octave up (+1) ----
const STAFF_MIDI=(page:Page)=>page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))).sort((a,b)=>a-b));
const KEY_MIDI=(page:Page)=>page.locator('.dojo-keyboard [data-midi-note]:has([data-answer-marker])').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-midi-note'))).sort((a,b)=>a-b));
const up12=(notes:readonly number[])=>notes.map(n=>n+12);
const sortedExpected=(row:Row,card=0)=>row.cards[card]!.expectedPitches.slice().sort((a,b)=>a-b);
/** Plays card i of a row one octave higher, as a pianist would. */
async function playRowUp(page:Page,row:Row,i:number){
 const all=[...new Set(row.cards.flatMap(c=>c.expectedPitches))].map(n=>n+12),keep=up12(row.cards[i]!.carried);
 await emit(page,all.filter(n=>!keep.includes(n)),false);
 await emit(page,up12(row.cards[i]!.struck),true,40);
}
const octaveUp=async(page:Page)=>{await page.getByTestId('jazz-octave-1').click();await expect(page.getByTestId('jazz-octave-1')).toHaveAttribute('aria-pressed','true');};

test('octave +1: the notes, the keyboard and the staff are one octave up with the same names and fingers, and it stays on the next progression',async({page})=>{
 await openJazz(page,'001');
 await expect(page.getByTestId('jazz-octave')).toBeVisible();
 await expect(page.getByTestId('jazz-octave-0')).toHaveAttribute('aria-pressed','true');
 const before={staff:await STAFF_MIDI(page),keys:await KEY_MIDI(page),text:await page.getByTestId('jazz-notes').allTextContents(),chords:await page.getByTestId('jazz-chord').allTextContents()};
 expect(before.staff).toEqual(sortedExpected(rowOf(ID,3)));
 await octaveUp(page);
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-octave','1');
 expect(await STAFF_MIDI(page)).toEqual(up12(before.staff));
 expect(await KEY_MIDI(page)).toEqual(up12(before.keys));
 const raisedText=before.text.map(s=>s.replace(/(\d)\(/g,(_,d)=>`${Number(d)+1}(`));
 expect(await page.getByTestId('jazz-notes').allTextContents()).toEqual(raisedText);   // only the octave numbers moved: the spelling and the fingers are the same
 expect(await page.getByTestId('jazz-chord').allTextContents()).toEqual(before.chords);
 await expect(page.locator('.dojo-keyboard')).toContainText('左5');
 // another key keeps it
 await page.getByTestId('jazz-key-select').selectOption('7');
 await expect(page.getByTestId('jazz-octave-1')).toHaveAttribute('aria-pressed','true');
 expect(await STAFF_MIDI(page)).toEqual(up12(sortedExpected(rowOf(ID,7))));
 // kept while the app is open, on the next progression (the keys of that progression, one octave up)
 await page.getByTestId('dojo-back').click();
 await page.locator('[data-jazz-item=jazz-progressions-002]').getByTestId('jazz-open').click();
 await expect(page.getByTestId('jazz-octave-1')).toHaveAttribute('aria-pressed','true');
 const key=await itemKeyOf(page);
 expect(await STAFF_MIDI(page)).toEqual(up12(sortedExpected(rowOf('jazz-progressions-002',key))));
 await page.getByTestId('jazz-octave-0').click();
 await expect(page.getByTestId('jazz-octave-0')).toHaveAttribute('aria-pressed','true');
 expect(await STAFF_MIDI(page)).toEqual(sortedExpected(rowOf('jazz-progressions-002',key)));
});

test('octave +1: a lap played one octave up is counted (not by octave), and the random key goes on at +1',async({page})=>{
 test.setTimeout(90000);
 await openJazz(page,'001');
 await octaveUp(page);
 for(let i=0;i<3;i+=1)await playRowUp(page,rowOf(ID,3),i);
 await expect.poll(async()=>(await record(page)).laps[ID]?.['3']?.count).toBe(1);
 await expect(page.getByTestId('jazz-lap')).toContainText('完奏');
 // the random key: the next key at once, still at +1, and its notes are the notes of that key + 12
 await page.getByTestId('jazz-random').click();
 const key=await itemKeyOf(page);
 for(let i=0;i<3;i+=1)await playRowUp(page,rowOf(ID,key),i);
 await expect.poll(()=>itemKeyOf(page)).not.toBe(key);
 const next=await itemKeyOf(page);
 await expect(page.getByTestId('jazz-octave-1')).toHaveAttribute('aria-pressed','true');
 expect(await STAFF_MIDI(page)).toEqual(up12(sortedExpected(rowOf(ID,next))));
 await expect.poll(async()=>(await record(page)).laps[ID]?.[String(rowOf(ID,key).tonic)]?.count).toBe(2);   // counted under the key (the first lap was in the same key, at +1 too), with no octave in it
});

test('octave +1: the notes of the standard octave do not pass at +1',async({page})=>{
 await openJazz(page,'001');
 await octaveUp(page);
 await playRow(page,rowOf(ID,3),0);                 // card 1 as written: an octave too low
 await at(page,0);
 await emit(page,[...new Set(rowOf(ID,3).cards.flatMap(c=>c.expectedPitches))],false);
 await playRowUp(page,rowOf(ID,3),0);               // card 1 one octave up: passes
 await at(page,1);
});

test('octave +1: the listening sounds the raised notes',async({page})=>{
 await openJazz(page,'001');
 const sent=()=>page.evaluate(()=>(window as typeof window&{__lvJazzListen?:{pitches:number[];bpm:number}}).__lvJazzListen);
 const standard=[...new Set(rowOf(ID,3).cards.flatMap(c=>c.expectedPitches))].sort((a,b)=>a-b);
 await page.getByTestId('jazz-listen-all').click();
 await expect.poll(sent).toMatchObject({pitches:standard,bpm:72});
 await page.getByTestId('jazz-listen-all').click();
 await octaveUp(page);
 await page.getByTestId('jazz-listen-all').click();
 await expect.poll(sent).toMatchObject({pitches:up12(standard),bpm:72});
 await page.getByTestId('jazz-listen-all').click();
});

test('octave +1: the staff keeps its size and place from card to card, key to key and version to version, and nothing is cut',async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width:1280,height:720});
 await openJazz(page,'009');
 await octaveUp(page);
 const first:{viewBox:string|null;size:number[];lines:number[]}[]=[];
 const versions=await page.getByTestId('jazz-version').count();
 for(let v=0;v<versions;v+=1){
  await page.getByTestId('jazz-version').nth(v).click();
  for(let t=0;t<12;t+=1){
   await page.getByTestId('jazz-key-select').selectOption(String(t));
   const cards=await page.getByTestId('jazz-card').count();
   for(let c=0;c<cards;c+=1){
    await page.getByTestId('jazz-card').nth(c).click();await page.waitForTimeout(60);
    const s=await page.evaluate(staffSample),where=`+1 version ${v} key ${t} card ${c+1}`;
    expect(s.cut,`${where}: cut`).toBe(0);
    if(first.length===0)first.push(s);else{expect(s.viewBox,where).toBe(first[0]!.viewBox);expect(s.size,where).toEqual(first[0]!.size);expect(s.lines,where).toEqual(first[0]!.lines);}
   }
  }
 }
});

for(const [w,h] of SIZES){
 test(`octave +1 fits at ${w}x${h}: the switch is in the row, nothing overlaps, the cards, the hint and the keyboard are seen`,async({page})=>{
  await page.setViewportSize({width:w,height:h});
  for(const item of ['002','009','001']){
   await openJazz(page,item);
   await octaveUp(page);
   const m=await page.evaluate(()=>{
    const c=document.querySelector('.dojo-endless-center') as HTMLElement,cr=c.getBoundingClientRect();
    const bar=[...document.querySelectorAll('.dojo-jazz-bar>*')].map(e=>e.getBoundingClientRect());
    const overlap=bar.some((a,i)=>bar.some((b,j)=>j>i&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));
    const o=document.querySelector('[data-testid=jazz-octave]')!.getBoundingClientRect(),kb=document.querySelector('.dojo-keyboard')!.getBoundingClientRect(),sc=document.querySelector('[data-testid=dojo-score]')!.getBoundingClientRect();
    const hint=document.querySelector('[data-testid=jazz-hint]')!.getBoundingClientRect();
    return {overflowX:document.documentElement.scrollWidth-innerWidth,centerScroll:c.scrollHeight-c.clientHeight,overlap,
     barRows:new Set([...document.querySelectorAll('.dojo-jazz-bar>*')].map(e=>Math.round(e.getBoundingClientRect().top/6))).size,
     octaveInside:o.left>=cr.left&&o.right<=cr.right+1&&o.top>=cr.top&&o.bottom<=cr.bottom+1,hintInside:hint.bottom<=cr.bottom+1,staffAboveKeys:sc.bottom<=kb.top+1,
     keysInside:kb.bottom<=innerHeight+1,fingerFont:Math.min(...[...document.querySelectorAll('.dojo-keyboard [data-finger-label]')].map(e=>e.getBoundingClientRect().height))};
   });
   expect(m.overflowX,item).toBe(0);expect(m.centerScroll,`${item} centre`).toBe(0);expect(m.overlap,`${item} buttons overlap`).toBe(false);
   if(w>=1500)expect(m.barRows,`${item} +1: the row of controls is one line`).toBe(1);
   expect(m.octaveInside,`${item} switch`).toBe(true);expect(m.hintInside,item).toBe(true);expect(m.staffAboveKeys,item).toBe(true);
   if(w!==768)expect(m.keysInside,item).toBe(true);
   expect(m.fingerFont,`${item} finger marks`).toBeGreaterThanOrEqual(9);
   await page.getByTestId('dojo-back').click();
  }
 });
}
