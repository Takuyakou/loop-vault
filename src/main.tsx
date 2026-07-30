import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveMidiWindowRoot } from "./components/LiveMidiWindowRoot";
import "./styles.css";

const isLiveMidiWindow = new URLSearchParams(window.location.search).get("window") === "live-midi";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isLiveMidiWindow ? <LiveMidiWindowRoot /> : <App />}
  </React.StrictMode>,
);
