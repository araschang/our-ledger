import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開發時 /api 轉給本機的 FastAPI（uvicorn server.app:app --port 8510）
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:8510" } },
  build: { target: "es2020", sourcemap: false, chunkSizeWarningLimit: 600 },
});
