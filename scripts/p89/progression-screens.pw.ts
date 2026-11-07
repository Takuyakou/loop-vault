import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
test('P10.4 shared progression page evidence',async({page})=>{
 const out=resolve('p89-generated',process.env.P89_SCREENS_NAME!);mkdirSync(out,{recursive:true});
 const audits:{file:string;overflow:number}[]=[];
 for(const [width,height] of [[1920,1080],[1440,900],[960,1032],[768,640]]){
  await page.setViewportSize({width:width!,height:height!});await page.goto('/?p104=normal');
  await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').first().getByRole('button',{name:/進行を開く/}).click();
  const shot=async(name:string)=>{const file=`${name}@${width}x${height}.png`;const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));expect(overflow).toBe(0);await page.screenshot({path:resolve(out,file),fullPage:true});audits.push({file,overflow});};
  await expect(page.getByTestId('correction-piano-roll')).toBeVisible();await shot('initial');
  const cards=page.getByTestId('correction-card');await cards.first().click();await shot('selected');
  await page.getByTestId('correction-mode-edit').click();await shot('edit');
  await page.locator('.lv-cw-note[data-card="p104-0"]').first().click();await shot('changed');
  await cards.first().click({button:'right'});await cards.nth(2).click({button:'right'});await shot('range');
  await page.getByRole('button',{name:'別の版として保存',exact:true}).click();await expect(page.getByRole('dialog',{name:'別の版として保存',exact:true})).toBeVisible();await shot('version-dialog');
  await page.goto('/?p104=long');await page.locator('[data-nav="vault"]').click();await page.locator('.lv-vault-row').first().getByRole('button',{name:/進行を開く/}).click();await page.getByRole('button',{name:'全体',exact:true}).click();await expect(page.getByTestId('correction-card')).toHaveCount(70);await shot('long');
 }
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify({synthetic:true,audits},null,2));
});
