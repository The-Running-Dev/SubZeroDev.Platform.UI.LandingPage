import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The remote gadget bundle. React is external here and nowhere else does this
 * matter more: a remote that bundled its own React would render, pass a
 * smoke test, and silently hold a second copy of the reconciler.
 */
export default defineConfig({
  plugins: [react()],
  // Only the host build owns `public/`; without this every build copies it.
  publicDir: false,
  build: {
    outDir: "dist/gadgets/counter",
    emptyOutDir: false,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: { gadget: "src/gadgets/counter/remote.ts" },
      external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
      preserveEntrySignatures: "allow-extension",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "gadget[extname]",
      },
    },
  },
});
