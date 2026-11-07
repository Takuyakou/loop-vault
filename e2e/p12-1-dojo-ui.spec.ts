import {emptyMaster,type CellKey} from '../src/domain/master251/model';
import {test,expect,type Page} from '@playwright/test';
import {dateKey,emptyStore,emptyItem,type Task,type DojoStore} from '../src/domain/chordDojo/store';
import {openDojo,seed,type MidiControl} from './helpers/p12';

const SHAPE:Task={kind:'shape',key:'preset:basic|close|self|any:quality:maj',quality:'maj',preset:'basic',bass:'self',review:false,roots:[0,5,2],seconds:60};
const PROGRESSION:Task={kind:'progression',key:'builtin:i-v-vi-iv:1',review:true,roots:[0],seconds:120};
export function practiceFile(task:Task=SHAPE,stage:NonNullable<DojoStore['today']>['cursor']['stage']='recall'){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 if(task.kind==='progression')f.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
export async function startPractice(page:Page,f=practiceFile(),mode='midi'){
 await seed(page,f);await openDojo(page,mode);await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
}
export const readDojo=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('loop-vault:chord-dojo-txt-jazz-v1:data')!) as DojoStore);
async function emit(page:Page,notes:number[],on=true){await page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes,on});}
async function freeKey(page:Page,key:string){await page.locator('body').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});await page.keyboard.press(key);}

