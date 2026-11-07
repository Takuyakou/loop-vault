import AxeBuilder from '@axe-core/playwright';
import {test,expect,type Page} from '@playwright/test';
import {dateKey,emptyStore,emptyItem,type DojoStore,type Task} from '../src/domain/chordDojo/store';
import {builtinChords} from './helpers/p12-3';
import {openDojo,type MidiControl} from './helpers/p12';

/** P12.3 §3 (bass below), §5 (playable progression cards), §6 (one-chord card), §7 (degrees always shown). */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const SHAPE:Task={kind:'shape',key:'preset:basic|close|self|any:quality:maj',quality:'maj',preset:'basic',bass:'self',review:false,roots:[0,5,2],seconds:60};
const progressionTask=(id='ii-v-i-major',root=0):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[root],seconds:120});
type Stage=NonNullable<DojoStore['today']>['cursor']['stage'];
function practiceFile(task:Task,stage:Stage='recall'){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 if(task.kind==='progression')f.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
async function start(page:Page,file:DojoStore){
 await page.addInitScript(({key,file})=>{localStorage.setItem(key,JSON.stringify(file));const probe={starts:0};(window as unknown as {__dojoAudio:typeof probe}).__dojoAudio=probe;const original=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof original>){probe.starts++;return original.apply(this,args);};},{key:KEY,file});
 await openDojo(page);await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
}
const starts=(page:Page)=>page.evaluate(()=>(window as unknown as {__dojoAudio:{starts:number}}).__dojoAudio.starts);
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,KEY);
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const cards=(page:Page)=>page.locator('.dojo-chord-cards>button');
const scoreNotes=(page:Page)=>page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))));

test('P12.3 §3 in key A the first ii–V–I answer has the bass below, and playing the shown answer is accepted',async({page})=>{
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await page.getByLabel('定番のキー').selectOption('9');
 await page.locator('.dojo-list .dojo-card').filter({has:page.getByRole('heading',{name:'ii–V–I',exact:true})}).getByRole('button',{name:'これを練習する'}).click();
 await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
 const first=builtinChords('ii-v-i-major',9)[0];
 expect(first.notes).toEqual([47,57,62,66]);
 await emit(page,first.notes);
 await expect(page.locator('.dojo-result')).toContainText('合いました');
});

