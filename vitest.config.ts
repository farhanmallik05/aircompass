import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/{golden,security,unit,property,api}/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
