import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDojo,type MidiControl} from './helpers/p12';
import {emptyStore,type DojoStore} from '../src/domain/chordDojo/store';

/**
 * P18-02: Jazz Progressions gets ② 覚えて弾く (the stages of the top row press, the notes of the hands are ? until the
 * card was played through or its answer was shown, the three entrances of the hint, the ends of the laps depend on the
 * stage, the hints and くり返す, a clean ② counts as 完奏 and a hinted one does not, and 通して聴く makes the round hinted).
 * Original Practice (the shared run without a stage) is covered by the existing p12-5 and p18-practice-frame suites.
 */
const JAZZ_KEY='loop-vault:jazz-progressions-v1:data';
interface JazzRow{id:string;itemTonic:number;cards:{display:string;expectedPitches:number[];carried:number[];struck:number[]}[]}
const table=(JSON.parse(readFileSync(fileURLToPath(new URL('../src/domain/chordDojo/jazzTranspose.expected.json',import.meta.url)),'utf-8')) as {progressions:JazzRow[]}).progressions;
const JAZZ_ID='jazz-progressions-001';
const rowOf=(itemTonic:number)=>table.find(r=>r.id===JAZZ_ID&&r.itemTonic===itemTonic)!;
const emit=(page:Page,notes:readonly number[],on=true,spread=0)=>page.evaluate(({notes,on,spread})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on,spread),{notes:[...notes],on,spread});
const atJazz=async(page:Page,n:number)=>expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-card',String(n));
const jazzRecord=(page:Page)=>page.evaluate(key=>{const v=localStorage.getItem(key);return v?JSON.parse(v) as {laps:Record<string,Record<string,{count:number}>>}:{laps:{}};},JAZZ_KEY);
const lapsOf=(laps:Record<string,Record<string,{count:number}>>|undefined,id:string)=>Object.values(laps?.[id]??{}).reduce((n,l)=>n+l.count,0);
/** Plays card i as a pianist: let go of everything that is not carried, then press the struck notes (with a small spread). */
async function playRow(page:Page,row:JazzRow,i:number){
 const all=[...new Set(row.cards.flatMap(c=>c.expectedPitches))],keep=row.cards[i]!.carried;
 await emit(page,all.filter(n=>!keep.includes(n)),false);
 await emit(page,row.cards[i]!.struck,true,40);
}
/** A fast pass of the whole progression in the key the screen shows. */
async function playThrough(page:Page){
 for(let i=0;i<3;i+=1){
  await atJazz(page,i);
  const key=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
  await playRow(page,rowOf(key),i);
 }
}
/** Seeds the Dojo document (hintSec short for the stall test) and opens item 001 in the ② stage (or in ① when asked). */
async function openJazz(page:Page,{hintSec,hinted=false}:{hintSec?:number;hinted?:boolean}={}){
 const f=emptyStore() as DojoStore;
 if(hintSec!==undefined)f.settings.hintSec=hintSec;
 await page.addInitScript(file=>localStorage.setItem('loop-vault:chord-dojo-txt-jazz-v1:data',JSON.stringify(file)),f);
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await page.locator('[data-jazz-item=jazz-progressions-001]').getByTestId('jazz-open').click();
 await expect(page.getByTestId('dojo-jazz')).toBeVisible();
 if(hinted)await page.getByTestId('dojo-stage-2').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-stage',hinted?'recall':'see');
}

