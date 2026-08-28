import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { App } from "./App.js";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  // Fails loudly in dev rather than silently rendering a broken auth state.
  console.error("VITE_CLERK_PUBLISHABLE_KEY is not set — see .env.example");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey ?? ""}>
      <App />
    </ClerkProvider>
  </React.StrictMode>,
);
