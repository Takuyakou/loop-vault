import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * P12.5-02: Original Practice. The answer is the real voicing from the player's MIDI; notes outside it are ignored;
 * a card needs every struck note pressed again; a lap is 完奏 and is not a clear.
 */
const KEY='loop-vault:original-practice-v1:data';
const DOJO_KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
interface Event {label:string;expectedPitches:number[];struck:{pitch:number}[];heldFromPrevious:string[];expectedNames:string[]}
const data=JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/originalPractice.json',import.meta.url)),'utf-8')) as {progressions:{id:string;events:Event[]}[]};
const ID='op-traditional-passing';
const events=data.progressions.find(p=>p.id===ID)!.events;
const expected=events.map(e=>e.expectedPitches),struck=events.map(e=>e.struck.map(s=>s.pitch));
const carried=events.map((e,i)=>e.heldFromPrevious.map(n=>expected[i]![e.expectedNames.indexOf(n)]!));
const emit=(page:Page,notes:readonly number[],on=true,spread=0)=>page.evaluate(({notes,on,spread})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on,spread),{notes:[...notes],on,spread});
const at=async(page:Page,n:number)=>expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-card',String(n));
const record=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY) as Promise<{laps:Record<string,Record<string,{count:number}>>}>;

async function openList(page:Page,mode='midi'){
 await openDojo(page,mode);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
}
async function openOriginal(page:Page,mode='midi'){
 await openList(page,mode);
 await page.locator(`.dojo-original-card[data-original=${ID}]`).getByRole('button',{name:'これを練習する'}).click();
 await expect(page.getByTestId('dojo-original')).toBeVisible();
}
/** Plays card i as a pianist would: let go of everything that is not carried, then press the struck notes. */
async function playCard(page:Page,i:number,extra:number[]=[]){
 const keep=carried[i]!;
 await emit(page,[...new Set(expected.flat())].filter(n=>!keep.includes(n)),false);
 await emit(page,[...struck[i]!,...extra],true,40);
}

test('the list has the Original Practice group after every other group, with the two progressions',async({page})=>{
 await openList(page);
 const jump=page.getByRole('navigation',{name:'まとまりへ移る'}).getByRole('button');
 // Jazz Progressions comes after it, in the list and among the jumps
 await expect(jump.nth(-2)).toHaveText('Original Practice 2');
 await expect(jump.last()).toHaveText('Jazz Progressions 12');
 const cards=page.locator('.dojo-original-card');
 await expect(cards).toHaveCount(2);
 await expect(cards.nth(0).getByRole('heading',{name:'01 Traditional Passing — E°7'})).toBeVisible();
 await expect(cards.nth(1).getByRole('heading',{name:'02 Modern Passing — Cadd2 on E'})).toBeVisible();
 await expect(cards.nth(0).locator('.dojo-badge')).toHaveText('まだ');
 await expect(cards.nth(0).getByRole('button',{name:'今日のテーマにする'})).toHaveCount(0);
 await expect(cards.nth(0).locator('.dojo-builtin-chords')).toContainText('E♭：Fm11 → B♭7sus4 → B♭9 → E♭maj9 → E♭maj9 → Edim7');
 await expect(cards.nth(1).locator('.dojo-builtin-chords')).toContainText('Cadd2/E');
});

test('the cards show the real notes of each hand and the screen says 完奏, never クリア',async({page})=>{
 await openOriginal(page);
 const cards=page.getByTestId('original-card');
 await expect(cards).toHaveCount(6);
 await expect(cards.nth(0)).toContainText('Fm11');
 await expect(cards.nth(0).getByTestId('original-notes')).toContainText('左 F2 C3');
 await expect(cards.nth(0).getByTestId('original-notes')).toContainText('右 A♭3 C4 E♭4 G4 B♭4');
 await expect(cards.nth(2).getByTestId('original-notes')).toContainText('左 B♭2 F3');
 await expect(page.getByTestId('dojo-original')).not.toContainText('クリア');
 await expect(page.getByTestId('dojo-original')).toContainText('完奏');
 await expect(page.getByTestId('original-hint')).toContainText('メロディなど、ほかの音を重ねても構いません');
});

