import {expect,test,type Page} from '@playwright/test';
import {assertNoHorizontalOverflow} from './helpers/app';
async function open(page:Page,long:boolean|'text'=false){await page.goto(`/?p104=${long==='text'?'text':long?'long':'normal'}`);await page.locator('[data-nav="vault"]').click();const row=page.locator('.lv-vault-row').filter({hasText:'P10.4 合成曲'}).first();await expect(row).toBeVisible();await row.getByRole('button',{name:/進行を開く/}).click();await expect(page.getByTestId('correction-piano-roll')).toBeVisible();}
const cards=(page:Page)=>page.getByTestId('correction-card');
const notes=(page:Page)=>page.locator('.lv-cw-note[data-card="p104-0"]');
test('P10.4 manual notes retain source, minimum two, overwrite reload and shared undo',async({page})=>{
 await open(page);await cards(page).first().click();await page.getByTestId('correction-mode-edit').click();
 const original=await notes(page).count();expect(original).toBe(4);
 await notes(page).first().click();await expect(page.locator('.lv-cw-note[data-card="p104-0"][data-kind="off"]')).toHaveCount(1);
 await page.getByTestId('correction-undo').click();await expect(page.locator('.lv-cw-note[data-card="p104-0"][data-kind="off"]')).toHaveCount(0);
 await notes(page).first().click();await notes(page).nth(1).click();await notes(page).nth(2).click();await expect(page.getByTestId('correction-notice')).toContainText('最後の2音');
 await expect(page.locator('.lv-cw-note[data-card="p104-0"]:not([data-kind="off"])')).toHaveCount(2);
 await page.getByRole('button',{name:'上書き保存',exact:true}).click();await expect(page.getByRole('button',{name:'上書き保存',exact:true})).toBeDisabled();
 await expect(notes(page)).toHaveCount(2);await page.getByRole('combobox',{name:'この曲の進行',exact:true}).selectOption('10400000-0000-4000-8000-000000000002');await page.getByRole('combobox',{name:'この曲の進行',exact:true}).selectOption('10400000-0000-4000-8000-000000000001');await expect(notes(page)).toHaveCount(2);
 await page.getByTestId('voicing-loop-handoff').click();await expect(page.getByTestId('voicing-loop-workspace')).toBeVisible();
});
test('P10.4 range loops for its full span, endpoints adjust, version defaults to range and original stays intact',async({page})=>{
 await open(page);await cards(page).first().click({button:'right'});await page.getByRole('menuitem',{name:'ここから保存する範囲を選ぶ'}).click();await cards(page).nth(1).click({button:'right'});await expect(page.getByTestId('correction-range-chip')).toContainText('くり返し');
 await page.getByRole('button',{name:'範囲の終わり',exact:true}).focus();await page.keyboard.press('ArrowLeft');await expect(page.getByTestId('correction-range-chip')).toContainText('25小節');
 await page.getByTestId('correction-play-song').click();await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__lvProgressionPlayback?:{count:number}}).__lvProgressionPlayback?.count??0)).toBeGreaterThanOrEqual(2);
 await page.getByTestId('correction-play-song').click();const count=await page.evaluate(()=>(window as typeof window&{__lvProgressionPlayback?:{count:number}}).__lvProgressionPlayback?.count);await page.waitForTimeout(1100);expect(await page.evaluate(()=>(window as typeof window&{__lvProgressionPlayback?:{count:number}}).__lvProgressionPlayback?.count)).toBe(count);
 await page.getByRole('button',{name:'別の版として保存',exact:true}).click();const dialog=page.getByRole('dialog',{name:'別の版として保存',exact:true});await expect(dialog.getByRole('radio').nth(1)).toBeChecked();await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('combobox',{name:'この曲の進行',exact:true}).locator('option')).toHaveCount(3);await expect(cards(page)).toHaveCount(1);await expect(cards(page).first()).toHaveAttribute('aria-label',/25小節/);
 await page.getByRole('combobox',{name:'この曲の進行',exact:true}).selectOption('10400000-0000-4000-8000-000000000001');await expect(cards(page)).toHaveCount(8);await expect(notes(page)).toHaveCount(4);
 await cards(page).first().click({button:'right'});await page.getByRole('menuitem',{name:'ここから保存する範囲を選ぶ'}).click();await cards(page).nth(2).click({button:'right'});await page.keyboard.press('Escape');await expect(page.getByTestId('correction-range-chip')).toHaveCount(0);
});
test('P10.4 candidates, note move/add, split/delete/boundary, save-aware navigation and text keyboard',async({page})=>{
 await open(page);await cards(page).first().click();await page.getByTestId('correction-name-candidates').getByRole('button').first().click();await expect(cards(page).first()).toContainText('変更');
 await page.getByRole('combobox',{name:'この曲の進行',exact:true}).selectOption('10400000-0000-4000-8000-000000000002');const guard=page.getByRole('dialog',{name:'変更を保存しますか？'});await expect(guard).toBeVisible();await guard.getByRole('button',{name:'戻る',exact:true}).click();await expect(page.getByRole('combobox',{name:'この曲の進行',exact:true})).toHaveValue('10400000-0000-4000-8000-000000000001');
 await page.getByTestId('correction-undo').click();await page.getByTestId('correction-mode-edit').click();const note=notes(page).first();const box=await note.boundingBox();if(!box)throw new Error('note missing');await page.mouse.move(box.x+12,box.y+2);await page.mouse.down();await page.mouse.move(box.x+12,box.y-4,{steps:3});await page.mouse.up();await expect(page.locator('.lv-cw-note[data-card="p104-0"][data-kind="manual"]')).toHaveCount(1);
 await page.getByTestId('correction-add-note').click();await page.getByRole('group',{name:'足す音を選ぶ'}).getByRole('button').nth(1).click();await expect(page.locator('.lv-cw-note[data-card="p104-0"][data-kind="manual"]')).toHaveCount(2);
 await page.getByTestId('correction-card-actions').getByRole('button',{name:/分けて足す/}).click();await expect(cards(page)).toHaveCount(9);await page.getByTestId('correction-undo').click();await expect(cards(page)).toHaveCount(8);
 await page.getByLabel('メモ',{exact:true}).fill('Space N S Del メモ');await page.keyboard.press('Space');await expect(page.getByTestId('correction-play-song')).toHaveText('▶ 再生');
 await page.locator('[data-nav="home"]').click();const leave=page.getByRole('dialog');await expect(leave).toContainText('保存して移る');await leave.getByRole('button',{name:'保存して移る',exact:true}).click();await expect(page.locator('[data-progression-detail-view]')).toHaveCount(0);
 await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').first().getByRole('button',{name:/進行を開く/}).click();await expect(page.getByLabel('メモ',{exact:true})).toHaveValue('Space N S Del メモ ');
});
test('P10.4 long progression and four viewport sizes have no horizontal overflow',async({page})=>{await open(page,true);await page.getByRole('button',{name:'全体',exact:true}).click();await expect(cards(page)).toHaveCount(70);for(const [width,height] of [[1920,1080],[1440,900],[960,1032],[768,640]]){await page.setViewportSize({width:width!,height:height!});await assertNoHorizontalOverflow(page);await expect(page.getByTestId('correction-piano-roll')).toBeVisible();}await page.getByTestId('correction-go-start').click();await expect(page.getByTestId('correction-position')).toContainText('1.1');});

