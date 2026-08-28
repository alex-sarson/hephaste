import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import { AppAuthProvider } from "./auth/context.js";
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppAuthProvider>
      <App />
    </AppAuthProvider>
  </React.StrictMode>,
);
