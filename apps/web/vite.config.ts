/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// TODO(ssr): add an Express SSR entry like sera.cx's server/ssr.ts that
// pre-fetches the home and cause pages. Pages avoid window access at module
// top level so they can render on the server unchanged.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    fs: {
      // The mock data layer imports the seed JSON straight from the repo root.
      allow: [repoRoot],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "wouter", "@tanstack/react-query"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-tabs", "lucide-react"],
          qrcode: ["qrcode"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
