import {test, expect, type Page} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {openDojo, type MidiControl} from '../../e2e/helpers/p12';
import {emptyStore} from '../../src/domain/chordDojo/store';
import {emptyMaster, targetForCell} from '../../src/domain/master251/model';

const output = join(process.cwd(), 'p89-generated', process.env.P89_SCREENS_NAME ?? 'P12.2-01');
const results: unknown[] = [];
const warningResults: unknown[] = [];
const sizes = [[1440,900], [1366,768], [960,1032], [768,640]] as const;
const states = ['paused-midattempt','paused-aftersuccess','recall-completed','posthint','tempo'] as const;
const emit = async (page: Page, notes: readonly number[], on = true) => page.evaluate(({notes,on}) =>
  (window as typeof window & {__p12Midi: MidiControl}).__p12Midi.emit(notes,on), {notes:[...notes],on});
async function transition(page: Page, previous: readonly number[], next: readonly number[]) {
  await emit(page, previous.filter(n => !next.includes(n)), false);
  await emit(page, next.filter(n => !previous.includes(n)));
}
async function setup(page: Page, tempo = false) {
  const file = emptyStore();
  file.master251 = emptyMaster();
  for (const id of ['A:0','B:4'] as const) {
    file.master251.cells[id].learnedAt = '2026-10-01T00:00:00Z';
    file.master251.cells[id].status = 'learning';
  }
  if (tempo) {file.master251.cells['A:0'].status='passed';file.master251.cells['A:0'].currentBpm=60;}
  file.master251.session = {cell:'A:0',seed:123,paused:false,mode:tempo?'tempo':'recall',...(tempo?{bpm:60}:{})};
  // Each navigation gets a complete synthetic store; no production storage is accessed.
  await page.addInitScript(file => localStorage.setItem('loop-vault:chord-dojo-theme-ranges-v1:data',JSON.stringify(file)),file);
  await openDojo(page);
  await page.getByRole('button',{name:'2-5-1 Master 続きから'}).click();
  await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','active');
}

