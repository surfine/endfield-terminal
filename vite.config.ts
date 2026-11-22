import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The build is served from /apps/endfield-terminal/ inside the desk and from any folder on its own.
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The page the manifest names.
    rollupOptions: {
      input: { terminal: "terminal/index.html" },
      output: {
        // The desk's themes name the background at its 1.0 address
        // (assets/endfield-background.svg), so it keeps that name.
        assetFileNames: (asset) =>
          asset.names?.includes("endfield-background.svg") ? "assets/[name][extname]" : "assets/[name]-[hash][extname]",
      },
    },
  },
});
