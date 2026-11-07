import {test,expect,type Page} from '@playwright/test';
import {openDojo,type MidiControl} from './helpers/p12';
import {emptyStore} from '../src/domain/chordDojo/store';
import {emptyMaster,targetForCell,type MasterStore,type CellKey} from '../src/domain/master251/model';

const STORAGE='loop-vault:chord-dojo-txt-jazz-v1:data';
const emit=async(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
async function transition(page:Page,previous:readonly number[],next:readonly number[]){await emit(page,previous.filter(n=>!next.includes(n)),false);await emit(page,next.filter(n=>!previous.includes(n)));}
async function saved(page:Page):Promise<MasterStore>{return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).master251,STORAGE);}
async function setup(page:Page,customize?:(master:MasterStore)=>void,held:readonly number[]=[]){const file=emptyStore();file.master251=emptyMaster();for(const id of ['A:0','B:4'] as const){file.master251.cells[id].learnedAt='2026-10-01T00:00:00Z';file.master251.cells[id].status='learning';}file.master251.session={cell:'A:0',seed:123,paused:false,mode:'recall'};customize?.(file.master251);await page.addInitScript(({key,file})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(file));},{key:STORAGE,file});await openDojo(page);if(held.length)await emit(page,held);await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase',held.length?'ready':'active');if(!held.length)await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:0');return targetForCell('A:0');}
async function completeHeld(page:Page,target:ReturnType<typeof targetForCell>){const id=`${target.form}:${target.key}` as CellKey,previous=await page.evaluate(({key,id})=>{const m=JSON.parse(localStorage.getItem(key)!).master251;return (m.selectedRange==='octave-down'?m.octaveDown:m).cells[id].attempts;},{key:STORAGE,id});await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await transition(page,target.chords[0].notes,target.chords[1].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');await transition(page,target.chords[1].notes,target.chords[2].notes);await expect.poll(()=>page.evaluate(({key,id})=>{const m=JSON.parse(localStorage.getItem(key)!).master251;return (m.selectedRange==='octave-down'?m.octaveDown:m).cells[id].attempts;},{key:STORAGE,id})).toBe(previous+1);}

test('P12.2 1 recorded success pause retains saved next cell and never repeats previous record',async({page})=>{
 const target=await setup(page);await completeHeld(page,target);
 await expect.poll(async()=> (await saved(page)).session?.cell).toBe('B:4');
 const previous=(await saved(page)).cells['A:0'];expect(previous.attempts).toBe(1);expect(previous.successes).toBe(1);
 await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
 expect((await saved(page)).session).toMatchObject({cell:'B:4',paused:true,mode:'recall'});
 await page.getByRole('button',{name:'再開（P）'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','ready');
 await expect(page.getByTestId('master251')).not.toHaveAttribute('data-cell',/./);await expect(page.locator('[data-answer-marker]')).toHaveCount(0);
 await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','B:4');
 expect((await saved(page)).cells['A:0']).toEqual(previous);
});

test('P12.2 2 active pause counts success and due date but excludes recall speed and promotion',async({page})=>{
 const target=await setup(page,m=>{m.cells['A:0'].bestRecallSec=4;});const before=(await saved(page)).cells['A:0'];
 await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');
 await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toContainText('速さは MASTER に数えません');
 await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,target.chords[0].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);
 const cell=(await saved(page)).cells['A:0'];expect(cell.attempts).toBe(before.attempts+1);expect(cell.successes).toBe(before.successes+1);expect(cell.recent.at(-1)).toMatchObject({ok:true,usedHint:false});expect(cell.recent.at(-1)).not.toHaveProperty('recallSec');expect(cell.status).toBe('learning');expect(cell.bestRecallSec).toBe(4);expect(cell.nextReviewAt).not.toBe(before.nextReviewAt);
 await expect(page.locator('.master251-feedback')).toHaveText('✓ 合いました（一時停止あり・速さは数えません）');
});

test('P12.2 2 unseen review Ready pause retains recall speed and normal promotion',async({page})=>{
 const target=await setup(page,undefined,[36]);await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toHaveCount(0);
 await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,[36],false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);
 const cell=(await saved(page)).cells['A:0'];expect(cell.recent.at(-1)?.recallSec).toBeGreaterThanOrEqual(0);expect(cell.status).toBe('passed');expect(cell.bestRecallSec).toBe(cell.recent.at(-1)?.recallSec);expect(cell.attempts).toBe(1);expect(cell.successes).toBe(1);
});

for(const point of ['active','rest'] as const)test(`P12.2 2 ${point} tempo pause preserves bpm progress but cannot qualify MASTER`,async({page})=>{
 const target=await setup(page,m=>{Object.assign(m.cells['A:0'],{status:'passed',currentBpm:80,bestRecallSec:4,qualifiedAt:'2026-10-01T00:00:00.000Z'});m.session!.mode='tempo';m.session!.bpm=80;});await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');
 if(point==='rest'){await transition(page,target.chords[0].notes,target.chords[1].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');await transition(page,target.chords[1].notes,target.chords[2].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','rest');}
 await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toBeVisible();await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,point==='rest'?target.chords[2].notes:target.chords[0].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);
 const cell=(await saved(page)).cells['A:0'];expect(cell.recent.at(-1)).toMatchObject({ok:true,bpm:80,usedHint:false});expect(cell.recent.at(-1)).not.toHaveProperty('recallSec');expect(cell.status).toBe('passed');expect(cell.bestRecallSec).toBe(4);expect(cell.currentBpm).toBe(80);expect(cell.qualifiedAt).toBe('2026-10-01T00:00:00.000Z');expect(cell.attempts).toBe(1);expect(cell.successes).toBe(1);
});

test('P12.2 3 and6 paused attempt explains restart, exposes the resume action and blocks S Space',async({page})=>{
 const target=await setup(page);await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await page.getByRole('button',{name:'一時停止（P）'}).click();
 await expect(page.locator('.master251-pause-description')).toHaveText('再開すると、このセルを最初（1つ目のコード）から弾きます。この回はまだ記録していません。');
 await expect(page.locator('.master251-identity')).toHaveText('Form A · キー C');await expect(page.locator('.master251-task button')).toHaveText(['再開（P）']);await expect(page.locator('.master251-task button.dojo-primary')).toHaveText('再開（P）');
 await expect(page.locator('.master251-score-paused')).toHaveText('一時停止中は答えを表示しません');await expect(page.locator('[data-answer-marker],[data-finger-label],[data-score-midi]')).toHaveCount(0);
 const before=await saved(page);for(const key of ['s','Space']){await page.keyboard.press(key);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');expect(await saved(page)).toEqual(before);}
 await page.keyboard.press('p');await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','ready');await emit(page,target.chords[0].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','0');
});

test('P12.2 3 recorded success explanation hides the next identity and preserves record through repeated pause',async({page})=>{
 const target=await setup(page);await completeHeld(page,target);await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-description')).toContainText('前の回（Form A · キー C）');await expect(page.locator('.master251-pause-description')).toContainText('✓ 合いました');await expect(page.locator('.master251-pause-description')).toContainText('再開して鍵盤を離すと、次の問題に進みます。');await expect(page.locator('.master251-identity')).toHaveCount(0);
 await page.getByRole('button',{name:'再開（P）'}).click();await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toHaveCount(0);expect((await saved(page)).session?.cell).toBe('B:4');await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','B:4');expect((await saved(page)).cells['A:0'].attempts).toBe(1);
});

test('P12.2 4 paused MIDI attacks are audible while judging and recording stay stopped',async({page})=>{
 await page.addInitScript(()=>{const w=window as typeof window&{__p122AudioStarts:number};w.__p122AudioStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){if(this.buffer&&this.buffer.duration>0.1)w.__p122AudioStarts++;return start.apply(this,args);};});
 await setup(page);await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');const starts=()=>page.evaluate(()=>(window as typeof window&{__p122AudioStarts:number}).__p122AudioStarts);const before=await starts();await emit(page,[36]);await expect.poll(starts).toBe(before+1);await page.waitForTimeout(1400);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');expect((await saved(page)).cells['A:0'].attempts).toBe(0);await emit(page,[36],false);
});

