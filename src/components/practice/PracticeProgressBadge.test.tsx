// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {PracticeProgressBadge} from './PracticeProgressBadge';
import {dojoStore} from '../../domain/chordDojo/runtime';
import {emptyStore,emptyItem} from '../../domain/chordDojo/store';
import {vaultKey} from '../../domain/chordDojo/collect';
import {dojoLongIdeas} from '../../testing/dojoLongFixture';
const initial=dojoStore.getState();
afterEach(()=>dojoStore.setState(initial,true));
it('retains section history without presenting its partial pass as whole mastery',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const block=dojoLongIdeas()[0].progressionBlocks![0],key=vaultKey(block),file=emptyStore();
 file.progressions[key+':section:1']={...emptyItem(),state:'passed'};
 dojoStore.setState({file,ready:true});const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<PracticeProgressBadge block={block}/>));expect(host.textContent).toBe('');
  await act(async()=>dojoStore.setState({file:{...file,progressions:{...file.progressions,[key]:{...emptyItem(),state:'provisional'}}}}));
  expect(host.textContent).toContain('仮の合格');
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});