test('D ②: the notes of the hands are ?, the degree and the name stay; the staff and the keyboard hide the answer',async({page})=>{
 await openJazz(page,{hinted:true});
 const row=rowOf(Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key')));
 await expect(page.getByTestId('jazz-chord')).toHaveText(row.cards.map(c=>c.display));
 await expect(page.getByTestId('jazz-notes').first()).toContainText('左 ?');
 await expect(page.getByTestId('jazz-notes').nth(0)).toContainText('左 ?'); // the round begins again: hidden again
 await expect(page.getByTestId('jazz-notes').nth(1)).toContainText('左 ?');
 await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','false');
 await expect(page.locator('.dojo-keyboard-head')).toContainText('答え(弾いた後かヒントで出る)');
 await expect(page.locator('.dojo-keyboard [data-answer-marker]')).toHaveCount(0);
});

test('D ②: a played card shows its notes again; the next card stays ? and the board hides again',async({page})=>{
 await openJazz(page,{hinted:true});
 await playThrough(page); // one clean pass: the cards were played, the lap is complete
 await atJazz(page,0);
 await expect(page.getByTestId('jazz-laps')).toHaveText('1'); // a clean ② counts as 完奏
 await expect(page.getByTestId('jazz-recall-clean')).toHaveText(/② ヒントなし 1/);
 // the played-through cards show their notes; the current card is ? again
 await expect(page.getByTestId('jazz-notes').nth(0)).toContainText('左 ?'); // the round begins again: hidden again
 await expect(page.getByTestId('jazz-notes').nth(1)).toContainText('左 ?');
 await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','false');
});

test('D ②: the three entrances of the hint show only the current card and mark it; the next card closes it',async({page})=>{
 await openJazz(page,{hinted:true});
 // Space shows the answer of the current card
 await page.getByTestId('jazz-reveal').click();
 const key0=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
 const row=rowOf(key0);
 await expect(page.getByTestId('jazz-notes').first()).toContainText('♭');
 await expect(page.getByTestId('jazz-card').first()).toHaveAttribute('data-hint','true');
 await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true');
 await expect(page.locator('[data-score-midi]').first()).toBeVisible();
 // the hint stays marked when the card moves; the next card is hidden again
 await playRow(page,row,0);
 await atJazz(page,1);
 await expect(page.getByTestId('jazz-card').nth(0)).toHaveAttribute('data-hint','true');
 await expect(page.getByTestId('jazz-notes').nth(1)).toContainText('左 ?');
 // the sample of the played card may still be sounding (the staff follows the sound): it hides when the sound stops
 await expect.poll(async()=>page.getByTestId('dojo-score').getAttribute('data-score-visible'),{timeout:9000}).toBe('false');
 // お手本を聴く (L) is a hint for the current card too
 await page.getByRole('button',{name:'お手本を聴く（L）'}).click();
 await expect(page.getByTestId('jazz-card').nth(1)).toHaveAttribute('data-hint','true');
});

test('D ②: stopping hintSec on a card shows its answer as a hint',async({page})=>{
 await openJazz(page,{hinted:true,hintSec:1});
 await page.waitForTimeout(1600);
 await expect(page.getByTestId('jazz-card').first()).toHaveAttribute('data-hint','true');
 await expect(page.getByTestId('jazz-notes').first()).toContainText('♭');
 await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true');
});

test('D ② a clean pass: counted; くり返す on goes on (random key moves), off stops and R continues',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page,{hinted:true});
 await page.getByTestId('jazz-random').click(); // the random key on
 const keyBefore=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key')); // the first key of the random round
 await playThrough(page);
 await atJazz(page,0);
 await expect.poll(async()=>lapsOf((await jazzRecord(page)).laps,JAZZ_ID)).toBe(1);
 // 入 (the first value): the round goes on with the next key
 await expect.poll(async()=>Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key')),{timeout:5000}).not.toBe(keyBefore);
 await expect(page.getByTestId('jazz-lap')).toContainText('② をヒントなしで通しました');
 // 切: the lap end asks, R goes on in the next key
 await page.getByTestId('jazz-repeat').click();
 await playThrough(page);
 await atJazz(page,0);
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-lap-stop','true');
 await expect(page.getByTestId('jazz-lap-stop')).toContainText('② をヒントなしで通しました');
 await expect(page.getByRole('button',{name:'もう一度 ② を弾く（R）'})).toBeVisible();
 await page.getByTestId('jazz-lap-again').click();
 await expect(page.getByTestId('dojo-jazz')).not.toHaveAttribute('data-lap-stop','true');
 await expect(page.getByTestId('jazz-recall-clean')).toHaveText(/② ヒントなし 2/);
});

test('D ② a hinted pass: not counted, and the random key stays on the same key',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page,{hinted:true});
 await page.getByTestId('jazz-random').click();
 await playThrough(page);; // a clean pass first, so that a counted lap exists
 await atJazz(page,0);
 const key=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
 // a hint on the current card, then the pass: the lap is not counted and the key stays
 await page.getByTestId('jazz-reveal').click();
 const row=rowOf(key);
 for(let i=0;i<3;i+=1){await atJazz(page,i);await playRow(page,row,i);}
 await atJazz(page,0);
 await expect.poll(async()=>lapsOf((await jazzRecord(page)).laps,JAZZ_ID)).toBe(1); // the hinted round is not counted
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key',String(key)); // the same key comes again
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-card','0');
});

