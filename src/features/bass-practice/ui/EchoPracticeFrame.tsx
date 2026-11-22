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
/** P23-62: `rail={false}` is the practice stage — one column, no right rail (the stage owns every control). */
export function EchoPracticeFrame({ children, active = true, rail: withRail = true }: { children: ReactNode; active?: boolean; rail?: boolean }) {
  const [rail, setRail] = useState<HTMLElement | null>(null);
  return <ActiveContext.Provider value={active}><FramedContext.Provider value={true}><RailContext.Provider value={withRail ? rail : null}>
    <div className="bass-echo-frame" data-rail={withRail ? undefined : "false"}><div className="bass-echo-main">{children}</div>
    {withRail ? <aside ref={setRail} className="bass-echo-rail" aria-label="録音と練習記録" /> : null}</div>
  </RailContext.Provider></FramedContext.Provider></ActiveContext.Provider>;
}
