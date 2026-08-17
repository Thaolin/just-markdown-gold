import React from "react";
import ReactDOM from "react-dom/client";
import App from "./TabbedApp";
import { installBrowserFallback } from "./browserFallback";
import "./styles.css";

installBrowserFallback();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
