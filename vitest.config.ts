import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/{golden,security,unit,property,api}/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 92, functions: 92, statements: 92, branches: 85 },
    },
  },
});
