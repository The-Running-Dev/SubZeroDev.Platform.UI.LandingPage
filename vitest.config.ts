import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // An agent-managed worktree under .claude/worktrees/ is a separate
    // checkout of this repository; without this, vitest's default excludes
    // (node_modules, dist, etc.) miss it and collect its test suites
    // alongside the repository's own, doubling every count.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
