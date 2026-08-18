import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Flat config ignores only node_modules by default and never reads a
  // .gitignore, so the docs/ Docusaurus project's generated output has to be
  // named here as well as in .gitignore or `npm run lint` fails on minified
  // bundles the moment anyone builds the docs site.
  { ignores: ["docs/build/", "docs/.docusaurus/"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: { "no-console": "off" },
  },
]);
