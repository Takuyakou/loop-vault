// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {restoreScroll} from './scrollRestore';

/** A scroller 600px tall whose button sits `offset()` px down its content; the content can change height while the test runs. */
function setup(){
  let offset=1000;const height=20;
  const scroller=document.createElement('div');scroller.style.overflowY='auto';
  const list=document.createElement('div');const button=document.createElement('button');
  list.append(button);scroller.append(list);document.body.append(scroller);
  Object.defineProperty(scroller,'scrollHeight',{value:5000});Object.defineProperty(scroller,'clientHeight',{value:600});
  let top=0;Object.defineProperty(scroller,'scrollTop',{get:()=>top,set:(v:number)=>{top=Math.round(v);}});
  scroller.getBoundingClientRect=()=>({top:0,bottom:600} as DOMRect);
  button.getBoundingClientRect=()=>({top:offset-top,bottom:offset-top+height} as DOMRect);
  // 'nearest' lines the bottom up with the edge, then the offset snaps to a whole pixel (here the fraction stays outside).
  button.scrollIntoView=()=>{top=Math.floor(offset+height-600);};
  return {scroller,button,setOffset:(value:number)=>{offset=value;},box:()=>button.getBoundingClientRect()};
}

let observed:(()=>void)|undefined;
class FakeResizeObserver{constructor(callback:()=>void){observed=callback;}observe(){}disconnect(){observed=undefined;}}

afterEach(()=>{document.body.replaceChildren();observed=undefined;vi.unstubAllGlobals();vi.useRealTimers();});

describe('restoreScroll',()=>{
  it('brings the button fully inside even when the whole-pixel scroll leaves a fraction outside',()=>{
    vi.stubGlobal('ResizeObserver',FakeResizeObserver);
    const {button,setOffset,box}=setup();setOffset(1000.17);
    restoreScroll(button,0);
    expect(box().bottom).toBeLessThanOrEqual(600);
    expect(box().top).toBeGreaterThanOrEqual(0);
  });

  it('when the list changes height after coming back, the button is brought back inside',()=>{
    vi.stubGlobal('ResizeObserver',FakeResizeObserver);
    const {button,setOffset,box}=setup();
    restoreScroll(button,0);
    expect(box().bottom).toBeLessThanOrEqual(600);
    // the list above the button grows (cards wrap differently while the sidebar moves): the button is pushed below the edge
    setOffset(1040.3);
    expect(box().bottom).toBeGreaterThan(600);
    observed!();
    expect(box().bottom).toBeLessThanOrEqual(600);
    expect(box().top).toBeGreaterThanOrEqual(0);
  });

  it('stops watching when the user scrolls, presses a key, or the time is up',()=>{
    vi.useFakeTimers();vi.stubGlobal('ResizeObserver',FakeResizeObserver);
    const {button}=setup();
    restoreScroll(button,0);expect(observed).toBeDefined();
    window.dispatchEvent(new Event('wheel'));expect(observed).toBeUndefined();
    restoreScroll(button,0);expect(observed).toBeDefined();
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'}));expect(observed).toBeUndefined();
    restoreScroll(button,0,1000);expect(observed).toBeDefined();
    vi.advanceTimersByTime(1000);expect(observed).toBeUndefined();
  });

  it('leaves a button that is already inside where it is',()=>{
    vi.stubGlobal('ResizeObserver',FakeResizeObserver);
    const {button,setOffset,scroller}=setup();setOffset(300);
    restoreScroll(button,0);
    expect(scroller.scrollTop).toBe(0);
  });
});
