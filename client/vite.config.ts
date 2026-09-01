import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "/kessler/",
  build: { outDir: path.resolve(__dirname, "../dist/client"), emptyOutDir: true },
  server: { port: 5174, proxy: { "/kessler/api": { target: "http://localhost:3006", rewrite: (p) => p.replace(/^\/kessler/, "") } } },
});