test.describe('§5 progression cards play',()=>{
 test('① a card is a button that sounds, lights up, and swaps the score and answer keys for its own notes without touching the record',async({page})=>{
  await start(page,practiceFile(progressionTask(),'memorize'));
  const before=await saved(page);const sounded=await starts(page);
  const third=cards(page).nth(2);await third.click();
  await expect.poll(()=>starts(page)).toBeGreaterThan(sounded);
  await expect(third).toHaveAttribute('data-playing','true');
  const notes=builtinChords('ii-v-i-major',0)[2].notes;
  expect(await scoreNotes(page)).toEqual(notes);
  await expect(page.locator('.dojo-score-caption b')).toHaveText('Cmaj7 を聴いています');
  await expect(third).not.toHaveAttribute('data-playing','true',{timeout:8000});
  expect(await scoreNotes(page)).toEqual(builtinChords('ii-v-i-major',0)[0].notes);
  const after=await saved(page);expect(after.today!.matched).toBe(before.today!.matched);expect(after.today).toEqual(before.today);
 });
 test('reads out the card labels: visible name with degree, hidden hint, hidden ✓',async({page})=>{
  await start(page,practiceFile(progressionTask(),'memorize'));
  await expect(cards(page).nth(0)).toHaveAttribute('aria-label','Dm7（ii7）を聴く');
  await expect(cards(page).nth(2)).toHaveAttribute('aria-label','Cmaj7（Imaj7）を聴く');
  await page.getByRole('button',{name:'覚えた（Enter）'}).click();
  await expect(cards(page).nth(1)).toHaveAttribute('aria-label','2番目のコードをヒントとして聴く');
  await emit(page,builtinChords('ii-v-i-major',0)[0].notes);await emit(page,builtinChords('ii-v-i-major',0)[0].notes,false);
  await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:0:1$/);
  await expect(cards(page).nth(0)).toHaveAttribute('aria-label','1番目のコードを聴く');
 });
 test('② a hidden later card shows its name until the current card moves, adds a hint, and keeps answerSeen false',async({page})=>{
  await start(page,practiceFile(progressionTask()));
  const third=cards(page).nth(2);await expect(third.locator('strong')).toHaveText('3');
  await third.click();
  await expect(third.locator('strong')).toHaveText('Cmaj7');
  await expect.poll(async()=>(await saved(page)).today!.cursor.hints).toContain(2);
  expect((await saved(page)).today!.cursor.answerSeen).toBe(false);
  expect(await third.locator('small').count()).toBe(1);
  const chords=builtinChords('ii-v-i-major',0);
  await emit(page,chords[0].notes);await emit(page,chords[0].notes,false);
  await expect(third.locator('strong')).toHaveText('3');
  await expect(third).toHaveAttribute('data-hint','true');
 });
 test('② pressing the current hidden card sets answerSeen (no seconds counted)',async({page})=>{
  await start(page,practiceFile(progressionTask()));
  await cards(page).nth(0).click();
  await expect.poll(async()=>(await saved(page)).today!.cursor.answerSeen).toBe(true);
  expect((await saved(page)).today!.cursor.hints).toContain(0);
 });
 test('③ the cards are disabled while the tempo run is going',async({page})=>{
  await start(page,practiceFile(progressionTask(),'tempo'));
  await expect(cards(page).first()).toBeEnabled();
  await page.getByRole('button',{name:'テンポで始める（Space）'}).click();
  for(let i=0;i<3;i++)await expect(cards(page).nth(i)).toBeDisabled();
  await page.getByRole('button',{name:'止める（Space）'}).click();
 });
 test('③ before the tempo run a card sounds and sets answerSeen',async({page})=>{
  await start(page,practiceFile(progressionTask(),'tempo'));
  const sounded=await starts(page);
  await cards(page).nth(1).click();
  await expect.poll(()=>starts(page)).toBeGreaterThan(sounded);
  await expect.poll(async()=>(await saved(page)).today!.cursor.answerSeen).toBe(true);
 });
});

test('P12.3 §2 a titled progression shows its display name, with the degrees line under it; a plain one does not',async({page})=>{
 await start(page,practiceFile(progressionTask('ouudou',0),'memorize'));
 await expect(page.locator('.dojo-progression-title')).toHaveText('王道進行');
 await expect(page.locator('.dojo-progression-degrees')).toHaveText('IVmaj7–V7–iii7–vi7');
 await expect(cards(page).nth(0)).toHaveAttribute('aria-label','Fmaj7（IVmaj7）を聴く');
});
test('P12.3 §2 a progression without a title keeps its plain name and has no degrees line',async({page})=>{
 await start(page,practiceFile(progressionTask(),'memorize'));
 await expect(page.locator('.dojo-progression-title')).toHaveText('ii–V–I');
 await expect(page.locator('.dojo-progression-degrees')).toHaveCount(0);
});

test.describe('§6 one-chord cards play',()=>{
 test('the chord name box and its speaker button both sound; the heading stays a plain G13-like name',async({page})=>{
  await start(page,practiceFile(SHAPE,'see'));
  await expect(page.getByRole('heading',{name:'C',exact:true})).toBeVisible();
  const button=page.locator('.dojo-prompt-play');
  await expect(button).toHaveAttribute('aria-label','Cを聴く（L）');await expect(button).toHaveAttribute('title','押すと鳴ります（L）');
  const sounded=await starts(page);await button.click();
  await expect.poll(()=>starts(page)).toBeGreaterThan(sounded);
  await expect(page.locator('.dojo-prompt-card')).toHaveAttribute('data-playing','true');
  await expect(page.locator('.dojo-prompt-card')).not.toHaveAttribute('data-playing','true',{timeout:8000});
  const again=await starts(page);await page.locator('.dojo-prompt').click();
  await expect.poll(()=>starts(page)).toBeGreaterThan(again);
 });
 test('② pressing the button sets answerSeen',async({page})=>{
  await start(page,practiceFile(SHAPE,'recall'));
  expect((await saved(page)).today!.cursor.answerSeen).toBe(false);
  await page.locator('.dojo-prompt-play').click();
  await expect.poll(async()=>(await saved(page)).today!.cursor.answerSeen).toBe(true);
 });
});

