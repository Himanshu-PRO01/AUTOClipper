import path from 'path'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
plugins: [react()],
  root: "web",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        bypass(req) {
          if (req.url && /\.(ts|tsx|js|jsx|css|json)(\?.*)?$/.test(req.url)) {
            return req.url;
          }
        },
      },
    },
  },
  build: { outDir: "../dist", emptyOutDir: true }
});
