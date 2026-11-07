import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
const RailContext = createContext<HTMLElement | null>(null);
const FramedContext = createContext(false);
export function useEchoFramed() { return useContext(FramedContext); }
const ActiveContext = createContext(true);
export function useEchoActive() { return useContext(ActiveContext); }
export function EchoRail({ children }: { children: ReactNode }) {
  const rail = useContext(RailContext);
  return rail ? createPortal(children, rail) : <>{children}</>;
}
export function EchoPracticeFrame({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [rail, setRail] = useState<HTMLElement | null>(null);
  return <ActiveContext.Provider value={active}><FramedContext.Provider value={true}><RailContext.Provider value={rail}>
    <div className="bass-echo-frame"><div className="bass-echo-main">{children}</div>
    <aside ref={setRail} className="bass-echo-rail" aria-label="録音と練習記録" /></div>
  </RailContext.Provider></FramedContext.Provider></ActiveContext.Provider>;
}