test('P12.2 5 saved paused session reopens unpaused on the same cell and waits for release',async({page})=>{
 await setup(page,m=>{m.session!.paused=true;},[36]);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','ready');expect((await saved(page)).session).toMatchObject({cell:'A:0',paused:false});await emit(page,[36],false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:0');
});

// P12.4-01: Esc steps one level outward. The first Esc pauses, an open dialog closes first, and a second Esc (paused) goes back.
test('P12.2 12 Escape pauses, respects an open dialog, and the next Escape on a paused Master goes back',async({page})=>{
 await setup(page);await page.keyboard.press('Escape');await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
 await page.getByRole('button',{name:'MIDI 設定',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
 await page.keyboard.press('Escape');await expect(page.getByTestId('master251')).toHaveCount(0);
});

test('P12.2 1 wrong feedback pause preserves its recorded failure and same-cell retry',async({page})=>{
 const target=await setup(page),wrong=target.chords[0].notes.map(n=>n+12);await emit(page,wrong);await expect.poll(async()=> (await saved(page)).cells['A:0'].attempts).toBe(1);await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-description')).toContainText('✗ 合いませんでした');const cell=(await saved(page)).cells['A:0'];expect(cell.successes).toBe(0);await page.getByRole('button',{name:'再開（P）'}).click();await expect(page.locator('[data-answer-marker],[data-score-midi]')).toHaveCount(0);await emit(page,wrong,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:0');expect((await saved(page)).cells['A:0']).toEqual(cell);
});

test('P12.2 1 pause flushes feedback reached by the final MIDI batch before the recording timer',async({page})=>{
 const target=await setup(page);await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await transition(page,target.chords[0].notes,target.chords[1].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');
 const attemptsBeforePause=await page.evaluate(({previous,next,key})=>{const midi=(window as typeof window&{__p12Midi:MidiControl}).__p12Midi;midi.emit(previous.filter(n=>!next.includes(n)),false);midi.emit(next.filter(n=>!previous.includes(n)),true);const end=performance.now()+80;while(performance.now()<end){/* Keep the synthetic settle deadline and following UI key in one event-loop task. */}midi.pedal(false);const attempts=JSON.parse(localStorage.getItem(key)!).master251.cells['A:0'].attempts;document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'p',code:'KeyP',bubbles:true}));return attempts;},{previous:[...target.chords[1].notes],next:[...target.chords[2].notes],key:STORAGE});
 expect(attemptsBeforePause).toBe(0);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');await expect(page.locator('.master251-pause-description')).toContainText('✓ 合いました');await expect.poll(async()=> (await saved(page)).session?.cell).toBe('B:4');const cell=(await saved(page)).cells['A:0'];expect(cell.attempts).toBe(1);expect(cell.successes).toBe(1);await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','B:4');expect((await saved(page)).cells['A:0']).toEqual(cell);
});

