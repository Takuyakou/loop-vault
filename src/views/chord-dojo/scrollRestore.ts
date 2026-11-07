/** The element that scrolls the page the button is in: the nearest ancestor with room to scroll, else the document. */
export function scrollerOf(element:HTMLElement):HTMLElement|undefined{
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
    const {overflowY}=getComputedStyle(parent);
    if((overflowY==='auto'||overflowY==='scroll'||overflowY==='overlay')&&parent.scrollHeight>parent.clientHeight)return parent;
  }
  return (document.scrollingElement as HTMLElement|null)??undefined;
}

/**
 * Back from a practice: the list goes to where it was scrolled when the button was pressed; when it cannot (the window is another size, the
 * list is shorter), the button is brought into view instead.
 */
export function restoreScroll(button:HTMLElement,scrollTop:number|undefined):void{
  const scroller=scrollerOf(button);if(!scroller)return;
  if(scrollTop!==undefined)scroller.scrollTop=scrollTop;
  const room=scroller===document.scrollingElement?{top:0,bottom:window.innerHeight}:scroller.getBoundingClientRect(),box=button.getBoundingClientRect();
  if(box.top<room.top||box.bottom>room.bottom)button.scrollIntoView({block:'nearest'});
}
