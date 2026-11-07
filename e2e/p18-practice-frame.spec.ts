import {test,expect,type Page} from '@playwright/test';
import {openDojo,type MidiControl} from './helpers/p12';

/**
 * P18-01 Stage 1: the practice screens of 定番の進行 (A the standard progressions: ① and ②, B the random key, C Original Practice, D Jazz Progressions)
 * have the same frame (top row, settings, cards, message and buttons, staff, keyboard, a free strip under the keyboard) and fit the five sizes.
 */
const SIZES=[[1280,720],[1366,768],[1440,900],[1920,1080],[768,640]] as const;
const connect=(page:Page)=>page.evaluate(async()=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.connect());
const emit=(page:Page,notes:readonly number[],on=true)=>page.evaluate(({notes,on})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,on),{notes:[...notes],on});
const answer=(page:Page)=>page.locator('.dojo-keyboard [data-midi-note]:has([data-answer-marker])').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-midi-note'))).sort((a,b)=>a-b));
async function list(page:Page){await openDojo(page,'midi');await page.getByRole('button',{name:'定番の進行',exact:true}).click();await expect(page.locator('.dojo-builtin-jump')).toBeVisible();}
const builtinCard=(page:Page)=>page.locator('.dojo-builtin-card').filter({has:page.getByRole('heading',{name:'王道進行',exact:true})});

const OPEN:Record<string,(page:Page)=>Promise<void>>={
 async 'A ① 見て弾く'(page){await list(page);await builtinCard(page).getByRole('button',{name:'これを練習する'}).click();await expect(page.locator('[data-dojo-screen=practice]')).toBeVisible();await connect(page);await expect(page.locator('.dojo-chord-cards>button').first()).toBeVisible();},
 async 'A ② 覚えて弾く'(page){
  await OPEN['A ① 見て弾く']!(page);
  for(let i=0;i<4;i+=1){const notes=await answer(page);await emit(page,notes);await emit(page,notes,false);if(i<3)await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',new RegExp(`:see:0:${i+1}$`),{timeout:10000});}
  await page.getByRole('button',{name:'② 覚えて弾くへ（Enter）'}).click();await expect(page.locator('.dojo')).toHaveAttribute('data-dojo-cursor',/:recall:0:0$/,{timeout:10000});
 },
 async 'B ランダムキー'(page){await list(page);await builtinCard(page).getByRole('button',{name:'ランダムキーで練習'}).click();await expect(page.getByTestId('dojo-endless')).toBeVisible();await connect(page);await expect(page.getByTestId('dojo-endless')).toHaveAttribute('data-endless-phase','active',{timeout:10000});},
 async 'C Original Practice'(page){await list(page);await page.locator('.dojo-original-card[data-original=op-traditional-passing]').getByRole('button',{name:'これを練習する'}).click();await expect(page.getByTestId('dojo-original')).toBeVisible();await connect(page);},
 async 'D Jazz Progressions'(page){await list(page);await page.locator('[data-jazz-item=jazz-progressions-001]').getByTestId('jazz-open').click();await expect(page.getByTestId('dojo-jazz')).toBeVisible();await connect(page);},
 async 'D ② 覚えて弾く'(page){await OPEN['D Jazz Progressions']!(page);await page.getByTestId('dojo-stage-2').click();await expect(page.getByTestId('dojo-jazz')).toHaveAttribute('data-jazz-stage','recall');},
};

for(const [name,open] of Object.entries(OPEN))for(const [w,h] of SIZES)test(`${name} fits the frame at ${w}x${h}`,async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:w,height:h});
 await open(page);
 await page.waitForTimeout(400);
 const tall=!(w===768);
 const m=await page.evaluate(()=>{
  const q=(s:string)=>document.querySelector(s) as HTMLElement|null,rect=(e:Element|null)=>e?e.getBoundingClientRect():null;
  const head=q('.dojo-practice-head')!,center=q('.dojo-endless-center')!,cards=[...document.querySelectorAll('.dojo-endless-cards>button')] as HTMLElement[],staff=q('[data-testid=dojo-score]')!,kb=q('.dojo-keyboard')!,safe=q('[data-testid=practice-safe]')!;
  const c=rect(center)!,s=rect(staff)!,k=rect(kb)!;
  const buttons=[...document.querySelectorAll('.dojo-endless-actions button, .dojo-practice-say button, .dojo-response button')].map(b=>rect(b)!);
  const msg=q('.dojo-endless-result, .dojo-result');
  const tops=new Set([...head.children].map(e=>{const r=e.getBoundingClientRect();return Math.round((r.top+r.bottom)/2/8);}));
  const title=q('.dojo-endless-name b')!;
  const notes=[...document.querySelectorAll('.dojo-endless-cards .dojo-original-notes')].map(e=>({n:rect(e)!,card:rect(e.closest('button'))!}));
  const main=q('#main-content')!;
  return {overflowX:document.documentElement.scrollWidth-innerWidth,headRows:tops.size,headTitleVisible:title.getBoundingClientRect().width>20&&getComputedStyle(title).visibility!=='hidden',
   centreScroll:center.scrollHeight-center.clientHeight,cardsInside:cards.every(b=>{const r=b.getBoundingClientRect();return r.bottom<=c.bottom+1&&r.top>=c.top-1&&r.right<=innerWidth+1;}),cardCount:cards.length,
   notesInside:notes.every(x=>x.n.bottom<=x.card.bottom+1),buttonsInside:buttons.length>0&&buttons.every(b=>b.bottom<=c.bottom+1&&b.top>=c.top-1),msgInside:msg?rect(msg)!.bottom<=c.bottom+1:false,
   actionsAboveStaff:buttons.every(b=>b.bottom<=s.top+1),staffAboveKeys:s.bottom<=k.top+1,keyboardBottom:k.bottom,safeHeight:safe.getBoundingClientRect().height,safeBottom:safe.getBoundingClientRect().bottom,
   viewportBottom:innerHeight,mainScrollable:main.scrollHeight>main.clientHeight+1,mainBottom:main.getBoundingClientRect().bottom,docScroll:document.documentElement.scrollHeight-innerHeight};
 });
 expect(m.overflowX,'no sideways overflow').toBe(0);
 expect(m.headRows,'the top row is one line').toBe(1);
 expect(m.headTitleVisible,'the title is seen').toBe(true);
 expect(m.safeHeight,'the free strip under the keyboard').toBeGreaterThanOrEqual(16);
 if(tall){
  expect(m.centreScroll,'no vertical scroll in the centre').toBe(0);
  expect(m.cardsInside,'every card is seen').toBe(true);expect(m.notesInside,'the second line of the notes is seen').toBe(true);
  expect(m.buttonsInside,'the buttons are seen').toBe(true);expect(m.msgInside,'the message is seen').toBe(true);
  expect(m.actionsAboveStaff,'the buttons do not touch the staff').toBe(true);expect(m.staffAboveKeys).toBe(true);
  // the keyboard is not at the bottom of the window: the strip is under it
  expect(m.viewportBottom-m.keyboardBottom,'the keyboard is clear of the bottom of the window').toBeGreaterThanOrEqual(16);
 }else{
  // 768x640: the page may scroll; at the bottom of it the strip is still there
  await page.locator('#main-content').evaluate(e=>e.scrollTo({top:e.scrollHeight}));
  const end=await page.evaluate(()=>{const kb=document.querySelector('.dojo-keyboard')!.getBoundingClientRect(),main=document.querySelector('#main-content')!.getBoundingClientRect();return main.bottom-kb.bottom;});
  expect(end,'at the bottom of the page the keyboard is clear of the edge').toBeGreaterThanOrEqual(16);
 }
});