test.describe('§7 degrees are always shown',()=>{
 test('the settings have no degrees checkbox, and ii–V–I ① shows ii7 · V7 · Imaj7',async({page})=>{
  await start(page,practiceFile(progressionTask(),'memorize'));
  await expect(page.locator('.dojo-chord-cards>button>small:last-child')).toHaveText(['ii7','V7','Imaj7']);
  await page.getByRole('button',{name:'練習の設定'}).click();
  await expect(page.getByLabel('BPM')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'度数も出す'})).toHaveCount(0);
 });
 test('a saved progression without a key never shows 「キー未設定」',async({page})=>{
  await page.goto('/?p12=midi&p104=normal');await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByRole('button',{name:'自分の進行',exact:true}).click();
  await page.locator('.dojo-list .dojo-card').first().getByRole('button',{name:'全体を練習する'}).click();
  await expect(page.locator('.dojo-chord-cards')).toBeVisible();
  expect(await page.locator('.dojo').innerText()).not.toContain('キー未設定');
 });
});

// ===================== §4 the standard-progression list =====================
async function openBuiltinList(page:Page,mode='midi'){
 await openDojo(page,mode);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await expect(page.getByRole('heading',{name:'定番の進行',exact:true})).toBeVisible();
}
test.describe('§4 the grouped list',()=>{
 test('25 cards in the first 5 groups (6·6·4·5·4), then the 18 added in 4 more (P12.4-02), then the 2 of Original Practice (P12.5-02); degrees and the chord names of the chosen key change with the key',async({page})=>{
  await openBuiltinList(page);
  await expect(page.locator('.dojo-builtin-card')).toHaveCount(45);
  expect(await page.locator('.dojo-builtin-group').evaluateAll(gs=>gs.map(g=>g.querySelectorAll('.dojo-builtin-card').length))).toEqual([6,6,4,5,4,3,6,3,6,2]);
  expect(await page.locator('.dojo-builtin-jump button').allTextContents()).toEqual(['基本 6','J-POP 6','ジャズ・ボサ 4','ネオソウル・Lo-fi 5','マイナー 4','ジャズ基礎 3','ジャズの仕掛け 6','ジャズ・フォーム 3','ネオソウル・ボサ・モーダル 6','Original Practice 2','Jazz Progressions 12']);
  const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})});
  await expect(card.locator('.dojo-builtin-degrees')).toHaveText('IVmaj7 – V7 – iii7 – vi7');
  await expect(card.locator('.dojo-builtin-chords')).toHaveText('C：Fmaj7 → G7 → Em7 → Am7');
  await page.getByLabel('定番のキー').selectOption('3');
  await expect(card.locator('.dojo-builtin-chords')).toHaveText('E♭：A♭maj7 → B♭7 → Gm7 → Cm7');
  await expect(page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'エオリアン',exact:true})}).locator('.dojo-builtin-chords')).toHaveText(`E♭m：${builtinChords('aeolian',3).map(c=>c.label).join(' → ')}`);
 });
 test('each card has the three buttons; a title-less progression keeps its plain name',async({page})=>{
  await openBuiltinList(page);
  const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'ii–V–I',exact:true})});
  await expect(card.getByRole('button')).toHaveText(['これを練習する','ランダムキーで練習','今日のテーマにする']);
  await expect(card.locator('.dojo-builtin-degrees')).toHaveText('ii7 – V7 – Imaj7');
 });
 test('a group button scrolls to its heading (1440×900)',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await openBuiltinList(page);
  const main=page.locator('#main-content');
  expect(await main.evaluate(e=>e.scrollTop)).toBe(0);
  await page.getByRole('button',{name:'マイナー 4',exact:true}).click();
  await expect.poll(()=>main.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#dojo-builtin-minor>h2')).toBeInViewport();
 });
 test('the list has no serious or critical accessibility problems',async({page})=>{
  await openBuiltinList(page);
  const result=await new AxeBuilder({page:page as never}).include('.dojo').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(result.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
 });
});