test('a lap with a melody on top goes round, counts as 完奏 and is kept as laps (not as a clear)',async({page})=>{
 test.setTimeout(60000);
 await openOriginal(page);
 for(let i=0;i<6;i+=1){
  await at(page,i);
  await playCard(page,i,[84,88]); // a melody far above, pressed with the chord
 }
 await at(page,0);
 await expect(page.getByTestId('original-lap')).toContainText('完奏！ E♭');
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-lap','2');
 await expect.poll(async()=>(await record(page)).laps[ID]?.['3']?.count).toBe(1);
 const dojo=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),DOJO_KEY);
 expect(dojo.progressions[`builtin:${ID}:1`]).toBeUndefined();
 await page.reload();await page.locator('[data-nav=chord-dojo]').click();await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await expect(page.locator(`.dojo-original-card[data-original=${ID}] .dojo-badge`)).toHaveText('完奏 1周');
 await page.locator(`.dojo-original-card[data-original=${ID}]`).getByRole('button',{name:'これを練習する'}).click();
 // back in the list the record is read as laps
 await page.getByTestId('dojo-back').click();
 await expect(page.locator(`.dojo-original-card[data-original=${ID}] .dojo-badge`)).toHaveText('完奏 1周');
 await expect(page.getByTestId('dojo-original-done').first()).toContainText('E♭ 1');
});

test('the keyboard marks the two hands in two colours, with 左 / 右 on the mark (there are no fingers on this card), and the legend says so',async({page})=>{
 await openOriginal(page);
 const e=events[0]! as Event&{leftHand:string[];rightHand:string[]};
 const pitch=(n:string)=>e.expectedPitches[e.expectedNames.indexOf(n)]!;
 for(const n of e.leftHand.map(pitch)){const key=page.locator(`.dojo-keyboard [data-midi-note="${n}"]`);await expect(key.locator('[data-answer-marker]')).toHaveAttribute('fill','#f59e0b');await expect(key.locator('[data-finger-label]')).toHaveText('左');}
 for(const n of e.rightHand.map(pitch)){const key=page.locator(`.dojo-keyboard [data-midi-note="${n}"]`);await expect(key.locator('[data-answer-marker]')).toHaveAttribute('fill','#22d3ee');await expect(key.locator('[data-finger-label]')).toHaveText('右');}
 await expect(page.locator('.dojo-keyboard-head')).toContainText('左手');
});

test('B♭7sus4 → B♭9 goes on with the left hand kept down, and not with A♭3 and F4 kept down',async({page})=>{
 await openOriginal(page);
 await playCard(page,0);await at(page,1);
 await playCard(page,1);await at(page,2);
 // new card B♭9: the C4 and D4 alone do not do it
 await emit(page,[60,62],false);await emit(page,[60,62],true);
 await at(page,2);
 await emit(page,[56,65],true);await at(page,3);
});

test('the second E♭maj9 needs every note played again; one note, or only a melody, is not enough',async({page})=>{
 await openOriginal(page);
 for(let i=0;i<4;i+=1){await playCard(page,i);await at(page,i+1);}
 await emit(page,[72,76,79],true); // a melody
 await at(page,4);
 await emit(page,[62],true);await at(page,4); // one note again
 await emit(page,[39,55,58],true);await at(page,4); // F4 is still missing
 await emit(page,[65],true);await at(page,5);
});

test('notes played from the bottom over 100 ms still pass',async({page})=>{
 await openOriginal(page);
 for(const n of struck[0]!){await emit(page,[n],true);await page.waitForTimeout(20);}
 await at(page,1);
});

test('a chord kept down from the card before does not pass the next card by itself',async({page})=>{
 await openOriginal(page);
 await playCard(page,0);await at(page,1);
 await page.waitForTimeout(300);
 await at(page,1);
 await emit(page,expected[1]!,true,0);await at(page,2);
 await page.waitForTimeout(300);await at(page,2); // B♭9 is not passed by what is already down
});

test('the last card goes back to the first: what was played last lap is not carried over',async({page})=>{
 test.setTimeout(60000);
 await openOriginal(page);
 for(let i=0;i<5;i+=1){await playCard(page,i);await at(page,i+1);}
 // the last card, and everything is kept down. G4 (67) is in both the last card and Fm11.
 await emit(page,struck[5]!,true);await at(page,0);
 await page.waitForTimeout(300);await at(page,0);
 await emit(page,[67],true);await at(page,0);
 await emit(page,struck[0]!,true);await at(page,1);
});

test('a card plays its own notes, not the notes of a shape from the table',async({page})=>{
 await openOriginal(page);
 await page.getByTestId('original-card').nth(2).click();
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-played-notes',expected[2]!.join(','),{timeout:5000});
});

test('another key moves every note by the same amount, and the random key leaves the key',async({page})=>{
 await openOriginal(page);
 await page.getByRole('combobox',{name:'Original Practice のキー'}).selectOption('2');
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-key','2');
 await expect(page.getByTestId('original-card').nth(0)).toContainText('Gm11');
 await expect(page.getByTestId('original-card').nth(0).getByTestId('original-notes')).toContainText('左 G2 D3');
 await expect(page.getByTestId('original-card').nth(5)).toContainText('F#dim7');
 await page.getByTestId('original-random').click();
 await expect(page.getByTestId('dojo-original')).not.toHaveAttribute('data-original-key','2');
 await at(page,0);
});

