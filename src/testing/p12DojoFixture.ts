import {tauriLiveMidiBridge} from '../liveMidi/bridge';
import {connectionController} from '../liveMidi/connectionController';
import {defaultLiveMidiStore} from '../liveMidi/defaultLiveMidiStore';
import type {RawLiveMidiEventBatch} from '../liveMidi/types';
/** Synthetic bridge: only fixture builds with an explicit query; never production. */
export function installP12Fixture(){
 const query=new URLSearchParams(location.search);if(!query.has('p12'))return;
 let handler:((batch:RawLiveMidiEventBatch)=>void)|undefined,available=query.get('p12')!=='no-midi',connectionId='';
 let paused=false,complete:((fail:boolean)=>void)|undefined;const stats={opens:0,closes:0,listeners:0};
 const device={backendId:'p12-synthetic',name:'合成入力',index:0},second={backendId:'p12-second',name:'合成入力2',index:1};
 tauriLiveMidiBridge.listInputs=async()=>available?[device,second]:[];
 tauriLiveMidiBridge.openInput=async d=>{stats.opens++;if(paused){paused=false;await new Promise<void>((resolve,reject)=>{complete=fail=>{complete=undefined;if(fail)reject(Error('合成接続エラー'));else resolve();};});}return connectionId=d.backendId+'-connection';};
 tauriLiveMidiBridge.closeInput=async()=>{stats.closes++;};
 tauriLiveMidiBridge.listenBatches=async fn=>{stats.listeners++;handler=fn;return()=>{stats.listeners--;handler=undefined;};};
 const control={stats,deferOpen(){paused=true;},resumeOpen(fail=false){complete?.(fail);},async plug(){available=true;await defaultLiveMidiStore.getState().refreshDevices();},async unplug(){available=false;await defaultLiveMidiStore.getState().refreshDevices();},pedal(down:boolean){handler?.({connectionId,events:[{timestampMs:performance.now(),status:176,channel:0,data1:64,data2:down?127:0}]});},async connect(){available=true;await defaultLiveMidiStore.getState().refreshDevices();await connectionController.connect();await connectionController.chooseDevice(device.backendId);},emit(notes:number[],on=true,spread=0){const at=performance.now();handler?.({connectionId,events:notes.map((n,i)=>({timestampMs:at+i*spread/Math.max(1,notes.length-1),status:on?144:128,channel:0,data1:n,data2:on?90:0}))});},async disconnect(){await connectionController.disconnect();},held(){let total=0;for(const note of defaultLiveMidiStore.getState().notes.held.values())total+=note.count;return total;}};
 Object.assign(window,{__p12Midi:control,__dojoMonitorCount:0,__dojoMonitorNotes:[]});
}