// ===================== §8–11 random-key endless practice =====================
const endlessKey=async(page:Page)=>Number(await page.locator('[data-endless-key]').getAttribute('data-endless-key'));
const stats=(page:Page)=>page.locator('.dojo-endless-stats');
async function openEndless(page:Page,id='王道進行',mode='midi'){
 await openBuiltinList(page,mode);
 await page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:id,exact:true})}).getByRole('button',{name:'ランダムキーで練習'}).click();
 await expect(page.locator('[data-dojo-screen=endless]')).toBeVisible();
}
/** Plays the chords of `id` in `key` as a real player: only the changing notes go off / on, and the old notes stay held between chords. */
async function playKey(page:Page,id:string,key:number,release=true){
 const chords=builtinChords(id,key).map(c=>c.notes);let previous:number[]=[];
 for(const [i,notes] of chords.entries()){
  const off=previous.filter(n=>!notes.includes(n)),on=notes.filter(n=>!previous.includes(n));
  if(off.length)await emit(page,off,false);if(on.length)await emit(page,on,true);
  if(i<chords.length-1)await expect(page.locator('.dojo-endless-cards>button').nth(i)).toHaveAttribute('data-state','done');
  previous=notes;
 }
 await expect(page.locator('.dojo-endless-clear')).toBeVisible();
 if(release)await emit(page,previous,false);
}
test.describe('§8 the random-key screen',()=>{
 test('shows the key and degrees only: every card name is hidden; the header says round 1 key 1/12',async({page})=>{
  await openEndless(page);
  await expect(page.locator('[data-endless-key]')).toBeVisible();
  expect(await endlessKey(page)).toBeGreaterThanOrEqual(0);
  const cards=page.locator('.dojo-endless-cards>button');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.dojo-endless-degree')).toHaveText(['IVmaj7','V7','iii7','vi7']);
  await expect(page.locator('.dojo-endless-chord')).toHaveText(['?','?','?','?']);
  await expect(stats(page)).toContainText('1巡目 1/12');
  await expect(page.locator('.dojo-endless-name')).toContainText('王道進行');
  await expect(page.locator('.dojo-endless-result')).toHaveText('度数を見て、このキーのコードを順に弾いてください');
  await expect(cards.first()).toHaveAttribute('data-state','current');
 });
 test('the Dojo keys and the practice record stay out of the way: Enter does not move today forward',async({page})=>{
  await openEndless(page);
  const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
  await page.keyboard.press('Enter');await page.waitForTimeout(300);
  expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(before);
  await expect(page.locator('[data-dojo-screen=endless]')).toBeVisible();
 });
});

