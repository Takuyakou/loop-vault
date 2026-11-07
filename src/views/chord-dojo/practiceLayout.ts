import {useEffect,useState,type CSSProperties} from 'react';
import {keyboardKeyHeight} from '../ear-practice/earKeyboardHeight';

/**
 * How the practice screens of 定番の進行 (A the standard progressions, B their random key, C Original Practice, D Jazz Progressions) are laid
 * out for the room they have (the practice area, in pixels): the same rows for all of them.
 * - `compact`: the usual small-window arrangement (what 1280×720 and 1366×768 have): everything in a short stack, what a progression
 *   teaches (Jazz) in the caption of the staff.
 * - `stacked`: a taller window (any width: one column from the top: the row of settings, the cards, the seek bar, the message and the
 *   buttons, what the progression teaches): the group is larger (up to 1.4 times), what the progression teaches is under the message
 *   (two lines, the rest behind 「続き」), the staff and the keyboard grow.
 * Under the keyboard there is always a free strip (`safe`), so that the keyboard does not touch the bottom of the window or the taskbar.
 */
export type PracticeLayoutKind='compact'|'stacked';
export interface PracticeLayout{
  kind:PracticeLayoutKind;
  /** The height of the staff row (px). */
  staff:number;
  /** How high the keys are drawn (px) and how much larger their marks are. */
  keyHeight:number;
  markScale:number;
  /** How much larger the text and the cards are than at the smallest size (1 = as small). */
  scale:number;
  /** The free strip under the keyboard (px). It is taken from the room of the staff, never from the cards, the fingers or the keys. */
  safe:number;
}
/** What the practice area has above the cards (its head row), below the staff and the keyboard, kept for the group of cards. */
const HEAD=42;
/** The line above the keys (the legend) and the room around the keys. */
const KEYBOARD_CHROME=40;
const CENTRE_MINIMUM=425;
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value));
/** The marks on the keys are a little larger even when the screen is small, so that the fingers can be read. */
export const PRACTICE_COMPACT:PracticeLayout={kind:'compact',staff:210,keyHeight:128,markScale:1.4,scale:1,safe:16};

/** `width`/`height`: the practice area. `whiteKeys`: the white keys of the keyboard of the progression on the screen. */
export function practiceLayout(width:number,height:number,whiteKeys:number):PracticeLayout{
  if(!(width>=1000&&height>=780))return PRACTICE_COMPACT;
  const safe=24;
  const staff=clamp(Math.round(height*0.26),210,300);
  const room=height-HEAD-staff-CENTRE_MINIMUM-KEYBOARD_CHROME-safe;
  const keyHeight=Math.max(128,keyboardKeyHeight({width:width-32,whiteKeys,room,narrowWindow:false}));
  return {kind:'stacked',staff,keyHeight,markScale:clamp(keyHeight/128,1.4,1.6),scale:Math.round(clamp(width/1048,1,1.4)*100)/100,safe};
}
export const practiceKeyboardChrome=KEYBOARD_CHROME;
/** The row of the settings grows with the screen only up to this (the cards and the text go on to 1.4): it has to stay on one line. */
export const PRACTICE_BAR_SCALE_MAX=1.15;

/**
 * Measures the practice area (the element `ref` is given to) and says how it is laid out; `style` carries the numbers to the CSS
 * (`--pf-*`). Before the first measure the compact layout is used.
 */
export function usePracticeLayout(whiteKeys:number,cards:number):{ref:(element:HTMLDivElement|null)=>void;layout:PracticeLayout;style:CSSProperties}{
  // A callback ref: the screen may put the area on the page later than its first render (A shows it only for a practice begun from the list).
  const [element,setElement]=useState<HTMLDivElement|null>(null);
  const [room,setRoom]=useState<{width:number;height:number}>();
  useEffect(()=>{
    if(!element)return undefined;
    const measure=()=>setRoom({width:element.clientWidth,height:element.clientHeight});
    measure();
    if(typeof ResizeObserver==='undefined')return undefined;
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[element]);
  const layout=room?practiceLayout(room.width,room.height,whiteKeys):PRACTICE_COMPACT;
  const style={'--pf-staff':`${layout.staff}px`,'--pf-kb':`${layout.keyHeight+KEYBOARD_CHROME}px`,'--pf-safe':`${layout.safe}px`,'--pf-scale':layout.scale,'--pf-bar':Math.min(layout.scale,PRACTICE_BAR_SCALE_MAX),'--pf-cards':cards} as CSSProperties;
  return {ref:setElement,layout,style};
}
