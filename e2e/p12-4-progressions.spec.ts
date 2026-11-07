import {test,expect,type Page} from '@playwright/test';
import {dateKey,emptyStore,emptyItem,type DojoStore,type Task} from '../src/domain/chordDojo/store';
import {openDojo,type MidiControl} from './helpers/p12';

/** P12.4-02: the jazz and composing progressions in the list, and one of them played. */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const task=(id:string,root=0):Task=>({kind:'progression',key:`builtin:${id}:1`,review:false,roots:[root],seconds:120});
function file(t:Task){
 const f=emptyStore();
 f.today={date:dateKey(new Date()),tasks:[t],cursor:{taskIndex:0,stage:'recall',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 f.progressions[t.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
async function start(page:Page,data:DojoStore){
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 await openDojo(page);await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
}
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});

test('the list has the four added groups, each progression with its use under the degrees',async({page})=>{
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await expect(page.locator('.dojo-builtin-card')).toHaveCount(45);
 for(const name of ['ジャズ基礎 3','ジャズの仕掛け 6','ジャズ・フォーム 3','ネオソウル・ボサ・モーダル 6'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'ペダルの上で動かす',exact:true})});
 await expect(card.locator('.dojo-builtin-degrees')).toHaveText('Imaj7/V – ♭VIImaj7/V – ♭VImaj7/V – V7sus4');
 await expect(card.locator('.dojo-builtin-usage')).toHaveText('ベースを固定して上だけ動かす。ネオソウルの浮遊感');
 await expect(card.locator('.dojo-builtin-chords')).toHaveText('C：Cmaj7/G → B♭maj7/G → A♭maj7/G → G7sus4');
 // an older progression has no use line, and is unchanged
 const older=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'ii–V–I',exact:true})});
 await expect(older.locator('.dojo-builtin-usage')).toHaveCount(0);
 await expect(older.locator('.dojo-builtin-degrees')).toHaveText('ii7 – V7 – Imaj7');
});

test('a 7alt is written 7(♭9) and says so in its use line',async({page})=>{
 await openDojo(page);
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 const card=page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'マイナー 2-5-1',exact:true})});
 await expect(card.locator('.dojo-builtin-degrees')).toHaveText('iiø7 – V7(♭9) – i(maj7) – i(maj7)');
 await expect(card.locator('.dojo-builtin-usage')).toContainText('7alt は 7(b9) で代用');
 await expect(card.locator('.dojo-builtin-chords')).toHaveText('Cm：Dm7♭5 → G7(♭9) → Cm(maj7) → Cm(maj7)');
});

test('a slash-chord progression is played: the bass is part of the answer',async({page})=>{
 await start(page,file(task('jd-descending-bass')));
 const cards=page.locator('.dojo-chord-cards>button');
 await expect(cards).toHaveCount(4);
 // ask for the answer, then play exactly it
 await page.getByRole('button',{name:'答えを見る（Space）'}).click();
 await expect.poll(()=>page.locator('[data-score-midi]').count()).toBeGreaterThan(0);
 const answer=await page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))));
 await emit(page,answer);
 await expect(page.locator('.dojo-result')).toContainText('合いました');
});

test('a 12-bar form shows all its chords as cards',async({page})=>{
 await start(page,file(task('jf-jazz-blues',5)));
 await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(15);
});
