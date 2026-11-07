import {masterKeyLabel} from '../src/views/chord-dojo/master251Feedback';
import {test,expect} from '@playwright/test';
import {openDojo} from './helpers/p12';
import {emptyStore} from '../src/domain/chordDojo/store';
import {emptyMaster,KEY_NAMES} from '../src/domain/master251/model';
import profile from '../src/domain/master251/canonical-fingering.json' with {type:'json'};
import {physicalVoicingSignature} from '../src/domain/progressionFingering';
for(const range of ['original','octave-down'] as const)for(const mode of ['recall','tempo'] as const)test(`Master all48 ${range} ${mode} answer score and keyboard keep the fixed profile despite personal anchors`,async({page})=>{
 test.setTimeout(120000);const file=emptyStore();file.master251=emptyMaster();for(const c of Object.values(file.master251.cells)){c.status='passed';c.learnedAt='2026-10-01T00:00:00Z';c.currentBpm=mode==='tempo'?40:undefined;}file.master251.session={cell:'A:0',seed:123,paused:false,mode,bpm:mode==='tempo'?40:undefined};
 if(range==='octave-down')file.master251={...emptyMaster(),selectedRange:range,octaveDown:file.master251};
 const offset=range==='original'?0:-12;
 const preferences={version:1,entries:[{hand:'left',pitches:[62+offset],fingers:[1],updatedAt:1,signature:physicalVoicingSignature('left',[62+offset])}]};
 await page.addInitScript(({file,preferences})=>{localStorage.setItem('loop-vault:chord-dojo-txt-jazz-v1:data',JSON.stringify(file));localStorage.setItem('loop-vault:voicing-loop-fingering-preferences:v1',JSON.stringify(preferences));},{file,preferences});
 await openDojo(page);await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();
 for(const row of profile.cells){
  await page.locator('.master251-records>summary').click();await page.getByRole('button',{name:'自分でセルを選ぶ',exact:true}).click();const [form,key]=row.cell.split(':');await page.getByRole('button',{name:`Form ${form} ${masterKeyLabel(KEY_NAMES[Number(key)])}`,exact:true}).click();await expect(page.getByTestId('master251')).toHaveAttribute('data-cell',row.cell);await page.locator('.master251-records>summary').click();
  await expect(page.getByTestId('master251')).toHaveAttribute('data-mode',mode);if(mode==='tempo'){await expect(page.locator('[data-score-midi],[data-finger-label]')).toHaveCount(0);await expect(page.locator('.master251-stage')).toContainText('40 BPM');}
  for(let i=0;i<3;i++){
   await page.locator('.master251-chords button').nth(i).click();const chord=row.chords[i];
   const expected=chord.notes.map(midi=>{const hand=chord.referenceHands.lh.includes(midi)?'lh':'rh',index=chord.referenceHands[hand].indexOf(midi);return {midi:midi+offset,hand:hand==='lh'?'left':'right',finger:chord.fingers[hand][index]};});
   await expect.poll(()=>page.locator('[data-score-midi]').evaluateAll(es=>es.map(e=>({midi:Number(e.getAttribute('data-score-midi')),hand:e.getAttribute('data-score-hand'),finger:Number(e.getAttribute('data-score-finger'))})))).toEqual(expected);
   const keys=await page.locator('.master251-keyboard [data-midi-note]').evaluateAll(es=>es.flatMap(e=>{const label=e.querySelector('[data-finger-label]');return label?[{midi:Number(e.getAttribute('data-midi-note')),label:label.textContent}]:[];}));
   expect(keys.sort((a,b)=>a.midi-b.midi)).toEqual(expected.map(x=>({midi:x.midi,label:(x.hand==='left'?'左':'右')+x.finger})));
  }
 }
 expect(await page.evaluate(()=>localStorage.getItem('loop-vault:voicing-loop-fingering-preferences:v1'))).toBe(JSON.stringify(preferences));
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('loop-vault:chord-dojo-txt-jazz-v1:data')!));const bank=range==='original'?stored.master251:stored.master251.octaveDown;expect(Object.values(bank.cells).every(c=>(c as {attempts:number}).attempts===0)).toBe(true);
});
