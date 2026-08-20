import { defineConfig } from "vite";

/**
 * Builds the shared-dependency modules the import map points at. All three
 * entries are in one build so Rollup hoists React into a single chunk both
 * import — two builds would produce two Reacts and the singleton claim would
 * be false while still looking right.
 */
export default defineConfig({
  // Only the host build owns `public/`; without this every build copies it.
  publicDir: false,
  build: {
    outDir: "dist/shared",
    emptyOutDir: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        react: "src/shared/react.ts",
        "jsx-runtime": "src/shared/jsx-runtime.ts",
        "react-dom-client": "src/shared/react-dom-client.ts",
      },
      preserveEntrySignatures: "allow-extension",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
      },
    },
  },
});
