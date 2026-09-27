import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveMidiWindowRoot } from "./components/LiveMidiWindowRoot";
import "./styles.css";

const isLiveMidiWindow = new URLSearchParams(window.location.search).get("window") === "live-midi";
// P8.9 component gallery: `?gallery` in development builds and the p89:screens build
// (VITE_P89_GALLERY=1) only. Production builds fold this to false and drop the chunk.
const ComponentGallery = (import.meta.env.DEV || import.meta.env.VITE_P89_GALLERY === "1")
  && new URLSearchParams(window.location.search).has("gallery")
  ? lazy(() => import("./components/ui/ComponentGallery").then((module) => ({ default: module.ComponentGallery })))
  : undefined;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {ComponentGallery ? (
      <Suspense fallback={null}><ComponentGallery /></Suspense>
    ) : isLiveMidiWindow ? <LiveMidiWindowRoot /> : <App />}
  </React.StrictMode>,
);