test('P12.2 3 paused storage error keeps its explanation but only two action buttons',async({page})=>{
 await setup(page);await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name.startsWith(key))throw new DOMException('Synthetic storage failure','QuotaExceededError');return set.call(this,name,value);};},STORAGE);await page.keyboard.press('Escape');await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');await expect(page.getByTestId('master251').getByRole('alert')).toContainText('練習記録を保存できません');await expect(page.getByRole('button',{name:'保存をもう一度'})).toHaveCount(0);await expect(page.locator('.master251 > .master251-layout > :not(header) button')).toHaveText(['再開（P）']);
});

test('P12.2 3 paused input audio error keeps its explanation but only two action buttons',async({page})=>{
 await page.route('**/*.mp3',route=>route.abort());await setup(page);await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','error',{timeout:15000});await page.keyboard.press('Escape');await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');await expect(page.getByTestId('master251').getByRole('alert')).toContainText('入力音を開始できません');await expect(page.getByRole('button',{name:'入力音をもう一度'})).toHaveCount(0);await expect(page.locator('.master251 > .master251-layout > :not(header) button')).toHaveText(['再開（P）']);
});

test('P12.2 1 last learning cell pause moves to empty pool without recording twice',async({page})=>{
 const target=await setup(page,m=>{for(const c of Object.values(m.cells))c.learnedAt='2026-10-01T00:00:00Z';delete m.cells['A:0'].learnedAt;m.practice={version:1,kind:'learning',form:'A',scope:'A',learningPositions:{A:0,B:12,C:12,D:12},learningStages:{A:'recall',B:'study',C:'study',D:'study'}};});await completeHeld(page,target);await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-description')).toContainText('次の問題はありません');expect((await saved(page)).session).toBeUndefined();await page.getByRole('button',{name:'再開（P）'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','empty');expect((await saved(page)).cells['A:0'].successes).toBe(1);expect((await saved(page)).cells['A:0'].attempts).toBe(1);
});