test.describe('§9 judging, hints, clear and the next key',()=>{
 test('playing the chords in order clears the key, shows the clear plate, and releasing moves to key 2/12',async({page})=>{
  test.setTimeout(60000);
  await openEndless(page);
  const key=await endlessKey(page);
  await playKey(page,'ouudou',key,false);
  await expect(page.locator('.dojo-endless-cards>button').nth(3)).toHaveAttribute('data-state','done');
  await expect(page.locator('.dojo-endless-clear')).toContainText(`クリア！`);
  await expect(page.locator('.dojo-endless-result')).toHaveText('鍵盤を離すと、次のキーが出ます');
  await emit(page,builtinChords('ouudou',key)[3].notes,false);
  await expect(stats(page)).toContainText('1巡目 2/12');
  expect(await endlessKey(page)).not.toBe(key);
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip')).toHaveCount(1);
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip').first()).toContainText(/\d+\.\ds$/);
 });
 test('12 clears use 12 different keys, and the 13th is round 2 key 1/12 and not the same as the 12th',async({page})=>{
  test.setTimeout(120000);
  await openEndless(page);
  const keys:number[]=[];
  for(let i=0;i<12;i++){const key=await endlessKey(page);keys.push(key);await playKey(page,'ouudou',key);await expect(stats(page)).toContainText(i<11?`1巡目 ${i+2}/12`:'2巡目 1/12');}
  expect(new Set(keys).size).toBe(12);
  expect(await endlessKey(page)).not.toBe(keys[11]);
 });
 test('a hidden card pressed as a hint makes the key a hint key: the chip says ヒント and has no seconds',async({page})=>{
  test.setTimeout(60000);
  await openEndless(page);
  const key=await endlessKey(page);
  const third=page.locator('.dojo-endless-cards>button').nth(2);
  await third.click();
  await expect(third.locator('.dojo-endless-chord')).toHaveText(builtinChords('ouudou',key)[2].label);
  await expect(third).toHaveAttribute('data-hint','true');
  await expect(page.locator('.dojo-endless-result')).toHaveText('ヒントを見ました。このキーは秒数を数えません');
  await playKey(page,'ouudou',key);
  await expect(page.locator('.dojo-endless-clear')).toContainText('ヒントあり');
  await expect(stats(page)).toContainText('クリア 1');
  await expect(stats(page)).toContainText('ヒントなし 0');
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip').first()).toHaveText(/ヒント$/);
 });
 test('このキーをとばす records a skipped chip and moves to the next key',async({page})=>{
  await openEndless(page);
  const key=await endlessKey(page);
  await page.getByRole('button',{name:'このキーをとばす'}).click();
  await expect(stats(page)).toContainText('1巡目 2/12');
  expect(await endlessKey(page)).not.toBe(key);
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip').first()).toHaveText(/とばした$/);
 });
 test('wrong notes show ✗ and keep the same card; the right notes then move on',async({page})=>{
  await openEndless(page);
  const key=await endlessKey(page);
  const first=builtinChords('ouudou',key)[0].notes;
  await emit(page,[first[0]+1,first[1],first[2],first[3]]);
  await expect(page.locator('.dojo-endless-result')).toContainText('✗');
  await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','current');
  await emit(page,[first[0]+1],false);await emit(page,[first[0]]);
  await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','done');
  await expect(page.locator('.dojo-endless-result')).toHaveText('1番目まで合いました');
 });
 test('the first card of the next chord can be played before the old notes are lifted',async({page})=>{
  test.setTimeout(60000);
  await openEndless(page);
  const key=await endlessKey(page);
  const [a,b]=builtinChords('ouudou',key).map(c=>c.notes);
  await emit(page,a);await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','done');
  await emit(page,b.filter(n=>!a.includes(n)));            // new notes first, old notes still held
  await emit(page,a.filter(n=>!b.includes(n)),false);       // the old ones are lifted afterwards
  await expect(page.locator('.dojo-endless-cards>button').nth(1)).toHaveAttribute('data-state','done');
 });
 test('the cards sound when pressed, like every other practice',async({page})=>{
  await page.addInitScript(()=>{const probe={starts:0};(window as unknown as {__dojoAudio:typeof probe}).__dojoAudio=probe;const original=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof original>){probe.starts++;return original.apply(this,args);};});
  await openEndless(page);
  const sounded=await starts(page);const first=page.locator('.dojo-endless-cards>button').first();
  await first.click();
  await expect.poll(()=>starts(page)).toBeGreaterThan(sounded);
  await expect(first).toHaveAttribute('data-playing','true');
  await expect(page.locator('[data-score-midi]').first()).toBeVisible();
 });
});

test.describe('§10 the summary, and nothing is recorded',()=>{
 test('three cleared keys, then やめる: the summary matches, and the Dojo record text is identical before and after',async({page})=>{
  test.setTimeout(90000);
  const file=practiceFile(progressionTask('ii-v-i-major',0),'memorize');
  await page.addInitScript(({key,file})=>localStorage.setItem(key,JSON.stringify(file)),{key:KEY,file});
  await openBuiltinList(page);
  const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
  await page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})}).getByRole('button',{name:'ランダムキーで練習'}).click();
  for(let i=0;i<3;i++){const key=await endlessKey(page);await playKey(page,'ouudou',key);await expect(stats(page)).toContainText(`1巡目 ${i+2}/12`);}
  await page.getByRole('button',{name:'やめる（Esc）'}).click();
  const summary=page.locator('.dojo-endless-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('dd').nth(0)).toHaveText('3');
  await expect(summary.locator('dd').nth(1)).toHaveText('3');
  await expect(summary.locator('dd').nth(3)).toHaveText('1 · 3/12');
  await expect(summary.locator('.dojo-endless-chip')).toHaveCount(3);
  await page.getByTestId('dojo-back').click();
  await expect(page.getByRole('heading',{name:'定番の進行',exact:true})).toBeVisible();
  expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(before);
 });
 test('quitting without any result goes straight back to the list; もう一度 starts a new order',async({page})=>{
  await openEndless(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading',{name:'定番の進行',exact:true})).toBeVisible();
  await page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})}).getByRole('button',{name:'ランダムキーで練習'}).click();
  await page.getByRole('button',{name:'このキーをとばす'}).click();
  await page.locator('body').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});   // keys are ignored while a button has the focus
  await page.keyboard.press('Escape');
  await expect(page.locator('.dojo-endless-summary')).toBeVisible();
  await expect(page.locator('.dojo-endless-summary dd').nth(0)).toHaveText('0');
  await page.keyboard.press('Enter');
  await expect(stats(page)).toContainText('1巡目 1/12');
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip')).toHaveCount(0);
 });
});