test('after the MIDI is unplugged and plugged again no key is left held',async({page})=>{
 await openOriginal(page);
 await emit(page,expected[0]!.slice(0,-1),true);
 await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
 await expect(page.getByTestId('original-hint')).toContainText('一時停止');
 await expect(page.getByRole('button',{name:'弾けた（Y）'})).toHaveCount(0);
 await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.plug());
 await expect(page.getByRole('button',{name:'弾けた（Y）'})).toHaveCount(0,{timeout:8000});
 await emit(page,[expected[0]![expected[0]!.length-1]!],true); // the last key only: the others are not known to be held
 await at(page,0);
});

test('without MIDI the player says 弾けた and goes on',async({page})=>{
 await openOriginal(page,'no-midi');
 await page.getByRole('button',{name:'弾けた（Y）'}).click();
 await at(page,1);
});

test('disconnect near the final card pauses, repeated reconnects clear history, explicit manual switch is required',async({page})=>{
 test.setTimeout(60000);await openOriginal(page);
 for(let i=0;i<5;i++){await playCard(page,i);await at(page,i+1);}
 await emit(page,struck[5]!.slice(0,-1),true);
 for(let i=0;i<2;i++){
  await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
  await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-paused','true');await at(page,5);
  await page.keyboard.press('y');await at(page,5);
  await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.plug());
  await expect(page.getByTestId('dojo-original')).not.toHaveAttribute('data-paused','true');
  await emit(page,struck[5]!.slice(-1),true);await at(page,5);
 }
 await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
 await page.getByRole('button',{name:'自分で判定に切り替える',exact:true}).click();
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-input-mode','manual');
 await page.getByRole('button',{name:'弾けた（Y）',exact:true}).click();await at(page,0);
 await expect.poll(async()=>(await record(page)).laps[ID]?.['3']?.count).toBe(1);
});
test('closing before the last card writes no lap and key changes never mix counts',async({page})=>{
 await openOriginal(page);await playCard(page,0);await at(page,1);await page.getByTestId('dojo-back').click();
 const before=await page.evaluate(k=>localStorage.getItem(k),KEY);expect(before).toBeNull();
 await page.locator(`.dojo-original-card[data-original=${ID}]`).getByRole('button',{name:'これを練習する'}).click();
 await page.getByRole('combobox',{name:'Original Practice のキー'}).selectOption('2');
 await expect(page.getByTestId('dojo-original')).toHaveAttribute('data-original-card','0');
 await page.getByTestId('dojo-back').click();expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBeNull();
});

test('Original Practice: the staff keeps its size and place from card to card and key to key, and nothing of it is cut',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:1280,height:720});
 await openOriginal(page);
 const first:{viewBox:string|null;size:number[];lines:number[]}[]=[];
 for(let k=0;k<12;k+=1){
  await page.getByLabel('Original Practice のキー').selectOption({index:k});
  const cards=await page.locator('.dojo-original-cards button').count();
  for(let c=0;c<cards;c+=1){
   await page.locator('.dojo-original-cards button').nth(c).click();await page.waitForTimeout(60);
   const s=await page.evaluate(()=>{
    const svg=document.querySelector('.dojo-grand-staff')!,box=svg.getBoundingClientRect(),scroll=document.querySelector('.dojo-score-scroll')!.getBoundingClientRect();
    const lines=[...document.querySelectorAll('.dojo-score-staff line')].map(l=>Math.round((l.getBoundingClientRect().top-box.top)*10)/10);
    const out=(r:DOMRect)=>r.top<scroll.top-1||r.bottom>scroll.bottom+1||r.left<scroll.left-1||r.right>scroll.right+1;
    const cut=[...document.querySelectorAll('.dojo-score-note ellipse, .dojo-score-note .dojo-score-finger, .dojo-score-note .dojo-score-ledger, .dojo-score-note .dojo-score-accidental')].filter(e=>out(e.getBoundingClientRect())).length;
    return {viewBox:svg.getAttribute('viewBox'),size:[Math.round(box.width*10)/10,Math.round(box.height*10)/10],lines,cut};
   });
   expect(s.cut,`key ${k} card ${c+1}: cut`).toBe(0);
   if(first.length===0)first.push(s);else{expect(s.viewBox,`key ${k} card ${c+1}`).toBe(first[0]!.viewBox);expect(s.size).toEqual(first[0]!.size);expect(s.lines).toEqual(first[0]!.lines);}
  }
 }
});
