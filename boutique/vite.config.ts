import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
        headers: { Origin: "http://127.0.0.1:8788" },
      },
    },
  },
  build: { target: "es2022" },
});