test.describe('§11 without MIDI, and when MIDI drops',()=>{
 test('no MIDI: 答えを見る → 弾けた four times clears the key, marked 自分で',async({page})=>{
  test.setTimeout(60000);
  await openEndless(page,'王道進行','no-midi');
  await expect(page.getByTestId('midi-required-notice')).toBeVisible();
  for(let i=0;i<4;i++){await page.getByRole('button',{name:'答えを見る（Space）'}).click();await page.getByRole('button',{name:'弾けた（Y）'}).click();}
  await expect(page.locator('.dojo-endless-clear')).toContainText('自分で判定');
  await expect(stats(page)).toContainText('自分で判定');
  await expect(page.locator('.dojo-endless-history .dojo-endless-chip').first()).toHaveText(/自分で$/);
 });
 test('no MIDI: まだ keeps the answer and says to try again',async({page})=>{
  await openEndless(page,'王道進行','no-midi');
  await page.getByRole('button',{name:'答えを見る（Space）'}).click();
  await expect(page.locator('.dojo-endless-result')).toHaveText('答えのとおりに弾いてみて、合っていたら「弾けた」');
  await page.getByRole('button',{name:'まだ（N）'}).click();
  await expect(page.locator('.dojo-endless-result')).toHaveText('答えを見て、もう一度');
  await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','current');
 });
 test('MIDI drops in the middle of the 2nd card: it pauses with the notice, never turns into self-judging, and the same key restarts from card 1',async({page})=>{
  test.setTimeout(60000);
  await openEndless(page);
  const key=await endlessKey(page);
  await emit(page,builtinChords('ouudou',key)[0].notes);
  await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','done');
  await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
  await expect(page.locator('[data-dojo-screen=endless]')).toHaveAttribute('data-endless-phase','paused');
  await expect(page.getByTestId('midi-required-notice')).toContainText('MIDI が外れました。つなぎ直すと、この課題から続けます。');
  await expect(page.getByRole('button',{name:'弾けた（Y）'})).toHaveCount(0);
  await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.plug());
  await expect(page.locator('[data-dojo-screen=endless]')).toHaveAttribute('data-endless-phase','active',{timeout:10000});
  expect(await endlessKey(page)).toBe(key);
  await expect(page.locator('.dojo-endless-cards>button').first()).toHaveAttribute('data-state','current');
  await expect(page.getByTestId('midi-required-notice')).toHaveCount(0);
 });
 test('「自分で判定に切り替える」 switches only when asked',async({page})=>{
  await openEndless(page);
  await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
  await expect(page.locator('[data-dojo-screen=endless]')).toHaveAttribute('data-endless-phase','paused');
  await page.getByRole('button',{name:'自分で判定に切り替える'}).click();
  await expect(page.getByRole('button',{name:'答えを見る（Space）'})).toBeVisible();
  await page.getByRole('button',{name:'答えを見る（Space）'}).click();
  await expect(page.getByRole('button',{name:'弾けた（Y）'})).toBeVisible();
 });
 test('MIDI 設定 opens the shared panel and closing returns focus to it',async({page})=>{
  await openEndless(page);
  const button=page.getByRole('button',{name:'MIDI 設定'}).first();
  await button.click();
  await expect(page.getByTestId('midi-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
 });
});