test('P12.2 2 visible learning Ready pause is marked for speed exclusion',async({page})=>{
 const target=await setup(page,m=>{delete m.cells['A:0'].learnedAt;m.cells['A:0'].status='new';m.session!.mode='learn';},[36]);await expect(page.getByTestId('master251')).toHaveAttribute('data-mode','learn');await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toBeVisible();await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,[36],false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);expect((await saved(page)).cells['A:0'].recent.at(-1)).not.toHaveProperty('recallSec');
});

test('P12.2 2 next learning answer waits for physical release even after resume and another pause',async({page})=>{
 const target=await setup(page,m=>{delete m.cells['A:0'].learnedAt;m.practice={version:1,kind:'learning',form:'A',scope:'A',learningPositions:{A:0,B:0,C:0,D:0},learningStages:{A:'recall',B:'study',C:'study',D:'study'}};});await completeHeld(page,target);await page.getByRole('button',{name:'一時停止（P）'}).click();expect((await saved(page)).session).toMatchObject({cell:'A:10',mode:'learn',paused:true});
 for(let round=0;round<2;round++){await page.getByRole('button',{name:'再開（P）'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','ready');await expect(page.getByTestId('master251')).not.toHaveAttribute('data-cell',/./);await expect(page.locator('[data-answer-marker],[data-score-midi],[data-finger-label]')).toHaveCount(0);if(round===0){await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-pause-warning')).toHaveCount(0);}}
 await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:10');await completeHeld(page,targetForCell('A:10'));expect((await saved(page)).cells['A:10'].recent.at(-1)).toHaveProperty('recallSec');
});

test('P12.2 2 pause keeps hint assistance across a restart and clears its speed mark after recording',async({page})=>{
 const target=await setup(page);await page.getByRole('button',{name:/ヒント（Space）/}).click();await page.getByRole('button',{name:'一時停止（P）'}).click();await page.getByRole('button',{name:'再開（P）'}).click();await expect(page.locator('[data-answer-marker]')).toHaveCount(0);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);let cell=(await saved(page)).cells['A:0'];expect(cell.recent.at(-1)).toMatchObject({ok:true,usedHint:true});expect(cell.recent.at(-1)).not.toHaveProperty('recallSec');expect(cell.status).toBe('learning');await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await completeHeld(page,target);cell=(await saved(page)).cells['A:0'];expect(cell.recent.at(-1)).toMatchObject({ok:true,usedHint:false});expect(cell.recent.at(-1)).toHaveProperty('recallSec');expect(cell.successes).toBe(2);expect(cell.status).toBe('passed');
});

