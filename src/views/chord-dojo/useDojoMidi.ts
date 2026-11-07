import * as Tone from 'tone';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useStore} from 'zustand';
import {defaultLiveMidiStore} from '../../liveMidi/defaultLiveMidiStore';
import {useMidiConnection} from '../../liveMidi/useMidiConnection';
import {startDojoPianoInput} from './midiInput';

export function useDojoMidi(audible:boolean,muted=false){
 const view=useMidiConnection();const connected=view.connected;const deviceId=useStore(defaultLiveMidiStore,s=>s.selected?.backendId);
 const inputState=view.kind==='connected'?'connected':view.kind==='error'?'error':view.kind==='searching'?'initializing':view.kind==='connecting'?'connecting':'disconnected';
 const cleanup=useRef<ReturnType<typeof startDojoPianoInput>>();const mutedRef=useRef(muted);mutedRef.current=muted;
 const [contextRunning,setContextRunning]=useState(()=>Tone.getContext().state==='running');
 useEffect(()=>{const context=Tone.getContext(),update=()=>setContextRunning(context.state==='running');context.on('statechange',update);update();return()=>{context.off('statechange',update);};},[]);
 const [audioState,setAudioState]=useState<'off'|'loading'|'ready'|'error'>('off'),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!audible||!connected){setAudioState('off');return;}setAudioState('loading');const close=startDojoPianoInput(setAudioState,undefined,undefined,mutedRef.current);cleanup.current=close;return()=>{close();cleanup.current=undefined;};},[audible,connected,deviceId,retry]);
 useEffect(()=>{cleanup.current?.setMuted(muted);},[muted]);
 const prepareAudio=useCallback(()=>{if(connected&&Tone.getContext().state!=='running')void Tone.start().catch(()=>setAudioState('error'));},[connected]);
 const resetAudio=useCallback(()=>{cleanup.current?.reset();},[]);
 return {view,resetAudio,prepareAudio,connected,inputState,inputError:view.error,connectionKey:connected?deviceId:undefined,audioState:audioState==='ready'&&!contextRunning?'suspended':audioState,retryAudio:()=>{prepareAudio();setRetry(n=>n+1);}};
}