test('P12.1 §1 practice MIDI settings belongs to the flow and opens settings',async({page})=>{
 await startPractice(page);await expect(page.locator('.dojo-actions').getByRole('button',{name:'MIDI 設定',exact:true})).toHaveCount(0);
 const midi=page.locator('.dojo-flow').getByRole('button',{name:'MIDI 設定',exact:true});await expect(midi).toHaveCount(1);await expect(midi).toHaveCSS('height','30px');
 await midi.click();await expect(page.getByTestId('midi-panel')).toBeVisible();await expect(page.locator('[data-dojo-screen=practice]')).toHaveCount(1);
});
for(const [width,height,font,limit] of [[1440,900,72,90],[1920,1080,96,140]])test('P12.1 §2 shape recall centered height tier '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startPractice(page);
 const measured=await page.locator('.dojo-center').evaluate(e=>{const r=e.getBoundingClientRect(),first=e.firstElementChild!.getBoundingClientRect(),last=e.lastElementChild!.getBoundingClientRect();return {top:first.top-r.top,bottom:r.bottom-last.bottom,scrollTop:document.getElementById('main-content')!.scrollTop};});
 console.info('P12.1 center',width,height,JSON.stringify(measured));expect(measured.scrollTop).toBe(0);expect(measured.top).toBeLessThanOrEqual(limit);expect(measured.bottom).toBeLessThanOrEqual(limit);expect(Math.abs(measured.top-measured.bottom)).toBeLessThanOrEqual(16);
 await expect(page.locator('.dojo-prompt')).toHaveCSS('font-size',font+'px');await expect(page.locator('.dojo-task-context')).toHaveCSS('gap','8px');await expect(page.locator('.dojo-keyboard svg')).toHaveCSS('height',height>1000?'150px':'128px');
});
for(const [width,height] of [[1366,768],[1280,720]])test('P12.1 §2 short screen retains whole 128px keyboard and primary '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startPractice(page,practiceFile(SHAPE,'see'),'no-midi');
 const measured=await page.evaluate(()=>{const main=document.getElementById('main-content')!,r=main.getBoundingClientRect(),k=document.querySelector('.dojo-keyboard svg')!.getBoundingClientRect(),b=document.querySelector('.dojo-actions .dojo-primary')!.getBoundingClientRect();return {mainTop:r.top,mainBottom:r.bottom,scrollTop:main.scrollTop,keysTop:k.top,keysBottom:k.bottom,keysHeight:k.height,primaryTop:b.top,primaryBottom:b.bottom};});
 console.info('P12.1 short',width,height,JSON.stringify(measured));expect(measured.scrollTop).toBe(0);expect(measured.keysHeight).toBe(128);expect(measured.keysTop).toBeGreaterThanOrEqual(measured.mainTop);expect(measured.keysBottom).toBeLessThanOrEqual(measured.mainBottom);
 expect(measured.primaryTop).toBeGreaterThanOrEqual(measured.mainTop);expect(measured.primaryBottom).toBeLessThanOrEqual(measured.mainBottom);
});
test('P12.1 §3 wrong shape actions start with retry and end with skip',async({page})=>{
 await startPractice(page);await emit(page,[48,60,64,68]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','false');
 await expect(page.locator('.dojo-actions button')).toHaveText(['もう一度（Enter）','お手本を聴く（L）','もう一度見る','とばす']);
});
test('P12.1 §4 seconds appear once on recall success and never on wrong or see',async({page})=>{
 await startPractice(page,practiceFile(SHAPE,'see'));await expect(page.locator('.dojo-timer')).toHaveCount(0);await emit(page,[48,60,64,67]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','true');await expect(page.locator('.dojo-feedback-row')).not.toContainText(/\d+\.\ds/);
 await emit(page,[48,60,64,67],false);await page.getByRole('button',{name:'次へ（Enter）',exact:true}).click();await expect(page.locator('.dojo-timer')).toContainText(/\d+\.\ds/);
 await emit(page,[48,60,64,68]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','false');expect((await page.locator('.dojo-feedback-row').innerText()).match(/\d+\.\ds/g)??[]).toHaveLength(0);
 await page.getByRole('button',{name:'もう一度（Enter）'}).click();await emit(page,[48,60,64,68],false);await emit(page,[48,60,64,67]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','true');expect((await page.locator('.dojo-feedback-row').innerText()).match(/\d+\.\ds/g)??[]).toHaveLength(1);
});
test('P12.1 §5 builtin automatic hint reveals the current name while score and guide stay hidden',async({page})=>{
 const f=practiceFile(PROGRESSION);f.settings.degrees=true;await startPractice(page,f);await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['1','2','3','4']);
 await expect(page.locator('.dojo-result')).toHaveText('1番目は C です。最初には戻らず続けます',{timeout:7000});await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['C','2','3','4']);await expect(page.locator('.dojo-chord-cards>button').first()).toContainText('ヒント');
 await expect(page.locator('.dojo-chord-cards>button').first().locator('small')).toHaveText(['ヒント']);await expect(page.locator('.dojo-score-hidden')).toBeVisible();await expect(page.locator('[data-answer-marker],[data-finger-label],[data-score-midi]')).toHaveCount(0);
 await expect.poll(async()=> (await readDojo(page)).today!.cursor.hints).toEqual([0]);expect((await readDojo(page)).today!.cursor.answerSeen).toBe(true);
 await freeKey(page,'Space');await expect(page.locator('[data-score-midi]').first()).toBeVisible();expect(await page.locator('[data-answer-marker]').count()).toBeGreaterThan(0);await expect(page.locator('.dojo-chord-cards>button').first().locator('small')).toHaveText(['ヒント','I']);
 await emit(page,[48,60,64,67]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','true');await page.getByRole('button',{name:'次へ（Enter）',exact:true}).click();await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['1','2','3','4']);await expect(page.locator('[data-answer-marker],[data-score-midi],[data-finger-label]')).toHaveCount(0);
});
test('P12.1 §6 explicit look and audition reveal the current answer and retry clears it',async({page})=>{
 await startPractice(page);await page.getByRole('button',{name:'もう一度見る'}).click();await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true');
 await emit(page,[48,60,64,68]);await expect(page.locator('.dojo-result')).toHaveAttribute('data-ok','false');await page.getByRole('button',{name:'もう一度（Enter）'}).click();await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','false');
 await page.getByRole('button',{name:'お手本を聴く（L）'}).click();await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true');
});
test('P12.1 §7 partial tempo marks numbered cards and puts two answer buttons before skip',async({page})=>{
 const f=practiceFile(PROGRESSION,'tempo');f.settings.progBpm=120;await startPractice(page,f);await page.getByRole('button',{name:'テンポで始める（Space）'}).click();const chords=[{notes:[48,60,64,67]},{notes:[43,59,62,67]},{notes:[45,60,64,67]},{notes:[41,60,64,69]}];
 for(let i=0;i<4;i++){await expect(page.locator('.dojo-chord-cards [data-current=true] strong')).toHaveText(String(i+1));if(i%2===0){await emit(page,chords[i].notes);await page.waitForTimeout(110);await emit(page,chords[i].notes,false);}}
 await expect(page.getByTestId('dojo-tempo-result')).toContainText('2/4 合いました',{timeout:10000});await expect(page.locator('.dojo-chord-cards [data-result=ok]')).toHaveCount(2);await expect(page.locator('.dojo-chord-cards [data-result=ng]')).toHaveCount(2);await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['1','2','3','4']);await expect(page.locator('.dojo-result')).toHaveAttribute('data-partial','true');
 await expect(page.locator('.dojo-actions button')).toHaveText(['結果を確認して次へ','2番目の答えを見る','4番目の答えを見る','とばす']);await expect(page.locator('.dojo-actions details')).toHaveCount(0);
 const state=await readDojo(page);expect(state.today!.cursor.tempoResults).toEqual([true,false,true,false]);expect(state.today!.taskResults![0]).toMatchObject({attempts:4,matches:2,completed:false,lastResult:false});
 await page.getByRole('button',{name:'2番目の答えを見る'}).click();await expect(page.getByTestId('dojo-score')).toHaveAttribute('data-score-visible','true');await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['1','2','3','4']);await page.getByRole('button',{name:'結果を確認して次へ'}).click();await expect(page.locator('.dojo-chord-cards [data-result]')).toHaveCount(0);
});
test('P12.1 §19 composition recall has one stage label and only the freedom chip',async({page})=>{
 const task:Task={kind:'composition',key:'quality:maj',quality:'maj',roots:[0],review:true,seconds:20};await startPractice(page,practiceFile(task,'composition'));
 await expect(page.locator('.dojo-center').getByText('構成を思い出す',{exact:true})).toHaveCount(1);await expect(page.locator('.dojo-chips .dojo-chip')).toHaveText(['オクターブ・順番・一番下は自由']);
});

async function startMaster(page:Page,mode:'learn'|'recall'|'tempo'='recall',cell:CellKey='A:0'){
 const f=emptyStore();f.master251=emptyMaster();if(mode!=='learn')for(const c of Object.values(f.master251.cells)){c.learnedAt='2026-10-01T00:00:00Z';c.status=mode==='tempo'?'passed':'learning';c.currentBpm=mode==='tempo'?80:undefined;}
 f.master251.session={cell,seed:123,paused:false,mode,bpm:mode==='tempo'?80:undefined};await seed(page,f);await openDojo(page);await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-cell',cell);
}
test('P12.1 §1 Master MIDI settings pauses and opens the MIDI panel',async({page})=>{
 await startMaster(page);await expect(page.locator('.master251-task .dojo-actions').getByRole('button',{name:'MIDI 設定'})).toHaveCount(0);await expect(page.locator('.master251-header').getByRole('button',{name:'MIDI 設定'})).toHaveCount(1);await expect(page.locator('.master251-midi')).toHaveCSS('height','30px');await page.locator('.master251-midi').click();await expect(page.getByTestId('midi-panel')).toBeVisible();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
});
for(const [width,height] of [[1440,900],[960,1032],[768,640]])test('P12.1 §8 Master header aligned '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startMaster(page,'learn');const m=await page.locator('.master251-header').evaluate(e=>{const r=e.getBoundingClientRect();const box=(selector:string)=>{const b=e.querySelector(selector)!.getBoundingClientRect();return {top:b.top,bottom:b.bottom,center:(b.top+b.bottom)/2};};return {height:r.height,title:box('.master251-title'),midi:box('.master251-midi'),records:box('.master251-records>summary'),back:box('[data-testid=dojo-back]'),select:box('.master251-stage select'),selectCenters:[...e.querySelectorAll('.master251-stage select')].map(el=>{const b=el.getBoundingClientRect();return (b.top+b.bottom)/2;}),description:box('.master251-stage-description')};});console.info('P12.1 Master header',width,height,JSON.stringify(m));if(width===1440){expect(m.height).toBe(42);const centers=[...m.selectCenters,m.description.center,m.midi.center,m.records.center,m.back.center];expect(Math.max(...centers)-Math.min(...centers)).toBeLessThanOrEqual(1);}else{const tops=[m.title.top,m.midi.top,m.records.top,m.back.top];expect(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(2);expect(m.select.top).toBeGreaterThan(m.title.bottom);expect(m.description.top).toBe(m.select.top);}
});
test('P12.1 §9 Master reserved rows keep the keyboard stable across hidden hint and wrong',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await startMaster(page);await expect(page.locator('.master251-identity')).toHaveText('Form A · キー C');await expect(page.locator('.master251-current-chord')).toHaveText('?');await expect(page.locator('.master251-current-chord')).toHaveAttribute('aria-label','1番目のコード');await expect(page.locator('.master251-current-chord')).toHaveCSS('font-size','64px');const positions=[await page.locator('.master251-keyboard').evaluate(e=>e.getBoundingClientRect().top)];await freeKey(page,'Space');await expect(page.locator('.master251-current-chord')).toHaveText('Dm9');positions.push(await page.locator('.master251-keyboard').evaluate(e=>e.getBoundingClientRect().top));await emit(page,[63,78,82,85,89]);await expect(page.locator('.master251-feedback')).toContainText('余分：');positions.push(await page.locator('.master251-keyboard').evaluate(e=>e.getBoundingClientRect().top));console.info('P12.1 Master keyboard positions',JSON.stringify(positions));expect(Math.max(...positions)-Math.min(...positions)).toBeLessThanOrEqual(1);
});
test('P12.1 §10 Master wrong notes are fixed at judging and have no seconds',async({page})=>{
 await startMaster(page);await emit(page,[63,78,82,85,89]);await expect(page.locator('.master251-feedback')).toHaveText('✗ 余分：E♭4 · G♭5 · B♭5 ほか2音 ／ 足りない：D4 · F5 · A5 ほか2音');const text=await page.locator('.master251-feedback').innerText();expect(text).not.toMatch(/\d+\.\d+s/);await emit(page,[63,78,82,85,89],false);await expect(page.locator('.master251-feedback')).toHaveText(text);
});
test('P12.1 §11 Learn has no hint action and recall and tempo keep their ordered controls',async({page})=>{
 await startMaster(page,'learn');await expect(page.locator('.master251-task .dojo-actions button')).toHaveText(['お手本を聴く','進行を聞く','一時停止（P）','弾き直す（S）']);await freeKey(page,'Space');await expect(page.locator('.master251-task .dojo-actions').getByRole('button',{name:/ヒント/})).toHaveCount(0);await emit(page,[62,77,81,84,88]);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');await emit(page,[62,77,81,84,88],false);await emit(page,[67,77,81,83,88]);await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');await emit(page,[67,77,81,83,88],false);await emit(page,[60,76,81,83,86]);await expect.poll(async()=> (await readDojo(page)).master251!.cells['A:0'].recent[0]).toMatchObject({ok:true,usedHint:true});
});
test('P12.1 §11 Recall controls put hint first and skip last',async({page})=>{await startMaster(page);await expect(page.locator('.master251-task .dojo-actions button')).toHaveText(['ヒント（Space）','進行を聞く','一時停止（P）','とばす（S）']);});
test('P12.1 §11 Tempo metronome follows pause',async({page})=>{await startMaster(page,'tempo');await expect(page.locator('.master251-task .dojo-actions button')).toHaveText(['ヒント（Space）','進行を聞く','一時停止（P）','メトロノーム OFF','とばす（S）']);});
test('P12.1 §18 Master flat labels cover the table manual choices and prompt',async({page})=>{await startMaster(page,'recall','A:3');await expect(page.locator('.master251-identity')).toHaveText('Form A · キー E♭');await page.locator('.master251-records>summary').click();for(const name of ['D♭','E♭','A♭','B♭','F#']){await expect(page.locator('.master251-grid').getByRole('img',{name:'Form A '+name+' 練習中',exact:true})).toHaveCount(1);}await page.getByRole('button',{name:'自分でセルを選ぶ'}).click();await expect(page.locator('.master251-manual').getByRole('button',{name:'Form A E♭',exact:true})).toBeEnabled();await expect(page.locator('.master251-grid')).not.toContainText(/Db|Eb|Ab|Bb/);});

