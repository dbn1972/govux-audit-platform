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
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
