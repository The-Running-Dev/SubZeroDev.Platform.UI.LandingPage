import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // An agent-managed worktree under .claude/worktrees/ is a separate
    // checkout of this repository; without this, vitest's default excludes
    // (node_modules, dist, etc.) miss it and collect its test suites
    // alongside the repository's own, doubling every count.
    // spikes/** for the same reason as .claude/**: an isolated investigation
    // workspace under spikes/ has its own vitest project and its own
    // dependencies, so collecting its suites here would run them against the
    // wrong config and count them as this package's.
    exclude: [...configDefaults.exclude, ".claude/**", "spikes/**"],
  },
});
