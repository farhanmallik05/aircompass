import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/{golden,security,unit,property,api}/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["src/lib/types.ts", "src/lib/llm/client.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 96, functions: 96, statements: 96, branches: 90 },
    },
  },
});
