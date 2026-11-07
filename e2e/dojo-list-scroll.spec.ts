import {test,expect,type Page} from '@playwright/test';
import {openDojo} from './helpers/p12';

/**
 * The list of 定番の進行 (the earlier groups, Original, Jazz): the titles of the cards are one colour, and coming back from a practice
 * (the back button or Esc) puts the list at the scroll it had when the button was pressed, with the focus on that button.
 */
async function openList(page:Page){
 await openDojo(page,'midi');
 await page.getByRole('button',{name:'定番の進行',exact:true}).click();
 await expect(page.locator('.dojo-builtin-jump')).toBeVisible();
}
/** The element that scrolls the list: the nearest ancestor with room to scroll. */
const scrollTopOf=(page:Page)=>page.evaluate(()=>{
 const start=document.querySelector('.dojo-builtin-jump')!;
 for(let p=start.parentElement;p;p=p.parentElement){const y=getComputedStyle(p).overflowY;if((y==='auto'||y==='scroll')&&p.scrollHeight>p.clientHeight)return p.scrollTop;}
 return document.scrollingElement!.scrollTop;
});
const scrollListBy=(page:Page,target:string,extra:number)=>page.evaluate(({target,extra})=>{
 const button=document.querySelector(target)!;button.scrollIntoView({block:'center'});
 for(let p=button.parentElement;p;p=p.parentElement){const y=getComputedStyle(p).overflowY;if((y==='auto'||y==='scroll')&&p.scrollHeight>p.clientHeight){p.scrollTop+=extra;return;}}
 document.scrollingElement!.scrollTop+=extra;
},{target,extra});

test('the titles of the cards are one colour and weight in every group (the earlier ones, Original, Jazz)',async({page})=>{
 await openList(page);
 const titles=await page.evaluate(()=>[...document.querySelectorAll('.dojo-builtin-title>h2,.dojo-builtin-title>h3')].map(e=>{const s=getComputedStyle(e);return `${s.color}|${s.fontWeight}|${s.fontSize}`;}));
 expect(titles.length).toBeGreaterThan(20);
 expect(new Set(titles).size).toBe(1);
 expect(titles[0]).toBe('rgb(242, 246, 252)|700|15px');
});

const ENTRANCES:[string,string][]=[
 ['an earlier group: これを練習する','.dojo-builtin-card:not(.dojo-original-card) [data-focus-key^="practice:"]'],
 ['an earlier group: ランダムキーで練習','.dojo-builtin-card:not(.dojo-original-card) [data-focus-key^="endless:"]'],
 ['Original: これを練習する','.dojo-original-card [data-focus-key^="original:"]'],
 ['Original: ランダムキーで練習','.dojo-original-card [data-focus-key^="original-random:"]'],
 ['Jazz: これを練習する','[data-testid=jazz-open]'],
 ['Jazz: ランダムキーで練習','[data-testid=jazz-open-random]'],
];
for(const [name,selector] of ENTRANCES){
 for(const how of ['back button','Esc'] as const){
  test(`coming back (${how}) from ${name}: the list is where it was scrolled to and the button has the focus`,async({page})=>{
   test.setTimeout(60000);
   await page.setViewportSize({width:1280,height:720});
   await openList(page);
   const buttons=page.locator(selector),count=await buttons.count();
   expect(count).toBeGreaterThan(0);
   const index=Math.min(count-1,5);
   await buttons.nth(index).evaluate(e=>e.setAttribute('data-e2e-target','1'));
   await scrollListBy(page,'[data-e2e-target="1"]',37);
   const before=await scrollTopOf(page);
   expect(before).toBeGreaterThan(200);                       // it really is scrolled down the list
   const key=await buttons.nth(index).getAttribute('data-focus-key');
   await buttons.nth(index).click();
   await expect(page.locator('.dojo-builtin-jump')).toBeHidden();
   if(how==='Esc')await page.keyboard.press('Escape');
   else await page.getByRole('button',{name:/定番の進行/}).first().click();
   await expect(page.locator('.dojo-builtin-jump')).toBeVisible();
   await expect.poll(()=>page.evaluate(()=>document.activeElement?.getAttribute('data-focus-key')??null)).toBe(key);
   await expect.poll(async()=>Math.abs((await scrollTopOf(page))-before)).toBeLessThanOrEqual(4);
  });
 }
}

test('when the window changed size meanwhile and the same scroll cannot be had, the button that was pressed is in view',async({page})=>{
 test.setTimeout(60000);
 await page.setViewportSize({width:1280,height:720});
 await openList(page);
 const button=page.locator('[data-testid=jazz-open]').nth(10);
 await button.evaluate(e=>e.setAttribute('data-e2e-target','1'));
 await scrollListBy(page,'[data-e2e-target="1"]',0);
 await button.click();
 await expect(page.locator('.dojo-builtin-jump')).toBeHidden();
 await page.setViewportSize({width:1000,height:640});
 await page.keyboard.press('Escape');
 await expect(page.locator('.dojo-builtin-jump')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const b=document.querySelector('[data-e2e-target="1"]')?.getBoundingClientRect()??null;const e=document.activeElement?.getBoundingClientRect();return e?e.top>=0&&e.bottom<=window.innerHeight&&document.activeElement?.getAttribute('data-focus-key')?.startsWith('jazz:'):b===null;})).toBe(true);
});