/** P18-02: D ② with a hint-marked card (the mark is the small corner tag): the buttons must not reach the staff (1280×720 / 1366×768 / 1440×900). */
for(const [w,h] of [[1280,720],[1366,768],[1440,900]] as const)test(`D ② with a hint-marked card fits the frame at ${w}x${h}`,async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:w,height:h});
 await OPEN['D ② 覚えて弾く']!(page);
 await page.getByTestId('jazz-reveal').click();
 await expect(page.getByTestId('jazz-card').first()).toHaveAttribute('data-hint','true');
 await page.waitForTimeout(400);
 const m=await page.evaluate(()=>{
  const q=(s:string)=>document.querySelector(s) as HTMLElement|null,rect=(e:Element|null)=>e?e.getBoundingClientRect():null;
  const center=q('.dojo-endless-center')!,staff=q('[data-testid=dojo-score]')!,cards=[...document.querySelectorAll('.dojo-endless-cards>button')] as HTMLElement[];
  const buttons=[...document.querySelectorAll('.dojo-endless-actions button, .dojo-practice-say button, .dojo-response button')].map(b=>rect(b)!);
  const heights=cards.map(b=>Math.round(b.getBoundingClientRect().height));
  return {overflowX:document.documentElement.scrollWidth-innerWidth,centreScroll:center.scrollHeight-center.clientHeight,
   buttonsAboveStaff:buttons.every(b=>b.bottom<=staff.getBoundingClientRect().top+1),
   equalCardHeights:new Set(heights).size===1,marks:true};
 });
 expect(m.overflowX,'no sideways overflow').toBe(0);
 expect(m.centreScroll,'no vertical scroll in the centre').toBe(0);
 expect(m.buttonsAboveStaff,'the buttons do not touch the staff').toBe(true);
 expect(m.equalCardHeights,'the hint mark does not change the height of the cards').toBe(true);
});
