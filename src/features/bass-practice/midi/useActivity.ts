import { useEffect, useState } from "react";
import { createMidiBassStorage } from "./library";
import { midiBassLibrarySchema, type MidiBassAttempt } from "./model";
/** Home is read-only: never quarantine/recover or initialize storage here. */
export function useMidiBassActivity() {
  const [attempts,setAttempts]=useState<readonly MidiBassAttempt[]>([]);
  useEffect(()=>{let live=true;const storage=createMidiBassStorage();const refresh=()=>{void storage.readCommitted().then(doc=>{if(!live||!doc)return;let raw:unknown;try{raw=JSON.parse(doc.contents);}catch{return;}const parsed=midiBassLibrarySchema.safeParse(raw);if(parsed.success)setAttempts(parsed.data.songs.flatMap(song=>song.attempts));}).catch(()=>undefined);};refresh();window.addEventListener("bass-midi-library-change",refresh);return()=>{live=false;window.removeEventListener("bass-midi-library-change",refresh);};},[]);
  return attempts;
}
