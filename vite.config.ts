import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${apiPort}`,
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
