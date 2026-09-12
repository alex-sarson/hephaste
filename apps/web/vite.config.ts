import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA over a separate native app — see brief: this is the sole "mobile app"
// delivery mechanism (installable, responsive), no React Native codebase.
export default defineConfig({
  // Vite only reads .env files from its own root (this directory) by
  // default — but this is a monorepo with a single .env at the repo root
  // (see .env.example). Without this, VITE_* vars silently resolve to
  // undefined regardless of what's set at the repo root.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Hephaste",
        short_name: "Hephaste",
        description: "Manage jobs, clients, and invoicing in one place",
        // Gold Subtle colourway (design/GoldSubtle.dc.html) — --accent and
        // --bg converted to hex, since manifest parsers can't be counted
        // on to understand oklch() the way a modern browser's CSS engine
        // can.
        theme_color: "#a27000",
        background_color: "#fbf6ec",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