for(const change of ['skip','choose','kind','range','exit'] as const)test(`P12.2 2 ${change} clears the interrupted speed mark`,async({page})=>{
 const target=await setup(page,m=>{m.octaveDown={version:1,cells:structuredClone(m.cells),session:structuredClone(m.session!)};});await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await page.getByRole('button',{name:'一時停止（P）'}).click();await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,target.chords[0].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');
 if(change==='skip')await page.getByRole('button',{name:'とばす（S）'}).click();
 if(change==='choose'){await page.locator('.master251-records>summary').click();await page.getByRole('button',{name:'自分でセルを選ぶ'}).click();await page.getByRole('button',{name:'Form A C',exact:true}).click();await page.locator('.master251-records>summary').click();}
 if(change==='kind')await page.getByLabel('Masterの練習').selectOption('mixed');
 if(change==='range')await page.getByLabel('Masterの音域').selectOption('octave-down');
 if(change==='exit'){await page.getByTestId('dojo-back').click();await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();}
 await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');const id=await page.getByTestId('master251').getAttribute('data-cell') as CellKey;const next=targetForCell(id),offset=change==='range'?-12:0;await completeHeld(page,{...next,chords:next.chords.map(c=>({...c,notes:c.notes.map(n=>n+offset)})) as unknown as typeof next.chords});const m=await saved(page),cell=(change==='range'?m.octaveDown!:m).cells[id];expect(cell.recent.at(-1)).toHaveProperty('recallSec');expect(cell.recent.at(-1)?.ok).toBe(true);
});


test('P12.2 7 one hint reveals every guide silently and only explicit listen attacks audio',async({page})=>{
 await page.addInitScript(()=>{const w=window as typeof window&{__p122AudioStarts:number};w.__p122AudioStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){if(this.buffer&&this.buffer.duration>0.1)w.__p122AudioStarts++;return start.apply(this,args);};});
 await setup(page);await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');const starts=()=>page.evaluate(()=>(window as typeof window&{__p122AudioStarts:number}).__p122AudioStarts);const before=await starts();await page.getByRole('button',{name:'ヒント（Space）',exact:true}).click();
 await expect(page.locator('.master251-current-chord')).toHaveText('Dm9');await expect(page.locator('.master251-note-names')).toContainText('D4');await expect(page.locator('[data-finger-label]')).toHaveCount(5);await expect(page.locator('[data-score-midi]')).not.toHaveCount(0);await expect(page.locator('[data-answer-marker]')).not.toHaveCount(0);await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle');await expect(page.getByTestId('master251')).not.toContainText('/4');await page.waitForTimeout(150);expect(await starts()).toBe(before);
 const listen=page.getByRole('button',{name:'お手本を聴く（Space）',exact:true});for(let i=0;i<3;i++){const prior=await starts();if(i===0){await page.locator('.master251-identity').click();await page.keyboard.press('Space');}else await listen.click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');await expect.poll(starts).toBeGreaterThan(prior);await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle',{timeout:10000});const ended=await starts();await page.waitForTimeout(100);expect(await starts()).toBe(ended);}
 expect((await saved(page)).cells['A:0'].attempts).toBe(0);await page.getByRole('button',{name:'同じセルを最初から弾く'}).click();await expect(page.getByRole('button',{name:'ヒント（Space）',exact:true})).toBeVisible();await expect(page.locator('[data-answer-marker]')).toHaveCount(0);
});

