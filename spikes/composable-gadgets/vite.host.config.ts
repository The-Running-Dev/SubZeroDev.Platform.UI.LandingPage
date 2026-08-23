import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The two pages: the composing host, and the gadget's own standalone app. */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: { index: "index.html", standalone: "standalone.html" },
      external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