for(const [width,height,font] of [[1280,720,40],[1366,768,40],[1440,900,64],[1920,1080,80]])test('P12.1 §9 Master rows never overlap the score and retain whole keyboard '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startMaster(page,'learn');await expect(page.locator('.master251-current-chord')).toHaveCSS('font-size',font+'px');const m=await page.evaluate(()=>{const box=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};const main=document.getElementById('main-content')!;return {main:box('#main-content'),actions:box('.master251-task>.dojo-actions'),score:box('.master251-practice>[data-testid=dojo-score]'),keyboard:box('.master251-keyboard svg'),scrollTop:main.scrollTop,horizontal:main.scrollWidth-main.clientWidth};});console.info('P12.1 Master reserved rows',width,height,JSON.stringify(m));expect(m.actions.bottom).toBeLessThanOrEqual(m.score.top);expect(m.actions.top).toBeGreaterThanOrEqual(m.main.top);expect(m.keyboard.top).toBeGreaterThanOrEqual(m.main.top);expect(m.keyboard.bottom).toBeLessThanOrEqual(m.main.bottom);expect(m.keyboard.height).toBe(128);expect(m.scrollTop).toBe(0);expect(m.horizontal).toBe(0);
});

test('P12.1 §11 Learn Space keeps the native scroll position and suppresses its default action',async({page})=>{
 await page.setViewportSize({width:768,height:640});
 await startMaster(page,'learn');
 const scrollTop=await page.locator('#main-content').evaluate(e=>e.scrollTop);
 expect(scrollTop).toBe(0);
 await page.evaluate(()=>window.addEventListener('keydown',ev=>{if(ev.code==='Space')queueMicrotask(()=>{(window as typeof window&{__p121SpacePrevented?:boolean}).__p121SpacePrevented=ev.defaultPrevented;});}));
 // R-01 §2: press once. The Space receiver is attached by React's post-commit pass; the failing FULL run raced it
 // (the press was recorded as un-suppressed). Two painted frames settle that pass before the one press — the flag
 // assertion below still checks the actual suppression, so a receiver that truly never attaches still fails.
 await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
 await freeKey(page,'Space');
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__p121SpacePrevented?:boolean}).__p121SpacePrevented)).toBe(true);
 await expect.poll(()=>page.locator('#main-content').evaluate(e=>e.scrollTop)).toBe(scrollTop);
 await expect(page.locator('.master251-task .dojo-actions').getByRole('button',{name:/ヒント/})).toHaveCount(0);
 await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','0');
 expect((await readDojo(page)).master251!.cells['A:0'].attempts).toBe(0);
});