test('P12.2 7 next chord resets hint and hinted success displays qualification warning',async({page})=>{
 const target=await setup(page);await page.getByRole('button',{name:'ヒント（Space）',exact:true}).click();await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await expect(page.getByRole('button',{name:'ヒント（Space）',exact:true})).toBeVisible();await expect(page.locator('[data-answer-marker],[data-score-midi],[data-finger-label]')).toHaveCount(0);await transition(page,target.chords[0].notes,target.chords[1].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');await transition(page,target.chords[1].notes,target.chords[2].notes);await expect.poll(async()=> (await saved(page)).cells['A:0'].attempts).toBe(1);await expect(page.locator('.master251-hint-warning')).toHaveText('ヒントを使った回は MASTER に数えません');expect((await saved(page)).cells['A:0'].recent.at(-1)).toMatchObject({ok:true,usedHint:true});expect((await saved(page)).cells['A:0'].status).toBe('learning');
});

for(const kind of ['learning','review','tempo','mixed'] as const)test(`P12.2 8 ${kind} completed chord check preserves hidden recall name and clears on pause`,async({page})=>{
 const target=await setup(page,m=>{if(kind==='learning'){delete m.cells['A:0'].learnedAt;m.session!.mode='learn';}if(kind==='tempo'){m.cells['A:0'].status='passed';m.cells['A:0'].currentBpm=60;m.session!.mode='tempo';m.session!.bpm=60;}if(kind==='mixed'){delete m.cells['B:4'].learnedAt;m.practice={version:1,kind:'mixed',form:'A',scope:'all',learningPositions:{A:0,B:0,C:0,D:0}};}});
 await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');const card=page.locator('.master251-chords button').first();await expect(card.locator('small')).toHaveText('✓');if(kind!=='learning')await expect(card.locator('b')).toHaveText('1');await expect(card.locator('small')).toHaveCSS('color','rgb(95, 211, 154)');await expect(card.locator('small')).toHaveCSS('font-size','14px');await expect(card.locator('small')).toHaveCSS('font-weight','700');await page.getByRole('button',{name:'一時停止（P）'}).click();await expect(page.locator('.master251-completed')).toHaveCount(0);await page.getByRole('button',{name:'再開（P）'}).click();await emit(page,target.chords[0].notes,false);await expect(page.locator('.master251-completed')).toHaveCount(0);
});

test('P12.2 9 and10 tempo identity and beat feedback omit seconds without altering stored recall',async({page})=>{
 const target=await setup(page,m=>{m.cells['A:0'].status='passed';m.cells['A:0'].currentBpm=60;m.session!.mode='tempo';m.session!.bpm=60;});await expect(page.locator('.master251-identity')).toContainText('テンポで確認 · 60 BPM');await expect(page.locator('.master251-tempo-label')).toHaveCSS('margin-left','6px');await expect(page.locator('.master251-response')).not.toContainText(/\d+\.\d+s/);await emit(page,target.chords[0].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await expect(page.getByTestId('master251-beats')).toBeVisible();await expect(page.locator('.master251-feedback')).toHaveText('');await transition(page,target.chords[0].notes,target.chords[1].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');await transition(page,target.chords[1].notes,target.chords[2].notes);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','rest');await expect(page.locator('.master251-response')).not.toContainText(/\d+\.\d+s/);await expect.poll(async()=> (await saved(page)).cells['A:0'].attempts).toBe(1);await expect(page.locator('.master251-feedback')).toContainText('合いました');await expect(page.locator('.master251-response')).not.toContainText(/\d+\.\d+s/);const cell=(await saved(page)).cells['A:0'];expect(cell.recent.at(-1)).toMatchObject({ok:true,bpm:60,usedHint:false});expect(cell.recent.at(-1)?.recallSec).toBeGreaterThanOrEqual(0);
});

test('P12.2 11 flat note display and its accessibility names use musical flat glyph',async({page})=>{
 await setup(page,m=>{m.cells['A:3'].learnedAt='2026-10-01T00:00:00Z';m.cells['A:3'].status='learning';});await page.locator('.master251-records>summary').click();await page.getByRole('button',{name:'自分でセルを選ぶ'}).click();await page.getByRole('button',{name:'Form A E♭',exact:true}).click();await page.locator('.master251-records>summary').click();await page.getByRole('button',{name:'ヒント（Space）',exact:true}).click();const row=page.locator('.master251-note-names');await expect(row).toContainText('♭');const label=await row.innerText();await expect(row).toHaveAttribute('aria-label',label);await expect(row).toHaveAttribute('title',label);await expect(page.getByTestId('master251')).not.toContainText(/\b[A-G]b\d/);
});


test('P12.2 8 completed checks disappear on the next selected cell',async({page})=>{
 const target=await setup(page);await completeHeld(page,target);await expect(page.locator('.master251-completed')).toHaveCount(2);await emit(page,target.chords[2].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','B:4');await expect(page.locator('.master251-completed')).toHaveCount(0);await expect(page.locator('.master251-chords small')).toHaveText(['—','—','—']);
});
