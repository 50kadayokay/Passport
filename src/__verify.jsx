import React from "react";
import { createRoot } from "react-dom/client";
import pp from "./__pp_sample.json";
import "./index.css";
window.__PP__ = pp;
const { default: App } = await import("./aiBrief/PassportProto.jsx");
createRoot(document.getElementById("root")).render(<App />);