test('P10.4 edited text split and range version enter Voicing Loop using saved cards',async({page})=>{
 await open(page,'text');await cards(page).first().click();await page.getByTestId('correction-card-actions').getByRole('button',{name:/分けて足す/}).click();await expect(cards(page)).toHaveCount(5);
 await page.getByTestId('voicing-loop-handoff').click();await page.getByRole('dialog',{name:'変更を保存しますか？'}).getByRole('button',{name:'保存して移る',exact:true}).click();await expect(page.getByTestId('voicing-loop-workspace')).toBeVisible();
 await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').filter({hasText:'P10.4 合成曲'}).first().getByRole('button',{name:/進行を開く/}).click();await expect(cards(page)).toHaveCount(5);
 await cards(page).nth(2).click({button:'right'});await page.getByRole('menuitem',{name:'ここから保存する範囲を選ぶ'}).click();await cards(page).nth(3).click({button:'right'});await expect(page.getByTestId('correction-range-chip')).toBeVisible();await page.getByRole('button',{name:'別の版として保存',exact:true}).click();const dialog=page.getByRole('dialog',{name:'別の版として保存',exact:true});await expect(dialog.getByRole('radio').nth(1)).toBeChecked();await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(cards(page)).toHaveCount(2);
 await page.getByTestId('voicing-loop-handoff').click();await expect(page.getByTestId('voicing-loop-workspace')).toBeVisible();
});

test('P10.4 saved edited MIDI notes reach Bass Listen/Play and discard uses the saved harmony',async({page})=>{
 await open(page);await cards(page).first().click();await page.getByTestId('correction-mode-edit').click();await notes(page).first().click();await notes(page).nth(1).click();
 await page.getByTestId('chord-context-handoff').getByRole('button',{name:'Bass Practice',exact:true}).click();await page.getByRole('dialog',{name:'変更を保存しますか？'}).getByRole('button',{name:'保存して移る',exact:true}).click();
 const context=page.getByTestId('chord-context-controls');await expect(context).toBeVisible();await context.getByTestId('chord-context-start-stop').click();
 const played=()=>page.evaluate(()=>(window as typeof window&{__lvBassSavedPlayback?:{mode:string;notes:readonly (readonly number[])[]}}).__lvBassSavedPlayback);
 await expect.poll(async()=>(await played())?.notes[0]).toEqual([64,67]);
 await context.getByRole('radio',{name:'演奏',exact:true}).click();await context.getByTestId('chord-context-start-stop').click();await expect.poll(async()=>(await played())?.mode).toBe('play');expect((await played())?.notes[0]).toEqual([64,67]);
 await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').filter({hasText:'P10.4 合成曲'}).first().getByRole('button',{name:/進行を開く/}).click();await cards(page).first().click();await page.getByTestId('correction-name-candidates').getByRole('button').first().click();
 await page.getByTestId('chord-context-handoff').getByRole('button',{name:'Bass Practice',exact:true}).click();await page.getByRole('dialog',{name:'変更を保存しますか？'}).getByRole('button',{name:'保存せずに移る',exact:true}).click();await expect(context).toBeVisible();
 await context.getByTestId('chord-context-start-stop').click();await expect.poll(async()=>(await played())?.mode).toBe('listen');expect((await played())?.notes[0]).toEqual([64,67]);
});
