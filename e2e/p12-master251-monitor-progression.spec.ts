import {test,expect,type Page} from '@playwright/test';
import {emptyStore} from '../src/domain/chordDojo/store';
import {emptyMaster,targetForCell} from '../src/domain/master251/model';
import {openDojo,type MidiControl} from './helpers/p12';
interface Probe {starts:Array<{leadMs:number;at:number;state:AudioContextState}>;stops:number;contexts:AudioContext[];}
async function setup(page:Page,mode:'learn'|'recall'|'tempo'='learn',held=false){
 const f=emptyStore();f.master251=emptyMaster();if(mode!=='learn')for(const c of Object.values(f.master251.cells))c.learnedAt='2026-10-01T00:00:00Z';f.master251.cells['A:0'].status=mode==='learn'?'new':'passed';f.master251.cells['A:0'].currentBpm=mode==='tempo'?80:undefined;f.master251.session={cell:'A:0',seed:123,paused:false,mode,bpm:f.master251.cells['A:0'].currentBpm};
 await page.addInitScript(file=>{
  localStorage.setItem('loop-vault:chord-dojo-txt-jazz-v1:data',JSON.stringify(file));const probe:Probe={starts:[],stops:0,contexts:[]};(window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe=probe;
  const Context=window.AudioContext;window.AudioContext=new Proxy(Context,{construct(t,a){const c=Reflect.construct(t,a) as AudioContext;probe.contexts.push(c);return c;}});
  const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){if(this.buffer&&this.buffer.duration>0.1)probe.starts.push({leadMs:((args[0]??0)-this.context.currentTime)*1000,at:performance.now(),state:this.context.state});return start.apply(this,args);};
  const stop=AudioBufferSourceNode.prototype.stop;AudioBufferSourceNode.prototype.stop=function(...args:Parameters<typeof stop>){if(this.buffer&&this.buffer.duration>0.1)probe.stops++;return stop.apply(this,args);};
 },f);
 await openDojo(page);if(held)await emit(page,[62]);await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase',held?'ready':'active');await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');return targetForCell('A:0');
}
const emit=(p:Page,notes:readonly number[],on=true)=>p.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on,0),{notes:[...notes],on});
const starts=(p:Page)=>p.evaluate(()=>(window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe.starts.length);
const stopCount=(p:Page)=>p.evaluate(()=>(window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe.stops);
const cell=(p:Page)=>p.evaluate(()=>JSON.parse(localStorage.getItem('loop-vault:chord-dojo-txt-jazz-v1:data')!).master251.cells['A:0']);

test('Master MIDI monitor attacks immediately, deduplicates held voices and follows pedal independently of judging',async({page})=>{
 await setup(page);const before=await starts(page);await emit(page,[60]);await expect.poll(()=>starts(page)).toBe(before+1);
 const first=await page.evaluate(()=>(window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe.starts.at(-1)!);expect(first.state).toBe('running');expect(first.leadMs).toBeLessThan(20);
 await emit(page,[60]);await page.waitForTimeout(80);expect(await starts(page)).toBe(before+1);expect((await cell(page)).attempts).toBe(0);
 await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.pedal(true));const stops=await stopCount(page);await emit(page,[60],false);await page.waitForTimeout(30);expect(await stopCount(page)).toBe(stops);await emit(page,[60],false);await page.waitForTimeout(50);expect(await stopCount(page)).toBe(stops);
 await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.pedal(false));await expect.poll(()=>stopCount(page)).toBeGreaterThan(stops);
 await page.evaluate(async()=>{await (window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe.contexts[0].suspend();});await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','suspended');await page.getByRole('button',{name:'入力音を有効にする'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');
 const ready=await starts(page);await emit(page,[61]);await expect.poll(()=>starts(page)).toBe(ready+1);await page.getByTestId('dojo-back').click();await expect(page.getByTestId('master251')).toHaveCount(0);await expect.poll(()=>stopCount(page)).toBeGreaterThan(stops);
});

test('Recall progression plays this exact cell in order, remains a Hint and restores warm input after completion',async({page})=>{
 const t=await setup(page,'recall'),before=await starts(page);await expect(page.locator('[data-score-midi]')).toHaveCount(0);await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','answer-review');await expect(page.locator('.master251-feedback')).toContainText('ヒント使用');
 for(let i=0;i<3;i++){await expect(page.locator('.master251-current-chord')).toHaveText(t.chords[i].symbol);expect(await page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))))).toEqual(t.chords[i].notes);if(i===0){await expect.poll(()=>starts(page)).toBe(before+t.chords[0].notes.length);const playing=await starts(page);await emit(page,[36]);await page.waitForTimeout(60);expect(await starts(page)).toBe(playing);await emit(page,[36],false);}}
 await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle',{timeout:10000});expect(await starts(page)).toBe(before+t.chords.reduce((n,c)=>n+c.notes.length,0));expect((await cell(page)).attempts).toBe(0);
 await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');const warm=await starts(page);await emit(page,[36]);await expect.poll(()=>starts(page)).toBe(warm+1);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','answer-review');expect((await cell(page)).attempts).toBe(0);await emit(page,[36],false);
 await page.getByRole('button',{name:'同じセルを最初から弾く'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await expect(page.locator('[data-score-midi]')).toHaveCount(0);
});

