import {test,expect,type Page} from '@playwright/test';
import {openDojo,type MidiControl} from './helpers/p12';
import {DOJO_JUDGE_ANSWERS} from '../src/testing/dojoJudgeAnswers';
import type {DojoStore} from '../src/domain/chordDojo/store';
import {installDojoPianoProbe,pianoNotes} from './helpers/dojoPianoProbe';
import {mkdirSync} from 'node:fs';
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const score=(page:Page)=>page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))).sort((a,b)=>a-b));
const keys=(page:Page)=>page.locator('.dojo-keyboard [data-midi-note]:has([data-answer-marker])').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-midi-note'))).sort((a,b)=>a-b));
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
async function prepared(page:Page,stage:'see'|'recall'|'tempo'='see',index=0,bars=14,policy:'saved'|'mixed'|'generated'='saved'){
 const route=`midi&p104=${policy==='mixed'?'judge-mixed':policy==='generated'?'judge-generated':bars===66?'judge-long':'judge'}`;
 await page.addInitScript(()=>localStorage.setItem('loop-vault:preview-sound:v1',JSON.stringify({version:1,sound:'piano'})));
 await openDojo(page,route);
 await expect.poll(()=>page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).progressions).filter(k=>k.startsWith('vault:')).length,KEY)).toBe(1);
 await page.evaluate(({key,stage,index})=>{const file=JSON.parse(localStorage.getItem(key)!) as DojoStore,taskKey=Object.keys(file.progressions).find(k=>k.startsWith('vault:'))!;file.settings.progBpm=240;file.today={date:new Date().toLocaleDateString('en-CA'),tasks:[{kind:'progression',key:taskKey,review:false,roots:[0],seconds:120}],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:index,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0};localStorage.setItem(key,JSON.stringify(file));},{key:KEY,stage,index});
 await openDojo(page,route);await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.connect());await page.getByTestId('practice-start').click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',`0:${stage}:0:${index}`);
}
test('Bm11 displayed keys and staff, actual piano audition and received notes all agree; see advances',async({page})=>{
 await installDojoPianoProbe(page);await prepared(page,'see',2);
 const expected=[59,69,73,76,78];await expect.poll(()=>score(page)).toEqual(expected);expect(await keys(page)).toEqual(expected);
 await expect(page.locator('.dojo-chips')).toContainText('保存した音・元の音域で');
 mkdirSync('p12-generated/dojo-display-judge',{recursive:true});await page.screenshot({path:'p12-generated/dojo-display-judge/bm11-source.png',fullPage:true});
 const before=(await pianoNotes(page)).length;await page.locator('.dojo-chord-cards>button').nth(2).click();
 await expect.poll(async()=>(await pianoNotes(page)).slice(before).sort((a,b)=>a-b)).toEqual(expected);
 // Play the rendered answer, after independently checking it against authored notes.
 const displayed=await keys(page);await emit(page,displayed);
 await expect.poll(()=>page.locator('.dojo-keyboard [data-visual-state="guide-and-held"]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-midi-note'))).sort((a,b)=>a-b))).toEqual(expected);
 await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,displayed,false);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor','0:see:0:3');
});
test('a genuine missing pitch is reported and corrected without requesting absent D',async({page})=>{
 await prepared(page,'see',2);const wrong=[59,69,76,78,81]; // missing C#5, octave doubling of A instead
 await emit(page,wrong);await expect(page.locator('.dojo-result')).toContainText('D♭ がありません');await emit(page,wrong,false);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor','0:see:0:2');
 await page.getByRole('button',{name:'もう一度（Enter）'}).click();await emit(page,await keys(page));await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,[59,69,73,76,78],false);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor','0:see:0:3');
});
test('tempo switches exact/core per event rather than inheriting the first event policy',async({page})=>{
 test.setTimeout(45_000);await prepared(page,'tempo',0,14,'mixed');
 const core:Record<number,number[]>={1:[48,51,58],3:[48,51,58,62],5:[48,52,58],7:[48,52,58,69],9:[52,59,60],11:[48,52,59],13:[47,57,62,64]};
 await page.getByRole('button',{name:'テンポで始める（Space）'}).click();
 for(let i=0;i<14;i++){await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',`0:tempo:0:${i}`);const notes=core[i]??DOJO_JUDGE_ANSWERS[i].notes;await emit(page,notes);await page.waitForTimeout(100);await emit(page,notes,false);}
 await expect(page.getByTestId('dojo-tempo-result')).toContainText('14/14 合いました',{timeout:15000});
});
test('generated core guide visibly includes mandatory D and rejects its absence',async({page})=>{
 await prepared(page,'see',2,14,'generated');await expect.poll(()=>score(page)).toEqual([47,57,61,62,64,66]);
 await expect(page.locator('.dojo-chips')).toContainText('構成とベースが合えばよい');
 mkdirSync('p12-generated/dojo-display-judge',{recursive:true});await page.screenshot({path:'p12-generated/dojo-display-judge/bm11-generated.png',fullPage:true});
 await emit(page,[47,57,61,64,66]);await expect(page.locator('.dojo-result')).toContainText('D がありません');await emit(page,[47,57,61,64,66],false);
 await page.getByRole('button',{name:'もう一度（Enter）'}).click();await emit(page,await keys(page));await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,[47,57,61,62,64,66],false);
});
test('legacy frozen notes without source metadata remain the answer without claiming MIDI provenance',async({page})=>{
 await prepared(page,'see',2);
 await page.evaluate(key=>{const file=JSON.parse(localStorage.getItem(key)!) as DojoStore;for(const t of file.today!.legacyTargets!)delete t.chord.source;localStorage.setItem(key,JSON.stringify(file));},KEY);
 await openDojo(page,'midi&p104=judge');await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.connect());await page.getByTestId('practice-start').click();
 await expect(page.locator('.dojo-chips')).toContainText('表示された音・同じ音域で');await expect.poll(()=>score(page)).toEqual([59,69,73,76,78]);
 mkdirSync('p12-generated/dojo-display-judge',{recursive:true});await page.screenshot({path:'p12-generated/dojo-display-judge/bm11-legacy.png',fullPage:true});
 await emit(page,await keys(page));await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,[59,69,73,76,78],false);
});
test('saved jazz answers in a 66-bar progression advance through the second half using rendered notes',async({page})=>{
 await prepared(page,'see',52,66);
 for(let i=52;i<66;i++){
  await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',`0:see:0:${i}`);
  const expected=[...DOJO_JUDGE_ANSWERS[i%14].notes];await expect.poll(()=>score(page)).toEqual(expected);expect(await keys(page)).toEqual(expected);
  const actual=await keys(page);await emit(page,actual);await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,actual,false);
 }
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor','0:memorize:0:0');
});
test('recall hides the answer, explicit hint shows the same saved notes and accepts them',async({page})=>{
 await prepared(page,'recall',2);await expect(page.locator('[data-score-midi]')).toHaveCount(0);await page.getByRole('button',{name:'答えを見る（Space）'}).click();
 await expect.poll(()=>score(page)).toEqual([59,69,73,76,78]);await emit(page,await keys(page));await expect(page.locator('.dojo-result')).toContainText('合いました');await emit(page,[59,69,73,76,78],false);
});
test('tempo accepts the same independently authored notes at every event and records the round',async({page})=>{
 test.setTimeout(45_000);await prepared(page,'tempo');await page.getByRole('button',{name:'テンポで始める（Space）'}).click();
 for(let i=0;i<14;i++){
  await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',`0:tempo:0:${i}`);
  await emit(page,DOJO_JUDGE_ANSWERS[i].notes);await page.waitForTimeout(100);await emit(page,DOJO_JUDGE_ANSWERS[i].notes,false);
 }
 await expect(page.getByTestId('dojo-tempo-result')).toContainText('14/14 合いました',{timeout:15000});
 const file=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as DojoStore,KEY);expect(file.today!.cursor.tempoResults).toEqual(Array(14).fill(true));
});
test('MIDI reconnect during tempo clears the old input Target and a new round accepts all answers',async({page})=>{
 test.setTimeout(45_000);await prepared(page,'tempo');await page.getByRole('button',{name:'テンポで始める（Space）'}).click();
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor','0:tempo:0:2');
 await page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.unplug());
 await expect(page.getByTestId('midi-required-notice')).toBeVisible();
 await page.evaluate(async()=>{const control=(window as typeof window&{__p12Midi:MidiControl}).__p12Midi;await control.plug();await control.connect();});
 await page.getByRole('button',{name:'テンポで始める（Space）'}).click();
 for(let i=0;i<14;i++){await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',`0:tempo:0:${i}`);await emit(page,DOJO_JUDGE_ANSWERS[i].notes);await page.waitForTimeout(100);await emit(page,DOJO_JUDGE_ANSWERS[i].notes,false);}
 await expect(page.getByTestId('dojo-tempo-result')).toContainText('14/14 合いました',{timeout:15000});
});
