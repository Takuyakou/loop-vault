import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const output=".local-evaluation/p11-13/screenshots";
async function setMode(page:Page, mode:"CURRENT"|"E1-T") {
  await page.locator('[data-nav="settings"]').click();
  const developer=page.locator('#settings-developer button[aria-expanded]');
  if(await developer.getAttribute('aria-expanded')!=="true")await developer.click();
  await page.getByLabel("運指方式",{exact:true}).selectOption(mode);
  await page.locator('[data-nav="voicing-loop"]').click();
}
async function notesAndHands(page:Page) {
  return page.locator('[data-testid="voicing-loop-workspace"] [data-midi-note] [data-finger-label]').evaluateAll(nodes=>nodes.map(node=>({
    note:node.closest('[data-midi-note]')?.getAttribute('data-midi-note'),hand:node.getAttribute('data-finger-label')?.slice(0,1),
  })));
}
test("P11-13 developer comparison preserves notes, hands and Range; resets to CURRENT on reload",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/?p527Status=p533-rules');await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByRole('button',{name:'元MIDI',exact:true}).click();
  const before=await notesAndHands(page);expect(before.length).toBeGreaterThan(0);
  const current=page.getByTestId('voicing-loop-current-panel');mkdirSync(output,{recursive:true});
  await current.screenshot({path:`${output}/current-1440.png`});
  await setMode(page,"E1-T");
  await expect(page.getByRole('button',{name:'元MIDI',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await notesAndHands(page)).toEqual(before);
  const labels=await page.getByTestId('voicing-loop-current-voicing').innerText();
  const cards=page.getByTestId('voicing-loop-event');await cards.nth(1).click({button:"right"});await cards.nth(2).click({button:"right"});
  await expect(page.getByTestId('voicing-loop-range-chip')).toBeVisible();await cards.nth(0).click();
  expect(await page.getByTestId('voicing-loop-current-voicing').innerText()).toBe(labels);
  await current.screenshot({path:`${output}/e1-t-1440.png`});
  await expect(page.getByTestId('voicing-loop-finger-slot')).toHaveCount(10);
  await expect(page.getByTestId('voicing-loop-movement-certainty')).toHaveCount(2);
  const geometry=await current.evaluate(node=>({client:node.clientHeight,scroll:node.scrollHeight}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
  const axe=await new AxeBuilder({page:page as never}).include('[data-testid="voicing-loop-current-panel"]').analyze();
  expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
  await setMode(page,"CURRENT");expect(await notesAndHands(page)).toEqual(before);
  await page.reload();await page.locator('[data-nav="settings"]').click();
  const developer=page.locator('#settings-developer button[aria-expanded]');if(await developer.getAttribute('aria-expanded')!=="true")await developer.click();
  await expect(page.getByLabel('運指方式',{exact:true})).toHaveValue('CURRENT');
});
