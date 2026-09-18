import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // mirror the tsconfig "@/*" path alias so component tests can load pages that
  // import "@/lib/api", "@/components/AppShell", etc.
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  // use the automatic JSX runtime (like Next.js) so components need no React import
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",   // component tests opt into jsdom via a per-file docblock
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // Raises Testing Library's async-utils timeout (waitFor/findBy) for every
    // test file. Import-only side effect (configure()), safe under the node
    // environment too — it touches no DOM at load time.
    setupFiles: ["./test/setup.ts"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
    // The component tests drive real React effect flushing through userEvent +
    // waitFor. Their actual work is well under a second, but the default 5s
    // timeout is wall-clock, not work — on a loaded CI runner (all jobs share a
    // 2-core box) a render that normally takes ~1s can be starved past 5s and
    // fail with "Test timed out in 5000ms" despite nothing being wrong. That was
    // the source of the intermittent ~13-failure runs. Give the timers real
    // headroom against scheduler starvation; a genuinely hung test still fails,
    // just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