for (const [width,height] of sizes) test(`P12.2 Master evidence ${width}x${height}`,async({context}) => {
  test.setTimeout(120000);
  mkdirSync(output,{recursive:true});
  const target = targetForCell('A:0');
  const captures: unknown[] = [];
  for (const state of states) {
    // A fresh page avoids accumulating fixture initialization scripts between states.
    const page=await context.newPage();
    await page.setViewportSize({width,height});
    await setup(page,state==='tempo');
    if (state==='paused-midattempt' || state==='recall-completed' || state==='paused-aftersuccess') {
      await emit(page,target.chords[0].notes);
      await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');
    }
    if (state==='paused-aftersuccess') {
      await transition(page,target.chords[0].notes,target.chords[1].notes);
      await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');
      await transition(page,target.chords[1].notes,target.chords[2].notes);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loop-vault:chord-dojo-theme-ranges-v1:data')!).master251.session.cell)).toBe('B:4');
    }
    if (state.startsWith('paused-')) {
      await page.getByRole('button',{name:'一時停止（P）'}).click();
      await expect(page.getByTestId('master251')).toHaveAttribute('data-phase','paused');
      await expect(page.locator('[data-answer-marker],[data-score-midi],[data-finger-label]')).toHaveCount(0);
    }
    if (state==='recall-completed') {
      await expect(page.locator('.master251-chords button').first().locator('small')).toHaveText('✓');
      await expect(page.locator('.master251-chords button').first().locator('b')).toHaveText('1');
    }
    if (state==='posthint') {
      await page.getByRole('button',{name:'ヒント（Space）',exact:true}).click();
      await expect(page.getByRole('button',{name:'お手本を聴く（Space）',exact:true})).toBeVisible();
      await expect(page.getByTestId('master251')).toHaveAttribute('data-preview','idle');
    }
    if (state==='tempo') await expect(page.locator('.master251-identity')).toContainText('テンポで確認 · 60 BPM');
    await page.mouse.move(width/2,62);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(180);
    const geometry = await page.evaluate(() => {
      const main=document.querySelector('#main-content'), master=document.querySelector('.master251')!;
      const rect = (selector:string) => {
        const element=master.querySelector(selector);
        if (!element || !element.getClientRects().length) return null;
        const r=element.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};
      };
      const selectors=['.master251-task','.master251-prompt','.master251-pause-description','.master251-pause-warning','.master251-pause-note','.master251-response','.master251-hint-warning','.master251-task>.dojo-actions'];
      const rectangles=Object.fromEntries(selectors.map(s=>[s,rect(s)]));
      const actions=rectangles['.master251-task>.dojo-actions'];
      const overlaps=selectors.filter(s=>!['.master251-task','.master251-task>.dojo-actions'].includes(s)).filter(s=>{
        const r=rectangles[s];return r&&actions&&r.y<actions.bottom-0.5&&r.bottom>actions.y+0.5&&r.x<actions.right&&r.right>actions.x;
      });
      return {phase:master.getAttribute('data-phase'),cell:master.getAttribute('data-cell'),
        overflow:Math.max(document.documentElement.scrollWidth-innerWidth,(main?.scrollWidth??0)-(main?.clientWidth??0)),
        scrollTop:main?.scrollTop??0,rectangles,overlaps};
    });
    const filename=`${state}@${width}x${height}.png`;
    await page.screenshot({path:join(output,filename),animations:'disabled'});
    captures.push({state,filename,width,height,...geometry});
    results.push({state,filename,width,height,...geometry});
    writeFileSync(join(output,'manifest.json'),JSON.stringify({expected:20,captured:results.length,results},null,2));
    console.info('P12.2 evidence',filename,JSON.stringify(geometry));
    expect(geometry.overflow,filename+' horizontal overflow').toBe(0);
    expect(geometry.overlaps,filename+' actions overlap').toEqual([]);
    if (state==='posthint') {
      await emit(page,target.chords[0].notes);
      await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','1');
      await transition(page,target.chords[0].notes,target.chords[1].notes);
      await expect(page.getByTestId('master251')).toHaveAttribute('data-chord-index','2');
      await transition(page,target.chords[1].notes,target.chords[2].notes);
      await expect(page.locator('.master251-hint-warning')).toHaveText('ヒントを使った回は MASTER に数えません');
      const warningGeometry=await page.evaluate(() => {
        const warning=document.querySelector('.master251-hint-warning')!,actions=document.querySelector('.master251-task>.dojo-actions')!;
        const w=warning.getBoundingClientRect(),a=actions.getBoundingClientRect(),range=document.createRange();
        range.selectNodeContents(warning);
        const text=range.getBoundingClientRect(),main=document.querySelector('#main-content');
        return {warning:{x:w.x,y:w.y,width:w.width,height:w.height,bottom:w.bottom},text:{x:text.x,y:text.y,width:text.width,height:text.height,bottom:text.bottom},actions:{y:a.y,bottom:a.bottom},
          overlap:Math.min(w.bottom,a.bottom)-Math.max(w.y,a.y),overflow:Math.max(document.documentElement.scrollWidth-innerWidth,(main?.scrollWidth??0)-(main?.clientWidth??0)),scrollTop:main?.scrollTop??0};
      });
      mkdirSync(join(output,'extra'),{recursive:true});
      await page.screenshot({path:join(output,'extra',`hint-result@${width}x${height}.png`),animations:'disabled'});
      warningResults.push({width,height,...warningGeometry});
      writeFileSync(join(output,'extra','hint-result-geometry.json'),JSON.stringify(warningResults,null,2));
      expect(warningGeometry.overflow,'hint result horizontal overflow').toBe(0);
      expect(warningGeometry.overlap,'hint result warning/actions overlap').toBeLessThanOrEqual(0.5);
      expect(warningGeometry.text.bottom,'hint result text/actions overlap').toBeLessThanOrEqual(warningGeometry.actions.y+0.5);
    }
    await page.close();
  }
  expect(captures).toHaveLength(5);
});
