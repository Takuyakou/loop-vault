import {test,expect,type Page} from '@playwright/test';
import {openDojo} from './helpers/p12';
import {settlePaint} from './helpers/settle';

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

// P22-01 §3-1 (rule B): a card is entered by its name (the primary); the random key is the list's 「ランダム」 switch, then the card.
const ENTRANCES:[string,string,boolean][]=[
 ['an earlier group: the card','.dojo-builtin-card:not(.dojo-original-card) [data-focus-key^="practice:"]',false],
 ['an earlier group: ランダム, then the card','.dojo-builtin-card:not(.dojo-original-card):not([data-long]) [data-focus-key^="practice:"]',true],
 ['Original: the card','.dojo-original-card [data-focus-key^="original:"]',false],
 ['Original: ランダム, then the card','.dojo-original-card [data-focus-key^="original:"]',true],
 ['Jazz: the card','[data-testid=jazz-open]',false],
 ['Jazz: ランダム, then the card','[data-testid=jazz-open]',true],
];
for(const [name,selector,random] of ENTRANCES){
 for(const how of ['back button','Esc'] as const){
  test(`coming back (${how}) from ${name}: the list is where it was scrolled to and the button has the focus`,async({page})=>{
   test.setTimeout(60000);
   await page.setViewportSize({width:1280,height:720});
   await openList(page);
   if(random)await page.getByTestId('dojo-random-toggle').click();
   const buttons=page.locator(selector),count=await buttons.count();
   expect(count).toBeGreaterThan(0);
   // P22-01 §3 (rule A): the cards lost their button row and are shorter, so an earlier group's 12th card is as far down as its 6th was.
   const index=Math.min(count-1,name.startsWith('an earlier group')?11:5);
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
   await settlePaint(page);
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