test('progression stop and card replacement cancel later chords; a pending sample cannot revive playback',async({page})=>{
 const t=await setup(page);await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');await expect.poll(()=>starts(page)).toBeGreaterThanOrEqual(t.chords[0].notes.length);
 await page.locator('.master251-chords button').nth(2).click();await expect(page.locator('.master251-current-chord')).toHaveText(t.chords[2].symbol);await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');const replaced=await starts(page);await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle');await page.waitForTimeout(3300);expect(await starts(page)).toBe(replaced);
 await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');await page.evaluate(async()=>{await (window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug();});await expect(page.locator('.master251-prompt')).toContainText('MIDI が外れました。つなぎ直すと、この課題から続けます。');const unplugged=await starts(page);await page.waitForTimeout(1600);expect(await starts(page)).toBe(unplugged);
});

test('delayed progression samples and rapid stop replay exit cannot start an abandoned voice',async({page})=>{
 await setup(page);const pending:Array<()=>Promise<void>>=[];await page.route('**/*.mp3',route=>new Promise<void>(resolve=>pending.push(async()=>{await route.continue();resolve();})));const before=await starts(page);
 await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect.poll(()=>pending.length).toBeGreaterThan(0);await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','starting');await page.getByRole('button',{name:'停止',exact:true}).click();await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await page.getByTestId('dojo-back').click();for(const finish of pending)await finish();await page.waitForTimeout(1700);expect(await starts(page)).toBe(before);
});

test('Tempo progression pauses its old clock and restarts from the same cell with a physical release gate',async({page})=>{
 const t=await setup(page,'tempo');await emit(page,t.chords[0].notes);await expect(page.getByTestId('master251-beats')).toBeVisible();await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect(page.getByTestId('master251-beats')).toHaveCount(0);await page.getByRole('button',{name:'停止',exact:true}).click();await page.getByRole('button',{name:'同じセルを最初から弾く'}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','ready');await expect(page.locator('.master251-release-wait')).toHaveCount(0);await expect(page.locator('.master251-release-wait')).toContainText('押している鍵盤を離すと');await expect(page.locator('[data-score-midi]')).toHaveCount(0);await emit(page,t.chords[0].notes,false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await expect(page.getByTestId('master251')).toHaveAttribute('data-cell','A:0');await expect(page.getByTestId('master251-beats')).toHaveCount(0);expect((await cell(page)).attempts).toBe(0);
});

test('brief release waits stay quiet and held-key explanation disappears on automatic start despite pedal',async({page})=>{
 await setup(page,'recall',true);await expect(page.locator('.master251-release-wait')).toHaveCount(0);await page.waitForTimeout(250);await expect(page.locator('.master251-release-wait')).toHaveCount(0);await expect(page.locator('.master251-release-wait')).toContainText('次の練習が始まります');await expect(page.locator('.master251-prompt')).not.toContainText('鍵盤を離してください');
 await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.pedal(true));await emit(page,[62],false);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');await expect(page.locator('.master251-release-wait')).toHaveCount(0);
});

for(const [width,height] of [[1440,900],[1366,768],[1280,720]])test(`Master ${width}x${height} reserves bottom space with full keys and visible progression controls`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);const check=async()=>{const b=await page.evaluate(()=>{const box=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};const main=document.querySelector('#main-content')!;return {main:box('#main-content'),practice:box('.master251-practice'),score:box('.dojo-score'),keyboard:box('.master251-keyboard'),keys:box('.master251-keyboard svg'),scroll:main.scrollTop,overflow:main.scrollHeight-main.clientHeight,buttons:[...document.querySelectorAll('.master251-task>.dojo-actions button')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})};});expect(b.scroll).toBe(0);expect(b.overflow).toBeLessThanOrEqual(1);expect(b.main.bottom-b.practice.bottom).toBe(8);expect(b.keys.height).toBe(128);expect(b.keys.bottom).toBeLessThanOrEqual(b.main.bottom-8);expect(b.score.bottom).toBe(b.keyboard.top);for(const z of b.buttons){expect(z.top).toBeGreaterThan(b.main.top);expect(z.bottom).toBeLessThanOrEqual(b.score.top);}return b.keys.top;};
 const top=await check();await page.getByRole('button',{name:'進行を聞く',exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');expect(await check()).toBe(top);await page.getByRole('button',{name:'停止',exact:true}).click();expect(await check()).toBe(top);
});


test('a fresh physical attack replaces a suppressed pedal voice after audition without judging the review',async({page})=>{
 await setup(page,'recall');await emit(page,[60]);await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.pedal(true));await emit(page,[60],false);
 await page.locator('.master251-chords button').first().click();await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','playing');await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle',{timeout:10000});await expect(page.getByTestId('master251')).toHaveAttribute('data-audio','ready');
 const before=await starts(page);await emit(page,[60]);await expect.poll(()=>starts(page)).toBe(before+1);const last=await page.evaluate(()=>(window as unknown as {__masterMonitorProbe:Probe}).__masterMonitorProbe.starts.at(-1)!);expect(last.leadMs).toBeLessThan(20);await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','answer-review');expect((await cell(page)).attempts).toBe(0);
 await emit(page,[60],false);await page.evaluate(()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.pedal(false));
});