test('D ② pressing 通して聴く makes the round hinted (it is not counted)',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page,{hinted:true});
 await page.getByTestId('jazz-listen-all').click();
 await expect(page.getByTestId('jazz-listen-hint')).toContainText('通して聴いたので、この周はヒントありです');
 await page.getByRole('button',{name:'止める'}).click(); // stop the listening (the marks of the round stay)
 await playThrough(page);;
 await atJazz(page,0);
 await expect.poll(async()=>lapsOf((await jazzRecord(page)).laps,JAZZ_ID)).toBe(0);
});

test('D ① (くり返す off) stops with もう一度 ① and ② 覚えて弾くへ, and Enter begins ② from its first card',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 await page.getByTestId('jazz-repeat').click();
 await playThrough(page);;
 await atJazz(page,0);
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-lap-stop','true');
 await expect(page.getByTestId('jazz-lap-stop')).toContainText('完奏！');
 await expect(page.getByRole('button',{name:'もう一度 ① を弾く（R）'})).toBeVisible();
  await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true'); // ① keeps the answer shown
 await page.getByTestId('jazz-lap-next').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-stage','recall');
 await expect(page.getByTestId('dojo-jazz')).not.toHaveAttribute('data-lap-stop','true');
 await atJazz(page,0);
 const row=rowOf(Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key')));
 await expect(page.getByTestId('jazz-chord').first()).toHaveText(row.cards[0]!.display);
 await expect(page.getByTestId('jazz-notes').first()).toContainText('左 ?');
});

test('D ②: the line that says which keys may stay held speaks no note names',async({page})=>{
 await openJazz(page,{hinted:true});
 await playThrough(page);
 await playRow(page,rowOf(3),0);await atJazz(page,1); // the second card: the line of the held keys
 await expect(page.getByTestId('jazz-hint')).toContainText('前のカードから押さえたままの音は、離さなくて構いません');
 await expect(page.getByTestId('jazz-hint')).not.toContainText('♭');
});

test('D: changing the stage keeps the key, the octave, the random key and くり返す',async({page})=>{
 await openJazz(page);
 await page.getByTestId('jazz-octave-1').click();
 await page.getByTestId('jazz-random').click();
 await page.getByTestId('jazz-repeat').click();
 const key=Number(await page.getByTestId('dojo-jazz').getAttribute('data-jazz-key'));
 await page.getByTestId('dojo-stage-2').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-stage','recall');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-octave','1');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-random','on');
 await expect(page.getByTestId('jazz-repeat')).toHaveAttribute('aria-pressed','false');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key',String(key));
 await atJazz(page,0);
 await page.getByTestId('dojo-stage-1').click();
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-stage','see');
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-key',String(key));
 await atJazz(page,0);
});

test('D ②: the focus line is folded (it carries note names); opening it makes the round hinted',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page,{hinted:true});
 // 1280×720: the fold is in the heading of the staff
 await expect(page.getByTestId('jazz-focus-toggle')).toBeVisible();
 await expect(page.getByTestId('dojo-jazz')).not.toContainText('同じ鍵のまま'); // the note names of the focus are hidden
 await page.getByTestId('jazz-focus-toggle').click();
 await expect(page.getByTestId('jazz-focus-hint')).toContainText('学ぶことを開いたので、この周はヒントありです');
 await expect(page.getByTestId('dojo-jazz')).toContainText('同じ鍵のまま'); // opened: the focus is seen
 await playThrough(page);
 await atJazz(page,0);
 await expect.poll(async()=>lapsOf((await jazzRecord(page)).laps,JAZZ_ID)).toBe(0); // the opened round is not counted (before nothing was)
});

test('D: the focus line is seen in ① and at the ② lap end, folded in ② while playing',async({page})=>{
 test.setTimeout(60000);
 await openJazz(page);
 await expect(page.getByTestId('dojo-jazz')).toContainText('同じ鍵のまま'); // ① shows it as before
 await expect(page.getByTestId('jazz-focus-toggle')).toHaveCount(0);
 await page.getByTestId('dojo-stage-2').click();
 await expect(page.getByTestId('dojo-jazz')).toContainText('②');
 await expect(page.getByTestId('jazz-focus-toggle')).toBeVisible();
 await expect(page.getByTestId('dojo-jazz')).not.toContainText('同じ鍵のまま');
 await page.getByTestId('jazz-repeat').click();
 await playThrough(page);
 await atJazz(page,0);
 await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-lap-stop','true');
 await expect(page.getByTestId('dojo-jazz')).toContainText('同じ鍵のまま'); // the lap end shows it as before
 await expect(page.getByTestId('jazz-focus-toggle')).toHaveCount(0);
});
