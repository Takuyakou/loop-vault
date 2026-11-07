import {NAMES} from '../../domain/chordDojo/recipes';
import type {ItemRecord} from '../../domain/chordDojo/store';
import {keyDisplay} from './presentation';
/** `only`: show just these keys (a progression practised in six keys shows six). The 12-key table is the default. */
export function DojoKeyGrid({record,limit,current,only}:{record?:ItemRecord;limit:number;current?:number;only?:readonly number[]}){
 return <><div className="dojo-keys" aria-label={only?`${only.length}キー`:'12キー'} data-keys={only?only.length:12}>{NAMES.map((name,root)=>{if(only&&!only.includes(root))return null;const d=keyDisplay(record,root,limit);const label=d.state==='fast'?'速く弾けた':d.state==='slow'?'遅かった':d.state==='self'?'自分で判定':'まだ';return <div key={root} className="dojo-key-status" data-key-root={root} data-state={d.state} data-current={root===current||undefined} aria-current={root===current?'step':undefined} aria-label={`${name} ${label}${d.seconds===undefined?'':` ${d.seconds.toFixed(1)}秒`}${root===current?' 現在':''}`}><span>{name}</span><small>{d.seconds===undefined?d.state==='self'?'自己':'—':`${d.seconds.toFixed(1)}s`}</small></div>;})}</div><div className="dojo-key-legend"><span><i data-state="fast"/>速く弾けた</span><span><i data-state="slow"/>遅かった</span><span><i data-state="pending"/>まだ</span></div></>;
}
