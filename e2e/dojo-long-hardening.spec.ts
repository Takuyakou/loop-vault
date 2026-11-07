import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {openDojo} from './helpers/p12';
const output='p12-generated/dojo-long-hardening';
async function list(page:Page){await openDojo(page,'no-midi&p104=dojo-long');await page.getByRole('button',{name:'自分の進行',exact:true}).click();await expect(page.locator('.dojo-saved-card')).toHaveCount(8);}
const card=(page:Page,bars:number)=>page.locator('.dojo-saved-card').filter({has:page.locator('.dojo-saved-size',{hasText:`全${bars}小節`})});
for(const [width,height] of [[1168,764],[1280,720],[1920,1080],[1024,768],[768,900],[375,812]])test(`saved progression list and expanded controls are readable ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await list(page);mkdirSync(output,{recursive:true});
 await expect(page.getByRole('spinbutton')).toHaveCount(0);
 await expect(page.locator('.dojo-saved-list')).not.toContainText('練習範囲1');
 await expect(card(page,4).locator('h2')).toHaveText('合成進行 4小節');
 await expect(card(page,12).locator('h2')).toContainText('ユーザー名 ambiguous-bass');
 await expect(card(page,66).locator('h2')).toHaveAttribute('title',/とても長い/);
 const geometry=()=>page.locator('.dojo-saved-list').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth,cards:[...el.querySelectorAll('.dojo-saved-card')].map(c=>({width:c.getBoundingClientRect().width,overflow:c.scrollWidth>c.clientWidth})),buttons:[...el.querySelectorAll('button')].map(b=>b.scrollWidth>b.clientWidth)}));
 let measured=await geometry();expect(measured.overflow).toBe(false);expect(measured.cards.every(c=>!c.overflow)).toBe(true);expect(measured.buttons.some(Boolean)).toBe(false);
 await page.screenshot({path:`${output}/${width}-collapsed.png`,fullPage:true});
 const target=card(page,63);await target.getByRole('button',{name:'区間を選んで練習'}).click();
 await expect(target.getByLabel('開始小節')).toBeVisible();await expect(card(page,66).getByRole('spinbutton')).toHaveCount(0);
 expect(await target.getByLabel('開始小節').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(100);
 measured=await geometry();expect(measured.overflow).toBe(false);expect(measured.cards.every(c=>!c.overflow)).toBe(true);expect(measured.buttons.some(Boolean)).toBe(false);
 await page.screenshot({path:`${output}/${width}-expanded.png`,fullPage:true});
 await card(page,8).getByText('詳細',{exact:true}).click();await expect(card(page,8)).toContainText('元MIDI：28〜35小節');
 await expect(card(page,8)).toContainText('保存した進行：全8小節');
 await page.screenshot({path:`${output}/${width}-details.png`,fullPage:true});
 writeFileSync(`${output}/${width}-geometry.json`,JSON.stringify({width,height,...await geometry()},null,2));
 if(width===1920)expect((await new AxeBuilder({page:page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page']}).include('.dojo-choose-page').analyze()).violations).toEqual([]);
});
test('range validation, single-bar drill, whole length and collapse preserve independent cards',async({page})=>{
 await list(page);const target=card(page,66);
 await target.getByRole('button',{name:'区間を選んで練習'}).click();
 await target.getByLabel('開始小節').fill('67');await expect(target.getByRole('status')).toHaveText('1〜66小節の範囲で指定してください。');
 await expect(target.getByTestId(/^section-practice:/)).toBeDisabled();
 await target.getByLabel('開始小節').fill('3');await target.getByLabel('終了小節').fill('2');await expect(target.getByRole('status')).toContainText('開始小節は終了小節以下');
 await target.getByLabel('開始小節').fill('2');await target.getByRole('button',{name:'2〜2小節を練習する',exact:true}).click();
 await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(1);await expect(page.locator('.dojo-chord-cards')).toContainText('G');
 await page.locator('.dojo-practice-records summary').click();await expect(page.locator('.dojo-record-panel')).toContainText('進行全体の習熟度');
 await page.getByTestId('dojo-back').click();await expect(page.locator('.dojo-saved-card')).toHaveCount(8);
 await card(page,66).getByRole('button',{name:'全体を練習する',exact:true}).click();await expect(page.locator('.dojo-chord-cards>button')).toHaveCount(66);
});
test('theme disables for an active lesson with a reason, not merely because a progression is long',async({page})=>{
 await list(page);await expect(card(page,63).getByRole('button',{name:'今日のテーマにする'})).toBeEnabled();
 await card(page,63).getByRole('button',{name:'今日のテーマにする'}).click();
 await page.getByTestId('practice-start').click();await page.getByTestId('dojo-back').click();
 await page.getByRole('button',{name:'自分の進行',exact:true}).click();
 await expect(card(page,63).getByRole('button',{name:'今日のテーマにする'})).toBeDisabled();
 await expect(card(page,63)).toContainText('今日のレッスンを終了すると選べます。');
});
