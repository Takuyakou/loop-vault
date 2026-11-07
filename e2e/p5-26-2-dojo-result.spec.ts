import {test,expect,type Page} from '@playwright/test';
import {dateKey,emptyStore,emptyItem,type DojoStore,type Task} from '../src/domain/chordDojo/store';
import {builtinChords} from './helpers/p12-3';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * P5.26.2-03: a correct answer shows on the card, from one shared mark.
 * moment (≤400 ms, then gone) · this round (stays on the card) · keyboard = filled, self-report = hollow.
 */
const KEY='loop-vault:chord-dojo-txt-jazz-v1:data';
const SHAPE:Task={kind:'shape',key:'preset:basic|close|self|any:quality:maj',quality:'maj',preset:'basic',bass:'self',review:false,roots:[0,5,2],seconds:60};
const progression:Task={kind:'progression',key:'builtin:ii-v-i-major:1',review:false,roots:[0],seconds:120};
function file(task:Task,stage:'see'|'recall'='recall'){
 const f=emptyStore();f.knownQualities.maj={at:'2026-09-01T00:00:00.000Z',nextRecallAt:'2026-11-01T00:00:00.000Z',recallStep:0};
 f.today={date:dateKey(new Date()),tasks:[task],cursor:{taskIndex:0,stage,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0,startedAt:new Date().toISOString()};
 if(task.kind==='progression')f.progressions[task.key]={...emptyItem(),state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z'};
 return f;
}
async function start(page:Page,data:DojoStore,mode='midi'){
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data});
 await openDojo(page,mode);await page.getByTestId('practice-start').click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();
}
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const cards=(page:Page)=>page.locator('.dojo-chord-cards>button');

test('progression card: a keyboard clear flashes the card for a moment, then stays as a filled mark', async({page})=>{
 await start(page,file(progression));
 const first=cards(page).nth(0);
 await emit(page,builtinChords('ii-v-i-major',0)[0].notes);
 await expect(first).toHaveAttribute('data-moment','correct');
 await expect(first.locator('.lv-card-mark[data-layer=moment]')).toHaveAttribute('data-source','midi');
 // The moment is gone by itself; nothing is left flashing.
 await expect(first).not.toHaveAttribute('data-moment','correct',{timeout:2500});
 await emit(page,builtinChords('ii-v-i-major',0)[0].notes,false);
 await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:0:1$/);
 const mark=first.locator('small .lv-card-mark');
 await expect(mark).toHaveAttribute('data-state','correct');
 await expect(mark).toHaveAttribute('data-source','midi');
 await expect(first.locator('small')).toHaveText('✓');
});

test('progression card: wrong notes show a short ✗ on the same card and nothing lasts', async({page})=>{
 await start(page,file(progression));
 const first=cards(page).nth(0);
 await emit(page,[60,64,67]);
 await expect(first).toHaveAttribute('data-moment','miss');
 await expect(first.locator('.lv-card-mark[data-state=miss]')).toHaveText('✗');
 await expect(first).not.toHaveAttribute('data-moment','miss',{timeout:2500});
 await expect(first.locator('.lv-card-mark[data-layer=moment]')).toHaveCount(0);
});

test('progression card: "弾けた" without a keyboard is a hollow mark, not the keyboard\'s filled one', async({page})=>{
 await start(page,file(progression),'no-midi');
 await page.getByRole('button',{name:'答えを見る（Space）'}).click();
 await page.getByRole('button',{name:'弾けた（Y）'}).click();
 const first=cards(page).nth(0);
 await expect(first).toHaveAttribute('data-moment','correct');
 await expect(first.locator('.lv-card-mark[data-layer=moment]')).toHaveAttribute('data-source','self');
 await page.getByRole('button',{name:'次へ（Enter）',exact:true}).click();
 await expect(first.locator('small .lv-card-mark')).toHaveAttribute('data-source','self');
 await expect(first.locator('small')).toHaveText('✓');
});

test('one-chord card: a keyboard clear marks the card, and its sounding and name are intact', async({page})=>{
 await start(page,file(SHAPE,'recall'));
 const card=page.locator('.dojo-prompt-card');
 await expect(card.locator('.lv-card-mark')).toHaveCount(0);
 await page.locator('.dojo-prompt-play').click(); // show the answer, then play exactly what is shown
 await expect.poll(()=>page.locator('[data-score-midi]').count()).toBeGreaterThan(0);
 const answer=await page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-score-midi'))));
 await emit(page,answer);
 await expect(card).toHaveAttribute('data-moment','correct');
 await expect(card.locator('.lv-card-mark')).toHaveAttribute('data-source','midi');
 await expect(card.locator('.dojo-prompt')).toHaveText('C');
 await expect(card.locator('.dojo-prompt-play')).toBeVisible();
});

test('degrees stay on the cards with the mark added', async({page})=>{
 await start(page,file(progression));
 await emit(page,builtinChords('ii-v-i-major',0)[0].notes);
 await expect(cards(page).nth(0)).toHaveAttribute('data-moment','correct');
 // The first card is the chord being played; its own text is still there and the others keep theirs.
 await expect(cards(page).nth(0).locator('strong')).toHaveText(/./);
 await expect(cards(page).nth(1)).toHaveAttribute('aria-label',/聴く/);
});
