import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Flat config ignores only node_modules by default and never reads a
  // .gitignore, so the docs/ Docusaurus project's generated output has to be
  // named here as well as in .gitignore or `npm run lint` fails on minified
  // bundles the moment anyone builds the docs site. .claude/ is excluded for
  // the same reason: an agent-managed worktree under .claude/worktrees/ has
  // its own tsconfig, which collides with this one during parsing.
  // spikes/ is excluded for a third reason: it is an isolated investigation
  // workspace with its own package.json, tsconfig and React toolchain
  // (spikes/composable-gadgets/README.md). Its sources are not the package's
  // and are never published; linting them here would only assert this
  // repository's rules against code written to answer a design question.
  { ignores: ["docs/build/", "docs/.docusaurus/", ".claude/", "spikes/"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: { "no-console": "off" },
  },
]);