for(const master of [false,true])test('P12.1 §12 narrow tall keyboard docks at main bottom '+(master?'Master':'shape'),async({page})=>{
 await page.setViewportSize({width:960,height:1032});if(master)await startMaster(page,'learn');else await startPractice(page);
 const m=await page.evaluate(master=>{const main=document.getElementById('main-content')!,r=main.getBoundingClientRect(),k=document.querySelector(master?'.master251-keyboard':'.dojo-keyboard')!.getBoundingClientRect();return {mainBottom:r.bottom,keyboardBottom:k.bottom,gap:r.bottom-k.bottom,scrollTop:main.scrollTop,horizontal:main.scrollWidth-main.clientWidth};},master);
 console.info('P12.1 docked narrow',master,JSON.stringify(m));expect(m.scrollTop).toBe(0);expect(Math.abs(m.gap)).toBeLessThanOrEqual(8);expect(m.horizontal).toBe(0);
});
for(const master of [false,true])test('P12.1 §12 short narrow retains native scroll and no horizontal overflow '+(master?'Master':'shape'),async({page})=>{
 await page.setViewportSize({width:768,height:640});if(master)await startMaster(page,'learn');else await startPractice(page);
 const m=await page.locator('#main-content').evaluate(e=>({horizontal:e.scrollWidth-e.clientWidth,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:getComputedStyle(e).overflowY}));console.info('P12.1 small native scroll',master,JSON.stringify(m));expect(m.horizontal).toBe(0);expect(m.scrollTop).toBe(0);expect(m.overflow).toMatch(/auto|scroll/);expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);
});
for(const [width,height] of [[960,1032],[768,640]])test('P12.1 §8 narrow open records uses full header width and closes back to two rows '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startMaster(page,'learn');const header=page.locator('.master251-header'),before=await header.boundingBox();await page.locator('.master251-records>summary').click();await expect(page.locator('.master251-grid')).toBeVisible();
 const m=await header.evaluate(e=>{const h=e.getBoundingClientRect(),p=e.querySelector('.master251-progress')!.getBoundingClientRect(),stage=e.querySelector('.master251-stage')!.getBoundingClientRect(),main=document.getElementById('main-content')!;return {headerWidth:h.width,panelWidth:p.width,panelTop:p.top,stageBottom:stage.bottom,headerBottom:h.bottom,horizontal:main.scrollWidth-main.clientWidth};});console.info('P12.1 narrow open records',width,height,JSON.stringify(m));expect(m.panelWidth).toBeGreaterThanOrEqual(m.headerWidth-26);expect(m.panelTop).toBeGreaterThanOrEqual(m.stageBottom);expect(m.headerBottom).toBeGreaterThanOrEqual(m.panelTop);expect(m.horizontal).toBe(0);await expect(page.locator('.master251-grid [role=img]')).toHaveCount(48);
 await page.locator('.master251-records>summary').click();const after=await header.boundingBox();expect(after!.height).toBe(before!.height);expect(after!.y).toBe(before!.y);await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:0');
});
for(const [width,height] of [[960,1032],[768,640]])test('P12.1 §10 narrow wrong feedback stays above its actions '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await startMaster(page);await emit(page,[63,78,82,85,89]);await expect(page.locator('.master251-feedback')).toContainText('足りない：');const m=await page.evaluate(()=>{const feedback=document.querySelector('.master251-feedback')!.getBoundingClientRect(),actions=document.querySelector('.master251-task>.dojo-actions')!.getBoundingClientRect(),main=document.getElementById('main-content')!;return {feedbackTop:feedback.top,feedbackBottom:feedback.bottom,actionsTop:actions.top,horizontal:main.scrollWidth-main.clientWidth};});console.info('P12.1 narrow wrong feedback',width,height,JSON.stringify(m));expect(m.feedbackBottom).toBeLessThanOrEqual(m.actionsTop);expect(m.horizontal).toBe(0);
});
test('P12.1 §13 home has one primary start and an outlined Master continue',async({page})=>{
 await openDojo(page);await expect(page.locator('[data-dojo-screen=home] .dojo-primary:visible')).toHaveCount(1);const button=page.getByRole('button',{name:'2-5-1 Master 続きから'});await expect(button).toHaveClass('master251-continue');await expect(button).toHaveCSS('height','40px');await expect(button).toHaveCSS('font-size','14px');await expect(button).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});
