/** The element that scrolls the page the button is in: the nearest ancestor with room to scroll, else the document. */
export function scrollerOf(element:HTMLElement):HTMLElement|undefined{
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
    const {overflowY}=getComputedStyle(parent);
    if((overflowY==='auto'||overflowY==='scroll'||overflowY==='overlay')&&parent.scrollHeight>parent.clientHeight)return parent;
  }
  return (document.scrollingElement as HTMLElement|null)??undefined;
}

/** Puts the button inside the scroller's visible part when it is (even a fraction of a pixel) outside it. */
function bringIntoView(scroller:HTMLElement,button:HTMLElement):void{
  const room=()=>scroller===document.scrollingElement?{top:0,bottom:window.innerHeight}:scroller.getBoundingClientRect();
  let box=button.getBoundingClientRect(),view=room();
  if(box.top>=view.top&&box.bottom<=view.bottom)return;
  button.scrollIntoView({block:'nearest'});
  // The scroll offset snaps to whole pixels, so 'nearest' can leave the button a fraction outside the edge.
  box=button.getBoundingClientRect();view=room();
  if(box.bottom>view.bottom)scroller.scrollTop+=Math.ceil(box.bottom-view.bottom);
  else if(box.top<view.top)scroller.scrollTop-=Math.ceil(view.top-box.top);
}

/** How long after coming back the list is watched: the sidebar folding after a window resize takes about 0.25 s. */
export const SETTLE_MS=1000;

/**
 * Back from a practice: the list goes to where it was scrolled when the button was pressed; when it cannot (the window is another size, the
 * list is shorter), the button is brought into view instead. For a short while after, when the list changes size (the sidebar folding
 * widens it, so the cards wrap into fewer lines), the button is brought back into view again; scrolling or a key ends that watch.
 * Returns the function that ends the watch.
 */
export function restoreScroll(button:HTMLElement,scrollTop:number|undefined,settleMs=SETTLE_MS):()=>void{
  const scroller=scrollerOf(button);if(!scroller)return()=>undefined;
  if(scrollTop!==undefined)scroller.scrollTop=scrollTop;
  bringIntoView(scroller,button);
  if(typeof ResizeObserver==='undefined')return()=>undefined;
  const observer=new ResizeObserver(()=>bringIntoView(scroller,button));
  for(const child of Array.from(scroller.children))observer.observe(child);
  const stopEvents=['wheel','pointerdown','keydown','touchstart'] as const;
  const stop=()=>{observer.disconnect();clearTimeout(timer);for(const type of stopEvents)window.removeEventListener(type,stop,true);};
  const timer=setTimeout(stop,settleMs);
  for(const type of stopEvents)window.addEventListener(type,stop,true);
  return stop;
}
