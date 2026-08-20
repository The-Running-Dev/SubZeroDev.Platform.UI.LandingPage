import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Flat config ignores only node_modules by default and never reads a
  // .gitignore, so the docs/ Docusaurus project's generated output has to be
  // named here as well as in .gitignore or `npm run lint` fails on minified
  // bundles the moment anyone builds the docs site. .claude/ is excluded for
  // the same reason: an agent-managed worktree under .claude/worktrees/ has
  // its own tsconfig, which collides with this one during parsing.
  { ignores: ["docs/build/", "docs/.docusaurus/", ".claude/"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: { "no-console": "off" },
  },
]);