test('P12.1 §14 zero task rows are dim in the overview and expanded plan',async({page})=>{
 await startPractice(page);await page.getByTestId('dojo-back').click();await expect(page.locator('.dojo-home-steps>[data-empty=true]')).toHaveCount(3);for(const row of await page.locator('.dojo-home-steps>[data-empty=true]').all())await expect(row).toHaveCSS('opacity','0.5');await page.locator('.dojo-home-details>summary').click();await expect(page.locator('.dojo-plan[data-empty=true]')).toHaveCount(3);for(const row of await page.locator('.dojo-plan[data-empty=true]').all())await expect(row).toHaveCSS('opacity','0.5');
});
test('P12.1 §15 budget input uses minutes and keeps stored seconds',async({page})=>{
 const f=emptyStore();f.settings.lessonPolicy={budgetSeconds:600,reviewLimit:6};await seed(page,f);await openDojo(page);await page.locator('.dojo-lesson-settings>summary').click();const input=page.getByRole('spinbutton',{name:'計画の時間枠'});await expect(input).toHaveValue('10');await expect(input).toHaveAttribute('max','150');await expect(input).toHaveAttribute('step','1');await input.fill('15');await expect.poll(async()=> (await readDojo(page)).settings.lessonPolicy?.budgetSeconds).toBe(900);await expect(page.locator('.dojo-budget-summary')).toContainText(/今の計画：約\d+分・確認 \d\/6/);await expect(page.locator('.dojo-lesson-settings')).not.toContainText('秒');await page.locator('.dojo-home-details>summary').click();await expect(page.locator('.dojo-theme>small')).toContainText(/目安 約\d+分 \/ 上限15分/);await expect(page.locator('.dojo-theme>small')).not.toContainText('秒');
});
test('P12.1 §16 builtins starts through the free practice chooser',async({page})=>{
 await openDojo(page);await expect(page.locator('.dojo-free-builtins')).toHaveCount(0);await page.locator('.dojo-free-practice').getByRole('button',{name:'定番の進行',exact:true}).click();await page.locator('.dojo-list .dojo-card').filter({has:page.getByRole('heading',{name:'I–V–vi–IV',exact:true})}).getByRole('button',{name:'これを練習する'}).click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();await expect(page.locator('.dojo-chord-cards strong')).toHaveText(['C','G','Am7','Fmaj7']);
});
for(const added of [false,true])test('P12.1 §17 finish shows vocabulary first and preserves the closed execution log '+(added?'added':'empty'),async({page})=>{
 await page.setViewportSize({width:1440,height:900});const f=practiceFile();if(added)f.today!.added=[SHAPE.key];await startPractice(page,f,'no-midi');await page.getByRole('button',{name:'とばす',exact:true}).click();const finish=page.locator('.dojo-finish');await expect(finish.locator('h1')).toHaveText('今日、自分の語彙に増えたもの');await expect(finish.locator('.dojo-finish-log')).not.toHaveAttribute('open');await expect(finish.locator('.dojo-finish-summary')).not.toContainText('今回の確認完了');if(!added)await expect(finish.locator('.dojo-vocab')).toHaveText('今回は新しく増えたものはありません。詳しい記録は下で見られます。');else await expect(finish.locator('.dojo-added')).toHaveCount(1);
 const m=await page.evaluate(()=>{const main=document.getElementById('main-content')!,r=main.getBoundingClientRect();return {top:r.top,bottom:r.bottom,scrollTop:main.scrollTop,parts:[...document.querySelectorAll('.dojo-finish>h1,.dojo-vocab,.dojo-finish>.dojo-actions button')].map(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom};})};});console.info('P12.1 initial finish',added,JSON.stringify(m));expect(m.scrollTop).toBe(0);for(const b of m.parts){expect(b.top).toBeGreaterThanOrEqual(m.top);expect(b.bottom).toBeLessThanOrEqual(m.bottom);}
 await finish.locator('.dojo-finish-log>summary').click();await expect(page.getByTestId('dojo-lesson-summary').getByRole('heading',{name:'今回の練習',exact:true})).toHaveJSProperty('tagName','H2');await expect(page.getByTestId('dojo-lesson-summary').locator('[data-task-outcome=skipped]')).toHaveCount(1);expect((await readDojo(page)).today!.taskResults![0].skipped).toBe(true);
});
